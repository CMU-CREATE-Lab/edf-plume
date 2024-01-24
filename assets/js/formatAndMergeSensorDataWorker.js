importScripts('https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.30.1/moment.min.js');
importScripts('https://cdnjs.cloudflare.com/ajax/libs/moment-timezone/0.5.44/moment-timezone-with-data-10-year-range.min.js');

var esdr_sensors = {};
var numSensorsPerChunk = 50;

onmessage = async function(event) {
  // The object that the web page sent is stored in the event.data property.

  var epochtime_milisec = event.data.epochtime_milisec;
  var info = event.data.sensors_list;
  var is_current_day = event.data.is_current_day;
  var marker_type = event.data.marker_type;
  var playback_timeline_increment_amt_sec = event.data.playback_timeline_increment_amt * 60;

  esdr_sensors = {};

  var result = await loadAndCreateSensorMarkers(epochtime_milisec, info, is_current_day, playback_timeline_increment_amt_sec);
  // Send back the results.
  postMessage({epochtime_milisec: epochtime_milisec, info: info, is_current_day: is_current_day, result: result, marker_type: marker_type});
};


async function loadAndCreateSensorMarkers(epochtime_milisec, info, is_current_day, playback_timeline_increment_amt_sec) {
  var [multiUrls, resultsMappings] = generateSensorDataMultiFeedUrls(epochtime_milisec, info, numSensorsPerChunk);
  var data = await loadMultiSensorDataAsChunks(multiUrls);
  var sensorCount = 0;
  for (var a = 0; a < data.length; a++) {
    var lastIdx = 0;
    for (var i = 0; i < resultsMappings[a].length; i++) {
      var d = [];
      // NOTE: This array slicing can be a big bottleneck for very large datasets.
      // e.g. PurpleAirs where if we select ~250 of them and do a full 24hrs, we can get over 30 million data points.
      // We speed this up by getting the sensors in groups of N (see numSensorsPerChunk variable)
      for (var j = 0; j < data[a]['data'].length; j++) {
        var row = data[a]['data'][j].slice(lastIdx + 1, resultsMappings[a][i] + 1);
        row.unshift(data[a]['data'][j][0]);
        d.push(row);
      }
      var dataSegment = {
        "channel_names" : data[a]['channel_names'].slice(lastIdx, resultsMappings[a][i]),
        "data" : d
      }
      lastIdx = resultsMappings[a][i];

      dataSegment['data'] = aggregateSensorData(d, info[sensorCount], playback_timeline_increment_amt_sec);
      var tmp = formatAndMergeSensorData(dataSegment, info[sensorCount]);
      // Roll the sensor data to fill in some missing values
      tmp = rollSensorData(tmp, info[i]);
      if (!esdr_sensors[info[sensorCount]["name"]]) {
        esdr_sensors[info[sensorCount]["name"]] = {"data" : {}};
      }
      esdr_sensors[info[sensorCount]["name"]]["data"][epochtime_milisec] = tmp;
      sensorCount++;
    }
  }
  return esdr_sensors;
}


async function loadMultiSensorDataAsChunks(urls) {
    const requests = urls.map((url) => fetch(url));
    const responses = await Promise.all(requests);
    //const errors = responses.filter((response) => !response.ok);
    const jsonArray = responses.map((response) => response.json());
    const dataArray = await Promise.all(jsonArray);
    return dataArray;
}


function generateSensorDataMultiFeedUrls(epochtime_milisec, info, numSensorsPerChunk) {
  var esdr_root_url = "https://esdr.cmucreatelab.org/api/v1/";
  var epochtime = parseInt(epochtime_milisec / 1000);
  var lookbackAmountInSec = 3600;
  var time_range_url_part = "?format=json&from=" + (epochtime - lookbackAmountInSec) + "&to=" + (epochtime + 86399);

  var urls = [];
  var mappings = [];

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
    if (sensors_to_feeds_end_index.length >= numSensorsPerChunk) {
      urls.push(esdr_root_url + "feeds/export/" + feeds_to_channels.toString() + time_range_url_part);
      mappings.push(sensors_to_feeds_end_index)
      feeds_to_channels = [];
      sensors_to_feeds_end_index = [];
      count = 0;
    }
  }
  if (sensors_to_feeds_end_index.length) {
    urls.push(esdr_root_url + "feeds/export/" + feeds_to_channels.toString() + time_range_url_part);
    mappings.push(sensors_to_feeds_end_index)
  }
  return [urls, mappings];
}


function aggregateSensorData(data, info, playback_timeline_increment_amt_sec) {
  // If there is 1 or less data points, no need to aggregate.
  if (data.length <= 1) {
    return data;
  }

  function round(date, duration, method) {
    return moment(Math[method]((+date) / (+duration)) * (+duration));
  }

  var new_data = [];
  var threshold = playback_timeline_increment_amt_sec;

  // Note: Only aggregate data that is sub time intervals of the threshold set above. Otherwise, the times associated with data will be mismatched after aggregation.
  var last_tmp_time;
  var average_time_interval = 0;
  var num_rows_to_check = Math.min(data.length, 10);
  for (var row = 0; row < num_rows_to_check; row++) {
    if (last_tmp_time) {
      average_time_interval += (data[row][0] - last_tmp_time);
    }
    last_tmp_time = data[row][0];
  }
  average_time_interval = Math.floor(average_time_interval / (num_rows_to_check - 1));

  if (average_time_interval >= threshold) {
    return data;
  }

  var current_time = round(moment((data[0][0] + threshold) * 1000), moment.duration(threshold, "seconds"), "floor").valueOf() / 1000;
  var current_sum = 0;
  var count = 0;
  var addedData = false;
  for (var col = 1; col < data[0].length; col++) {
    for (var row = 0; row < data.length; row++) {
      var time = data[row][0];
      addedData = false;
      if (time <= current_time) {
        if (data[row][col] == null) {
          continue;
        }
        current_sum += data[row][col];
        count++;
      } else {
        if (current_sum > 0) {
          new_data.push([current_time, current_sum / Math.max(1, count)]);
          addedData = true;
        }
        if (data[row][col] != null) {
          current_sum = data[row][col];
          count = 1;
        } else {
          current_sum = 0;
          count = 0;
        }
        current_time += threshold;
      }
    }
  }

  if (!addedData && count > 0) {
    new_data.push([current_time, current_sum / Math.max(1, count)]);
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


// Fill in missing values based on previous observed ones
function rollSensorData(data, info) {
  var data = JSON.parse(JSON.stringify(data));

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


// Safely get the value from a variable, return a default value if undefined
function safeGet(v, default_val) {
  if (typeof default_val === "undefined") default_val = "";
  return (typeof v === "undefined") ? default_val : v;
}


function getSensorType(info) {
  var sensor_type;
  if (Object.keys(info["sensors"]).indexOf("wind_direction") > -1 && Object.keys(info["sensors"]).indexOf("PM25") == -1) {
    sensor_type = "WIND_ONLY";
  } else if (Object.keys(info["sensors"]).indexOf("PM25") > -1) {
    sensor_type = "PM25";
  } else if (Object.keys(info["sensors"]).indexOf("VOC") > -1) {
    sensor_type = "VOC";
  }
  return sensor_type;
}
