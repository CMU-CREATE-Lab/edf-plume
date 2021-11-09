"use strict";

var map;
var playbackTimeline;
var $infobar;

var isLocal = ["localhost", "file:"].some(str => window.location.href.includes(str));
var TRAX_COLLECTION_NAME = "trax-dev";
var STILT_COLLECTION_NAME = "stilt-prod";
var STILT_GCLOUD_BUCKET = "https://storage.googleapis.com/storage/v1/b/air-tracker-edf-prod/o/by-simulation-id";
var ASSETS_ROOT = isLocal ? "./assets/" : "https://edf.createlab.org/assets/";
var CITY_DATA_ROOT = "https://edf.createlab.org/assets/data/cities/";
var HRRR_UNCERTAINTY_COLLECTION_NAME = "hrrr-uncertainty-v2-dev";
var PM25_UNIT = "ug/m3";
var MAP_ZOOM_CHANGEOVER_THRESHOLD = 8;
var FACILITY_MARKERS_TOGGLE_ZOOM_THRESHOLD = 13;

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
};

var dataFormatWorker;

var available_cities = {};
var selectedCity = "";
var selected_city_tmz = "";
var plume_backtraces = {};

var tourObj;

var selected_day_start_epochtime_milisec;
//var end_of_current_day_epoch = moment().tz(selected_city_tmz).endOf("day").valueOf();
var current_day_str = "";
var zoomChangedSinceLastIdle = false;
var currentZoom = -1;

var selectedLocationPin;
var selectedSensorMarker;
var overlay;
var purpleAirLoadInterval;

var db;

//var mostRecentUpdate12HourTimeForLocation;
var mostRecentUpdateEpochTimeForLocationInMs;
//var mostRecentDayStr;
//var mostRecentDayStrFull;
//var mostRecentAvailableFootprintTimeInMs;
//var mostRecentAvailableFootprintTimeStr;
var startOfLatestAvailableDay;

var sensorsLoadedResolver;
var sensorsLoadedPromise;

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
var dataFormatPurpleAirWorkerIsProcessing = false;
var inTour = false;

var traxDataByEpochTimeInMs = {};
var traxLocations = {};
var traxMarkers = [];
var hrrrWindErrorMarkers = [];
var hrrrWindErrorDataByEpochTimeInMs = {};

// DOM
var $infobarHeader;
var $infobarPollution;
var $infobarWind;
var $infobarPlume;
var $playbackTimelineContainer;
var $footprint_dialog;
var $playbackTimelineAnchor;
var $controls;
var $calendarChosenDayIndicator;
var $calendarBtn;
var $dayTimeToggle;
var $infobarComponentContainer;
var $infobarInitial;
var $purpleAirToggle;
var $traxToggle;
var $citySelector;
var $cityName;
var $map;
var $currentDateLegendText;
//var $currentDateLegendTextNone;
var $legend;
var $searchBoxClear;
var $searchBox;
var $searchBoxIcon;

var showHrrrWindDirectionError;
var showHrrrWindSpeedError;
var hrrrWindErrorPointLocations = {};
var defaultHomeView = {lat: 38.26796, lng: -100.57088, zoom: window.innerWidth <= 450 ? 4 : 5};
var startingView = Object.assign({}, defaultHomeView);

function isMobileView() {
  return $(window).width() <= 450;
}


function getSelectedCityTZ() {
  return selected_city_tmz;
}


function resetAllHrrrWindErrorPoints() {
  for (var site in hrrrWindErrorPointLocations) {
    var marker = hrrrWindErrorPointLocations[site].marker;
    marker.setVisible(false);
  }
  /*if (selectedSensorMarker && selectedSensorMarker.traxId) {
    selectedSensorMarker = null;
  }*/
}

function resetAllTrax() {
  for (var trax in traxLocations) {
    var marker = traxLocations[trax].marker;
    marker.setOptions({
      fillColor: "#000000",
      strokeColor: "#000000",
      fillOpacity: 0,
      strokeOpacity: 0
    });
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
  };
  mostRecentTraxLineMarkers.forEach(marker => {
    if (marker) {
      marker.setOptions(specialOptions);
    }
  });
}


async function getTraxLocations() {
  const snapshot = await db.collection('trax_location').get();
  let locations = {};
  snapshot.docs.map(doc => (locations[doc.id]  = {'lat' : doc.data().loc.latitude, 'lng' : doc.data().loc.longitude}));
  return locations;
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
  if (!selectedCity) return;
  var markers_with_data_for_chosen_epochtime = [];
  for (var sensorName in available_cities[selectedCity].sensors) {
    var sensor = available_cities[selectedCity].sensors[sensorName];
    if (!sensor.data || !sensor.data[selected_day_start_epochtime_milisec]) {
      continue;
    }

    var fullDataForDay = sensor.data[selected_day_start_epochtime_milisec].data;

    var sensorTimes = fullDataForDay.map(entry => entry.time * 1000);
    var indexOfAvailableTime = findExactOrClosestTime(sensorTimes, playbackTimeInMs, "down");
    if (indexOfAvailableTime >= 0) {
      markers_with_data_for_chosen_epochtime.push(sensor.marker);
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

  var mStartDate = moment.tz(playbackTimeInMs, selected_city_tmz);
  // For some reason we need to add/subtract an extra minute. The where clause does not seem to do what I would expect for the conditional...
  var endDate = mStartDate.clone().add(1, 'minutes').toDate();
  //playbackTimeline.getIncrementAmt()
  var startDate = mStartDate.clone().subtract(traxDataIntervalInMin - 1, 'minutes').toDate();

  // We pass local time, offset to the city's TMZ.
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

var infowindow;
async function initMap() {
  var urlVars = Util.parseVars(window.location.href);

  showHrrrWindSpeedError = urlVars.showHrrrWindError == "speed";
  showHrrrWindDirectionError = urlVars.showHrrrWindError == "direction";
  infowindow = new google.maps.InfoWindow({
    visible: true,
    content: 'HELLO WORLD'
  });

  var shareView = urlVars.v;

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
    minZoom: !isMobileView() ? 5 : 4,
    streetViewControl: false,
    fullscreenControl: false,
    zoomControl: !isMobileView(),
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
    if (selectedCity) {
      handleMapClicked(mapsMouseEvent);
    }
  });

  // Extend Polyline
  google.maps.Polyline.prototype.getBounds = function() {
    var bounds = new google.maps.LatLngBounds();
    this.getPath().forEach(function(item, index) {
      bounds.extend(new google.maps.LatLng(item.lat(), item.lng()));
    });
    return bounds;
  };

  google.maps.event.addListener(map, 'bounds_changed', function() {
    // If in a tour and we are resizing, we need to change the positions of our manual tour 'div' regions
    if (isInTour()) {
      var $manualRegions = $(".tour-overlay-region");
      for (var manualRegion of $manualRegions) {
        var $manualRegion = $(manualRegion);
        var latLng = new google.maps.LatLng($manualRegion.data('lat'), $manualRegion.data('lng'));
        var screenPos = convertLatLngToScreenCoords(latLng);
        $manualRegion.css({left: screenPos.left, top: screenPos.top});
      }
      if ($manualRegions.length) {
        tourObj.refresh();
      }
    }
  });

  google.maps.event.addListenerOnce(map, 'idle', async function() {
    await loadAvailableCities();
    //await loadSensorList();
    //await loadFacilitiesList();

    showHideMarkersByZoomLevel();
    getCityInBounds();

    google.maps.event.addListener(map, 'zoom_changed', function() {
      showHideMarkersByZoomLevel();
      zoomChangedSinceLastIdle = true;
    });

    google.maps.event.addListener(map, 'idle', function(e) {
      // Note that this is also called when the map resizes, since
      // the bounds of the map changes
      changeBrowserUrlState();
      getCityInBounds();
    });

  });

  $("#infobar-close-toggle-container").on("click", toggleInfobar);

  $(".explanation-step-button").on("click", function(e) {
    if ($(this).hasClass("disabled")) return;
    stepThroughExplanation($(this).data("direction"));
  });

  $infobar = $("#infobar");
  $infobar.on("mousedown", function(e) {
    if (!isMobileView()) {
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
      var max = selectedLocationPinVisible() ? 218 : 258;
      var maxHeight = Math.min(max, (startHeight - dist));
      $infobar.height(maxHeight);
    });
    $(document).one("mouseup.infocontainer", function(e) {
      if (lastYDirection && lastYDirection == "up") {
        $infobar.stop(true, false).animate({
          height: selectedLocationPinVisible() ? "210px" : "250px"
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

  $(window).on("resize", function() {
    map.setOptions({zoomControl: !isMobileView()});
  });

  $("#controls").on("click", "#calendar-btn, .timestampPreview", handleTimelineToggling);

  if (hasTouchSupport) {
    //var controlsElem = document.getElementById("controls");
    $("#controls, #infobar").on("touchstart", Util.touch2Mouse)
                            .on("touchmove", Util.touch2Mouse)
                            .on("touchend", Util.touch2Mouse)
                            .on("touchcancel", Util.touch2Mouse);
  }



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

  $(document).on("keydown",function(e) {
    if (isInTour() || !playbackTimeline) return;
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
  if (isMobileView()) {
    $( ".custom-legend" ).accordion( "option", "active", false );
  }

  initFootprintDialog();
  initDomElms();

  createDataPullWebWorker();

  $(".cityPickerModal").dialog({
    resizable: false,
    autoOpen: false,
    dialogClass: "customDialog",
    modal: true,
    height: 300,
    width: 300
  });

  $(".shareViewModal").dialog({
    resizable: false,
    autoOpen: false,
    dialogClass: "customDialog",
    modal: true,
    open: function() {
      $(".shareurl").text(getShareUrl());
    }
  });

  $(".close-modal").on("click", function() {
    $(this).parent().dialog('close');
  });

  $(window).resize(function() {
    $(".shareViewModal").dialog("option", "position", {my: "center", at: "center", of: window});
    $(".cityPickerModal").dialog("option", "position", {my: "center", at: "center", of: window});
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
      range.selectNode(element);
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
    var momentTime = moment.tz(currentPlaybackTimeInMs, selected_city_tmz);
    var dateStr = isDaylineOpen ? momentTime.format("YYYYMMDDHHmm") : momentTime.startOf("day").format("YYYYMMDDHHmm");
    download(exportImage, dateStr + ".png", "image/png");
    $(this).removeClass("waiting").text("Capture Screenshot");
  });

  $purpleAirToggle.on("click", function(e) {
    togglePurpleAirs($(e.target).prop("checked"));
  });

  $traxToggle.on("click", function(e) {
    toggleTrax($(e.target).prop("checked"));
  });

  $searchBoxIcon.on("mouseover mouseout", function() {
    $searchBox.toggleClass("hover");
  });

  $searchBoxIcon.on("click", function() {
    $searchBoxClear.trigger("click");
    var toggleWidth, paddingRight;
    if ($searchBox.width() == 0) {
      toggleWidth = "200";
      paddingRight = "30";
      $searchBox.focus();
    } else {
      toggleWidth = "0";
      paddingRight = "0";
    }
    $searchBox.toggleClass("expanded");
    $searchBox.stop().animate({
      width: toggleWidth,
      paddingRight: paddingRight
    });
  });

  $searchBoxClear.on('click', function() {
    $searchBox.val("");
    $(this).hide();
    $searchBoxIcon.show();
    $('.pac-container').hide();
  });

  $searchBox.on("input", function() {
    if ($(this).val() == "") {
      $searchBoxClear.hide();
    } else {
      $searchBoxClear.show();
    }
  });


  setupGoogleMapsSearchPlaceChangedHandlers();



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
    google.maps.event.addListener(traxMarker, "click", function (e) {
      // Handle TRAX click event
      selectedSensorMarker = this;
      handleTRAXMarkerClicked(this);
    });
    traxMarker.setVisible(false);
    traxMarkers.push(traxMarker);
  }
}

var siteTour = function() {
  var defaultTourStepTitle = "Air Tracker Tour";
  tourObj = introJs().setOptions({
    autoPosition: false,
    exitOnOverlayClick: false,
    showProgress: true,
    showBullets: false,
    steps: [{
      title: defaultTourStepTitle,
      intro: "This tour covers the basics of Air Tracker. <br> <br> To start, click 'Next'.",
    }, {
      title: defaultTourStepTitle,
      element: null,
      intro: "Cities featured by Air Tracker are marked with a blue icon on the map. You can click these icons to have the system zoom you in or you can manually zoom in yourself.",
      highlightPaddings: {width: 86, height: 40, left: -57, top: -50}
    },
    {
      title: defaultTourStepTitle,
      element: document.querySelector('#city-picker'),
      intro: "You can also select a city by clicking on the city building icon in the upper left corner.",
      position: "right"
    },
    {
      title: defaultTourStepTitle,
      intro: "Air Tracker is interactive and works within the dotted lines around each featured city. Click on any location within the box to create a 'back trace' from that point of interest."
    },
    {
      title: defaultTourStepTitle,
      element: null,
      intro: "A back trace shows the area where a pollution source is most likely to be found. The darker purple indicates the area with the strongest contribution to the back trace. <br> <br> Watch <a target='_blank' href='https://drive.google.com/file/d/1uVzPw4l0GT2S8FcYwGHT430MkIejNXHg/preview'>this video</a> for the basics on what a back trace is.",
      highlightPaddings:  {top: -50, left: -50, width: 150, height: 400}
    },
    {
      title: defaultTourStepTitle,
      element: null,
      intro: "Some locations at a particular time may not have a back trace available. In those cases, you'll see a gray pin icon at the location you clicked at.",
      highlightPaddings: {top: -50, left: -50, width: 70, height: 40}
    },
    {
      title: defaultTourStepTitle,
      element: document.querySelector(".gm-bundled-control-on-bottom"),
      intro: "You can zoom in or out with your mouse/touchscreen or the '+' and '-' in the bottom right corner. The functionality of the map remains the same.",
      position: "left",
      highlightPaddings: {width: 40, height: 81},
    },
    {
      title: defaultTourStepTitle,
      element: null,
      intro: "Regulatory air quality monitors (supported by U.S. EPA’s AirNow Network) are represented by colored circles. The colors within the circle represent air pollution readings as indicated by the legend in the upper right. <br><br> Air Tracker currently includes measurements of fine particulate matter (PM<sub>2.5</sub>), but it can be used to track any primary pollutant. Read more about this [HERE].",
      position: "left",
      highlightPaddings: {left: -50, top: -50, width: 70, height: 70},
    },
    {
      title: defaultTourStepTitle,
      element: null,
      intro: "Wind direction is also mapped at most regulatory air quality monitors using the wind arrow as shown in the legend. <br><br>The arrow points in the direction that wind is moving.",
      position: "left",
      highlightPaddings: {left: -50, top: -50, width: 70, height: 70},
    },
    {
      title: defaultTourStepTitle,
      element: null,
      intro: "Where wind measurements are available, the wind arrow can be used to evaluate how well Air Tracker is working by comparing the direction of the wind to the general direction of the back traces.",
      position: "left",
      highlightPaddings: {left: -50, top: -50, width: 70, height: 70},
    },
    {
      title: defaultTourStepTitle,
      element: null,
      intro: "When they overlap, that means the model that Air Tracker uses is doing well!",
      position: "right",
      highlightPaddings: {left: -350, top: -150, width: 350, height: 150},
    },
    {
      title: defaultTourStepTitle,
      element: null,
      intro: "And if they don't overlap, then the model did not perform to expectations. <br><br> In depth weather model performance for Air Tracker is available [HERE].",
      position: "left",
      highlightPaddings: {left: -50, top: -140, width: 180, height: 190},
    },
    {
      title: defaultTourStepTitle,
      element: document.querySelector("#purple-air-legend-row"),
      intro: "'PurpleAir' (low cost sensor) data can be added to the map using the toggle button in the legend. They are represented by small squares.",
      position: "left",
    },
    {
      title: defaultTourStepTitle,
      element: null,
      intro: "Similar to the regulatory sensors, the colors within the squares represent air pollution readings as indicated by the legend.",
      position: "left",
      highlightPaddings: {width: 90, height: 90, left: -55, top: -60}
    },
    {
      title: defaultTourStepTitle,
      element: document.querySelector("#trax-legend-row"),
      intro: "Additional air quality data sources vary by city. In Salt Lake City, three trains from the light rail system 'TRAX' have devices that measure air pollution. Like with 'Purple Air', these can be toggled on from the legend.",
      position: "left",

    },
    {
      title: defaultTourStepTitle,
      element: null,
      intro: "When those trains are running, the real-time data is mapped to Air Tracker. The latest reading from TRAX is outlined in black, and historical measurements stay on the map for the last hour from the current timestamp. Older readings become more faded in color. <br><br> These sensors track fine particulate matter (PM<sub>2.5</sub>) and their colors follow the same scale as the other sensors.",
      position: "left",
      highlightPaddings: {width: 400, height: 735, left: -150, top: -380}
    },
    {
      title: defaultTourStepTitle,
      element: document.querySelector('#infobar-content'),
      intro: "If you click on the icons of any of the previously mentioned sensors, the numerical concentration measurement of PM<sub>2.5</sub>, along with wind speed and direction (if applicable), at that location pops up on the sidebar.",
      position: "right",
    },
    {
      title: defaultTourStepTitle,
      element: document.querySelector('#infobar-close-toggle-container'),
      intro: "At any time, you can hide the side panel by clicking this button. The panel will automatically be brought back up again when you click anywhere on the map.",
      position: "right",
    },
    {
      title: defaultTourStepTitle,
      element: document.querySelector('#timeline-container'),
      intro: "While the default map of Air Tracker shows 'real-time' data, you can look back in time to see back traces up to 12 months. <br><br>To do that, scroll through the dates at the bottom of the tool. The colored boxes above the date represent the highest air pollution data (AQI) measured on that day. <br><br> When you click on a new date, the map will update to the data on that day, defaulting to the same time of day. The currently mapped date is also shown in the legend.",
      position: "top-middle-aligned",
    },
    {
      title: defaultTourStepTitle,
      element: document.querySelector('.timestampPreview'),
      intro: "To select a new time during the day, click on the clock in the lower left hand corner of the screen.",
      position: "top-left-aligned",
    },
    {
      title: defaultTourStepTitle,
      element: null,
      intro: "After pressing the clock in the lower left hand corner, you can scroll through the time of day in three ways:",
    },
    {
      title: defaultTourStepTitle,
      element: document.querySelector('.materialTimeline'),
      intro: "1. Use the scroll bar.",
      position: "top",
      highlightPaddings: {height: -55, top: 55}
    },
    {
      title: defaultTourStepTitle,
      element: null,
      intro: "2. Press the left/right arrows on your keyboard.<br><br><div style='text-align: center'><img src='" + ASSETS_ROOT + "img/keyboard-left-right.jpg' /></div>",
    },
    {
      title: defaultTourStepTitle,
      element: document.querySelector('.leftSeekControl'),
      intro: "3. Click either the left/right step arrow buttons to step forward or backwards in time. <br><br>If you hold down either for two seconds, a pop-up will appear to allow you to select a time that you can jump to.",
      position: "top-left-aligned",
    },
    {
      title: defaultTourStepTitle,
      element: document.querySelector('.playbackButton'),
      intro: "You can also animate and loop through time by pressing the play button in the lower left hand corner next to the calendar. <br><br> This will automatically step through time, visualizing on the map the corresponding measured air pollution and back trace data.",
      position: "top-left-aligned",
    },
    {
      title: defaultTourStepTitle,
      element: null,
      intro: "AirNow data is updated every hour on the half hour, purple air every 15 minutes, and back traces are updated every hour on the hour. Meteorological data is updated every 15 to an hour depending on how often each site reports new measurements.",
    },
    {
      title: defaultTourStepTitle,
      element: document.querySelector("#calendar-btn"),
      intro: "To select a new day, simply click on the calendar icon in the bottom left corner and you can scroll between dates again.",
      position: "top-left-aligned",
    },
    {
      title: defaultTourStepTitle,
      element: document.querySelector("#share-picker"),
      intro: "You can share a snapshot of the map view you were looking at by clicking this button. A pop-up will appear with various options.",
      position: "right",
    },
    {
      title: defaultTourStepTitle,
      element: document.querySelector("#share-link-container-main"),
      intro: "You can either share a URL that will take other users to the exact view and time you were exploring, so that they too can explore.",
      position: "right",
    },
    {
      title: defaultTourStepTitle,
      element: document.querySelector("#embed-link-container-main"),
      intro: "Or, you can export an image of the map's view that you can then use in presentations or on social media.",
      position: "right",
      highlightPaddings: {height: -30, top: 30}
    },
    {
      title: defaultTourStepTitle,
      element: document.querySelector(".searchBoxContainer"),
      intro: "You can also search for specific areas of interest. <br><br> Just click the icon with the magnifying glass and you'll be presented with a search box from which to search. <br><br> You can click the icon again at any time to hide away the input box.",
    },
    {
      title: defaultTourStepTitle,
      element: null,
      intro: "Closing remarks....",
    },

  ]
  }).onbeforechange(async function() {
    // Steps are 0 indexed
    if (this._currentStep == 0) {

      inTour = true;

      // Add tour css indicator to any elements that we want to handle css transitions differently when in tour mode
      $(".materialTimelineContainerMain").addClass("tour");

      if (selectedLocationPinVisible()) {
        google.maps.event.trigger(selectedLocationPin, "click");
      }

    } else if (this._currentStep == 1) {

      // Turn off purple air
      if ($purpleAirToggle.prop("checked")) {
        $purpleAirToggle.trigger("click");
      }

      // turn off TRAX
      if ($traxToggle.prop("checked")) {
        $traxToggle.trigger("click");
      }

      // If we are starting the tour with the playback timeline up, close it.
      if (playbackTimeline && playbackTimeline.isActive()) {
        handleTimelineToggling();
      }

      // If we had a city selected, go to the last availabe day
      if (selectedCity && timeline && timeline.getSelectedBlock().data().index != 0) {
        $(".block-click-region[data-epochtime_milisec='" + timeline.getLastBlockData().epochtime_milisec + "']").trigger("click");
        await sensorsLoadedPromise;
      }

      // Zoom out to national view
      goToDefaultHomeView();

      // It is unreliable/impossible to get a marker's DOM element, so we create a manual region at the location of marker
      var latLng = available_cities["US-SLC"].marker.position;
      var screenPos = convertLatLngToScreenCoords(latLng);
      var id = "tour-manual-region-" + this._currentStep;
      if (!document.querySelector("#" + id)) {
        $("#map").prepend("<div id='" + id +  "' class='tour-overlay-region' style='top:" + screenPos.top + "px; left:" + screenPos.left + "px;' data-lat='" + latLng.lat() + "'data-lng='" + latLng.lng() + "'></div>");
      }
      this._introItems[this._currentStep].element = document.querySelector("#" + id);
      this._introItems[this._currentStep].position = "top";
      this.refresh();
    } else if (this._currentStep == 2) {
      goToDefaultHomeView();
    } else if (this._currentStep == 3) {
      // Remove pin
      if (selectedLocationPinVisible()) {
        google.maps.event.trigger(selectedLocationPin, "click");
      }
      // Bring SLC bounds into view
      google.maps.event.trigger(available_cities["US-SLC"].marker, "click");
    } else if (this._currentStep == 4) {
      // Bring up Nov 3rd 2021 @ noon
      playbackTimeline.seekTo(48, true);
      $(".block-click-region[data-epochtime_milisec='1635919200000']").trigger("click");
      await sensorsLoadedPromise;

      // A lat/lng point in SLC region
      //var latLng = new google.maps.LatLng(40.6599, -111.9963);
      var latLng = new google.maps.LatLng(40.6188, -111.9929);
      var e = { latLng: latLng, fromVirtualClick: true };
      // TODO: Likely need to tweak for mobile
      map.setZoom(12);
      // Trigger a click to show a backtrace
      google.maps.event.trigger(map, 'click', e);
      // It is unreliable/impossible to get a marker's DOM element, so we create a manual region at the location of marker
      var screenPos = convertLatLngToScreenCoords(latLng);
      var id = "tour-manual-region-" + this._currentStep;
      if (!document.querySelector("#" + id)) {
        $("#map").prepend("<div id='" + id +  "' class='tour-overlay-region' style='top:" + screenPos.top + "px; left:" + screenPos.left + "px;' data-lat='" + latLng.lat() + "'data-lng='" + latLng.lng() + "'></div>");
      }
      this._introItems[this._currentStep].element = document.querySelector("#" + id);
      this._introItems[this._currentStep].position = "right";
      setTimeout(() => {
        this.refresh();
      }, 500);
    } else if (this._currentStep == 5) {
      // 3:45 AM
      playbackTimeline.seekTo(12, true);

      // A lat/lng point in SLC region
      var latLng = new google.maps.LatLng(40.6188, -111.9929);
      var e = { latLng: latLng, fromVirtualClick: true };
      // TODO: Likely need to tweak for mobile
      map.setZoom(12);
      // Trigger a click to show a backtrace
      google.maps.event.trigger(map, 'click', e);
      // It is unreliable/impossible to get a marker's DOM element, so we create a manual region at the location of marker
      var screenPos = convertLatLngToScreenCoords(latLng);
      var id = "tour-manual-region-" + this._currentStep;
      if (!document.querySelector("#" + id)) {
        $("#map").prepend("<div id='" + id +  "' class='tour-overlay-region' style='top:" + screenPos.top + "px; left:" + screenPos.left + "px;' data-lat='" + latLng.lat() + "'data-lng='" + latLng.lng() + "'></div>");
      }
      this._introItems[this._currentStep].element = document.querySelector("#" + id);
      this._introItems[this._currentStep].position = "right";
      setTimeout(() => {
        this.refresh();
      }, 500);
    } else if (this._currentStep == 6) {
      // Remove pin
      if (selectedLocationPinVisible()) {
        google.maps.event.trigger(selectedLocationPin, "click");
      }
      // Go back to most recent day
      $(".block-click-region[data-epochtime_milisec='" + timeline.getLastBlockData().epochtime_milisec + "']").trigger("click");
    } else if (this._currentStep == 7) {
      var marker = available_cities["US-SLC"].sensors["Hawthorne AirNow"].marker.getGoogleMapMarker();
      var latLng = marker.position;
      map.setCenter(latLng);
      // It is unreliable/impossible to get a marker's DOM element, so we create a manual region at the location of marker
      var screenPos = convertLatLngToScreenCoords(latLng);
      var id = "tour-manual-region-" + this._currentStep;
      if (!document.querySelector("#" + id)) {
        $("#map").prepend("<div id='" + id +  "' class='tour-overlay-region' style='top:" + screenPos.top + "px; left:" + screenPos.left + "px;' data-lat='" + latLng.lat() + "'data-lng='" + latLng.lng() + "'></div>");
      }
      this._introItems[this._currentStep].element = document.querySelector("#" + id);
      this._introItems[this._currentStep].position = "left";
      this.refresh();
    } else if (this._currentStep == 8) {
      // uses step 7 div
      var id = "tour-manual-region-7";
      this._introItems[this._currentStep].element = document.querySelector("#" + id);
      this._introItems[this._currentStep].position = "left";
      this.refresh();
    } else if (this._currentStep == 9) {
      // Remove pin
      if (selectedLocationPinVisible()) {
        google.maps.event.trigger(selectedLocationPin, "click");
      }

      if (playbackTimeline && playbackTimeline.isActive()) {
        playbackTimeline.seekTo(48, true);
        handleTimelineToggling();
        await setAsyncTimeout(() => {
          $(".block-click-region[data-epochtime_milisec='" + timeline.getLastBlockData().epochtime_milisec + "']").trigger("click");
        }, 75);
        await sensorsLoadedPromise;
      }

      // uses step 7 div
      var id = "tour-manual-region-7";
      this._introItems[this._currentStep].element = document.querySelector("#" + id);
      this._introItems[this._currentStep].position = "right";
      this.refresh();
    } else if (this._currentStep == 10) {
      if (playbackTimeline && !playbackTimeline.isActive()) {
        // 1:45 PM
        playbackTimeline.seekTo(55, true);
        // Bring Nov 2nd 2021
        $(".block-click-region[data-epochtime_milisec='1635832800000']").trigger("click");
        await setAsyncTimeout(() => {
          handleTimelineToggling();
        }, 75);
      } else {
        playbackTimeline.seekTo(55);
      }
      if (!selectedLocationPinVisible()) {
        var marker = available_cities["US-SLC"].sensors["Hawthorne AirNow"].marker.getGoogleMapMarker();
        google.maps.event.trigger(marker, "click");
      }
      // uses step 7 div
      var id = "tour-manual-region-7";
      this._introItems[this._currentStep].element = document.querySelector("#" + id);
      this._introItems[this._currentStep].position = "right";
      await setAsyncTimeout(() => {
        this.refresh();
      }, 450);
    } else if (this._currentStep == 11) {
      // 9:30 PM
      playbackTimeline.seekTo(86);
      // uses step 7 div
      var id = "tour-manual-region-7";
      this._introItems[this._currentStep].element = document.querySelector("#" + id);
      this._introItems[this._currentStep].position = "left";
      this.refresh();

      if (!selectedLocationPinVisible()) {
        var marker = available_cities["US-SLC"].sensors["Hawthorne AirNow"].marker.getGoogleMapMarker();
        google.maps.event.trigger(marker, "click");
      }
    } else if (this._currentStep == 12) {
      if (selectedLocationPinVisible()) {
        google.maps.event.trigger(selectedLocationPin, "click");
      }
      $purpleAirToggle.prop("checked", false);
      togglePurpleAirs(false);
    } else if (this._currentStep == 13) {
      // 9:30 PM
      playbackTimeline.seekTo(86);

      // Random location in SLC to show off purple airs
      var latLng = new google.maps.LatLng(40.678517865879655, -111.79349862416623);
      map.setCenter(latLng);
      map.setZoom(12);
      var screenPos = convertLatLngToScreenCoords(latLng);
      var id = "tour-manual-region-" + this._currentStep;
      if (!document.querySelector("#" + id)) {
        $("#map").prepend("<div id='" + id +  "' class='tour-overlay-region' style='top:" + screenPos.top + "px; left:" + screenPos.left + "px;' data-lat='" + latLng.lat() + "'data-lng='" + latLng.lng() + "'></div>");
      }
      this._introItems[this._currentStep].element = document.querySelector("#" + id);
      this._introItems[this._currentStep].position = "left";
      this.refresh();

      // Only visually show state change, don't actually turn on purple airs
      // Turning on all the purple airs changes the state of the DOM so that we cannot highlight previous DOM markers.
      // Google is doing something to the DOM when there are lots of markers. That said, we don't need to show them
      // all for this tour. Plus, we are manually selecting a bounds on the screen and not messing with map DOM elements.
      $purpleAirToggle.prop("checked", true);

      // Turn back on if they exist, otherwise pull them
      await handlePurpleAirTourData();
    } else if (this._currentStep == 14) {
      togglePurpleAirs(false);

      if ($traxToggle.prop("checked")) {
        $traxToggle.trigger("click");
      }
      $purpleAirToggle.prop("checked", false);
    } else if (this._currentStep == 15) {
      if (selectedLocationPinVisible()) {
        google.maps.event.trigger(selectedLocationPin, "click");
      }
      map.setZoom(13);
      var latLng = new google.maps.LatLng(40.731316223740315, -111.92356154003906);
      map.setCenter(latLng);
      var screenPos = convertLatLngToScreenCoords(latLng);
      var id = "tour-manual-region-" + this._currentStep;
      if (!document.querySelector("#" + id)) {
        $("#map").prepend("<div id='" + id +  "' class='tour-overlay-region' style='top:" + screenPos.top + "px; left:" + screenPos.left + "px;' data-lat='" + latLng.lat() + "'data-lng='" + latLng.lng() + "'></div>");
      }
      this._introItems[this._currentStep].element = document.querySelector("#" + id);
      this._introItems[this._currentStep].position = "left";
      this.refresh();

      // 9:30 AM
      playbackTimeline.seekTo(38);

      if (!$traxToggle.prop("checked")) {
        $traxToggle.trigger("click");
      }

    } else if (this._currentStep == 16) {
      if ($traxToggle.prop("checked")) {
        $traxToggle.trigger("click");
      }
      if (!selectedLocationPinVisible()) {
        google.maps.event.trigger(available_cities["US-SLC"].sensors["Hawthorne AirNow"].marker.getGoogleMapMarker(), "click");
      }
      if (playbackTimeline && !playbackTimeline.isActive()) {
        handleTimelineToggling();
      }
    } else if (this._currentStep == 17) {
      if (selectedLocationPinVisible()) {
        google.maps.event.trigger(selectedLocationPin, "click");
      }
      setTimeout(() => {
        this.refresh();
      }, 50);
    } else if (this._currentStep == 18) {
      if (playbackTimeline && playbackTimeline.isActive()) {
        handleTimelineToggling();
      }
      await setAsyncTimeout(() => {
        this.refresh()
      }, 75);
    } else if (this._currentStep == 20) {
      if (playbackTimeline && !playbackTimeline.isActive()) {
        handleTimelineToggling();
      }
      google.maps.event.trigger(available_cities["US-SLC"].marker, "click");
    } else if (this._currentStep == 26) {
      google.maps.event.trigger(available_cities["US-SLC"].marker, "click");
      setTimeout(() => {
        if (playbackTimeline && !playbackTimeline.isActive()) {
          handleTimelineToggling();
          this._introItems[this._currentStep].element = document.querySelector("#calendar-btn"),
          this._introItems[this._currentStep].position = "top-left-aligned";
          this.refresh();
        }
      }, 30)
    } else if (this._currentStep == 27) {
      $(".close-modal").trigger("click");
      if (playbackTimeline && playbackTimeline.isActive()) {
        handleTimelineToggling();
      }
    } else if (this._currentStep == 28) {
      $("#share-picker").trigger("click");
    } else if (this._currentStep == 29) {
      $("#share-picker").trigger("click");
    } else if (this._currentStep == 30) {
      $(".close-modal").trigger("click");
      goToDefaultHomeView();
    }
  }).onexit(function() {
    // If we never got beyond the intro slide of the tour, don't do any of the cleanup/resetting below.
    if (this._currentStep == 0) {
      return;
    }
    // Go to most recent available day
    $(".block-click-region[data-epochtime_milisec='" + timeline.getLastBlockData().epochtime_milisec + "']").trigger("click");
    // Zoom to national view
    goToDefaultHomeView();
    // Share modal may still be open, clsoe it
    $(".close-modal").trigger("click");
    // Purple airs used in the tour may still be up, hide them
    togglePurpleAirs(false);
    // Turn off purple air UI toggle
    $purpleAirToggle.prop("checked", false);
    // TRAX may still be up, hide them
    if ($traxToggle.prop("checked")) {
      $traxToggle.trigger("click");
    }
    // Remove all manual tour div regions
    $("tour-overlay-region").remove();
    // Remove tour CSS indicator
    $(".materialTimelineContainerMain").removeClass("tour");
    // Turn off tour mode
    inTour = false;
  }).start();
}

var convertLatLngToScreenCoords = function(latLng) {
  var _projection = map.getProjection();
  var _topRight = _projection.fromLatLngToPoint(map.getBounds().getNorthEast());
  var _bottomLeft = _projection.fromLatLngToPoint(map.getBounds().getSouthWest());
  var _scale = Math.pow(2, map.getZoom());

  var _point = _projection.fromLatLngToPoint(latLng);

  var _posLeft = Math.round((_point.x - _bottomLeft.x) * _scale);
  var _posTop = Math.round((_point.y - _topRight.y) * _scale);

  return {left: _posLeft, top: _posTop};
}

var goToDefaultHomeView = function(){
  map.setCenter({lat: defaultHomeView.lat, lng: defaultHomeView.lng});
  map.setZoom(defaultHomeView.zoom);
}

var changeBrowserUrlState = function() {
  window.history.replaceState({}, "", getShareUrl());
}


var toggleTrax = function(makeVisible) {
  if (!playbackTimeline || !playbackTimeline.isActive()) {
    return;
  }
  if (makeVisible) {
    getTraxInfoByPlaybackTime(playbackTimeline.getPlaybackTimeInMs());
  } else {
    resetAllTrax();
  }
}


var togglePurpleAirs = function(makeVisible) {
  if (!selectedCity) return;

  let purple_air_sensors = [];
  let purple_air_sensor_info_list = Object.values(available_cities[selectedCity].sensors).reduce(function(result, sensor) {
    if (sensor.info.marker_type == "purple_air") {
      result.push(sensor.info);
      purple_air_sensors.push(sensor);
    }
    return result;
  }, []);

  for (let sensor of purple_air_sensors) {
    if (sensor.marker && sensor.data[timeline.selectedDayInMs]) {
      sensor.marker.getGoogleMapMarker().setVisible(makeVisible);
    } else {
      // TODO: Dynamic loading of purple airs

      if (!makeVisible) {
        continue;
      }

      // The worker may already be processing so terminate it and create a new one.
      // There is overhead to this but significantly less than having it finish
      // the whatever the last worker was doing.
      if (dataFormatPurpleAirWorkerIsProcessing) {
        dataFormatWorker.terminate();
        createDataPullWebWorker();
        dataFormatPurpleAirWorkerIsProcessing = false;
      }

      let purple_air_markers = purple_air_sensors.map(function(sensor){return sensor.marker;});
      hideMarkers(purple_air_markers);
      // Check if current day
      var date_str_sensor = moment(timeline.selectedDayInMs).tz(selected_city_tmz).format("YYYY-MM-DD");
      var is_current_day = date_str_sensor === current_day_str;

      purpleAirLoadInterval = setInterval(function() {
        if (!dataFormatPurpleAirWorkerIsProcessing) {
          clearInterval(purpleAirLoadInterval);
          dataFormatPurpleAirWorkerIsProcessing = true;
          dataFormatWorker.postMessage(
          { epochtime_milisec: timeline.selectedDayInMs,
            sensors_list: purple_air_sensor_info_list,
            is_current_day : is_current_day}
          );
        }
      }, 50);
      break;
    }
  }
}

var toggleOffAllNonForcedSensors = function() {
  if ($traxToggle.prop("checked")) {
    $traxToggle.trigger("click");
  }
  if ($purpleAirToggle.prop("checked")) {
    $purpleAirToggle.trigger("click");
  }
}

var getCityInBounds = async function() {
  var lastSelectedCity = selectedCity;
  selectedCity = "";
  var zoom = map.getZoom();

  if (zoom < MAP_ZOOM_CHANGEOVER_THRESHOLD) {
    if ($citySelector.val() != selectedCity) {
      $citySelector.val(selectedCity).change();
    }
    return;
  }
  var cityInBoundsCallback = function() {
    // Note that this will trigger a map resize, which in turn triggers a map 'idle',
    // which will trigger getCityInBounds() again.
    $controls.show();
    if ($map.hasClass("no-controls")) {
      $("#map, #infobar, #legend").removeClass("no-controls");
      if (timeline) {
        $(".selected-block")[0].scrollIntoView(false);
      }
    }
  }

  let currentMapBounds = map.getBounds();
  for (let [city_locode, city] of Object.entries(available_cities)) {
    if (!city_locode) continue;
    if (currentMapBounds.intersects(city.footprint_region.getBounds())) {

      // Toggle facility markers depending upon zoom level
      if (zoom >= FACILITY_MARKERS_TOGGLE_ZOOM_THRESHOLD) {
        for (let facility_marker of available_cities[city_locode].facility_markers) {
          facility_marker.setVisible(true);
        }
      } else {
        for (let facility_marker of available_cities[city_locode].facility_markers) {
          facility_marker.setVisible(false);
        }
      }

      if (lastSelectedCity == city_locode) {
        selectedCity = lastSelectedCity;
        return;
      }

      // If we previously had a city up, hide its markers.
      if (lastSelectedCity) {
        hideMarkersByCity(lastSelectedCity);
      }
      selectedCity = city_locode;
      //$currentDateLegendTextNone.hide();
      //$currentDateLegendText.show();
      selected_city_tmz = available_cities[selectedCity]['IANA_TZ'];
      break;
    }
  }

  if (selectedCity) {
    // show/hide sensor types from legend, based on what the city offers
    toggleOffAllNonForcedSensors();
    $legend.show();
    $(".custom-legend").accordion( "option", "active", true );
    $(".custom-legend").accordion( "option", "active", 0 );
    $("#legend .legend-row").hide();
    for (let sensory_type of available_cities[selectedCity].available_sensor_types) {
      var sensor_type_legend_name = sensory_type.replace(/_/g, "-") + "-legend-row";
      $("#" + sensor_type_legend_name).show();
    }

    $cityName.text(available_cities[selectedCity].name);

    if ($citySelector.val() != selectedCity) {
      $citySelector.val(selectedCity).change();
    }

    // First time city is entered
    if (!available_cities[selectedCity].sensors) {
      await loadSensorsListForCity(selectedCity);
      if (available_cities[selectedCity].has_facility_markers) {
        await loadFacilitiesListForCity(selectedCity);
      }
    }

    // Show markers for the new city.
    showMarkersByCity(selectedCity);

    available_cities[selectedCity].marker.setVisible(false);
    available_cities[selectedCity].footprint_region.setVisible(true);

    if (playbackTimeline) {
      playbackTimeline.setTimezoneText();
    }
    if (timeline) {
      // from timeline.js
      if (timeline.activeCity != selectedCity) {
        loadAndUpdateTimeLine(zoomChangedSinceLastIdle ? cityInBoundsCallback : null);
      } else {
        cityInBoundsCallback();
        showSensorMarkersByTime(timeline.selectedDayInMs);
      }
      // TODO
      if (playbackTimeline && playbackTimeline.isActive()) {
        playbackTimeline.seekTo(playbackTimeline.getCurrentFrameNumber());
      }
    } else {
      if (!current_day_str) {
        current_day_str = moment().tz(selected_city_tmz).format("YYYY-MM-DD");
      }
      var urlVars = Util.parseVars(window.location.href);
      var shareTimeInMs = parseInt(urlVars.t);
      if (shareTimeInMs) {
        selected_day_start_epochtime_milisec = moment(shareTimeInMs).tz(selected_city_tmz).startOf("day").valueOf();
      }
      setupTimeline(shareTimeInMs);
      if (zoomChangedSinceLastIdle || lastSelectedCity == "") {
        cityInBoundsCallback();
      }
    }
  } else {
    // If we previously had a city up and we've panned awway, hide its markers.
    if (lastSelectedCity) {
      resetMapToCitiesOverview(lastSelectedCity)
    }
  }
  zoomChangedSinceLastIdle = false;
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
  var mapCenter = map.getCenter();
  var mapZoom = map.getZoom();
  var viewStr = mapCenter.lat().toFixed(6) + "," + mapCenter.lng().toFixed(6) + "," + mapZoom;
  var timeStr = playbackTimeline && mapZoom >= MAP_ZOOM_CHANGEOVER_THRESHOLD ? playbackTimeline.getPlaybackTimeInMs() : null;
  //var isDaylineOpen = playbackTimeline.isActive();
  var urlVars = Util.parseVars(window.location.href);
  urlVars.v = viewStr;
  if (timeStr) {
    urlVars.t = timeStr;
  } else {
    delete urlVars.t;
  }
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


function selectedLocationPinVisible() {
  return selectedLocationPin && selectedLocationPin.visible;
}

function createDataPullWebWorker() {
  // Create the worker.
  dataFormatWorker = new Worker(ASSETS_ROOT + "js/formatAndMergeSensorDataWorker.js");
  // Hook up to the onMessage event, so you can receive messages from the worker.
  dataFormatWorker.onmessage = receivedWorkerMessage;
}

function isInTour() {
  return inTour;
  //return $(".introjs-tooltip").length != 0;
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
  $("#city-picker").show().button({
    icons: {
      primary: "ui-icon-custom-city-picker-black"
    },
    text: false
  }).on("click", function() {
    //$(".cityPickerModal").dialog('open');
    $("#city-picker-controls .btn-mobileSelect-gen").trigger("click");
  });
  $("#help-tour").show().button({
    icons: {
      primary: "ui-icon-custom-help-tour-black"
    },
    text: false
  }).on("click", function() {
    siteTour();
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
  $purpleAirToggle = $("#toggle-purple-air");
  $traxToggle = $("#toggle-trax");
  $citySelector = $("#city-selector");
  $cityName = $("#city_name");
  $map = $("#map");
  $legend = $("#legend");
  $currentDateLegendText = $("#current-date-legend");
  //$currentDateLegendTextNone = $("#current-date-legend-none");
  $searchBoxClear = $(".searchBoxClearIcon");
  $searchBox = $(".searchBox");
  $searchBoxIcon = $(".searchBoxIcon");
  verticalTouchScroll($infobarInitial);
}

var setupGoogleMapsSearchPlaceChangedHandlers = function() {
  var autocomplete = new google.maps.places.Autocomplete($searchBox.get(0));
  var geocoder = new google.maps.Geocoder();

  // Enable places selection from dropdown on touch devices
  $(document).on('touchstart', '.pac-item', function(e) {
    var $pacItem = $(this);
    e.preventDefault();
    $pacItem.children().each(function(index) {
      $(this).append(' ');
    });
    var searchItemText = $pacItem.text();
    searchItemText = searchItemText.replace(/\s\s+/g, ' ');
    $searchBox.val(searchItemText);
    google.maps.event.trigger(autocomplete, 'place_changed', {
      locationName: searchItemText
    });
  });

  $searchBox.on("keydown", function(e) {
    if (e.which == 13) {
      google.maps.event.trigger(autocomplete, 'place_changed', {
        locationName: $searchBox.val()
      });
    }
  });

  google.maps.event.addListener(autocomplete, 'place_changed', function() {
    var place = autocomplete.getPlace();
    if (place && place.geometry) {
      map.fitBounds(place.geometry.viewport);
    } else {
      // User didn't pick an autocomplete choice and just hit enter after typing text
      var address = $searchBox.val();
      geocoder.geocode({
        'address': address
      }, function(results, status) {
        if (status == google.maps.GeocoderStatus.OK) {
          var bounds = results[0].geometry.bounds || results[0].geometry.viewport;
          if (bounds) {
            map.fitBounds(bounds);
          } else {
            map.setCenter(results[0].geometry.location);
            // Arbitrary zoom level
            map.setZoom(12);
          }
        } else {
          UTIL.log("Geocode failed: " + status);
        }
      });
    }
    document.activeElement.blur();
  });
};


async function handleDraw(timeInEpoch, doOverview, fromDaySelection) {
  if (doOverview && !fromDaySelection) {
    // animate sensors from ESDR (airnow, purpleair, etc)
    await showSensorMarkersByTime(timeline.selectedDayInMs);
  } else if (!doOverview) {
    // animate trax data
    if ($traxToggle.prop("checked")) {
      await getTraxInfoByPlaybackTime(timeInEpoch);
    }
    // TODO: Handle HRRR Wind Error visual
    if (showHrrrWindDirectionError || showHrrrWindSpeedError) {
      handleHrrrWindErrorPointsByEpochTime(timeInEpoch);
    }
    // animate sensors from ESDR (airnow, purpleair, etc)
    updateSensorsByEpochTime(timeInEpoch, true);
  }
  await sensorsLoadedPromise;

  var primaryInfoPopulator = selectedSensorMarker;
  // Handle case where a user has clicked on the map where a trax sensor can be but it is not yet visible.
  //  As time plays, however, it may become visible, so allow for the info panel to see this info when the train passes by.
  if (selectedLocationPinVisible()) {
    for(var x = 0; x < traxMarkers.length; x++) {
      if (!selectedSensorMarker && traxMarkers[x].visible && traxMarkers[x].getBounds().contains(selectedLocationPin.position)) {
        primaryInfoPopulator = traxMarkers[x];
        selectedSensorMarker = primaryInfoPopulator;
        break;
      }
    }
  }

  // animate footprint
  if (overlay && (overlay.projection || selectedLocationPinVisible())) {
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


/*async function getMostRecentFootprintTimeInMs() {
  if (mostRecentAvailableFootprintTimeInMs) {
    return mostRecentAvailableFootprintTimeInMs;
  }
  var snapshot = await  db.collection("stilt-prod").orderBy("job_id").limitToLast(1).get();
  var jobId = snapshot.docs[0].get("job_id");
  var dateString = jobId.split("_")[0];
  mostRecentAvailableFootprintTimeInMs = moment.tz(dateString, "YYYYMMDDhhmm", "UTC").valueOf();
  //mostRecentAvailableFootprintTimeStr = moment.tz(mostRecentAvailableFootprintTimeInMs, "UTC").tz(DEFAULT_TZ).format("h:mm A");
  return mostRecentAvailableFootprintTimeInMs;
}*/


async function drawFootprint(lat, lng, fromClick) {
  if (!fromClick && !selectedLocationPinVisible()) {
    return;
  }

  var fromTour = isInTour();
  if (!fromTour && typeof(drawFootprint.firstTime) == 'undefined' && localStorage.dontShowFootprintPopup != "true") {
    $footprint_dialog.dialog("open");
    drawFootprint.firstTime = false; //do the initialisation
  }

  var previousFootprintData = overlay.getData();
  // Clear existing footprint if there is one and we are not stepping through time
  if (fromClick) {
    map.panTo({lat: lat, lng: lng});
    if (overlay) {
      overlay.setMap(null);
      overlay.setData({});
    }
  }

  var playbackTimeInMs = playbackTimeline.getPlaybackTimeInMs();

  // Show footprint at sensor time
  // We may instead want to find the latest footprint and then show the sensor value based on that time.
  if (!playbackTimeline.isActive()) {
    if (selectedSensorMarker) {
      var sensorData = selectedSensorMarker.getData();
      if (sensorData) {
        playbackTimeInMs = sensorData['sensor_data_time'];
      }
    }
  }

  var m_date = moment(playbackTimeInMs).tz(selected_city_tmz);
  // Check if current day
  //var is_current_day = m_date.format("YYYY-MM-DD") === current_day_str;

  // Footprints are hourly
  var m_closestDate = m_date.startOf("hour");
  var closestDate = m_closestDate.toDate();
  var closestDateEpoch = m_closestDate.valueOf();
  var isoString = closestDate.toISOString();
  //var yearMonthDay = isoString.split("T")[0].split("-");
  //var hourMinute = isoString.split("T")[1].split(":");

  // The hour has not changed, so keep previous plume up
  if (overlay.getData().isoString == isoString) {
    return;
  }


  var latTrunc = lat.toFixed(2);
  // Footprints are being stored in the bucket by lat/lon with 2 digit precision. Sorta.
  // If the two digit precision ends with trailing zero in the second digit, it is removed.
  if (latTrunc.split(".")[1][1] == "0") {
    latTrunc = latTrunc.slice(0,-1);
  }
  var latOffset = lat - latTrunc;

  var lngTrunc = lng.toFixed(2);
  // Footprints are being stored in the bucket by lat/lon with 2 digit precision. Sorta.
  // If the two digit precision ends with trailing zero in the second digit, it is removed.
  if (lngTrunc.split(".")[1][1] == "0") {
    lngTrunc = lngTrunc.slice(0,-1);
  }
  var lngOffset = lng - lngTrunc;

  var overlayData = {
    'is_current_day' : playbackTimeline.isActive(),
    'isoString' : isoString,
    'lat' : lat,
    'lng' : lng,
    'sensorType' : "backtrace",
    'name' : latTrunc + ", " + lngTrunc,
    'epochtimeInMs' : closestDateEpoch
  };

  var data;
  var iconPath;
  var loc = latTrunc + "," + lngTrunc

  if (plume_backtraces[loc] && plume_backtraces[loc][closestDateEpoch]) {
    data = plume_backtraces[loc][closestDateEpoch];
  } else {
    // STILT job ids don’t use trailing zeros, so do parseFloat to remove them.
    ////var docRefString = yearMonthDay[0] + yearMonthDay[1] + yearMonthDay[2] + hourMinute[0] + hourMinute[1] + "_" + parseFloat(lngTrunc) + "_" + parseFloat(latTrunc) + "_1";
    ////const snapshot = await  db.collection(STILT_COLLECTION_NAME).doc(docRefString).get();
    ////data = snapshot.data();
    var parsedIsoString = isoString.replace(/:/g,"-").split(".")[0];
    try {
      var result = await $.ajax({
        url: STILT_GCLOUD_BUCKET + "%2F" + parsedIsoString + "%2F" + lngTrunc + "%2F" + latTrunc + "%2F" + "1" + "%2F" + "footprint.png",
        dataType : 'json',
      });
      data = {
        image: result.mediaLink,
        metadata: result.metadata
      }
    } catch(e) {
      // Either there is a permission error (not public) or the file does not exist
    }

    if (!plume_backtraces[loc]) {
      plume_backtraces[loc] = {};
    }
  }

  if (data) {
    overlayData['hasData'] = true;
    iconPath = ASSETS_ROOT + 'img/red-pin.png';
    ////var { image, location, time, extent } = data;
    ////var timeInMs = time.seconds * 1000;
    ////plume_backtraces[loc][timeInMs] = data;
    ////overlayData['epochtimeInMs'] = timeInMs;
    ////overlay.set('image', image);
    plume_backtraces[loc][closestDateEpoch] = data;
    overlay.set('image', data.image);
    ////const bounds = new google.maps.LatLngBounds(
    ////  new google.maps.LatLng(extent.ymin + latOffset, extent.xmin + lngOffset),
    ////  new google.maps.LatLng(extent.ymax + latOffset, extent.xmax + lngOffset)
    ////);
    const bounds = new google.maps.LatLngBounds(
      new google.maps.LatLng(parseFloat(data.metadata.ymin) + latOffset, parseFloat(data.metadata.xmin) + lngOffset),
      new google.maps.LatLng(parseFloat(data.metadata.ymax) + latOffset, parseFloat(data.metadata.xmax) + lngOffset)
    );
    overlay.set('bounds', bounds);
    overlay.setMap(map);
    overlay.show();
  } else {
    overlayData['hasData'] = false;
    iconPath = ASSETS_ROOT + 'img/gray-pin.png';
    if (!fromClick && previousFootprintData.hasData) {
      if (overlay) {
        overlay.hide();
      }
    }
  }

  overlay.setData(overlayData);

  if (!fromClick && ((previousFootprintData.hasData && overlayData['hasData']) || (previousFootprintData.hasData == false && !overlayData['hasData']))) {
    return;
  }

  if (fromClick) {
    expandInfobar();
  }

  if (selectedLocationPin) {
    selectedLocationPin.setPosition(new google.maps.LatLng(lat,lng));
    selectedLocationPin.setIcon(iconPath);
    if (fromClick) {
      selectedLocationPin.setVisible(true);
      if (!fromTour) {
        // In order to do the 'drop' animation again, we need to first dissociate the pin from the map.
        // Is this worse than just recreating the pin each time? I don't know...
        selectedLocationPin.setMap(null)
        selectedLocationPin.setMap(map)
        selectedLocationPin.setAnimation(google.maps.Animation.DROP);
      }
    }
  } else {
    selectedLocationPin = new google.maps.Marker({
      position: new google.maps.LatLng(lat,lng),
      map,
      title: "Selected pollution footprint location",
      animation: fromClick && !fromTour ? google.maps.Animation.DROP : null,
      icon: iconPath
    });
    google.maps.event.addListener(selectedLocationPin, "click", function (e) {
      if (selectedLocationPin) {
        selectedLocationPin.setVisible(false);
      }
      overlay.setMap(null);
      overlay.setData({});
      resetInfobar();
    });
  }
}


function toggleInfobar() {
  $infobar.toggleClass("closed");
}


function expandInfobar() {
  //get infobar element
  if (!$infobarComponentContainer) return;
  $infobar.removeClass("closed");
  $infobarComponentContainer.show();
  $infobarInitial.hide();
}

function resetInfobar() {
  if (!$infobarComponentContainer) return;
  $infobarComponentContainer.hide();
  $infobarInitial.show();
  $infobarHeader.hide();
}

async function loadSensorsListForCity(city_locode) {
  available_cities[city_locode].sensors = {};
  if (available_cities[city_locode].available_sensor_types.includes("air_now")) {
    let markersList = await loadJsonData(CITY_DATA_ROOT + city_locode + "/airnow.json");
    for (let marker of markersList.markers) {
      available_cities[city_locode].sensors[marker['name']] = {"info" : marker}
    }
  }

  if (available_cities[city_locode].available_sensor_types.includes("purple_air")) {
    let markersList = await loadJsonData(CITY_DATA_ROOT + city_locode + "/purpleair.json");
    for (let marker of markersList.markers) {
      available_cities[city_locode].sensors[marker['name']] = {"info" : marker}
    }
  }
}

async function loadFacilitiesListForCity(city_locode) {
  let facilities_list = await loadJsonData(CITY_DATA_ROOT + city_locode + "/facilities.json");
  for (let facility of facilities_list.facilities) {
    let facility_marker = new MarkerWithLabel({
      position: new google.maps.LatLng(facility["Lat"], facility["Lon"]),
      draggable: false,
      clickable: false,
      map: map,
      /*title: facility["Name"],*/
      labelContent: facility["Name"],
      labelAnchor: new google.maps.Point(0,0),
      data: {},
      icon: ASSETS_ROOT + 'img/facility-icon-magenta.png',
      labelClass: "facilityMarker",
      visible: false
    });
    available_cities[city_locode].facility_markers.push(facility_marker);
  }
}

async function handlePurpleAirTourData() {
  let purpleair_tour_list = await loadJsonData("tour-purpleair.json");
  let purpleair_tour_marker_list = purpleair_tour_list.tour.markers;
  let doCreate = true;
  for (let marker_info of purpleair_tour_marker_list) {
    if (available_cities["US-SLC"].sensors[marker_info['name']].data && available_cities["US-SLC"].sensors[marker_info['name']].data[timeline.selectedDayInMs]) {
      available_cities["US-SLC"].sensors[marker_info['name']].marker.getGoogleMapMarker().setVisible(true);
      doCreate = false;
    } else {
      available_cities["US-SLC"].sensors[marker_info['name']] = {"info" : marker_info}
    }
  }
  if (doCreate) {
    await loadAndCreateSensorMarkers(timeline.selectedDayInMs, purpleair_tour_marker_list, true);
  }
}

async function receivedWorkerMessage(event) {
  var result = event.data.result;
  var info = event.data.info;
  var epochtime_milisec = event.data.epochtime_milisec;
  var is_current_day = event.data.is_current_day;
  var sensor_names = Object.keys(result);
  for (var i = 0; i < info.length; i++) {
    var sensor = available_cities[selectedCity].sensors[info[i]['name']];
    if (sensor && sensor.data) {
      var marker = sensor['marker'];
      marker.setData(parseSensorMarkerData(result[sensor_names[i]].data[epochtime_milisec], is_current_day, info[i]));
      marker.updateMarker();
      // TODO
      marker.getGoogleMapMarker().setVisible(true);
    } else {
      createAndShowSensorMarker(result[sensor_names[i]].data[epochtime_milisec], epochtime_milisec, is_current_day, info[i]);
    }
  }

  jQuery.extend(true, available_cities[selectedCity].sensors, result);
  dataFormatWorkerIsProcessing = false;
  if (dataFormatPurpleAirWorkerIsProcessing) {
    dataFormatPurpleAirWorkerIsProcessing = false;
  }

  // TODO: We need a slight delay otherwise an array access error occurs
  // We need to run this code because if we are in playback mode and we turn on
  // purple airs, then we need to ensure they show the correct values corresponding
  // to the playback timeline.
  if (playbackTimeline && playbackTimeline.isActive()) {
    setTimeout(function() {
      handleDraw(playbackTimeline.getPlaybackTimeInMs());
    }, 10);
  }
  sensorsLoadedResolver(null);
}

async function loadAndCreateSensorMarkers(epochtime_milisec, info, is_current_day, selectedCityOverride) {
  let cityToMapTo = selectedCity;
  if (selectedCityOverride) {
    cityToMapTo = selectedCityOverride;
  }
  var [multiUrl, resultsMapping] = generateSensorDataMultiFeedUrl(epochtime_milisec, info);
  var data = await loadJsonData(multiUrl);
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

    dataSegment['data'] = aggregateSensorData(d, info[i]);
    var tmp = formatAndMergeSensorData(dataSegment, info[i]);
    // Roll the sensor data to fill in some missing values
    tmp = rollSensorData(tmp, info[i]);


    var sensorName = info[i]["name"];
    if (!available_cities[selectedCity].sensors[sensorName].data) {
      available_cities[selectedCity].sensors[sensorName].data = {};
      createAndShowSensorMarker(tmp, epochtime_milisec, is_current_day, info[i]);
    } else {
      var marker = available_cities[selectedCity].sensors[sensorName]['marker'];
      marker.setData(parseSensorMarkerData(tmp, is_current_day, info[i]));
      marker.updateMarker();
    }
    available_cities[selectedCity].sensors[sensorName].data[epochtime_milisec] = tmp;
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
    var sensorName = info["name"];
    if (!available_cities[selectedCity].sensors[sensorName].data) {
      available_cities[selectedCity].sensors[sensorName].data = {"data" : {}};
      createAndShowSensorMarker(data, epochtime_milisec, is_current_day, info, i);
    } else {
      var marker = available_cities[selectedCity].sensors[sensorName]['marker'];
      marker.setData(parseSensorMarkerData(data, is_current_day, info));
      marker.updateMarker();
    }
    available_cities[selectedCity].sensors[sensorName].data[epochtime_milisec] = data;
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
        showMarkers([marker], true);
      }
      var sensorName = info['name'];
      available_cities[selectedCity].sensors[sensorName].marker = marker;
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

async function loadAvailableCities() {
  let result;
  let city_selector_data = [];
  try {
      result = await $.ajax({
        url: CITY_DATA_ROOT + "cities.json",
        dataType : 'json',
      });
      available_cities = result || {};

      let lineSymbol = {
        path: 'M 0,-1 0,1',
        strokeOpacity: 1,
        scale: 2
      };
      for (let city_locode in available_cities) {
        let city = available_cities[city_locode];
        let cityClickRegion = new google.maps.Polyline({
          strokeColor: '#000000',
          strokeOpacity: 0,
          icons: [{
            icon: lineSymbol,
            offset: '0',
            repeat: '12px'
          }],
          path: [
            {lat: city['click_bounds']['ymax'], lng: city['click_bounds']['xmin']}, {lat: city['click_bounds']['ymin'], lng: city['click_bounds']['xmin']},
            {lat: city['click_bounds']['ymin'], lng: city['click_bounds']['xmax']},
            {lat: city['click_bounds']['ymin'], lng: city['click_bounds']['xmax']}, {lat: city['click_bounds']['ymax'], lng: city['click_bounds']['xmax']},
            {lat: city['click_bounds']['ymax'], lng: city['click_bounds']['xmin']}
                ],
          map: map,
          clickable: false,
          visible: false
        });
        available_cities[city_locode].footprint_region = cityClickRegion;

        let city_title = city['name'] + ", " + city['state_code'];
        let city_data = city;
        city_data['city_locode'] = city_locode;
        let city_marker = new MarkerWithLabel({
          position: new google.maps.LatLng(city['lat'], city['lon']),
          draggable: false,
          clickable: true,
          map: map,
          title: city_title,
          labelContent: city_title,
          labelAnchor: new google.maps.Point(0,-8),
          labelClass: "cityMapMarker",
          data: city_data,
          icon: ASSETS_ROOT + 'img/city_icon.png#' + city_locode,
        });
        google.maps.event.addListener(city_marker, "click", function (e) {
          map.setCenter({lat: this.data['lat'], lng: this.data['lon']});
          map.setZoom(window.innerWidth <= 450 ? this.data['zoom'] - 1 : this.data['zoom']);
        });
        available_cities[city_locode].marker = city_marker;
        available_cities[city_locode].facility_markers = [];
        city_selector_data.push({id: city_locode, text: city_title});
      }

      let options = [];
      for (let cityOption of city_selector_data) {
        options.push('<option value="'+ cityOption.id +'">'+ cityOption.text +'</option>');
      }
      $citySelector.html(options.join(''));

      $citySelector.mobileSelect({
        id : "cityOptionSelector",
        title : "Pick a city to explore:",
        animation : "none",
        buttonSave : "OK",
        filterable: true,
        filterPlaceholder: "Search...",
        onOpen: function() {
          // Need to delay some amount of time for UI to be ready
          setTimeout(function() {
            let $selectedOption = $("#cityOptionSelector .mobileSelect-control.selected");
            if ($selectedOption.lenth) {
              $selectedOption[0].scrollIntoView();
            }
          }, 20);
        }
      });
      $citySelector.val("");

      $citySelector.on("change", function(e) {
        let city_locode = e.currentTarget.value;
        if (city_locode && city_locode != selectedCity) {
          google.maps.event.trigger(available_cities[city_locode].marker, "click");
        }
      })
  } catch (error) {
      console.error(error);
  }
}

async function loadJsonData(url) {
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


// Safely get the value from a variable, return a default value if undefined
function safeGet(v, default_val) {
  if (typeof default_val === "undefined") default_val = "";
  return (typeof v === "undefined") ? default_val : v;
}


// TODO: Refactor so we are not passing in a marker but pulling state elsewhere.
function updateInfoBar(marker) {
  if (!marker || !selectedLocationPinVisible()) return;

  var markerData = marker.getData();

  // This is likely the case where we clicked on TRAX and incremented time, thus that marker is no longer valid.
  if (!markerData) {
    if (overlay) {
      markerData = overlay.getData();
    }
  }

  var isDaySummary = !markerData['is_current_day'] && markerData.sensorType != "trax";

  var markerDataTimeInMs = markerData.sensorType ==  "trax" || markerData.sensorType  == "backtrace" ? markerData['epochtimeInMs'] : markerData['sensor_data_time'] || markerData['wind_data_time'];
  var markerDataTimeMomentFormatted = moment.tz(markerDataTimeInMs, selected_city_tmz).format("h:mm A (zz)");

  // Set infobar header to sensor name (if TRAX or AirNow) or clicked lat/lon coords otherwise
  $infobarHeader.show();
  var infobarHeader = $infobarHeader[0];
  var markerName = markerData.sensorType ==  "trax" ? "TRAX "+ formatTRAXLineName(marker.traxId) + " Line" : markerData.name;
  infobarHeader.innerHTML = markerName;

  // Show sensor pollution value (PM25) in infobar
  var sensorVal = markerData.sensorType == "trax" ? markerData['pm25'] : markerData['sensor_value'] || 0;
  if (selectedSensorMarker) {
    if (isDaySummary) {
      setInfobarSubheadings($infobarPollution,"",sensorVal,PM25_UNIT,"Daily Max at "  + markerDataTimeMomentFormatted);
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
    var infoStr = "";
    if (overlayData.hasData) {
      infoStr = "Snapshot from model at " + moment.tz(overlayData['epochtimeInMs'], selected_city_tmz).format("h:mm A (zz)");
      setInfobarSubheadings($infobarPlume,infoStr,"","","");
      $infobarPlume.children(".infobar-text").addClass('display-unset');
    } else {
      var pollution_time = playbackTimeline.getPlaybackTimeInMs();
      if (selectedSensorMarker) {
        pollution_time = markerDataTimeInMs;
      }
      infoStr = "No pollution backtrace available at " + moment.tz(pollution_time, selected_city_tmz).format("h:mm A (zz)");
      setInfobarUnavailableSubheadings($infobarPlume,infoStr);
      $infobarPlume.children(".infobar-text").removeClass('display-unset');
      $infobarPlume.children(".infobar-unit").hide();
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
  await drawFootprint(marker.getData()['latitude'], marker.getData()['longitude'], true);

  updateInfoBar(marker);
}


async function handleTRAXMarkerClicked(marker, fromAnimate) {
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
  var fromClick = mapsMouseEvent.fromVirtualClick || !!mapsMouseEvent.domEvent;

  selectedSensorMarker = null;

  await drawFootprint(mapsMouseEvent.latLng.lat(),mapsMouseEvent.latLng.lng(), fromClick);
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

function hideMarkersByCity(city_locode, fromTimeChange) {
  // Get sensors
  var markers = Object.keys(available_cities[city_locode].sensors).map(function(k){return available_cities[city_locode].sensors[k]['marker'];});
  if (!fromTimeChange) {
    // Get facility icon markers
    markers = markers.concat(available_cities[city_locode].facility_markers);
  }
  hideMarkers(markers);
}

function hideMarkers(markers) {
  markers = safeGet(markers, []);
  for (var i = 0; i < markers.length; i++) {
    if (typeof markers[i] !== "undefined") {
      if (markers[i] instanceof CustomMapMarker) {
        markers[i].getGoogleMapMarker().setVisible(false);
      } else {
        markers[i].setVisible(false);
      }
    }
  }
}

function showMarkersByCity(city_locode) {
  var markers = Object.keys(available_cities[city_locode].sensors).map(function(sensorName){return available_cities[city_locode].sensors[sensorName]['marker'];});
  showMarkers(markers);
}

function showMarkers(markers, isFirstTime) {
  var zoom = map.getZoom();
  drewMarkersAtLeastOnce = true;
  markers = safeGet(markers, []);
  let filterExcludes = [];
  if (!$purpleAirToggle.prop("checked")) {
    filterExcludes.push("purple_air")
  }
  for (var i = 0; i < markers.length; i++) {
    if (typeof markers[i] !== "undefined" && !filterExcludes.includes(markers[i].getSensorType())) {
      if (isFirstTime) {
        markers[i].setMap(map);
      } else {
        markers[i].getGoogleMapMarker().setVisible(zoom >= MAP_ZOOM_CHANGEOVER_THRESHOLD);
      }
    }
  }
}

function setupTimeline(startTime) {
  var options = {
    playbackTimeInMs: startTime,
    clickEvent: function() {
      handleDraw(timeline.selectedDayInMs, true, true);
    }
  }
  // global function in timeline.js
  initTimeline(options);
}

function resetMapToCitiesOverview(city_locode) {
  resetAllTrax();
  resetAllHrrrWindErrorPoints();
  hideMarkersByCity(city_locode);
  available_cities[city_locode].marker.setVisible(true);
  available_cities[city_locode].footprint_region.setVisible(false);
  $citySelector.val("");
  $controls.hide();
  // TODO: If we no longer show legend when fully zoomed out, then remove the legend selector here
  $("#map, #infobar, #legend").addClass("no-controls");
  toggleOffAllNonForcedSensors();
  if (selectedLocationPinVisible()) {
    google.maps.event.trigger(selectedLocationPin, "click");
  }
  selectedCity = "";
  $legend.hide();
  //$currentDateLegendText.hide();
  //$currentDateLegendTextNone.show();
}

function showHideMarkersByZoomLevel() {
  var previousZoom = currentZoom;
  currentZoom = map.getZoom();

  if (previousZoom < MAP_ZOOM_CHANGEOVER_THRESHOLD && currentZoom != MAP_ZOOM_CHANGEOVER_THRESHOLD && previousZoom != -1) {
    return;
  }

  if (currentZoom < MAP_ZOOM_CHANGEOVER_THRESHOLD ) {
    var city_icon_markers_and_footprint_regions = Object.values(available_cities).map(function(city){return {marker: city.marker, footprint_region: city.footprint_region};});
    for (let i = 0; i < city_icon_markers_and_footprint_regions.length; i++) {
      if (!city_icon_markers_and_footprint_regions[i].marker) continue;
      city_icon_markers_and_footprint_regions[i].footprint_region.setVisible(false);
      city_icon_markers_and_footprint_regions[i].marker.setVisible(true);
    }
    if (selectedCity) {
      resetMapToCitiesOverview(selectedCity);
    }
  }
}


async function showSensorMarkersByTime(epochtime_milisec) {
  if (!selectedCity) return;
  if (typeof epochtime_milisec == "undefined") return;

  // Check if current day
  var date_str_sensor = moment(epochtime_milisec).tz(selected_city_tmz).format("YYYY-MM-DD");
  var is_current_day = date_str_sensor === current_day_str;

  var markers_with_data_for_chosen_epochtime = [];
  for (var sensorName in available_cities[selectedCity].sensors) {
    var sensor = available_cities[selectedCity].sensors[sensorName];
    if (sensor && sensor.data && sensor.data[epochtime_milisec]) {
      markers_with_data_for_chosen_epochtime.push(sensor.marker);
      sensor.marker.setData(parseSensorMarkerData(sensor.data[epochtime_milisec], is_current_day, sensor.info));
      sensor.marker.updateMarker();
    }
  }

  if (markers_with_data_for_chosen_epochtime.length > 0) {
    // Make sensors markers visible on the map
    showMarkers(markers_with_data_for_chosen_epochtime, false);
  } else {
    hideMarkersByCity(selectedCity, true);
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
    let air_now_list = Object.values(available_cities[selectedCity].sensors).reduce(function(result, sensor) {
      if (sensor.info.marker_type == "air_now") {
        result.push(sensor.info);
      }
      return result;
    }, []);
    dataFormatWorker.postMessage(
    { epochtime_milisec: epochtime_milisec,
      sensors_list: air_now_list,
      is_current_day : is_current_day }
    );
    // PurpleAir sensors
    if ($purpleAirToggle.prop("checked")) {
      clearInterval(purpleAirLoadInterval);
      let purple_air_list = Object.values(available_cities[selectedCity].sensors).reduce(function(result, sensor) {
        if (sensor.info.marker_type == "purple_air") {
          result.push(sensor.info);
        }
        return result;
      }, []);
      purpleAirLoadInterval = setInterval(function() {
        if (!dataFormatWorkerIsProcessing) {
          dataFormatPurpleAirWorkerIsProcessing = true;
          clearInterval(purpleAirLoadInterval);
          dataFormatWorker.postMessage(
          { epochtime_milisec: epochtime_milisec,
            sensors_list: purple_air_list,
            is_current_day : is_current_day }
          );
        }
      }, 50);
    }

  }
}

function handleTimelineToggling(e) {
  if (e) {
    var $currentTarget = $(e.currentTarget);
  }
  resetAllTrax();
  resetAllHrrrWindErrorPoints();
  $playbackTimelineAnchor.show();
  if (playbackTimeline && !playbackTimeline.isActive()) {
    if ($currentTarget && $currentTarget.prop("id") == "calendar-btn") return;
    isPlaybackTimelineToggling = true;
    playbackTimeline.setActiveState(true);
    $controls.removeClass("playbackTimelineOff");
    $calendarChosenDayIndicator.text($(".selected-block").data("label")).removeClass("hidden");
    $calendarBtn.addClass("playbackTimelineOn calendar-specific-day-icon").removeClass("force-hidden").prop("title", "Choose a different day");
    $dayTimeToggle.addClass("force-no-visibility");
    $("#timeline-handle").slideUp(500);
    playbackTimeline.seekTo(playbackTimeline.getCurrentFrameNumber());
  } else {
    if ($currentTarget && $currentTarget.hasClass("playbackButton")) return;
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

  $("#footprint-first-click-dialog input[type='checkbox']").on("click", function(){
    if ($(this).prop("checked")){
      localStorage.dontShowFootprintPopup = "true";
    }
  });
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
  $("#footprint-first-click-dialog [id^='explanation-'].explanation-content").hide();
  $("#explanation-" + currentStep).show();
}


function pad(n) { return (n < 10 ? '0' : '') + n.toString(); };


function convertFrom24To12Format(time24) {
  var [sHours, minutes] = time24.match(/([0-9]{1,2}):([0-9]{2})/).slice(1);
  var period = +sHours < 12 ? 'AM' : 'PM';
  var hours = +sHours % 12 || 12;
  return hours + ":" + minutes + " " + period;
}

function convertFrom12To24Format(time12) {
  var [sHours, sMinutes] = time12.match(/([0-9]{1,2}):([0-9]{2})/).slice(1);
  var hours = parseInt(sHours);
  if (time12.toLowerCase().indexOf("pm") && hours != 12) {
    var hourIn24Format = hours + 12;
    sHours = hourIn24Format;
  }
  return sHours + ":" + sMinutes;
}

const setAsyncTimeout = (cb, ms = 0) => new Promise(resolve => {
  setTimeout(() => {
      cb();
      resolve();
  }, ms);
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// TODO
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
