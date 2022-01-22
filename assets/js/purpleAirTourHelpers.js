// Used only by PurpleAir tour

async function loadAndCreateSensorMarkers(epochtime_milisec, info, is_current_day) {
  var [multiUrl, resultsMapping] = generateSensorDataMultiFeedUrl(epochtime_milisec, info);
  var data = await loadJsonData(multiUrl);
  var lastIdx = 0;
  var playbackTimeInMs = playbackTimeline.getPlaybackTimeInMs();
  for (var i = 0; i < resultsMapping.length; i++) {
    var d = [];
    for (var a = 0; a < data['data'].length; a++) {
      d.push([data['data'][a][0], data['data'][a].slice(lastIdx + 1, resultsMapping[i] + 1)].flat());
    }
    var dataSegment = {
      "channel_names" :data['channel_names'].slice(lastIdx, resultsMapping[i]),
      "data" : d
    }
    lastIdx = resultsMapping[i];

    dataSegment['data'] = aggregateSensorData(d, info[i]);
    var tmp = formatAndMergeSensorData(dataSegment, info[i]);
    // Roll the sensor data to fill in some missing values
    tmp = rollSensorData(tmp, info[i]);

    var sensorName = info[i]["name"];
    var sensorTimes = tmp.data.map(entry => entry.time * 1000);
    var indexOfAvailableTime = findExactOrClosestTime(sensorTimes, playbackTimeInMs, "down");
    var newData = tmp.data[indexOfAvailableTime];

    if (!available_cities[selectedCity].sensors[sensorName].data) {
      available_cities[selectedCity].sensors[sensorName].data = {};
      createAndShowSensorMarker(newData, epochtime_milisec, is_current_day, info[i]);
    } else {
      var marker = available_cities[selectedCity].sensors[sensorName]['marker'];
      marker.setData(parseSensorMarkerDataForPlayback(newData, is_current_day, info[i]));
      marker.updateMarker();
    }
    available_cities[selectedCity].sensors[sensorName].data[epochtime_milisec] = tmp;
  }
}

// Fill in missing values based on previous observed ones
function rollSensorData(data, info) {
  var data = $.extend({}, data); // copy object

  // Fill in missing values
  var cache = {}; // cache previous observations
  var threshold = 3600; // one hour to look back
  for (var i = 0; i < data["data"].length; i++) {
    var d = data["data"][i];
    for (var name in info["sensors"]) {
      if (typeof d[name] === "undefined") {
        // We need to back fill data according to the threshold
        if (typeof cache[name] !== "undefined") {
          if (d["time"] - cache[name]["time"] <= threshold) {
            d[name] = {};
            d[name]["time"] = cache[name]["time"];
            d[name]["value"] = cache[name]["value"];
          }
        }
      } else {
        // No need for back filling, we only need to store data
        cache[name] = safeGet(cache[name], {});
        cache[name]["time"] = d["time"];
        cache[name]["value"] = d[name];
      }
    }
  }

  return data;
}


function aggregateSensorData(data, info) {
  var sensor_type = getSensorType(info);

  // TODO
  if ((info['marker_type'] != "purple_air" && info['marker_type'] != "clarity") && (sensor_type == "PM25" || sensor_type == "WIND_ONLY")) {
    return data;
  }
  if (data.length <= 1) {
    return data;
  }

  function round(date, duration, method) {
    return moment(Math[method]((+date) / (+duration)) * (+duration));
  }

  var new_data = [];
  var threshold = 900; // average previous 15 minutes of data
  var current_time = round(moment(data[0][0] * 1000), moment.duration(threshold, "seconds"), "floor").valueOf() / 1000;
  var current_sum = 0;
  var count = 0;
  for (var col = 1; col < data[0].length; col++) {
    for (var row = 0; row < data.length; row++) {
      var time = data[row][0];
      if (data[row][col] == null)
        continue;
      if (time - current_time <= threshold) {
        current_sum +=  data[row][col];
        count++;
      } else {
        new_data.push([current_time, current_sum / Math.max(1, count)]);
        current_sum = data[row][col];
        count = 1;
        current_time += threshold;
      }
    }
  }
  return new_data;
}


function formatAndMergeSensorData(responses, info, method) {
  if (!Array.isArray(responses)) {
    responses = [responses];
  }
  // TODO: implement more methods for merging, e.g. average
  //method = typeof method === "undefined" ? "last" : method;

  ////////////////////////////////////////////////////////////////
  // First pass: loop through all responses and merge data points
  ////////////////////////////////////////////////////////////////
  var data = {};
  for (var i = 0; i < responses.length; i++) {
    var r = responses[i];
    // Get the channel names
    var channel_names = [];
    for (var j = 0; j < r["channel_names"].length; j++) {
      var c = r["channel_names"][j];
      var c_split = c.split(".");
      channel_names.push(c_split[c_split.length - 1]);
    }
    // Loop through all data points in each response
    for (var k = 0; k < r["data"].length; k++) {
      var d = r["data"][k];
      var key = d[0]; // Use epochtime as the key
      if (typeof data[key] === "undefined") {
        data[key] = {};
      }
      for (var m = 1; m < d.length; m++) {
        // This assume that the last data source overrides the previous ones.
        // If the later source has the channel name that appears before,
        // it will override the data in that channel.
        if (d[m] !== null) {
          data[key][channel_names[m - 1]] = d[m];
        }
      }
    }
  }

  ////////////////////////////////////////////////////////////////
  // Second pass: merge channels and rename them
  // Also find the latest one and the max
  // (one sensor can have data from different channels)
  ////////////////////////////////////////////////////////////////
  var sensors_to_channels = {};
  for (var sensor_name in info["sensors"]) {
    var s = safeGet(safeGet(info["sensors"][sensor_name], {})["sources"], []);
    // Get the unique set of channel names
    var channel_names = [];
    for (var i = 0; i < s.length; i++) {
      channel_names.push(s[i]["channel"]);
    }
    if (channel_names.length > 1) {
      channel_names = Array.from(new Set(channel_names));
    }
    sensors_to_channels[sensor_name] = channel_names;
  }
  // Sort the epoch times
  var t_all = Object.keys(data).map(Number).sort(function (a, b) {
    return a - b;
  });
  // Loop through all data points and merge channels
  var data_merged = [];
  var data_max = {};
  for (var i = 0; i < t_all.length; i++) {
    var t = t_all[i];
    var tmp = {
      time: t
    };
    // Loop through channels
    for (var sensor_name in sensors_to_channels) {
      var channel_names = sensors_to_channels[sensor_name];
      for (var j = 0; j < channel_names.length; j++) {
        var d = data[t][channel_names[j]];
        // The new data will override the old ones
        if (typeof d !== "undefined") {
          tmp[sensor_name] = d;
          if (typeof data_max[sensor_name] === "undefined" || d > data_max[sensor_name]["value"]) {
            data_max[sensor_name] = {
              time: t,
              value: d
            };
          }
        }
      }
    }
    data_merged.push(tmp);
  }

  return {
    data: data_merged,
    summary: {
      max: data_max
    }
  };
}


function generateSensorDataMultiFeedUrl(epochtime_milisec, info) {
  var esdr_root_url = "https://esdr.cmucreatelab.org/api/v1/";
  var epochtime = parseInt(epochtime_milisec / 1000);
  var time_range_url_part = "?format=json&from=" + epochtime + "&to=" + (epochtime + 86399);

  // Parse sensor info into several urls (data may come from different feeds and channels)
  var feeds_to_channels = [];
  var sensors_to_feeds_end_index = [];
  var count = 0;
  for (var sensorIdx = 0; sensorIdx < info.length; sensorIdx++) {
    var sensors = info[sensorIdx]["sensors"];
    var sensorNames = Object.keys(sensors);
    for (var k = 0; k < sensorNames.length; k++) {
      var sensor = sensorNames[k];
      var sources = safeGet(sensors[sensor]["sources"], []);
      for (var i = 0; i < sources.length; i++) {
        var s = sources[i];
        var feed = s["feed"];
        var channel = s["channel"];
        feeds_to_channels.push(feed + "." + channel);
        count++;
      }
    }
    sensors_to_feeds_end_index.push(count);
  }
  return [esdr_root_url + "feeds/export/" + feeds_to_channels.toString() + time_range_url_part, sensors_to_feeds_end_index];
}
