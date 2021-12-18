// TODO

var hrrrWindErrorMarkers = [];
var hrrrWindErrorDataByEpochTimeInMs = {};

function setHrrrWindErrorPointsColor(currentPlaybackTimeInMs) {
  var opacity;
  var options = {};
  for (var site in hrrrWindErrorPointLocations) {
    var marker = hrrrWindErrorPointLocations[site].marker;
    var dataWithinPlaybackInterval = hrrrWindErrorDataByEpochTimeInMs[currentPlaybackTimeInMs][site];
    if (dataWithinPlaybackInterval) {
      if (showHrrrWindSpeedError) {
        options.fillOpacity = dataWithinPlaybackInterval.wind_speed_err / dataWithinPlaybackInterval.wind_linear_scale_divisor;
      } else if (showHrrrWindDirectionError) {
        options.fillOpacity = dataWithinPlaybackInterval.wind_direction_err / dataWithinPlaybackInterval.wind_linear_scale_divisor;
      }
    } else {
      opacity = 0;
      options.fillOpacity = opacity;
      options.strokeOpacity = opacity;
    }
    marker.setOptions(options);
    var visiblity = opacity != 0;
    marker.setVisible(visiblity);
  }
}

function resetAllHrrrWindErrorPoints() {
  for (var site in hrrrWindErrorPointLocations) {
    var marker = hrrrWindErrorPointLocations[site].marker;
    marker.setVisible(false);
  }
  //if (selectedSensorMarker && selectedSensorMarker.traxId) {
  //  selectedSensorMarker = null;
  //}
}

// TODO
async function handleHrrrWindErrorPointsByEpochTime(timeInEpoch) {
  var playbackTimeInMs = timeInEpoch || playbackTimeline.getPlaybackTimeInMs();
  if (hrrrWindErrorDataByEpochTimeInMs[playbackTimeInMs]) {
    setHrrrWindErrorPointsColor(playbackTimeInMs);
    return;
  }
  hrrrWindErrorDataByEpochTimeInMs[playbackTimeInMs] = {};

  // The names of the files in firestore are in UTC
  var docRefString = moment.tz(playbackTimeInMs, selected_city_tmz).startOf("hour").utc().format("YYYYMMDDHHmm") + "Z";
  const snapshot = await db.collection(HRRR_UNCERTAINTY_COLLECTION_NAME).doc(docRefString).get();
  const snapshotData = snapshot.data();
  if (snapshotData) {
    var data = snapshotData.data;
    var populateLocations = false;

    if (Object.keys(hrrrWindErrorPointLocations).length == 0) {
      populateLocations = true;
    }

    var windLinearScaleDivisor = 1;
    if (showHrrrWindDirectionError) {
      windLinearScaleDivisor = 180;
    } else {
      for (var i = 0; i < data.length; i++) {
        if (windLinearScaleDivisor < data[i].wind_speed_err) {
          windLinearScaleDivisor = data[i].wind_speed_err;
        }
      }
    }

    for (var i = 0; i < data.length; i++) {
      hrrrWindErrorDataByEpochTimeInMs[playbackTimeInMs][i] = {
        HRRR_Wind_Dir: data[i].HRRR_Wind_Dir,
        HRRR_Wind_Speed: data[i].HRRR_Wind_Speed,
        Mesowest_Wind_Dir: data[i].Mesowest_Wind_Dir,
        Mesowest_Wind_Speed: data[i].Mesowest_Wind_Speed,
        wind_direction_err: data[i].wind_direction_err,
        wind_speed_err: data[i].wind_speed_err,
        sensorType: "hrrr_wind_error",
        wind_linear_scale_divisor: windLinearScaleDivisor
      };
      if (populateLocations) {
        let hrrrErrorMarker = new google.maps.Circle({
          strokeWeight: 0,
          strokeColor: "#ff0000",
          fillColor: "#ff0000",
          map,
          center: { lat: data[i].latitude, lng: data[i].longitude },
          radius: 360,
          visible: false,
          hrrrErrorPointId: i,
          getData: function() { return hrrrWindErrorDataByEpochTimeInMs[playbackTimeline.getPlaybackTimeInMs()][this.hrrrErrorPointId]; }
        });

        google.maps.event.addListener(hrrrErrorMarker, "click", function (e) {
          let data = this.getData();
          // Note: Because this is not a marker but rather a "circle" in the Google Maps world, we cannot anchor to
          // a marker with the 'open' call and must instead explicitly set the position of the marker we clicked on.
          infowindow.setPosition(e.latLng);
          infowindow.open(map);
          let content = "<table>"
          if (showHrrrWindDirectionError) {
            content += "<tr><td style='font-weight: bold'>HRRR_Wind_Dir: </td><td style='padding-left: 20px'>" + data.HRRR_Wind_Dir.toFixed(2) + "</td></tr>";
            content += "<tr><td style='font-weight: bold'>Mesowest_Wind_Dir: </td><td style='padding-left: 20px'>" + data.Mesowest_Wind_Dir + "</td></tr>";
            content += "<tr><td style='font-weight: bold'>wind_direction_err: </td><td style='padding-left: 20px'>" + data.wind_direction_err.toFixed(2) + "</td></tr>";
          } else if (showHrrrWindSpeedError) {
            content += "<tr><td style='font-weight: bold'>HRRR_Wind_Speed: </td><td style='padding-left: 20px'>" + data.HRRR_Wind_Speed.toFixed(2) + "</td></tr>";
            content += "<tr><td style='font-weight: bold'>Mesowest_Wind_Speed: </td><td style='padding-left: 20px'>" + data.Mesowest_Wind_Speed.toFixed(2) + "</td></tr>";
            content += "<tr><td style='font-weight: bold'>wind_speed_err: </td><td style='padding-left: 20px'>" + data.wind_speed_err.toFixed(2) + "</td></tr>";
          }
          content += "</table>";
          infowindow.setContent(content);
        });
        hrrrWindErrorPointLocations[i] = {
          lat: data[i].latitude,
          lng: data[i].longitude,
          marker: hrrrErrorMarker
        }
      }
    }
    setHrrrWindErrorPointsColor(playbackTimeInMs);
  } else {
    console.log("no hrrr wind error data found found for:", playbackTimeInMs);
    resetAllHrrrWindErrorPoints();
  }
}

async function testHeatmap() {
  // The names of the files in firestore are in UTC
  var docRefString = "202109300200Z";
  const snapshot = await db.collection(HRRR_UNCERTAINTY_COLLECTION_NAME).doc(docRefString).get();
  const snapshotData = snapshot.data();
  var heatmapData = [];
  if (snapshotData) {
    var data = snapshotData.data;
    for (var i = 0; i < data.length; i++) {
        if (isNaN(data[i].Mesowest_Wind_Dir) || isNaN(data[i].Mesowest_Wind_Speed)) {
          continue;
        }
        heatmapData.push({location: new google.maps.LatLng(data[i].latitude, data[i].longitude), weight : 1})

        console.log(data[i])
        //data[i].HRRR_Wind_Dir,
        //data[i].HRRR_Wind_Speed,
        //data[i].Mesowest_Wind_Dir,
        //data[i].Mesowest_Wind_Speed,
        //data[i].wind_direction_err,
        //data[i].wind_speed_err
    }
    //["#ededed", "#dbdbdb", "#afafaf", "#848383", "#545454", "#000000"]

    var heatmap = new google.maps.visualization.HeatmapLayer({
      data: heatmapData,
      radius: 40,

      gradient: ['rgba(255, 255, 255, 0)', "#ededed", "#dbdbdb", "#afafaf", "#848383", "#545454", "#000000"]
      /*gradient: ["#ededed", 'rgba(255, 255, 255, 0)', 'rgba(255, 255, 255, 0)', 'rgba(255, 255, 255, 0)', "#848383", "#545454", "#000000"]*/
    });
    heatmap.setMap(map);
  }
}