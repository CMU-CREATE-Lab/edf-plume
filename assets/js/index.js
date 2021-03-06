"use strict";

var map;
var playbackTimeline;
var $infobar

var TRAX_COLLECTION_NAME = "trax-dev";
var STILT_COLLECTION_NAME = "stilt-prod";
var DEFAULT_TZ = "America/Denver";
var PM25_UNIT = "ug/m3";

// Increase/decrease for more or less TRAX data to look back at
var traxDataIntervalInMin = 60;
var traxDataIntervalInMs = traxDataIntervalInMin * 60000;

var pm25ColorLookup = function(pm25) {
  var color;
  if (pm25 >= 250.5) {
    color = "#7e0023"; // dark maroon
  } else if (pm25 >= 150.5) {
    color = "#99004c"; //light maroon
  } else if (pm25 >= 55.5) {
    color = "#ff0000"; //red
  } else if (pm25 >= 35.5) {
    color = "#ff7e00"; //orange
  } else if (pm25 >= 12.1) {
    color = "#ffff00"; //yellow
  } else if (pm25 >= 0) {
    color = "#00e400"; //green
  } else {
    color = "#000000"; //white
  }
  return color;
}

var dataFormatWorker;

var sensors = [{
  "name": "Salt Lake City",
  "state_code": "UT",
  "markers": [{
    "name": "BV AirNow",
    "sensors": {
      "wind_speed": {
        "sources": [{
          "feed": 3827,
          "channel": "WS"
        }]
      },
      "wind_direction": {
        "sources": [{
          "feed": 3827,
          "channel": "WD"
        }]
      },
      "PM25": {
        "sources": [{
          "feed": 3827,
          "channel": "PM2_5"
        }]
      }
    },
    "id": 1,
    "latitude": 40.897999,
    "longitude": -111.885498,
    "marker_type": "esdr_feed"
  },
  {
    "name": "Rose Park AirNow",
    "sensors": {
      "wind_speed": {
        "sources": [{
          "feed": 7801,
          "channel": "WS"
        }]
      },
      "wind_direction": {
        "sources": [{
          "feed": 7801,
          "channel": "WD"
        }]
      },
      "PM25": {
        "sources": [{
          "feed": 7801,
          "channel": "PM2_5"
        }]
      }
    },
    "id": 2,
    "latitude": 40.7955,
    "longitude": -111.9309,
    "marker_type": "esdr_feed"
  },
  {
    "name": "Hawthorne AirNow",
    "sensors": {
      "wind_speed": {
        "sources": [{
          "feed": 3833,
          "channel": "WS"
        }]
      },
      "wind_direction": {
        "sources": [{
          "feed": 3833,
          "channel": "WD"
        }]
      },
      "PM25": {
        "sources": [{
          "feed": 3833,
          "channel": "PM2_5"
        }]
      }
    },
    "id": 3,
    "latitude": 40.733501,
    "longitude": -111.871696,
    "marker_type": "esdr_feed"
  },
  {
    "name": "Copper View AirNow",
    "sensors": {
      "wind_speed": {
        "sources": [{
          "feed": 21950,
          "channel": "WS"
        }]
      },
      "wind_direction": {
        "sources": [{
          "feed": 21950,
          "channel": "WD"
        }]
      },
      "PM25": {
        "sources": [{
          "feed": 21950,
          "channel": "PM2_5"
        }]
      }
    },
    "id": 4,
    "latitude": 40.598056,
    "longitude": -111.894167,
    "marker_type": "esdr_feed"
  },
  {
    "name": "Herriman #3 AirNow",
    "sensors": {
      "wind_speed": {
        "sources": [{
          "feed": 12447,
          "channel": "WS"
        }]
      },
      "wind_direction": {
        "sources": [{
          "feed": 12447,
          "channel": "WD"
        }]
      },
      "PM25": {
        "sources": [{
          "feed": 12447,
          "channel": "PM2_5"
        }]
      }
    },
    "id": 5,
    "latitude": 40.496408,
    "longitude": -112.036305,
    "marker_type": "esdr_feed"
  },
  {
    "name": "Erda AirNow",
    "sensors": {
      "wind_speed": {
        "sources": [{
          "feed": 5923,
          "channel": "WS"
        }]
      },
      "wind_direction": {
        "sources": [{
          "feed": 5923,
          "channel": "WD"
        }]
      },
      "PM25": {
        "sources": [{
          "feed": 5923,
          "channel": "PM2_5"
        }]
      }
    },
    "id": 6,
    "latitude": 40.600556,
    "longitude": -112.355,
    "marker_type": "esdr_feed"
  },
  {
    "name": "Lindon - Provo AirNow",
    "sensors": {
      "wind_speed": {
        "sources": [{
          "feed": 3841,
          "channel": "WS"
        }]
      },
      "wind_direction": {
        "sources": [{
          "feed": 3841,
          "channel": "WD"
        }]
      },
      "PM25": {
        "sources": [{
          "feed": 3841,
          "channel": "PM2_5"
        }]
      }
    },
    "id": 7,
    "latitude": 40.3414,
    "longitude": -111.7136,
    "marker_type": "esdr_feed"
  },
  {
    "name": "Spanish Fork AirNow",
    "sensors": {
      "wind_speed": {
        "sources": [{
          "feed": 3842,
          "channel": "WS"
        }]
      },
      "wind_direction": {
        "sources": [{
          "feed": 3842,
          "channel": "WD"
        }]
      },
      "PM25": {
        "sources": [{
          "feed": 3842,
          "channel": "PM2_5"
        }]
      }
    },
    "id": 8,
    "latitude": 40.136398,
    "longitude": -111.660202,
    "marker_type": "esdr_feed"
  },
  /*{
    "name": "Harrisville AirNow",
    "sensors": {
      "wind_speed": {
        "sources": [{
          "feed": 3847,
          "channel": "WS"
        }]
      },
      "wind_direction": {
        "sources": [{
          "feed": 3847,
          "channel": "WD"
        }]
      }
    },
    "id": 9,
    "latitude": 41.302799,
    "longitude": -111.988297,
    "marker_type": "esdr_feed"
  },*/
  {
    "name": "Timpanogos Cave AirNow",
    "sensors": {
      "PM25": {
        "sources": [{
          "feed": 26391,
          "channel": "PM2_5"
        }]
      }
    },
    "id": 10,
    "latitude": 40.44194,
    "longitude": -111.71341,
    "marker_type": "esdr_feed"
  },]
}];


var sensors_list = [];
var purpleair_list = [];
var esdr_sensors = {};
var plume_backtraces = {};

var selected_day_start_epochtime_milisec;
var end_of_current_day_epoch = moment().tz(DEFAULT_TZ).endOf("day").valueOf();
var current_day_str = moment().tz(DEFAULT_TZ).format("YYYY-MM-DD");

var selectedLocationPin;
var selectedSensorMarker;
var overlay;
var purpleAirLoadInterval;
var showPurpleAir = false;

var db;

//var mostRecentUpdate12HourTimeForLocation;
var mostRecentUpdateEpochTimeForLocationInMs;
//var mostRecentDayStr;
//var mostRecentDayStrFull;
var mostRecentAvailableFootprintTimeInMs;
//var mostRecentAvailableFootprintTimeStr;
var startOfLatestAvailableDay;

var sensorsLoadedResolver;
var sensorsLoadedPromise;

var $infobarHeader;
var $infobarPollution;
var $infobarWind;
var $infobarPlume;
var $playbackTimelineContainer;
var $footprint_dialog;

var widgets = new edaplotjs.Widgets();
var Util = new edaplotjs.Util();

// Touch support
var hasTouchSupport = Util.isTouchDevice();
var hasPointerSupport = Util.isPointerDevice();
var tappedTimer = null;
var lastDist = null;
var lastLocation;
var thisLocation;
var isTouchMoving = false;
var touchStartTargetElement;
var currentTouchCount = 0;
var drewMarkersAtLeastOnce = false;

var isPlaybackTimelineToggling = false;
var dataFormatWorkerIsProcessing = false;

var traxDataByEpochTimeInMs = {};
var traxLocations = {};
var traxMarkers = [];

// DOM
var $playbackTimelineAnchor;
var $controls;
var $calendarChosenDayIndicator;
var $calendarBtn;
var $dayTimeToggle;
var $infobarComponentContainer;
var $infobarInitial;


function getDefaultTZ() {
  return DEFAULT_TZ;
}


function resetAllTrax() {
  for (var trax in traxLocations) {
    var marker = traxLocations[trax].marker;
    marker.setOptions({
      fillColor: "#000000",
      strokeColor: "#000000",
      fillOpacity: 0,
      strokeOpacity: 0
    })
    marker.setVisible(false);
  }
  if (selectedSensorMarker && selectedSensorMarker.traxId) {
    selectedSensorMarker = null;
  }
}


function setTraxOpacityAndColor(currentPlaybackTimeInMs) {
  var opacity;
  // 60000 ms = 1 minute
  var timeIntervalInMs = traxDataIntervalInMs; //playbackTimeline.getIncrementAmt() * 60000;
  var options = {};
  var mostRecentTraxLines = {'r' : {'marker' : null, 'timeInMs' : -1}, 'g' : {'marker' : null, 'timeInMs' : -1}, 'b' : {'marker' : null, 'timeInMs' : -1}};
  for (var site in traxLocations) {
    var marker = traxLocations[site].marker;
    var dataWithinPlaybackInterval = traxDataByEpochTimeInMs[currentPlaybackTimeInMs][site];
    if (dataWithinPlaybackInterval) {
      var traxLine = site[0];
      var markerEpochTimeInMs = dataWithinPlaybackInterval.epochtimeInMs;
      if (markerEpochTimeInMs > mostRecentTraxLines[traxLine].timeInMs) {
        mostRecentTraxLines[traxLine].marker = marker;
        mostRecentTraxLines[traxLine].timeInMs = markerEpochTimeInMs;
      }
      var color = pm25ColorLookup(dataWithinPlaybackInterval.pm25);
      var timeDiff = Math.abs(currentPlaybackTimeInMs - markerEpochTimeInMs);
      opacity = Math.min(1, Math.max(0, (1 - (timeDiff / timeIntervalInMs)) + .05));
      options.fillColor = color;
      options.strokeColor = color;
      options.fillOpacity = opacity;
      options.strokeOpacity = Math.max(0, opacity - 0.2);
      options.radius = 90;
    } else {
      opacity = 0;
      options.fillOpacity = opacity;
      options.strokeOpacity = opacity;
    }
    marker.setOptions(options);
    var visiblity = opacity != 0;
    marker.setVisible(visiblity);
  }
  var mostRecentTraxLineMarkers = Object.values(mostRecentTraxLines).map(traxLine => traxLine.marker);
  // Make the most recent trax reading a bigger sizes circle with a black outline
  var specialOptions = {
    strokeColor: "#000000",
    radius: 120,
  }
  mostRecentTraxLineMarkers.forEach(marker => {
    if (marker) {
      marker.setOptions(specialOptions);
    }
  });
}


async function getTraxLocations() {
  const snapshot = await db.collection('trax_location').get()
  let locations = {}
  snapshot.docs.map(doc => (locations[doc.id]  = {'lat' : doc.data().loc.latitude, 'lng' : doc.data().loc.longitude}));
  return locations;
}


async function getTraxInfoByDateAndId(date, id) {
  date = "20210108224846";
  id = "g096";
  const doc = await db.collection(TRAX_COLLECTION_NAME).doc(date + "_" + id + "_TRX01").get()
  console.log(doc.data());
}


async function getTraxInfoByDay() {
  var d = moment(timeline.selectedDayInMs);
  var startDate = d.startOf("day").toDate();
  var endDate = d.endOf("day").toDate();
  const snapshot  = await db.collection(TRAX_COLLECTION_NAME).where('time', '>=', startDate).where('time', '<=', endDate).get();
  if (!snapshot.empty) {
    snapshot.forEach(doc => {
      var data = doc.data();
      console.log(data)
    });
  } else {
    console.log("no trax data found found for day starting at: ", timeline.selectedDayInMs);
    resetAllTrax();
  }
}


function findExactOrClosestTime(availableTimes, timeToFind, direction, exactOnly) {
  var low = 0, high = availableTimes.length - 1, i, newCompare;
  if (!timeToFind)
    return null;
  while (low <= high) {
    i = Math.floor((low + high) / 2);
    newCompare = availableTimes[i];
    if (newCompare < timeToFind) {
      low = i + 1;
      continue;
    } else if (newCompare > timeToFind) {
      high = i - 1;
      continue;
    }
    // Exact match
    return i;
  }
  if (exactOnly) {
    return -1;
  }
  if (low >= availableTimes.length)
    return (availableTimes.length - 1);
  if (high < 0)
    return 0;
  // No exact match. Return lower or upper bound if 'down' or 'up' is selected
  if (direction === 'down') return Math.min(low, high);
  if (direction === 'up') return Math.max(low, high);
  // Otherwise, select closest
  var lowCompare = availableTimes[low];
  var highCompare = availableTimes[high];
  if (Math.abs(lowCompare - timeToFind) > Math.abs(highCompare - timeToFind)) {
    return high;
  } else {
    return low;
  }
}


function updateSensorsByEpochTime(playbackTimeInMs, animating) {
  var markers_with_data_for_chosen_epochtime = [];
  for (var sensorName in esdr_sensors) {
    var sensor = esdr_sensors[sensorName];
    var fullDataForDay = sensor.data[selected_day_start_epochtime_milisec].data;
    var sensorTimes = fullDataForDay.map(entry => entry.time * 1000);
    var indexOfAvailableTime = findExactOrClosestTime(sensorTimes, playbackTimeInMs, "down");
    if (indexOfAvailableTime >= 0) {
      markers_with_data_for_chosen_epochtime.push(sensor.marker)
      sensor.marker.setData(parseSensorMarkerDataForPlayback(fullDataForDay[indexOfAvailableTime], sensor.info, animating));
      sensor.marker.updateMarker();
    }
  }
  return markers_with_data_for_chosen_epochtime;
}


async function getTraxInfoByPlaybackTime(timeInEpoch) {
  var playbackTimeInMs = timeInEpoch || playbackTimeline.getPlaybackTimeInMs();
  if (traxDataByEpochTimeInMs[playbackTimeInMs]) {
    setTraxOpacityAndColor(playbackTimeInMs);
    return;
  }
  traxDataByEpochTimeInMs[playbackTimeInMs] = {};

  var mStartDate = moment.tz(playbackTimeInMs, DEFAULT_TZ);
  // For some reason we need to add/subtract an extra minute. The where clause does not seem to do what I would expect for the conditional...
  var endDate = mStartDate.clone().add(1, 'minutes').toDate();
  //playbackTimeline.getIncrementAmt()
  var startDate = mStartDate.clone().subtract(traxDataIntervalInMin - 1, 'minutes').toDate();

  const snapshot  = await db.collection(TRAX_COLLECTION_NAME).where('time', '>', startDate).where('time', '<', endDate).get();
  if (!snapshot.empty) {
    snapshot.forEach(doc => {
      var data = doc.data();
      var traxId = data.site;
      var epochtimeInSec = data.time.seconds;
      traxDataByEpochTimeInMs[playbackTimeInMs][traxId] = {pm25: data.pm25, epochtimeInMs: epochtimeInSec * 1000, name: traxId, sensorType: "trax"};
    });
    setTraxOpacityAndColor(playbackTimeInMs);
  } else {
    //console.log("no trax data found found for:", playbackTimeInMs);
    resetAllTrax();
  }
}


async function initMap() {
  var startingView = {lat: 40.688701, lng: -111.876183, zoom: window.innerWidth <= 450 ? 10 : 11};
  var urlVars = Util.parseVars(window.location.href);
  showPurpleAir = urlVars.showPurpleAir == "true";
  if (showPurpleAir) {
    $("#purple-air-legend-row").show();
  }
  var shareView = urlVars.v;
  var shareTimeInMs = parseInt(urlVars.t);

  if (shareTimeInMs) {
    selected_day_start_epochtime_milisec = moment(shareTimeInMs).tz(DEFAULT_TZ).startOf("day").valueOf();
  }

  if (shareView) {
    var tmp = shareView.split(",");
    startingView.lat = parseFloat(tmp[0]);
    startingView.lng = parseFloat(tmp[1]);
    startingView.zoom = parseFloat(tmp[2]);
  }

  map = new google.maps.Map(document.getElementById("map"), {
    options: {
      gestureHandling: 'greedy'
    },
    center: { lat: startingView.lat, lng: startingView.lng },
    zoom: startingView.zoom,
    streetViewControl: false,
    fullscreenControl: false,
    zoomControl: $(window).width() > 450,
    mapTypeControl: false,
    clickableIcons: false,
    styles:
      [
          {
              "stylers": [
                  {
                      "saturation": -100
                  },
                  {
                      "gamma": 1
                  }
              ]
          },
          {
              "elementType": "labels.text.stroke",
              "stylers": [
                  {
                      "visibility": "off"
                  }
              ]
          },
          {
              "featureType": "poi.business",
              "elementType": "labels.text",
              "stylers": [
                  {
                      "visibility": "off"
                  }
              ]
          },
          {
              "featureType": "poi.business",
              "elementType": "labels.icon",
              "stylers": [
                  {
                      "visibility": "off"
                  }
              ]
          },
          {
              "featureType": "poi.place_of_worship",
              "elementType": "labels.text",
              "stylers": [
                  {
                      "visibility": "off"
                  }
              ]
          },
          {
              "featureType": "poi.place_of_worship",
              "elementType": "labels.icon",
              "stylers": [
                  {
                      "visibility": "off"
                  }
              ]
          },
          {
              "featureType": "road",
              "elementType": "geometry",
              "stylers": [
                  {
                      "visibility": "simplified"
                  }
              ]
          },
          {
              "featureType": "water",
              "stylers": [
                  {
                      "visibility": "on"
                  },
                  {
                      "saturation": 50
                  },
                  {
                      "gamma": 0
                  },
                  {
                      "hue": "#50a5d1"
                  }
              ]
          },
          {
              "featureType": "administrative.neighborhood",
              "elementType": "labels.text.fill",
              "stylers": [
                  {
                      "color": "#333333"
                  }
              ]
          },
          {
              "featureType": "road.local",
              "elementType": "labels.text",
              "stylers": [
                  {
                      "weight": 0.5
                  },
                  {
                      "color": "#333333"
                  }
              ]
          },
          {
              "featureType": "transit.station",
              "elementType": "labels.icon",
              "stylers": [
                  {
                      "gamma": 1
                  },
                  {
                      "saturation": 50
                  }
              ]
          }
      ]
  });

  map.addListener("click", (mapsMouseEvent) => {
    handleMapClicked(mapsMouseEvent);
  });

  $("#infobar-close-toggle-container").on("click", toggleInfobar);

  $(".explanation-step-button").on("click", function(e) {
    if ($(this).hasClass("disabled")) return;
    stepThroughExplanation($(this).data("direction"));
  });

  $infobar = $("#infobar");
  $infobar.on("mousedown", function(e) {
    if ($(window).width() > 450) {
      return;
    }
    var lastYPos;
    var lastYDirection = null;
    var startYPos = e.pageY;
    lastYPos = startYPos;
    var startHeight = $infobar.height();
    var currentYPos;
    $infobar.addClass("disableScroll");
    $(document).on("mousemove.infocontainer", function(e) {
      if ($(e.target).hasClass("initial") || $(e.target).parents("#infobar-initial").hasClass("initial")) return;
      currentYPos = e.pageY;
      if (lastYPos > e.pageY) {
        lastYDirection = "down";
      } else if (lastYPos < e.pageY) {
        lastYDirection = "up";
      }
      lastYPos = currentYPos;
      var dist = startYPos - currentYPos;
      var max = selectedLocationPin ? 218 : 258;
      var maxHeight = Math.min(max, (startHeight - dist));
      $infobar.height(maxHeight);
    });
    $(document).one("mouseup.infocontainer", function(e) {
      if (lastYDirection && lastYDirection == "up") {
        $infobar.stop(true, false).animate({
          height: selectedLocationPin ? "210px" : "250px"
        });
        $infobar.addClass("maximized");
      } else if (lastYDirection && lastYDirection == "down") {
        $infobar.stop(true, false).animate({
          height: "46px"
        }, function() {
          $infobar.removeClass("maximized");
        });

      }
      $infobar.removeClass("disableScroll");
      $(document).off(".infocontainer");
    });
  });

  verticalTouchScroll($infobar);

  $(window).on("resize", function(){
    if ($(this).width() > 450) {
      map.setOptions({zoomControl:true});
    }
    else {
      map.setOptions({zoomControl:false})
    }
  });

  $("#controls").on("click", "#calendar-btn, .timestampPreview", handleTimelineToggling);

  if (hasTouchSupport) {
    //var controlsElem = document.getElementById("controls");
    $("#controls, #infobar").on("touchstart", Util.touch2Mouse);
    $("#controls, #infobar").on("touchmove", Util.touch2Mouse);
    $("#controls, #infobar").on("touchend", Util.touch2Mouse);
    $("#controls, #infobar").on("touchcancel", Util.touch2Mouse);
  }

  //$("#timestampPreviewContent").text(current12HourString);
  await loadSensorList(sensors);

  var options = {
    playbackTimeInMs: shareTimeInMs,
    clickEvent: function() {
      handleDraw(timeline.selectedDayInMs, true, true);
      //closeInfobar();
    }
  }
  initTimeline(options);

  //------------------- create custom map overlay to draw footprint ---------------------------------
  class FootprintOverlay extends google.maps.OverlayView {
    constructor(bounds, image) {
      super();
      this.bounds = bounds;
      this.image = image;
      this.data = {};
    }
    /**
     * onAdd is called when the map's panes are ready and the overlay has been
     * added to the map.
     */
    onAdd() {
      this.div = document.createElement("div");
      this.div.style.borderStyle = "none";
      this.div.style.borderWidth = "0px";
      this.div.style.position = "absolute";
      // Create the img element and attach it to the div.
      const img = document.createElement("img");
      img.src = this.image;
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.position = "absolute";
      img.style.opacity = "80%";

      this.div.appendChild(img);
      // Add the element to the "overlayLayer" pane.
      const panes = this.getPanes();
      panes.overlayLayer.appendChild(this.div);
    }
    draw() {
      // We use the south-west and north-east
      // coordinates of the overlay to peg it to the correct position and size.
      // To do this, we need to retrieve the projection from the overlay.
      const overlayProjection = this.getProjection();
      // Retrieve the south-west and north-east coordinates of this overlay
      // in LatLngs and convert them to pixel coordinates.
      // We'll use these coordinates to resize the div.
      const sw = overlayProjection.fromLatLngToDivPixel(
        this.bounds.getSouthWest()
      );
      const ne = overlayProjection.fromLatLngToDivPixel(
        this.bounds.getNorthEast()
      );

      // Resize the image's div to fit the indicated dimensions.
      if (this.div) {
        this.div.style.left = sw.x + "px";
        this.div.style.top = ne.y + "px";
        this.div.style.width = ne.x - sw.x + "px";
        this.div.style.height = sw.y - ne.y + "px";
      }
    }
    /**
     * The onRemove() method will be called automatically from the API if
     * we ever set the overlay's map property to 'null'.
     */
    onRemove() {
      if (this.div) {
        this.div.parentNode.removeChild(this.div);
        delete this.div;
      }
    }
    /**
     *  Set the visibility to 'hidden' or 'visible'.
     */
    hide() {
      if (this.div) {
        this.div.style.visibility = "hidden";
      }
    }
    show() {
      if (this.div) {
        this.div.style.visibility = "visible";
      }
    }
    toggle() {
      if (this.div) {
        if (this.div.style.visibility === "hidden") {
          this.show();
        } else {
          this.hide();
        }
      }
    }
    toggleDOM(map) {
      if (this.getMap()) {
        this.setMap(null);
      } else {
        this.setMap(map);
      }
    }
    getData() {
      return this.data;
    }
    setData(newData) {
      if (newData) {
        this.data = newData;
      }
    }
  }
  //-------------------------------------------------------------------------------------

  // Prep footprint overlay
  overlay = new FootprintOverlay(null, null);

  var firebaseConfig = {
    apiKey: "AIzaSyBApvOreZf2JX3Ew9MazDduL_EgGf-RSDU",
    authDomain: "air-tracker-edf.firebaseapp.com",
    databaseURL: "https://air-tracker-edf.firebaseio.com",
    projectId: "air-tracker-edf",
    storageBucket: "air-tracker-edf.appspot.com",
    messagingSenderId: "688008459229",
    appId: "1:688008459229:web:e4650919402c7a71a33c34"
  };

  // Initialize Firebase
  firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();

  var lineSymbol = {
    path: 'M 0,-1 0,1',
    strokeOpacity: 1,
    scale: 2
  };

  var plumeClickRegion = new google.maps.Polyline({
    strokeColor: '#000000',
    strokeOpacity: 0,
    icons: [{
      icon: lineSymbol,
      offset: '0',
      repeat: '12px'
    }],
    path: [
           {lat: 40.905, lng: -112.105}, {lat: 40.39508, lng: -112.105},
           {lat: 40.39508, lng: -111.745},
           {lat: 40.39508, lng: -111.745}, {lat: 40.905, lng: -111.745},
           {lat: 40.905, lng: -112.105}
          ],
    map: map,
    clickable: false
  });

  $(document).on("keydown",function(e) {
    switch (e.keyCode) {
      case 32:
        if (playbackTimeline.isActive()) {
          playbackTimeline.togglePlayPause();
        }
        break;
      case 37:
        if (playbackTimeline.isActive()) {
          playbackTimeline.seekControlAction("left");
        }
        break;
      case 39:
        if (playbackTimeline.isActive()) {
          playbackTimeline.seekControlAction("right");
        }
        break;
    }
  });

  widgets.setCustomLegend($("#legend"));
  if ($(window).width() < 450) {
    $( ".custom-legend" ).accordion( "option", "active", false );
  }

  initFootprintDialog();
  initDomElms();

  createDataPullWebWorker();


  $(".shareViewModal").dialog({
    resizable: false,
    autoOpen: false,
    dialogClass: "customDialog",
    modal: true,
    open: function() {
      $(".shareurl").text(getShareUrl());
    }
  });

  $(".close-share").on("click", function() {
    $( ".shareViewModal" ).dialog('close');
  })

  $(window).resize(function() {
    $(".shareViewModal").dialog("option", "position", {my: "center", at: "center", of: window});
  });

  $(".shareurl-copy-text-button").click(function(event) {
    var $this = $(this);
    var element = $this.prev(".always-selectable")[0];
    var range, select;
    if (document.body.createTextRange) {
      range = document.body.createTextRange();
      range.moveToElementText(element);
      range.select();
    } else if (document.createRange) {
      range = document.createRange();
      range.selectNode(element)
      select = window.getSelection();
      select.removeAllRanges();
      select.addRange(range);
    }
    document.execCommand('copy');
    setButtonTooltip("Copied", $this, 1000);
    window.getSelection().removeAllRanges();
  });

  $("#get-screenshot").on("click", async function() {
    /*var tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = 1920;
    tmpCanvas.height = 1080;*/

    if ($(this).hasClass("waiting")) return;

    $(this).addClass("waiting").text("Generating...");
    //var ratio = Math.max(1920/$("#map").width(), 1080/$("#map").height());

    var canvas = await html2canvas(document.getElementById('map'),
    {
      /*canvas: tmpCanvas,*/
      useCORS: true,
      allowTaint: true,
      logging: false,
      /*scale: ratio,*/
      /*onclone: function() {
        var tmpCanvasCtx = tmpCanvas.getContext("2d");
        var ratio = [1920/$("#map").width(), 1080/$("#map").height()];
        ratio = Math.max(ratio[0], ratio[1]);
        tmpCanvasCtx.scale(ratio, ratio);
      },*/
      ignoreElements: function( element ) {
        // Ignore the zoom controls on Google Maps
        if (element.classList.contains('gm-bundled-control')) {
          return true;
        }
      }
    });
    var exportImage = canvas.toDataURL();
    var currentPlaybackTimeInMs = playbackTimeline.getPlaybackTimeInMs();
    var isDaylineOpen = playbackTimeline.isActive();
    var momentTime = moment.tz(currentPlaybackTimeInMs, DEFAULT_TZ);
    var dateStr = isDaylineOpen ? momentTime.format("YYYYMMDDHHmm") : momentTime.startOf("day").format("YYYYMMDDHHmm");
    download(exportImage, dateStr + ".png", "image/png");
    $(this).removeClass("waiting").text("Capture Screenshot");
  });

  google.maps.event.addListener(map, 'idle', function(e) {
    if (!playbackTimeline || !timeline) return;
    changeBrowserUrlState();
  });

  // !!DO LAST!!

  // Draw TRAX locations on the map
  traxLocations = await getTraxLocations();
  for (var traxid in traxLocations) {
    let traxMarker = new google.maps.Circle({
      strokeOpacity: 0,
      strokeWeight: 2,
      fillColor: "#000000",
      fillOpacity: 0,
      map,
      center: traxLocations[traxid],
      radius: 90,
      getData: function() { return traxDataByEpochTimeInMs[playbackTimeline.getPlaybackTimeInMs()][this.traxId]; }
    });
    traxLocations[traxid].marker = traxMarker;
    traxLocations[traxid].marker['traxId'] = traxid;
    google.maps.event.addListener(traxMarker, 'click', function (e) {
      // Handle TRAX click event
      selectedSensorMarker = this;
      handleTRAXMarkerClicked(this);
    });
    traxMarker.setVisible(false);
    traxMarkers.push(traxMarker)
  }
}

var changeBrowserUrlState = function() {
  window.history.replaceState({}, "", getShareUrl());
}

var getShareUrl = function() {
  var parentUrl = "";
  var sourceUrl = window.location.href.split("?")[0];
  if (window.top === window.self) {
    // no iframe
    parentUrl = sourceUrl;
  } else {
    // inside iframe
    try {
      parentUrl = window.top.location.href.split("?")[0];
    } catch(e) {
      parentUrl = document.referrer.split("?")[0];
    }
  }
  // View is saved as a center view (lat, lng, zoom)
  var viewStr = map.getCenter().toString().replace(/\(|\)| /g, '') + "," + map.getZoom();
  var timeStr = playbackTimeline.getPlaybackTimeInMs();
  //var isDaylineOpen = playbackTimeline.isActive();
  var urlVars = Util.parseVars(window.location.href);
  urlVars.v = viewStr;
  urlVars.t = timeStr;
  var urlVarsString = "?";
  for (var urlVar in urlVars) {
    urlVarsString += urlVar + "=" + urlVars[urlVar] + "&";
  }
  // Remove trailing &
  urlVarsString = urlVarsString.slice(0, -1);
  return parentUrl + urlVarsString;
}

var setButtonTooltip = function(text, $target, duration) {

  var $thumbnailPreviewCopyTextButtonTooltip = $(".thumbnail-copy-text-button-tooltip");
  var $thumbnailPreviewCopyTextButtonTooltipContent = $(".thumbnail-copy-text-button-tooltip").find("p");

  if ($target && ($target.hasClass("ui-button") && $target.button("option", "disabled"))) {
    return;
  }

  var targetOffset = $target.offset();
  var tooltipWidth;
  // The container is the body, so just use 0, 0
  var containerOffset = {left: 0, top: 0};

  if (text) {
    $thumbnailPreviewCopyTextButtonTooltipContent.text(text);
    $thumbnailPreviewCopyTextButtonTooltip.show();
    tooltipWidth = $thumbnailPreviewCopyTextButtonTooltip.outerWidth();
    $thumbnailPreviewCopyTextButtonTooltip.css({
      left: targetOffset.left - (tooltipWidth / 2 - ($target.outerWidth() / 2)) - containerOffset.left + "px",
      top: targetOffset.top - containerOffset.top - 45 + "px"
    });
  } else {
    $thumbnailPreviewCopyTextButtonTooltip.hide();
  }

  if (duration) {
    clearTimeout($thumbnailPreviewCopyTextButtonTooltipContent.hideTimer);
    $thumbnailPreviewCopyTextButtonTooltipContent.hideTimer = setTimeout(function() {
      $thumbnailPreviewCopyTextButtonTooltip.hide();
    }, duration);
  }
};


function createDataPullWebWorker() {
  // Create the worker.
  dataFormatWorker = new Worker("./assets/js/formatAndMergeSensorDataWorker.js");
  // Hook up to the onMessage event, so you can receive messages from the worker.
  dataFormatWorker.onmessage = receivedWorkerMessage;
}


function initDomElms() {
  $("#share-picker").show().button({
    icons: {
      primary: "ui-icon-custom-share-black"
    },
    text: false
  }).on("click", function() {
    $(".shareViewModal").dialog('open');
  });
  $infobarPollution = $("#infobar-pollution");
  $infobarWind = $("#infobar-wind");
  $infobarPlume = $("#infobar-plume");
  $infobarHeader = $("#infobar-location-header");
  $playbackTimelineContainer = $("#playback-timeline-container")
  $controls = $("#controls");
  $calendarChosenDayIndicator = $(".calendar-specific-day");
  $calendarBtn = $("#calendar-btn");
  $dayTimeToggle = $(".timestampPreview");
  $infobarComponentContainer = $("#infobar-component-container");
  $infobarInitial = $("#infobar-initial");
  verticalTouchScroll($infobarInitial);
}

async function handleDraw(timeInEpoch, doOverview, fromDaySelection) {
  if (doOverview && !fromDaySelection) {
    // animate ESDR (and eventually other) sensors
    await showSensorMarkersByTime(timeline.selectedDayInMs);
  } else if (!doOverview) {
    // animate trax data
    await getTraxInfoByPlaybackTime(timeInEpoch);
    // animate ESDR (and eventually other) sensors
    updateSensorsByEpochTime(timeInEpoch, true);
  }
  await sensorsLoadedPromise;

  var primaryInfoPopulator = selectedSensorMarker;
  // Handle case where a user has clicked on the map where a trax sensor can be but it is not yet visible.
  //  As time plays, however, it may become visible, so allow for the info panel to see this info when the train passes by.
  if (selectedLocationPin) {
    for(var x = 0; x < traxMarkers.length; x++) {
      if (!selectedSensorMarker && traxMarkers[x].visible && traxMarkers[x].getBounds().contains(selectedLocationPin.getPosition())) {
        primaryInfoPopulator = traxMarkers[x];
        selectedSensorMarker = primaryInfoPopulator;
        break;
      }
    }
  }

  // animate footprint
  if (overlay && (overlay.projection || selectedLocationPin)) {
    var overlayData = overlay.getData();
    await drawFootprint(overlayData.lat, overlayData.lng, false);
    if (!primaryInfoPopulator) {
      primaryInfoPopulator = overlay;
    }
  }

  // Update info panel
  if (primaryInfoPopulator) {
    updateInfoBar(primaryInfoPopulator);
  }

  // update time jump modal
  playbackTimeline.updateTimeJumpMenu();
}


async function getMostRecentFootprintTimeInMs() {
  if (mostRecentAvailableFootprintTimeInMs) {
    return mostRecentAvailableFootprintTimeInMs;
  }
  var snapshot = await  db.collection("stilt-prod").orderBy("job_id").limitToLast(1).get();
  var jobId = snapshot.docs[0].get("job_id");
  var dateString = jobId.split("_")[0];
  mostRecentAvailableFootprintTimeInMs = moment.tz(dateString, "YYYYMMDDhhmm", "UTC").valueOf();
  //mostRecentAvailableFootprintTimeStr = moment.tz(mostRecentAvailableFootprintTimeInMs, "UTC").tz(DEFAULT_TZ).format("h:mm A");
  return mostRecentAvailableFootprintTimeInMs;
}


async function drawFootprint(lat, lng, fromClicked) {
  if (!fromClicked && !selectedLocationPin) {
    return;
  }
  if ( typeof drawFootprint.firstTime == 'undefined' && localStorage.dontShowFootprintPopup != "true") {
    $footprint_dialog.dialog("open");
    $(" .custom-dialog-flat ").css('width','350px');
    drawFootprint.firstTime = false; //do the initialisation
    $('input[type="checkbox"]').click(function(){
      if($(this).prop("checked") == true){
          localStorage.dontShowFootprintPopup = "true";
      }
    });
  }

  var previousFootprintData = overlay.getData();
  // Clear existing footprint if there is one and we are not stepping through time
  if (fromClicked) {
    if (overlay) {
      overlay.setMap(null);
      overlay.setData({});
    }
    if (selectedLocationPin) {
      selectedLocationPin.setMap(null);
      selectedLocationPin = null;
    }
  }

  var playbackTimeInMs = playbackTimeline.getPlaybackTimeInMs();

  if (!playbackTimeline.isActive()) {
    if (timeline.selectedDayInMs == startOfLatestAvailableDay) {
      var latestFootprintTimeInMs = await getMostRecentFootprintTimeInMs();
      if (moment.tz(latestFootprintTimeInMs, "UTC").isSame(moment.tz(timeline.selectedDayInMs, "UTC"), 'day')) {
        playbackTimeInMs = latestFootprintTimeInMs;
      } else {
        playbackTimeInMs = timeline.selectedDayInMs;
      }
    } else {
      playbackTimeInMs = timeline.selectedDayInMs;
    }
  }

  var m_date = moment(playbackTimeInMs).tz(DEFAULT_TZ);
  // Check if current day
  //var is_current_day = m_date.format("YYYY-MM-DD") === current_day_str;

  // Footprints are hourly
  var m_closestDate = m_date.startOf("hour");
  var closestDate = m_closestDate.toDate();
  var closestDateEpoch = m_closestDate.valueOf();
  var isoString = closestDate.toISOString();
  var yearMonthDay = isoString.split("T")[0].split("-");
  var hourMinute = isoString.split("T")[1].split(":");

  // The hour has not changed, so keep previous plume up
  if (overlay.getData().isoString == isoString) {
    return;
  }

  var latTrunc = lat.toFixed(2);
  var latOffset = lat - latTrunc;
  var lngTrunc = lng.toFixed(2);
  var lngOffset = lng - lngTrunc;

  var overlayData = {
    'is_current_day' : playbackTimeline.isActive(),
    'isoString' : isoString,
    'lat' : lat,
    'lng' : lng,
    'sensorType' : "plume-backtrace",
    'name' : latTrunc + ", " + lngTrunc
  };

  var data;
  var iconPath;
  var loc = latTrunc + "," + lngTrunc

  if (plume_backtraces[loc] && plume_backtraces[loc][closestDateEpoch]) {
    data = plume_backtraces[loc][closestDateEpoch];
  } else {
    // STILT job ids don’t use trailing zeros, so do parseFloat to remove them.
    var docRefString = yearMonthDay[0] + yearMonthDay[1] + yearMonthDay[2] + hourMinute[0] + hourMinute[1] + "_" + parseFloat(lngTrunc) + "_" + parseFloat(latTrunc) + "_1";
    //console.log(docRefString)
    const snapshot = await  db.collection(STILT_COLLECTION_NAME).doc(docRefString).get();
    data = snapshot.data();
    if (!plume_backtraces[loc]) {
      plume_backtraces[loc] = {};
    }
  }

  if (data) {
    overlayData['hasData'] = true;
    var { image, location, time, extent } = data;
    var timeInMs = time.seconds * 1000;
    plume_backtraces[loc][timeInMs] = data;
    overlayData['epochtimeInMs'] = timeInMs;
    overlay.set('image', image);
    const bounds = new google.maps.LatLngBounds(
      new google.maps.LatLng(extent.ymin + latOffset, extent.xmin + lngOffset),
      new google.maps.LatLng(extent.ymax + latOffset, extent.xmax + lngOffset)
    );
    overlay.set('bounds', bounds);
    overlay.setMap(map);
    overlay.show();
    if (!fromClicked && !previousFootprintData.hasData) {
      if (selectedLocationPin) {
        selectedLocationPin.setMap(null);
        selectedLocationPin = null;
      }
    }
  } else {
    overlayData['hasData'] = false;
    iconPath = 'assets/img/gray-pin.png';
    if (!fromClicked && previousFootprintData.hasData) {
      if (selectedLocationPin) {
        selectedLocationPin.setMap(null);
        selectedLocationPin = null;
      }
      if (overlay) {
        overlay.hide();
      }
    }
  }

  overlay.setData(overlayData);

  if (!fromClicked && ((previousFootprintData.hasData && overlayData['hasData']) || (previousFootprintData.hasData == false && !overlayData['hasData']))) {
    return;
  }

  if (fromClicked) {
    expandInfobar();
  }

  // TODO: Set this once and just update position and icon
  selectedLocationPin = new google.maps.Marker({
    position: new google.maps.LatLng(lat,lng),
    map,
    title: "Selected Location",
    animation: fromClicked ? google.maps.Animation.DROP : null,
    icon: iconPath
  });

  google.maps.event.addListener(selectedLocationPin, 'click', function (e) {
    if (selectedLocationPin) {
      selectedLocationPin.setMap(null);
      selectedLocationPin = null;
    }
    overlay.setMap(null);
    resetInfobar();
  });

}


function toggleInfobar() {
  $infobar.toggleClass("closed");
  //var infobar = $("#infobar")[0];
  //infobar.style.visibility = 'hidden';
  //overlay.setMap(null);
  //if (selectedLocationPin) {
  //  selectedLocationPin.setMap(null);
  //  selectedLocationPin = null;
  //}
}


function expandInfobar() {
  //get infobar element
  $infobar.removeClass("closed");
  $infobarComponentContainer.show();
  $infobarInitial.hide();
}

function resetInfobar() {
  $infobarComponentContainer.hide();
  $infobarInitial.show();
  $infobarHeader.hide();
}


async function loadSensorList(sensors) {
  for (var i = 0; i < sensors.length; i++) {
    var markers = sensors[i].markers;
    for (var j = 0; j < markers.length; j++) {
      sensors_list.push(markers[j]);
    }
  }

  if (showPurpleAir) {
    var purple_airs = await loadPurpleAirSensorList();
    for (var j = 0; j < purple_airs.length; j++) {
      purpleair_list.push(purple_airs[j]);
    }
  }
}

async function receivedWorkerMessage(event) {
  var result = event.data.result;
  var info = event.data.info;
  var epochtime_milisec = event.data.epochtime_milisec;
  var is_current_day = event.data.is_current_day;
  var sensor_names = Object.keys(result);
  for (var i = 0; i < info.length; i++) {
    var sensor = esdr_sensors[info[i]['name']];
    if (sensor) {
      var marker = sensor['marker'];
      marker.setData(parseSensorMarkerData(result[sensor_names[i]].data[epochtime_milisec], is_current_day, info[i]));
      marker.updateMarker();
    } else {
      createAndShowSensorMarker(result[sensor_names[i]].data[epochtime_milisec], epochtime_milisec, is_current_day, info[i]);
    }
  }

  jQuery.extend(true, esdr_sensors, result);
  dataFormatWorkerIsProcessing = false;
  sensorsLoadedResolver(null);
}

async function loadAndCreateSensorMarkers(epochtime_milisec, info, is_current_day) {
  var [multiUrl, resultsMapping] = generateSensorDataMultiFeedUrl(epochtime_milisec, info);
  var data = await loadMultiSensorData(multiUrl);
  var lastIdx = 0;
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

    var tmp = formatAndMergeSensorData(dataSegment, info[i]);
    // Roll the sensor data to fill in some missing values
    tmp = rollSensorData(tmp, info[i]);

    if (!esdr_sensors[info[i]["name"]]) {
      esdr_sensors[info[i]["name"]] = {"data" : {}};
      createAndShowSensorMarker(tmp, epochtime_milisec, is_current_day, info[i]);
    } else {
      var marker = esdr_sensors[info[i]['name']]['marker'];
      marker.setData(parseSensorMarkerData(tmp, is_current_day, info[i]));
      marker.updateMarker();
    }
    esdr_sensors[info[i]["name"]]["data"][epochtime_milisec] = tmp;
  }
  sensorsLoadedResolver(null);
}

async function loadAndCreateSensorMarker(epochtime_milisec, info, is_current_day, i) {
  // Generate a list of urls that we need to request
  var urls = generateSensorDataUrlList(epochtime_milisec, info);

  // Request urls and load all sensor data
  await loadSensorData(urls, function (responses) {
    // Merge all sensor data
    var data = formatAndMergeSensorData(responses, info);
    // Roll the sensor data to fill in some missing values
    data = rollSensorData(data, info);
    // For VOC sensors with faster sampling rates, we need to average data points
    data = aggregateSensorData(data, info);
    // Create markers
    if (!esdr_sensors[info["name"]]) {
      esdr_sensors[info["name"]] = {"data" : {}};
      createAndShowSensorMarker(data, epochtime_milisec, is_current_day, info, i);
    } else {
      var marker = esdr_sensors[info['name']]['marker'];
      marker.setData(parseSensorMarkerData(data, is_current_day, info));
      marker.updateMarker();
    }
    esdr_sensors[info["name"]]["data"][epochtime_milisec] = data;
    //createAndShowSensorMarker(data, epochtime_milisec, is_current_day, info, i);
    //createMarkerTableFromSensorData(data, epochtime_milisec, info, i);
  });
}


function createAndShowSensorMarker(data, epochtime_milisec, is_current_day, info, i) {
  return new CustomMapMarker({
    "type": getSensorType(info),
    "sensor_type" : info['marker_type'],
    "marker_icon_size" : info['marker_type'] == "purple_air" ? 12 : null,
    "marker_draw_level_padding" : info['marker_type'] != "purple_air" ? 10 : null,
    "data": parseSensorMarkerData(data, is_current_day, info),
    "click": function (marker) {
      selectedSensorMarker = marker;
      handleSensorMarkerClicked(marker);
    },
    "complete": function (marker) {
      // Make the maker visible on the map when the maker is created
      // Make sure that the desired time matches the current time
      // (if user selects the time block too fast, they will be different)
      if (epochtime_milisec == selected_day_start_epochtime_milisec) {
        showMarkers([marker]);
      }
      esdr_sensors[info['name']]['marker'] = marker;
      esdr_sensors[info['name']]['info'] = info;
    }
  });
}


function parseSensorMarkerDataForPlayback(data, info, is_current_day) {
  var sensor_type = getSensorType(info);
  if (typeof sensor_type === "undefined") return undefined;
  var marker_data = {
    "is_current_day": typeof(is_current_day) === "undefined" ? true : is_current_day,
    "name": info["name"],
    "latitude": info["latitude"],
    "longitude": info["longitude"],
    "feed_id": sensor_type == "WIND_ONLY" ? info["sensors"]["wind_direction"]["sources"][0]["feed"] : info["sensors"][sensor_type]["sources"][0]["feed"]
  };
  if (typeof data === "undefined") return marker_data;
  // For PM25 or VOC (these two types cannot both show up in info)
  if (typeof data[sensor_type] !== "undefined" && sensor_type != "WIND_ONLY") {
    if (typeof data[sensor_type] === "object") {
      marker_data["sensor_value"] = roundTo(data[sensor_type]["value"], 2);
      marker_data["sensor_data_time"] = data[sensor_type]["time"] * 1000;
    } else {
      marker_data["sensor_value"] = roundTo(data[sensor_type], 2);
      marker_data["sensor_data_time"] = data["time"] * 1000;
    }
  }
  // For wind direction
  if (typeof data["wind_direction"] !== "undefined") {
    if (typeof data["wind_direction"] === "object") {
      marker_data["wind_direction"] = roundTo(data["wind_direction"]["value"], 2);
      marker_data["wind_data_time"] = data["wind_direction"]["time"] * 1000;
    } else {
      marker_data["wind_direction"] = roundTo(data["wind_direction"], 2);
      marker_data["wind_data_time"] = data["time"] * 1000;
    }
  }
  // For wind speed
  if (typeof data["wind_speed"] !== "undefined") {
    if (typeof data["wind_speed"] === "object") {
      marker_data["wind_speed"] = roundTo(data["wind_speed"]["value"], 2);
    } else {
      marker_data["wind_speed"] = roundTo(data["wind_speed"], 2);
    }
  }
  return marker_data;
}


function parseSensorMarkerData(data, is_current_day, info, i) {
  var sensor_type = getSensorType(info);
  if (typeof sensor_type === "undefined") return undefined;
  var marker_data = {
    "is_current_day": is_current_day,
    "name": info["name"],
    "latitude": info["latitude"],
    "longitude": info["longitude"],
    "feed_id": sensor_type == "WIND_ONLY" ? info["sensors"]["wind_direction"]["sources"][0]["feed"] : info["sensors"][sensor_type]["sources"][0]["feed"]
  };

  if (is_current_day) {
    ///////////////////////////////////////////////////////////////////////////////
    // If the selected day is the current day
    if (typeof i === "undefined") {
      i = data["data"].length - 1;
    }
    var d = data["data"][i];
    if (typeof d === "undefined") return marker_data;
    // For PM25 or VOC (these two types cannot both show up in info)
    if (typeof d[sensor_type] !== "undefined" && sensor_type != "WIND_ONLY") {
      if (typeof d[sensor_type] === "object") {
        marker_data["sensor_value"] = roundTo(d[sensor_type]["value"], 2);
        marker_data["sensor_data_time"] = d[sensor_type]["time"] * 1000;
      } else {
        marker_data["sensor_value"] = roundTo(d[sensor_type], 2);
        marker_data["sensor_data_time"] = d["time"] * 1000;
      }
    }
    // For wind direction
    if (typeof d["wind_direction"] !== "undefined") {
      if (typeof d["wind_direction"] === "object") {
        marker_data["wind_direction"] = roundTo(d["wind_direction"]["value"], 2);
        marker_data["wind_data_time"] = d["wind_direction"]["time"] * 1000;
      } else {
        marker_data["wind_direction"] = roundTo(d["wind_direction"], 2);
        marker_data["wind_data_time"] = d["time"] * 1000;
      }
    }
    // For wind speed
    if (typeof d["wind_speed"] !== "undefined") {
      if (typeof d["wind_speed"] === "object") {
        marker_data["wind_speed"] = roundTo(d["wind_speed"]["value"], 2);
      } else {
        marker_data["wind_speed"] = roundTo(d["wind_speed"], 2);
      }
    }
  } else {
    if (sensor_type == "WIND_ONLY") return null;
    ///////////////////////////////////////////////////////////////////////////////
    // If the selected day is not the current day, use the max
    var data_max = data["summary"]["max"];
    if (typeof data_max[sensor_type] !== "undefined") {
      marker_data["sensor_value"] = roundTo(data_max[sensor_type]["value"], 2);
      marker_data["sensor_data_time"] = data_max[sensor_type]["time"] * 1000;
    }
  }

  return marker_data;
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


function generateSensorDataUrlList(epochtime_milisec, info) {
  var esdr_root_url = "https://esdr.cmucreatelab.org/api/v1/";
  var epochtime = parseInt(epochtime_milisec / 1000);
  var time_range_url_part = "/export?format=json&from=" + epochtime + "&to=" + (epochtime + 86399);

  // Parse sensor info into several urls (data may come from different feeds and channels)
  var sensors = info["sensors"];
  var feeds_to_channels = {};
  for (var k in sensors) {
    var sources = safeGet(sensors[k]["sources"], []);
    for (var i = 0; i < sources.length; i++) {
      var s = sources[i];
      var feed = s["feed"];
      var channel = s["channel"];
      if (feed in feeds_to_channels) {
        feeds_to_channels[feed].push(channel);
      } else {
        feeds_to_channels[feed] = [channel];
      }
    }
  }

  // Assemble urls
  var urls = [];
  for (var f in feeds_to_channels) {
    urls.push(esdr_root_url + "feeds/" + f + "/channels/" + feeds_to_channels[f].toString() + time_range_url_part);
  }

  return urls;
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

  // Remove any duplicates
  //feeds_to_channels = feeds_to_channels.filter(function(item, index, inputArray) {
  //  return inputArray.indexOf(item) == index;
  //});
  return [esdr_root_url + "feeds/export/" + feeds_to_channels.toString() + time_range_url_part, sensors_to_feeds_end_index];
}


async function loadSensorData(urls, callback) {
  var deferreds = [];
  var responses = [];
  for (var i = 0; i < urls.length; i++) {
    deferreds.push($.getJSON(urls[i], function (json) {
      responses.push(json);
    }));
  }
  await $.when.apply($, deferreds).then(function () {
    if (typeof callback === "function") {
      callback(responses);
    }
  });
}


async function loadPurpleAirSensorList() {
  let result;
  try {
      result = await $.ajax({
        url: "purpleair.json",
        dataType : 'json',
      });
      return result;
  } catch (error) {
      console.error(error);
      return {};
  }
}

async function loadMultiSensorData(url) {
  let result;
  try {
      result = await $.ajax({
        url: url,
        dataType : 'json',
      });
      return result;
  } catch (error) {
      console.error(error);
      return {};
  }
}

function formatAndMergeSensorDataLite(responses, info) {
  if (!Array.isArray(responses)) {
    responses = [responses];
  }
  console.log(responses)
  var channels = Object.keys(info['sensors']);
  // Add to start of array
  channels.unshift("time")
  var formatted_data = [];
  var max_data = {};
  for (var i = 0; i < responses.length; i++) {
    for (var row of responses[i].data) {
      var data = {};
      for (var col = 0; col < row.length; col++) {
        var channel_name = channels[col];
        data[channel_name]= row[col];
        if (col > 0 && (!max_data[channel_name] || row[col] > max_data[channel_name].value)) {
          max_data[channel_name] = {time: row[0], value : row[col]};
        }
      }
      formatted_data.push(data);
    }
  }
  return {
    data : formatted_data,
    summary : {
      max: max_data
    }
  };
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
  if (info['marker_type'] != "purple_air" && (sensor_type == "PM25" || sensor_type == "WIND_ONLY")) {
    return data;
  }
  if (data.length <= 1) {
    return data;
  }

  function round(date, duration, method) {
    return moment(Math[method]((+date) / (+duration)) * (+duration));
  }

  var new_data = [];
  //var threshold = 1800; // average previous 30 minutes of data
  var threshold = 900; // average previous 15 minutes of data
  var current_time = round(moment(data[0][0] * 1000), moment.duration(threshold, "seconds"), "floor").valueOf() / 1000;
  var current_sum = 0;
  var count = 0;
  for (var col = 1; col < data[0].length; col++) {
    for (var row = 0; row < data.length; row++) {
      var time = data[row][0];
      if (time - current_time <= threshold) {
        current_sum +=  data[row][col];
        count++;
      } else {
        new_data.push([current_time, current_sum / count]);
        current_sum = data[row][col];
        count = 1;
        current_time += threshold;
      }
    }
  }
  return new_data;
}


// Safely get the value from a variable, return a default value if undefined
function safeGet(v, default_val) {
  if (typeof default_val === "undefined") default_val = "";
  return (typeof v === "undefined") ? default_val : v;
}


// TODO: Refactor so we are not passing in a marker but pulling state elsewhere.
function updateInfoBar(marker) {
  if (!marker) return;

  var markerData = marker.getData();

  // This is likely the case where we clicked on TRAX and incremented time, thus that marker is no longer valid.
  if (!markerData) {
    if (overlay) {
      markerData = overlay.getData();
    }
  }

  var isDaySummary = !markerData['is_current_day'] && markerData.sensorType != "trax";

  var markerDataTimeInMs = markerData.sensorType ==  "trax" || markerData.sensorType  == "plume-backtrace" ? markerData['epochtimeInMs'] : markerData['sensor_data_time'] || markerData['wind_data_time'];
  var markerDataTimeMomentFormatted = moment.tz(markerDataTimeInMs, DEFAULT_TZ).format("h:mm A (zz)");

  // Set infobar header to sensor name (if TRAX or AirNow) or clicked lat/lon coords otherwise
  $infobarHeader.show();
  var infobarHeader = $infobarHeader[0];
  var markerName = markerData.sensorType ==  "trax" ? "TRAX "+ formatTRAXLineName(marker.traxId) + " Line" : markerData.name;
  infobarHeader.innerHTML = markerName;

  // Show sensor pollution value (PM25) in infobar
  var sensorVal = markerData.sensorType == "trax" ? markerData['pm25'] : markerData['sensor_value'] || 0;
  if (selectedSensorMarker) {
    if (isDaySummary) {
      setInfobarSubheadings($infobarPollution,"",sensorVal,PM25_UNIT,"Daily Max");
    } else {
      if (sensorVal >= 0) {
        setInfobarSubheadings($infobarPollution,"",sensorVal,PM25_UNIT,markerDataTimeMomentFormatted);
      } else {
        // Clicked on a trax sensor, which is now invisible since the time does not match for it.
        setInfobarUnavailableSubheadings($infobarPollution,"Click on nearest sensor to see pollution readings.");
      }
    }
  } else {
    setInfobarUnavailableSubheadings($infobarPollution,"Click on nearest sensor to see pollution readings.")
  }

  // If time selected, show sensor wind in infobar
  if (selectedSensorMarker) {
    if (isDaySummary) {
      setInfobarUnavailableSubheadings($infobarWind,"Click the clock icon to explore wind information for this past day.");
    } else {
      if (markerData['wind_direction']) {
        setInfobarSubheadings($infobarWind,"",getWindDirFromDeg(markerData['wind_direction']), " at " + markerData['wind_speed'] + " mph",markerDataTimeMomentFormatted);
      } else {
        setInfobarUnavailableSubheadings($infobarWind,"Click on the nearest wind arrow to see wind measurements.")
      }
    }
  } else {
    setInfobarUnavailableSubheadings($infobarWind,"Click on the nearest wind arrow to see wind measurements.")
  }

  // Show plume backtrace information
  if (overlay) {
    var overlayData = overlay.getData();
    var infobarPlume = $infobarPlume;
    var infoStr = "";
    if (overlayData.hasData) {
      infoStr = "Snapshot from model at " + moment.tz(overlayData['epochtimeInMs'], DEFAULT_TZ).format("h:mm A (zz)");
      setInfobarSubheadings(infobarPlume,infoStr,"","","");
      infobarPlume.children(".infobar-text").addClass('display-unset');
    } else {
      infoStr = "No pollution backtrace available at " + moment.tz(playbackTimeline.getPlaybackTimeInMs(), DEFAULT_TZ).format("h:mm A (zz)");
      setInfobarUnavailableSubheadings(infobarPlume,infoStr);
      infobarPlume.children(".infobar-text").removeClass('display-unset');
    }
  }
}


function setInfobarSubheadings($element, text, data, unit, time) {
  $element.children(".infobar-text")[0].innerHTML = text;
  $element.children(".infobar-data")[0].innerHTML = typeof(data) === "string" ? data : roundTo(data,2);
  $element.children(".infobar-unit")[0].innerHTML = unit;
  $element.children(".infobar-time")[0].innerHTML = time;
  $element.children(".infobar-data").show();
  $element.children(".infobar-data-intro").show();
  $element.children(".infobar-unit").removeClass('mobile-only-error');
  $element.children(".infobar-time").show();
}


function setInfobarUnavailableSubheadings($element, text) {
  setInfobarSubheadings($element,text,"-","No Data","—");
  $element.children(".infobar-data").hide();
  $element.children(".infobar-data-intro").hide();
  $element.children(".infobar-unit").addClass('mobile-only-error');
  $element.children(".infobar-time").hide();
}


async function handleSensorMarkerClicked(marker) {
  //if (selectedLocationPin) { selectedLocationPin.setMap(null) };

  await drawFootprint(marker.getData()['latitude'], marker.getData()['longitude'], true);

  updateInfoBar(marker);
}


async function handleTRAXMarkerClicked(marker, fromAnimate) {
  // (selectedLocationPin) { selectedLocationPin.setMap(null) };

  await drawFootprint(traxLocations[marker.traxId]['lat'], traxLocations[marker.traxId]['lng'], !fromAnimate);

  updateInfoBar(marker);
}


function formatTRAXLineName(traxID) {
  var lineID = traxID[0];
  var idToName = {
    'b': 'Blue',
    'g': 'Green',
    'r': 'Red'
  };
  return idToName[lineID];
}


function formatPM25(val) {
  if (val){
    return val.toFixed(1) + " μg/m3";
  }
  else {
    return "No PM 2.5 data available ";
  }
}


function formatWind(speed,deg) {
  var returnString;
  if (speed){
    returnString = speed + " mph";
  } else {
    returnString = "Unknown speed";
  }
  if (deg) {
    returnString += " from " + getWindDirFromDeg(deg) + " direction"
  }
  if (!speed || !deg) {
    return "No wind data available ";
  }
  return returnString;
}


async function handleMapClicked(mapsMouseEvent) {
  //if (selectedLocationPin) { selectedLocationPin.setMap(null) };

  var fromClicked = !!mapsMouseEvent.domEvent;

  selectedSensorMarker = null;

  await drawFootprint(mapsMouseEvent.latLng.lat(),mapsMouseEvent.latLng.lng(), fromClicked);
  updateInfoBar(overlay)
}


function getWindDirFromDeg(deg) {
  // NOTE:
  // Wind information is reported in the direction _from_ which the wind is coming.
  // We say _from_ in the info window but our wind icon is showing _to_
  var val = Math.round((deg/22.5)+.5);
  var arr = ["N","NNE","NE","ENE","E","ESE", "SE", "SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return arr[(val % 16)];
}


//Object.keys(esdr_sensors).map(function(k){return esdr_sensors[k]['marker']})
function showMarkers(markers) {
  drewMarkersAtLeastOnce = true;
  markers = safeGet(markers, []);
  for (var i = 0; i < markers.length; i++) {
    if (typeof markers[i] !== "undefined") {
      markers[i].setMap(map);
    }
  }
}


async function showSensorMarkersByTime(epochtime_milisec) {
  if (typeof epochtime_milisec == "undefined") return;

  // Check if current day
  var date_str_sensor = moment(epochtime_milisec).tz(DEFAULT_TZ).format("YYYY-MM-DD");
  var is_current_day = date_str_sensor === current_day_str;

  var markers_with_data_for_chosen_epochtime = [];
  for (var sensorName in esdr_sensors) {
    var sensor = esdr_sensors[sensorName];
    if (sensor.data[epochtime_milisec]) {
      markers_with_data_for_chosen_epochtime.push(sensor.marker);
      sensor.marker.setData(parseSensorMarkerData(sensor.data[epochtime_milisec], is_current_day, sensor.info));
      sensor.marker.updateMarker();
    }
  }

  if (markers_with_data_for_chosen_epochtime.length > 0) {
    // Make sensors markers visible on the map
    showMarkers(markers_with_data_for_chosen_epochtime);
  } else {
    sensorsLoadedResolver = undefined;
    sensorsLoadedPromise = new Promise((resolve, reject) => { sensorsLoadedResolver = resolve});
    // The worker may already be processing so terminate it and create a new one.
    // There is overhead to this but significantly less than having it finish
    // the whatever the last worker was doing.
    if (dataFormatWorkerIsProcessing) {
      dataFormatWorker.terminate();
      createDataPullWebWorker();
      dataFormatWorkerIsProcessing = false;
    }
    dataFormatWorkerIsProcessing = true;
    // AirNow sensors
    dataFormatWorker.postMessage(
    { epochtime_milisec: epochtime_milisec,
      sensors_list: sensors_list,
      is_current_day : is_current_day }
    );

    // PurpleAirs
    if (showPurpleAir) {
      clearInterval(purpleAirLoadInterval);
      purpleAirLoadInterval = setInterval(function() {
        if (!dataFormatWorkerIsProcessing) {
          clearInterval(purpleAirLoadInterval);
          dataFormatWorker.postMessage(
          { epochtime_milisec: epochtime_milisec,
            sensors_list: purpleair_list,
            is_current_day : is_current_day }
          );
        }
      }, 50);
    }

  }
}


function handleTimelineToggling(e) {
  var $currentTarget = $(e.currentTarget);
  resetAllTrax();
  $playbackTimelineAnchor.show();
  if ($controls.hasClass("playbackTimelineOff")) {
    if ($currentTarget.prop("id") == "calendar-btn") return;
    isPlaybackTimelineToggling = true;
    playbackTimeline.setActiveState(true);
    $controls.removeClass("playbackTimelineOff");
    $calendarChosenDayIndicator.text($(".selected-block").data("label")).removeClass("hidden");
    $calendarBtn.addClass("playbackTimelineOn calendar-specific-day-icon").removeClass("force-hidden").prop("title", "Choose a different day");
    $dayTimeToggle.addClass("force-no-visibility");
    $("#timeline-handle").slideUp(500);
    playbackTimeline.seekTo(playbackTimeline.getCurrentFrameNumber());
  } else {
    if ($currentTarget.hasClass("playbackButton")) return;
    playbackTimeline.setActiveState(false);
    $calendarChosenDayIndicator.addClass("hidden");
    $calendarBtn.removeClass("playbackTimelineOn calendar-specific-day-icon").addClass("force-hidden").prop("title", "Calendar");
    $dayTimeToggle.removeClass("force-no-visibility");
    playbackTimeline.stopAnimate();
    $controls.addClass("playbackTimelineOff");
    $(".selected-block")[0].scrollIntoView(false);
    $("#timeline-handle").slideDown(500);
    handleDraw(mostRecentUpdateEpochTimeForLocationInMs, true, false);
  }
}

function initFootprintDialog() {
  $footprint_dialog = widgets.createCustomDialog({
    selector: "#footprint-first-click-dialog",
    show_cancel_btn: false,
    max_height: 405,
  });

  $(".ui-dialog-titlebar-close").on("click",function(){
    $footprint_dialog.hide();
  })
}


// Add horizontal scroll touch support to a jQuery HTML element.
var touchHorizontalScroll = function($elem) {
  var scrollStartPos = 0;
  $elem.on("touchstart", function(e) {
    scrollStartPos = this.scrollLeft + e.originalEvent.touches[0].pageX;
    e.preventDefault();
  }).on("touchmove", function(e) {
    this.scrollLeft = scrollStartPos - e.originalEvent.touches[0].pageX;
    e.preventDefault();
  });
};


// Add vertical scroll touch support to an HTML element
var verticalTouchScroll = function($elem){
  var el = $elem[0];
  var scrollStartPos = 0;
  el.addEventListener("touchstart", function(e) {
    if ($(this).hasClass("disableScroll")) return;
    scrollStartPos = this.scrollTop + e.touches[0].pageY;
    e.preventDefault();
  }, false);
  el.addEventListener("touchmove", function(e) {
    if ($(this).hasClass("disableScroll")) return;
    this.scrollTop = scrollStartPos - e.touches[0].pageY;
    e.preventDefault();
  }, false);
};


function roundTo(val, n) {
  var d = Math.pow(10, n);
  return Math.round(parseFloat(val) * d) / d;
}

function stepThroughExplanation(direction) {
  var $elm = $("#explanationstep-container");
  $("#footprint-first-click-dialog").scrollTop(0);
  var currentStep = parseInt($elm.data("current-step"));
  var maxSteps = parseInt($elm.data("max-steps"));
  currentStep += parseInt(direction);
  $elm.data("current-step", currentStep);
  $(".explanation-step-button").removeClass("disabled");
  if (currentStep == 1) {
    $("#explanationstep-back").addClass("disabled");
  } else if (currentStep == maxSteps) {
    $("#explanationstep-forward").addClass("disabled");
  }
  $('#footprint-first-click-dialog [id^="explanation-"].explanation-content').hide();
  $("#explanation-" + currentStep).show();
}


function pad(n) { return (n < 10 ? '0' : '') + n.toString(); };


function convertFrom24To12Format(time24) {
  var [sHours, minutes] = time24.match(/([0-9]{1,2}):([0-9]{2})/).slice(1);
  var period = +sHours < 12 ? 'AM' : 'PM';
  var hours = +sHours % 12 || 12;
  return hours + ":" + minutes + " " + period;
}
