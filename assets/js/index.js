"use strict";

// Note that ASSETS_ROOT is defined in index.html

var TRAX_COLLECTION_NAME = "trax-dev";
//var STILT_COLLECTION_NAME = "stilt-prod";
var STILT_GCLOUD_BUCKET = "https://storage.googleapis.com/storage/v1/b/{BUCKET_NAME}/o/by-simulation-id";
var CLOUD_STORAGE_PARENT_URL = "https://storage.googleapis.com/{BUCKET_NAME}/by-simulation-id";
var CITY_DATA_ROOT = "https://airtracker.createlab.org/assets/data/cities/";
var CITY_DATA_ROOT_LOCAL = "./assets/data/cities/";
//var HRRR_UNCERTAINTY_COLLECTION_NAME = "hrrr-uncertainty-v2-dev";
var PM25_UNIT = "ug/m3";
var MAP_ZOOM_CHANGEOVER_THRESHOLD = 8;

// Increase/decrease for more or less TRAX data to look back at
var traxDataIntervalInMin = 60;
var traxDataIntervalInMs = traxDataIntervalInMin * 60000; // 60000 ms = 1 minute
var monitorGapThresholdInMs = 3600000 * 2; // 2 hour(s); show no available data after a time gap longer than this.

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

var map;
var infowindow;
var playbackTimeline;
var dataFormatWorker;
var available_cities = {};
var selectedCity = "";
var selected_city_tmz = "";
var plume_backtraces = {};
var tourObj;
var selected_day_start_epochtime_milisec;
var previous_selected_day_start_epochtime_milisec;
var zoomChangedSinceLastIdle = false;
var currentZoom = -1;
var selectedLocationPin;
var selectedSensorMarker;
var userPlacemarkes = [];
var overlay;
var db;
var RRule;
//var mostRecentUpdateEpochTimeForLocationInMs;
//var startOfLatestAvailableDay;

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
var ignoreMapIdleCallback = false;

var isPlaybackTimelineToggling = false;
var inTour = false;

var traxDataByEpochTimeInMs = {};
var traxLocations = {};
var traxMarkers = [];
var sensorsEnabledState = {};
var sensorLoadingDeferrers = {};

var worldMask;
// modes:
// 0 = masked out area, unmasked shows where pollution could have covered covered
// 1 = show likelihood of where pollution has come from
var backtraceMode = "0";
// modes:
// 0 = no uncertainty details
// 1 = basic uncertainty info
// 2 = detailed uncertainty info, which includes kriging info, wind info, etc
var uncertaintyDetailLevel = "1";

var checkIfPinOnLoadIsReadyInterval;

// DOM
var $infobar;
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
var $citySelector;
var $cityName;
var $map;
var $currentDateLegendText;
var $currentClockPreviewTime;
var $legend;
var $searchBoxClear;
var $searchBox;
var $searchBoxIcon;
var $tooltip;
var $tooltipContent;


var defaultHomeView = {lat: 38.26796, lng: -100.57088, zoom: window.innerWidth <= 450 ? 4 : 5};
var startingView = Object.assign({}, defaultHomeView);
// If true, do not pull footprints from GCS, but compute them in realtime
var runRealTime = false;
var runRealTimeOverride = false;
var useGFSMetOverride = false

function isMobileView() {
  return $(window).width() <= 450;
}


function getSelectedCityTZ() {
  return selected_city_tmz;
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
  /*if (selectedSensorMarker && selectedSensorMarker.traxId) {
    selectedSensorMarker = null;
  }*/
}


function setTraxOpacityAndColor(currentPlaybackTimeInMs) {
  var opacity;
  var timeIntervalInMs = traxDataIntervalInMs;
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
      opacity = Math.min(1, Math.max(0, (1 - (timeDiff / timeIntervalInMs)) + 0.05));
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
  var startDate = mStartDate.clone().subtract(traxDataIntervalInMin - 1, 'minutes').toDate();

  sensorLoadingDeferrers['trax'] = new Deferred();
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
  sensorLoadingDeferrers['trax'].resolve(null);
}


async function initMap() {
  var urlVars = Util.parseVars(window.location.href);

  var shareView = urlVars.v;

  runRealTimeOverride = urlVars.runRealTime == 'true';
  useGFSMetOverride = urlVars.useGFSMet == 'true';
  backtraceMode = typeof(urlVars.backtraceMode) != "undefined" ? urlVars.backtraceMode : backtraceMode;

  if (shareView) {
    var tmp = shareView.split(",");
    startingView.lat = parseFloat(tmp[0]);
    startingView.lng = parseFloat(tmp[1]);
    startingView.zoom = parseFloat(tmp[2]);
  }

  // DEBUG
  STILT_GCLOUD_BUCKET = STILT_GCLOUD_BUCKET.replace("{BUCKET_NAME}", urlVars.gcsBucketName ? urlVars.gcsBucketName : "air-tracker-edf-prod");
  CLOUD_STORAGE_PARENT_URL = CLOUD_STORAGE_PARENT_URL.replace("{BUCKET_NAME}", urlVars.gcsBucketName ? urlVars.gcsBucketName : "air-tracker-edf-prod");
  // DEBUG

  // Set information window
  infowindow = new google.maps.InfoWindow({
    pixelOffset: new google.maps.Size(-1, 0),
    maxWidth: 250
  });

  map = new google.maps.Map(document.getElementById("map"), {
    options: {
      gestureHandling: 'greedy'
    },
    tilt: 0,
    rotateControl: false,
    center: { lat: startingView.lat, lng: startingView.lng },
    zoom: startingView.zoom,
    minZoom: isMobileView() ? 4 : 5,
    streetViewControl: false,
    mapTypeControl: true,
    mapTypeControlOptions: {
      style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
      position: isMobileView() ? google.maps.ControlPosition.LEFT_BOTTOM : google.maps.ControlPosition.BOTTOM_RIGHT,
      mapTypeIds: ["roadmap", "satellite"],
    },
    fullscreenControl: false,
    zoomControl: !isMobileView(),
    zoomControlOptions: {
      position: google.maps.ControlPosition.RIGHT_BOTTOM,
    },
    clickableIcons: false,
    styles:
      [
        {
          "stylers":[
            {
              "saturation":-100
            },
            {
              "gamma":1
            }
          ]
        },
        {
          "elementType":"labels.text.stroke",
          "stylers":[
            {
              "visibility":"off"
            }
          ]
        },
        {
          "featureType":"poi.business",
          "elementType":"labels.text",
          "stylers":[
            {
              "visibility":"off"
            }
          ]
        },
        {
          "featureType":"poi.business",
          "elementType":"labels.icon",
          "stylers":[
            {
              "visibility":"off"
            }
          ]
        },
        {
          "featureType":"poi.place_of_worship",
          "elementType":"labels.text",
          "stylers":[
            {
              "visibility":"off"
            }
          ]
        },
        {
          "featureType":"poi.place_of_worship",
          "elementType":"labels.icon",
          "stylers":[
            {
              "visibility":"off"
            }
          ]
        },
        {
          "featureType":"poi.school",
          "elementType":"labels.icon",
          "stylers":[
            {
              "visibility":"on"
            },
            {
              "saturation":50
            },
            {
              "gamma":0
            },
            {
              "hue":"#747aa8"
            }
          ]
        },
        {
          "featureType":"road",
          "elementType":"geometry",
          "stylers":[
            {
              "visibility":"simplified"
            }
          ]
        },
        {
          "featureType":"water",
          "stylers":[
            {
              "visibility":"on"
            },
            {
              "saturation":50
            },
            {
              "gamma":0
            },
            {
              "hue":"#50a5d1"
            }
          ]
        },
        {
          "featureType":"administrative.neighborhood",
          "elementType":"labels.text.fill",
          "stylers":[
            {
              "color":"#333333"
            }
          ]
        },
        {
          "featureType":"road.local",
          "elementType":"labels.text",
          "stylers":[
            {
              "weight":0.5
            },
            {
              "color":"#333333"
            }
          ]
        },
        {
          "featureType":"transit.station",
          "elementType":"labels.icon",
          "stylers":[
            {
              "gamma":1
            },
            {
              "saturation":50
            }
          ]
        },
        {
          "featureType":"poi.park",
          "elementType":"geometry",
          "stylers":[
            {
              "visibility":"on"
            },
            {
              "color":"#d2e2cf"
            }
          ]
        },
        {
          "featureType":"landscape",
          "elementType":"geometry",
          "stylers":[
            {
              "visibility":"on"
            },
            {
              "lightness":"10"
            }
          ]
        },
        {
          "featureType":"landscape.natural.landcover",
          "elementType":"geometry",
          "stylers":[
            {
              "visibility":"on"
            },
            {
              "lightness":"15"
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

    showHideMarkersByZoomLevel();
    getCityInBounds(true);

    google.maps.event.addListener(map, 'zoom_changed', function() {
      showHideMarkersByZoomLevel();
      zoomChangedSinceLastIdle = true;
    });

    google.maps.event.addListener(map, 'idle', function(e) {
      // Note that this event is also called when the map resizes,
      // since the bounds of the map changes.

      changeBrowserUrlState();
      if (ignoreMapIdleCallback) {
        ignoreMapIdleCallback = false;
        return;
      }
      getCityInBounds();
    });

  });

  $("#legend-table").on("click", ".more-info", function() {
    var text = {
      "side-panel-data" : {text: "Data comes in at different rates depending upon the type of monitor. If the data rate is sub " + playbackTimeline.getIncrementAmt() + " minute intervals, the value displayed below is the average of all points collected between the selected playback time and prior " + playbackTimeline.getIncrementAmt() + " minute window.", pos: {at: "top", my: 'left bottom-10'}},
      "side-panel-backtrace" : {text: "To visualize the likely origin of a pollution hotspot, click on the map to generate a source area figure from that hotspot. A source area shows the most likely location where that pollution originated. To further help pinpoint a potential pollution source, click the 3 dots on the side to learn more details about a specific area's contribution likelihood.", pos: {at: "bottom", my: 'left top+10'}},
      "legend-backtrace" : {text: "A source area (inside the dotted region) is the most likely origin of the air traveling to the clicked location.", pos: {at: "top", my: 'left bottom-10'}},
      "legend-air_now" : {text: "Government monitors providing hourly PM<sub>2.5</sub> readings. These sensors can be used as the most accurate measures of PM. Click on the colored circles to view PM<sub>2.5</sub> measurements in the info panel.", pos: {at: "top", my: 'left bottom-10'}},
      "legend-purple_air" : {text: "PurpleAir low-cost monitors provide more frequent and localized PM<sub>2.5</sub> readings. Click on the colored squares to view PM<sub>2.5</sub> measurements in the info panel.", pos: {at: "top", my: 'left bottom-10'}},
      "legend-trax" : {text: "TRAX is a public transportation system in Salt Lake City. Three trains measure PM<sub>2.5</sub> along their light rail routes.", pos: {at: "top", my: 'left bottom-10'}},
      "legend-clarity" : {text: "Clarity low-cost monitors provide more frequent and localized PM<sub>2.5</sub> readings. Click on the colored squares to view PM<sub>2.5</sub> measurements in the info panel.", pos: {at: "top", my: 'left bottom-10'}},
      "legend-quant_aq" : {text: "QuantAQ low-cost monitors provide more frequent and localized PM<sub>2.5</sub> readings. Click on the colored squares to view PM<sub>2.5</sub> measurements in the info panel.", pos: {at: "top", my: 'left bottom-10'}},
      "legend-aq_sync" : {text: "AQSync low-cost monitors provide more frequent and localized PM<sub>2.5</sub> readings. Click on the colored squares to view PM<sub>2.5</sub> measurements in the info panel.", pos: {at: "top", my: 'left bottom-10'}},
      "legend-wind" : {text: "This icon points in the direction the wind is moving. Click on the monitor to view wind speed and direction in the info panel.", pos: {at: "top", my: 'left bottom-10'}},
      "legend-facilities" :  {text: "Industrial facility locations are marked with either a pin or the full boundaries drawn in light red.", pos: {at: "top", my: 'left bottom-10'}},
      "grapher" : {text: "View PM<sub>2.5</sub> data over time from any monitor on Air Tracker. Click a monitor on the map. When it appears below, toggle the monitor from 'off' to 'on'. Each measurement is represented by a dot on the chart. <br><br> Click on the plus and minus signs or use your scroll wheel to explore trends over time. <br><br>You may compare trends from multiple monitors by clicking on additional monitors. <br><br>Click on a dot in the chart, and  Air Tracker will automatically show you the source area at that time for that monitor. Note that if you select multiple monitors, Air Tracker will show the source areas for the last location you clicked on the map.", pos: {at: "right", my: 'left-12 top+10'}},
    };
    var selectedInfo = text[$(this).data("info")];
    setButtonTooltip(selectedInfo.text, $(this), null, selectedInfo.pos);
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
      var max = 248;
      var maxHeight = Math.min(max, (startHeight - dist));
      $infobar.height(maxHeight);
    });
    $(document).one("mouseup.infocontainer", function(e) {
      $(document).trigger("click");
      if (lastYDirection && lastYDirection == "up") {
        $infobar.stop(true, false).animate({
          height: "240px"
        });
        $infobar.addClass("maximized");
      } else if (lastYDirection && lastYDirection == "down") {
        $infobar.stop(true, false).animate({
          height: "51px"
        }, function() {
          $infobar.removeClass("maximized");
          $(document).trigger("click");
        });
      }
      $infobar.removeClass("disableScroll");
      $(document).off(".infocontainer");
    });
  });

  $("#infobar-back-arrow-container").on("click", function() {
    if (heatmapModeEnabled) {
      hideHeatmapUI();
      // Remove footprint pin if visible
      if (selectedLocationPinVisible()) {
        google.maps.event.trigger(selectedLocationPin, "dblclick");
      }
      handleControlsUI("enable");
      showSensorMarkersByTime(playbackTimeline.getPlaybackTimeInMs());
    }

    if (timeSeriesModeEnabled) {
      hideTimeSeriesUI();
    }

    $("#infobar").removeClass("altmode");
    $("#infobar-tools").hide();
  });

  verticalTouchScroll($infobar);

  $(window).on("resize", function() {
    map.setOptions({zoomControl: !isMobileView()});
  });

  $("#controls").on("click", "#calendar-btn, .timestampPreview", handleTimelineToggling);

  if (hasTouchSupport) {
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
      // Ensure this layer is the top most in the pane
      img.style.zIndex = "99999";

      this.div.appendChild(img);
      // Add the element to the "markerLayer" pane.
      const panes = this.getPanes();
      panes.markerLayer.appendChild(this.div);
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
    if (isInTour() || !playbackTimeline || $("input").is(":focus")) return;
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

  $("input[name='date-picker-selector']").on("click", function() {
    $("#heatmap div[data-radio$='-collection-radio']").hide();
    $("#heatmap div[data-radio='" + $(this).prop('id') + "']").show();
  });

  $('#heatmap-date-picker').on('click', '.select-all', function () {
    var $checkboxes = $(this).parent().find("input[type='checkbox']");
    $checkboxes.prop('checked', true);
    $checkboxes.first().trigger("change");
  });


  $.datetimepicker.setDateFormatter('moment');

  $('#datetimepicker-start').datetimepicker({
    step: 3600,
    formatTime: 'h A',
    formatDate: 'MM/DD/YYYY',
    format: 'MM/DD/YYYY h A',
    todayButton: false,
    yearStart: 2020,
    onShow:function( ct ){
      this.setOptions({
        maxDate: $('#datetimepicker-end').val() ? $('#datetimepicker-end').val() : moment(Date.now()).tz(selected_city_tmz).format("MM/DD/YYYY 12 A")
      });
    }
  });

  $('#datetimepicker-end').datetimepicker({
    step: 3600,
    formatTime: 'h A',
    formatDate: 'MM/DD/YYYY',
    format: 'MM/DD/YYYY h A',
    todayButton: false,
    yearStart: 2020,
    onShow:function( ct ){
      this.setOptions({
        minDate: $('#datetimepicker-start').val() ? $('#datetimepicker-start').val() : false,
        maxDate: moment(Date.now()).tz(selected_city_tmz).format("MM/DD/YYYY 12 A")
      });
    }
  });

  $("#frequency, #interval, #datetimepicker-start, #datetimepicker-end, input[name='bymonth'], input[name='byweekday'], input[name='byhour']").on("change", function() {
    var val = "";
    if ($(this).prop('type') == "checkbox") {
      val = $(this).is(':checked');
    } else {
      val = $(this).val();
    }
    if ($(this).data("last-val") == val) return;
    $(this).data('last-val', val);

    if ($(this).prop("id") == "frequency") {
      if ($(this).val() == "RRule.HOURLY") {
        $("#hour-row").hide();
      } else {
        $("#hour-row").show();
      }
    }

    if ($("#frequency").val() && $("#interval").val() && $("#datetimepicker-start").val() && $("#datetimepicker-end").val()) {
      $("#result").html(computeRRule());
    }
  });

  $(".shareViewModal").dialog({
    resizable: false,
    autoOpen: false,
    dialogClass: "customDialog",
    modal: true,
    open: function() {
      $(".shareurl").text(getShareUrl());
      if (isMobileView()) {
        $(".shareViewModal").dialog("option", "position", {of: window, my: "top+40", at: "top"});
        $('.ui-widget-overlay').css({ opacity: '1', background: "#878787" });
      }
    }
  });

  $(".reachOutModal").dialog({
    resizable: false,
    autoOpen: false,
    dialogClass: "customDialog",
    modal: true,
    open: function() {
      if (isMobileView()) {
        $(".reachOutModal").dialog("option", "position", {of: window, my: "top+40", at: "top"});
        $('.ui-widget-overlay').css({ opacity: '1', background: "#878787" });
      }
    }
  });

  $(".backtraceSettingsModal").dialog({
    resizable: false,
    autoOpen: false,
    dialogClass: "customDialog",
    modal: true,
    width: "350px",
    open: function() {
      // Ensure toggle matches internal state
      $("#toggle-backtrace-likelihood").prop("checked", backtraceMode == "1");
      if (isMobileView()) {
        $(".backtraceSettingsModal").dialog("option", "position", {of: window, my: "top+40", at: "top"});
        $('.ui-widget-overlay').css({ opacity: '1', background: "#878787" });
      }
    }
  });

  $(".tosModal").dialog({
    resizable: false,
    autoOpen: false,
    dialogClass: "customDialog",
    modal: true,
    width: isMobileView() ? window.innerWidth - 50 : "450",
    maxWidth: window.innerWidth,
    maxHeight: window.innerHeight,
    open: function() {
      document.activeElement.blur();
      $(".content").css("height", window.innerHeight - 200);
      $(".tosModal").dialog("option", "position", {of: window, my: "top+40", at: "top"});
    }
  });

  $("#tos-agree").on("click", function() {
    localStorage.showTOS = "true";
    $(".tosModal").dialog('close');
  });

  $(".searchModal").dialog({
    resizable: false,
    autoOpen: false,
    dialogClass: "customDialog",
    modal: true,
    position: { of: window, my: "top+40", at: "top" },
    open: function() {
      $('.ui-widget-overlay').css({ opacity: '1', background: "#878787" });
    }
  });

  $(".methodologyModal").dialog({
    resizable: false,
    autoOpen: false,
    dialogClass: "customDialog",
    modal: true,
    open: function() {
      if (isMobileView()) {
        $(".methodologyModal").dialog("option", "position", {of: window, my: "top+40", at: "top"});
        $('.ui-widget-overlay').css({ opacity: '1', background: "#878787" });
      }
    }
  });

  $(".chart-btn").on("click", function() {
    if ($(this).hasClass("disabled")) return;
    timeSeriesModeEnabled = true;
    if (!heatmapModeEnabled) {
      $("#back-arrow-text").html("Exit Time Series");
    }
    $("#infobar").addClass("altmode");
    if (heatmapModeEnabled) {
      $("#get-heatmap").show();
    } else {
      $("#get-heatmap").hide();
    }
    if (heatmapModeEnabled && $("input[name='date-picker-selector']:checked").prop("id") == "gui-collection-radio") {
      $("#timeseries").hide();
    } else {
      $("#infobar-tools, #timeseries").show();
    }
    handleTimeSeries();
    // TODO: Reposition map to ensure side panel isn't covering the location pin?
    map.panTo({lat: selectedLocationPin.getPosition().lat(), lng: selectedLocationPin.getPosition().lng()});
  });

  $("#heatmap-btn").on("click", function() {
    if ($(this).hasClass("disabled")) return;
    heatmapModeEnabled = true;
    $("#back-arrow-text").html("Exit Heatmap Mode");
    $("#infobar").addClass("altmode");
    $("#infobar-tools, #heatmap").show();
    handleHeatmapMode();
    // TODO: Reposition map to ensure side panel isn't covering the location pin?
    map.panTo({lat: selectedLocationPin.getPosition().lat(), lng: selectedLocationPin.getPosition().lng()});
  });

  $(".close-modal").on("click", function() {
    $(this).parent().dialog('close');
  });

  $(window).resize(function() {
    if (!isMobileView()) {
      $(".shareViewModal, .reachOutModal, .backtraceSettingsModal").dialog("option", "position", {my: "center", at: "center", of: window});
    }
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

  $("#heatmap-dates").on("input", function(e) {
    if (e.originalEvent.inputType == "insertFromPaste") {
      // Ensure each date is on a single line, comma delimited
      $(this).val($(this).val().replace(/\s*,\s*|(?<!,)\n/g,",\n"));
    }
  });

  $("#get-heatmap").on("click", function() {
    if ($(this).hasClass("button-loading")) return;
    if (!selectedLocationPinVisible()) {
      alert("You need to click a location on the map.");
      return;
    }
    var $that = $(this);

    var payload = {};

    if ($("input[name='date-picker-selector']:checked").prop("id") == "manual-collection-radio") {
      var dates = $("#heatmap-dates").val().replace(/\n/g, '').replace(/(?!\b\s\b)\s+/g,'');
      var regexDatePattern = "\\d{4}-\\d{2}-\\d{2}\\s\\d{2}:\\d{2}";
      var re = new RegExp(`^(${regexDatePattern})(,${regexDatePattern})+,?$`);

      if (!re.test(dates)) {
        alert("Invalid formatted date list.");
        return;
      }
      // Date is displayed in RFC 3339, (by use of a space separating date and time)
      // We replace the space with a 'T' to be ISO8601 compliant.
      payload.times = dates.replace(/\s/g,'T');
      payload.tz = selected_city_tmz;
    } else {
      rrule = $("#rrule-str").val();
      if (!rrule) {
        alert("Missing start/end dates.");
        return;
      }
      payload.rrule = rrule;
    }

    payload.view = selectedLocationPin.getPosition().lat() + "," + selectedLocationPin.getPosition().lng() + "," + map.getZoom();
    payload.forOverlay = true;

    //$(this).addClass("button-loading");
    $("#heatmap-loading-mask").addClass("visible");
    $.ajax({
      url: "https://api.airtracker.createlab.org/get_heatmap",
      data: payload,
      dataType: "json"
      // xhrFields: {
      //   responseType: 'blob'
      // }
    }).done(async function(data) {
      //download(data, "heatmap", "image/png");
      await drawFootprint(selectedLocationPin.getPosition().lat(), selectedLocationPin.getPosition().lng(), true, false, data);
    }).fail(function(e) {
      if (e && e.status == 414) {
        alert("Too many DateTimes to process. Please try again with a shorter list.");
      } else if (e && e.status == 503) {
        alert("Heatmap service is temporarily unavailable. Please try again later.")
      } else if (e && e.responseJSON && e.responseJSON.error) {
        alert(e.responseJSON.error);
      } else {
        alert("An error occurred processing your request. Please check your input data.");
      }
    }).always(function() {
      //$that.removeClass("button-loading");
      $("#heatmap-loading-mask").removeClass("visible");
    });
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
        // Ignore various controls (zoom, map style) on Google Maps
        // Note that classList returns a DOMTokenList
        if (['gm-bundled-control','gm-style-mtc'].some(className => element.classList.contains(className))) {
          return true;
        }
      }
    });
    var exportImage = canvas.toDataURL();
    var currentPlaybackTimeInMs = playbackTimeline.getPlaybackTimeInMs();
    var isPlaybackTimelineOpen = playbackTimeline.isActive();
    var momentTime = moment.tz(currentPlaybackTimeInMs, selected_city_tmz);
    var dateStr = isPlaybackTimelineOpen ? momentTime.format("YYYYMMDDHHmm") : momentTime.startOf("day").format("YYYYMMDDHHmm");
    download(exportImage, dateStr + ".png", "image/png");
    $(this).removeClass("waiting").text("Capture Screenshot");
  });

  $("#legend-table").on("click", "td input", function(e) {
    var isChecked = $(e.target).prop("checked");
    var markerType = $(e.target).data("marker-type");
    if (markerType == "facilities") {
      toggleFacilities(isChecked);
    } else if (markerType == "trax") {
      toggleTrax(isChecked);
    } else {
      toggleMarkersByMarkerType(markerType, isChecked);
    }
    if (isSensorMarkerVisible(selectedSensorMarker)) {
      updateInfoBar(selectedSensorMarker);
    } else if (selectedLocationPinVisible()) {
      updateInfoBar(overlay);
    }
  }).on("change", function(e) {
    var isChecked = $(e.target).prop("checked");
    var markerType = $(e.target).data("marker-type");
    updateSensorsEnabledState(markerType, isChecked);
  });

  $("#search-mobile").on("click", function() {
    $(".searchModal").dialog('open');
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

  var DummyOverlay = function() { };
  DummyOverlay.prototype = new google.maps.OverlayView();
  DummyOverlay.prototype.draw = function() {
   var self = this;
   if (!map.getMapPanes) {
     map.getMapPanes = function() {
        return self.getPanes();
     };
   }
  };
  // Add the dummy overlay to the map so it's draw method is called and we gain a new function to get map panes
  (new DummyOverlay()).setMap(map);

  worldMask = new MaskClass(map);

  if (localStorage.showTOS !== "true") {
    $(".tosModal").dialog('open');
  }

  RRule = rrule.RRule;

  // !!DO TRAX LAST!!

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


function siteTourShort() {
  var defaultTourStepTitle = "Air Tracker Tour";

  // TODO: Make tour views/text fit better for mobile
  var steps = [];

  var step_0_text = "This tour covers the basics of Air Tracker. <br> <br> To start, click 'Next'.";
  if (!isMobileView()) {
    step_0_text += "<br><br> You can also use the forward/backward arrow keys on your keyboard.";
  }
  var step_0 = {
    title: defaultTourStepTitle,
    intro: step_0_text
  };

  var step_1 = {
    title: defaultTourStepTitle,
    intro: "Air Tracker is interactive and works within the dotted bounds around each featured city. <br><br> You can click anywhere within those bounds to find a source area influencing that point of interest."
  };

  var step_2 = {
    title: defaultTourStepTitle,
    element: null,
    highlightPaddings:  {top: -150, left: -50, width: 500, height: 200},
    intro: "A source area, which is depicted as a non-masked out region, shows where pollution is most likely originating."
  };

  var step_3 = {
    title: defaultTourStepTitle,
    element: null,
    intro: "These colored circles represent regulatory air quality monitors. The colors within the circle represent real-time air pollution readings.",
    position: "right",
    highlightPaddings: {left: -50, top: -50, width: 70, height: 70},
  };

  var step_4 = {
    title: defaultTourStepTitle,
    element: null,
    intro: "The blue arrow points in the direction that wind is moving. You can click on these monitors to show real-time wind and pollution readings on the side bar.",
    position: "right",
    highlightPaddings: {left: -50, top: -50, width: 70, height: 70},
  };

  var step_5 = {
    title: defaultTourStepTitle,
    element: document.querySelector(".chart-btn"),
    intro: "Once you've click on a monitor, you can also click the chart emblem on the side bar to see pollution concentrations over time at that monitor.",
    position: "right",
  };

  var step_6 = {
    title: defaultTourStepTitle,
    element: document.querySelector("#purple_air-legend-row"),
    intro: "'PurpleAir' and 'Clarity' sensor data can be added to the map using the toggle button in the legend.",
    highlightPaddings:  {height: 38},
    position: "left",
  };

  var step_7 = {
    title: defaultTourStepTitle,
    element: document.querySelector("#legend"),
    intro: "Additional air quality data sources vary by city. <br><br> In Salt Lake City, three trains from the light rail system 'TRAX' feature real-time air pollution monitors that map readings when those trains are running. <br><br> In Pittsburgh, real-time smell reports highlight areas where citizens have reported nuisance smells.",
    position: "left"
  };

  var step_8 = {
    title: defaultTourStepTitle,
    element: document.querySelector('#timeline-container'),
    intro: "The default map of Air Tracker shows current, real-time data. <br><br> You can also look up source areas in the past. Scroll through the dates at the bottom of the page. When you click on a new date, the map will update, showing the data from the selected day.",
    position: "top-middle-aligned"
  };

  var step_9 = {
    title: defaultTourStepTitle,
    element: document.querySelector('.timestampPreview'),
    intro: "To select a new time within a day, click on the clock in the lower left-hand corner of the screen.",
    position: "top-left-aligned",
  };

  var step_10 = {
    title: defaultTourStepTitle,
    element: null,
    intro: "Once you clicked the clock, you can change the time of day in 3 ways: <br><br> <ol><li>Use the scroll bar on the timeline.</li><li>Click the left/right arrows on your keyboard.</li><li>Hold down the left or right arrow buttons on the timeline and a pop-up will allow you to select a time to jump to.</li>",
    position: "top-left-aligned",
  };

  var step_11 = {
    title: defaultTourStepTitle,
    element: document.querySelector('.playbackButton'),
    intro: "To animate source areas on a specific date, click the play button next to the calendar. This will play through measured air pollution and source area data.",
    position: "top-left-aligned",
  };

  var step_12 = {
    title: defaultTourStepTitle,
    element: document.querySelector("#share-picker"),
    intro: "You can share a snapshot of the map view you were looking at by clicking this button. A pop-up will appear with various options.",
    position: "right",
  };

  tourObj = introJs().setOptions({
    autoPosition: false,
    exitOnOverlayClick: false,
    showProgress: true,
    showBullets: false,
    steps: [
      step_0,
      step_1,
      step_2,
      step_3,
      step_4,
      step_5,
      step_6,
      step_7,
      step_8,
      step_9,
      step_10,
      step_11,
      step_12
    ]
  }).onbeforechange(async function() {
    // Steps are 0 indexed
    if (this._currentStep == 0) {
      inTour = true;

      // Add tour css indicator to any elements that we want to handle css transitions differently when in tour mode
      $(".materialTimelineContainerMain").addClass("tour");

      // Remove footprint pin if visible
      if (selectedLocationPinVisible()) {
        google.maps.event.trigger(selectedLocationPin, "dblclick");
      }

    } else if (this._currentStep == 1) {
      // Remove footprint pin if visible
      if (selectedLocationPinVisible()) {
        google.maps.event.trigger(selectedLocationPin, "dblclick");
      }

      // Close side panel
      $("#infobar-back-arrow-container").trigger("click");

      // Turn off any sensors that can be toggled
      toggleOffAllNonForcedSensors();

      // If we are starting the tour with the playback timeline up, close it.
      if (playbackTimeline && playbackTimeline.isActive()) {
        handleTimelineToggling();
      }

      // Bring SLC bounds into view
      google.maps.event.trigger(available_cities["US-HOU"].marker, "click");

    } else if (this._currentStep == 2) {
      // Bring up Nov 3rd 2021 @ noon
      playbackTimeline.seekTo(39, true);
      $(".block-click-region[data-epochtime_milisec='1651035600000']").trigger("click");
      await waitForSensorsLoaded();
      // A lat/lng point in SLC region
      var latLng = new google.maps.LatLng(29.726360689, -95.44894116);
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
      if (isMobileView()) {
        $(".custom-legend").accordion( "option", "active", false);
        this._introItems[this._currentStep].position = "top-middle-aligned";
      } else {
        this._introItems[this._currentStep].position = "right";
      }

      // Reposition
      map.setCenter(new google.maps.LatLng(29.726360689, -95.30371547509765));

      setTimeout(() => {
        this.refresh();
      }, 500);

    } else if (this._currentStep == 3) {
      // Remove footprint pin if visible
      if (selectedLocationPinVisible()) {
        google.maps.event.trigger(selectedLocationPin, "dblclick");
      }

      var marker = available_cities["US-HOU"].sensors["Houston Westhollow C410 AirNow"].marker.getGoogleMapMarker();
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
    } else if (this._currentStep == 4) {
      var id = "tour-manual-region-3";
      this._introItems[this._currentStep].element = document.querySelector("#" + id);
      this._introItems[this._currentStep].position = "left";
      this.refresh();
    } else if (this._currentStep == 5) {
      if (!selectedLocationPinVisible()) {
        var marker = available_cities["US-HOU"].sensors["Houston Westhollow C410 AirNow"].marker.getGoogleMapMarker();
        google.maps.event.trigger(marker, "click");
      }
      var that = this;
      setTimeout(() => {
        that._introItems[that._currentStep].element = document.querySelector(".chart-btn");
        that._introItems[that._currentStep].position = "right";
        that.refresh();
      }, 300);
    } else if (this._currentStep == 6) {
      // Remove footprint pin if visible
      if (selectedLocationPinVisible()) {
        google.maps.event.trigger(selectedLocationPin, "dblclick");
      }
    } else if (this._currentStep == 9) {
      // If we are starting the tour with the playback timeline up, close it.
      if (playbackTimeline && playbackTimeline.isActive()) {
        handleTimelineToggling();
      }
    } else if (this._currentStep == 10) {
      if (playbackTimeline && !playbackTimeline.isActive()) {
        handleTimelineToggling();
      }
    }

  }).onexit(function() {
    // Turn off tour mode
    inTour = false;
    // Remove tour CSS indicator
    $(".materialTimelineContainerMain").removeClass("tour");
    // If we never got beyond the intro slide of the tour, don't do any of the cleanup/resetting below.
    if (this._currentStep == 0) {
      return;
    }
    // Remove footprint pin if visible
    if (selectedLocationPinVisible()) {
      google.maps.event.trigger(selectedLocationPin, "dblclick");
    }
    // Go to most recent available day
    $(".block-click-region[data-epochtime_milisec='" + timeline.getLastBlockData().epochtime_milisec + "']").trigger("click");
    // Remove all manual tour div regions
    $("tour-overlay-region").remove();
  }).start();
}


function convertLatLngToScreenCoords(latLng) {
  var _projection = map.getProjection();
  var _topRight = _projection.fromLatLngToPoint(map.getBounds().getNorthEast());
  var _bottomLeft = _projection.fromLatLngToPoint(map.getBounds().getSouthWest());
  var _scale = Math.pow(2, map.getZoom());

  var _point = _projection.fromLatLngToPoint(latLng);

  var _posLeft = Math.round((_point.x - _bottomLeft.x) * _scale);
  var _posTop = Math.round((_point.y - _topRight.y) * _scale);

  return {left: _posLeft, top: _posTop};
}


function goToDefaultHomeView(){
  map.setCenter({lat: defaultHomeView.lat, lng: defaultHomeView.lng});
  map.setZoom(defaultHomeView.zoom);
}


function changeBrowserUrlState() {
  window.history.replaceState({}, "", getShareUrl());
}


async function toggleTrax(makeVisible) {
  if (makeVisible) {
    await getTraxInfoByPlaybackTime(playbackTimeline.getPlaybackTimeInMs());
  } else {
    resetAllTrax();
  }
}


async function toggleMarkersByMarkerType(marker_type, makeVisible) {
  if (!selectedCity) return;

  let sensors = [];
  let marker_info_list = Object.values(available_cities[selectedCity].sensors).reduce(function(result, sensor) {
    if (sensor.info.marker_type == marker_type) {
      result.push(sensor.info);
      sensors.push(sensor);
    }
    return result;
  }, []);

  for (let sensor of sensors) {
    if (sensor.marker && sensor.data[timeline.selectedDayInMs]) {
      sensor.marker.getGoogleMapMarker().setVisible(makeVisible);
    } else {
      // The worker may already be processing so terminate it and create a new one.
      // There is overhead to this but significantly less than having it finish
      // whatever the last worker was doing.
      if (sensorLoadingDeferrers[marker_type] && sensorLoadingDeferrers[marker_type].isProcessing) {
        dataFormatWorker.terminate();
        createDataPullWebWorker();
        sensorLoadingDeferrers[marker_type].promise = null;
        sensorLoadingDeferrers[marker_type].isProcessing = false;
        sensorLoadingDeferrers[marker_type].isQueued = false;
      }

      if (!makeVisible) {
        continue;
      }

      let sensor_markers = sensors.map(function(sensor){return sensor.marker;});
      hideMarkers(sensor_markers);
      // Check if current day
      // Previous code differentiated between showing current day values and 'max' values for prior days.
      // We no longer want to show 'max' values anymore and instead the value at the time being looked at.
      // To do this, we always treat the mode as 'is_current_day'
      var is_current_day = true;
      //var date_str_sensor = moment(timeline.selectedDayInMs).tz(selected_city_tmz).format("YYYY-MM-DD");
      //var is_current_day = date_str_sensor === current_day_str;

      sensorLoadingDeferrers[marker_type] = {};
      sensorLoadingDeferrers[marker_type].isQueued = true;
      await waitForSensorsLoaded();
      sensorLoadingDeferrers[marker_type] = new Deferred();
      sensorLoadingDeferrers[marker_type].isProcessing = true;
      sensorLoadingDeferrers[marker_type].isQueued = false;

      dataFormatWorker.postMessage({
        epochtime_milisec: timeline.selectedDayInMs,
        sensors_list: marker_info_list,
        marker_type: marker_type,
        is_current_day : is_current_day,
        playback_timeline_increment_amt : playbackTimeline.getIncrementAmt()
      });
      break;
    }
  }
}


function toggleOffAllNonForcedSensors() {
  var activeSensors = Object.keys(sensorsEnabledState).filter(key => sensorsEnabledState[key] === true);
  for (let activeSensorType of activeSensors) {
    if (sensorsEnabledState[activeSensorType]) {
      // TODO: Perhaps cache (earlier on) and store the selector in the sensorsEnabledState dict
      $("#toggle-" + activeSensorType).trigger("click");
    }
  }
}


async function getCityInBounds(mapFirstLoad) {
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
    handleControlsUI("enable", mapFirstLoad);
    showSensorMarkersByTime(playbackTimeline.getPlaybackTimeInMs());
    if (selectedCity && available_cities[selectedCity].has_smell_reports) {
      handleSmellReports(playbackTimeline.getPlaybackTimeInMs());
    }
  };

  let currentMapBounds = map.getBounds();
  for (let [city_locode, city] of Object.entries(available_cities)) {
    if (!city_locode) continue;
    if (currentMapBounds.intersects(city.footprint_region.getBounds())) {
      if (lastSelectedCity == city_locode) {
        selectedCity = lastSelectedCity;
        return;
      }

      // If we previously had a city up, hide its markers.
      if (lastSelectedCity) {
        hideMarkersByCity(lastSelectedCity);
      }
      selectedCity = city_locode;
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
      var sensor_type_legend_name = sensory_type + "-legend-row";
      $("#" + sensor_type_legend_name).show();
    }

    if (available_cities[selectedCity].has_smell_reports) {
      $("#smell_report-legend-row").show();
    } else {
      $("#smell_report-legend-row").hide();
    }

    if (available_cities[selectedCity].facility_data && available_cities[selectedCity].facility_data.has_markers) {
      $("#facilities-legend-row").show();
    } else {
      $("#facilities-legend-row").hide();
    }

    $cityName.text(available_cities[selectedCity].name);

    if ($citySelector.val() != selectedCity) {
      $citySelector.val(selectedCity).change();
    }

    // First time city is entered
    if (!available_cities[selectedCity].sensors) {
      await loadSensorsListForCity(selectedCity);
      if (available_cities[selectedCity].has_sensor_placeholders) {
        await loadSensorPlaceholderListForCity(selectedCity);
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
        // Close playback timeline if it is open when switching to another city
        if (playbackTimeline && playbackTimeline.isActive()) {
          handleTimelineToggling();
        }
      } else {
        cityInBoundsCallback();
      }
    } else {
      /*if (!current_day_str) {
        current_day_str = moment().tz(selected_city_tmz).format("YYYY-MM-DD");
      }*/
      var urlVars = Util.parseVars(window.location.href);
      var shareTimeInMs = parseInt(urlVars.t);
      if (shareTimeInMs) {
        selected_day_start_epochtime_milisec = moment(shareTimeInMs).tz(selected_city_tmz).startOf("day").valueOf();
      }
      setupTimeline(shareTimeInMs, async function() {
        if (zoomChangedSinceLastIdle || lastSelectedCity == "") {
          cityInBoundsCallback();
        }
        var urlVars = Util.parseVars(window.location.href);
        if (urlVars.playbackTimelineOpen == "true") {
          handleTimelineToggling();
        }
        if (urlVars.activeSensors) {
          var sensorsToActivate = urlVars.activeSensors.split(",");
          for (var sensorType of sensorsToActivate) {
            $("#toggle-" + sensorType).trigger("click");
          }
        }
        if (urlVars.pinnedPoint) {
          await waitForSensorsLoaded();
          var latLng = urlVars.pinnedPoint.split(",");
          google.maps.event.trigger(map, "click", {latLng: new google.maps.LatLng(latLng[0], latLng[1]), fromVirtualClick: true});
          // Need a delay for the click to fully register
          // TODO: Make this done through a Promise
          var waitForReady = function() {
            if (selectedLocationPinVisible()) {
              clearInterval(checkIfPinOnLoadIsReadyInterval);
              determineSensorAndUpdateInfoBar();
            }
          };
          clearInterval(checkIfPinOnLoadIsReadyInterval);
          checkIfPinOnLoadIsReadyInterval = setInterval(function() {
            waitForReady();
          }, 50);
        }

      });
    }
  } else {
    // If we previously had a city up and we've panned awway, hide its markers.
    if (lastSelectedCity) {
      resetMapToCitiesOverview(lastSelectedCity);
    }
  }
  zoomChangedSinceLastIdle = false;
  if (runRealTimeOverride) {
    runRealTime = true;
  } else {
    runRealTime = !!(selectedCity && available_cities[selectedCity].real_time_footprints);
  }
}


function offsetCenter(latlng, offsetx, offsety) {
  // latlng is the apparent centre-point
  // offsetx is the distance you want that point to move to the right, in pixels
  // offsety is the distance you want that point to move upwards, in pixels
  // offset can be negative
  // offsetx and offsety are both optional

  var scale = Math.pow(2, map.getZoom());

  var worldCoordinateCenter = map.getProjection().fromLatLngToPoint(latlng);
  var pixelOffset = new google.maps.Point((offsetx / scale) || 0, (offsety / scale) || 0);

  var worldCoordinateNewCenter = new google.maps.Point(
      worldCoordinateCenter.x - pixelOffset.x,
      worldCoordinateCenter.y + pixelOffset.y
  );

  var newCenter = map.getProjection().fromPointToLatLng(worldCoordinateNewCenter);

  return newCenter;
}


function handleControlsUI(state, doIgnore) {
  // Note that showing/hiding the controls will trigger a map resize, which in turn triggers a map 'idle',
  // which will trigger getCityInBounds() again. We use a global flag to prevent that from happening.

  ignoreMapIdleCallback = true;
  var currentCenter = map.getCenter();

  // The height of the controls is 76px. I would assume we need to offset by that much, but apparently no, roughly half is all that's needed...
  var yOffset = doIgnore ? 0 : 38;
  if (state == "disable") {
    currentCenter = offsetCenter(currentCenter, 0, yOffset);
  } else if (state == "enable") {
    currentCenter = offsetCenter(currentCenter, 0, yOffset * -1);
  }

  if (state == "enable") {
    $controls.show();
    $("#add-placemarker, #remove-placemarkers").removeClass("disabled");
    if ($map.hasClass("no-controls")) {
      $("#map, #infobar, #legend").removeClass("no-controls");
      if (timeline) {
        $(".selected-block")[0].scrollIntoView(false);
      }
    }
  } else if (state == "disable") {
    $controls.hide();
    $("#map, #infobar").addClass("no-controls");
  }
  map.setCenter(currentCenter);
}


function getShareUrl() {
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
  var isPlaybackTimelineOpen = playbackTimeline ? playbackTimeline.isActive() : false;
  var activeSensors = Object.keys(sensorsEnabledState).filter(key => sensorsEnabledState[key] === true).join(",");
  var selectedLocationPinCoords = selectedLocationPinVisible() ? selectedLocationPin.position.lat().toFixed(6) + "," + selectedLocationPin.position.lng().toFixed(6) : null;

  var urlVars = Util.parseVars(window.location.href);
  urlVars.v = viewStr;
  if (timeStr) {
    urlVars.t = timeStr;
  } else {
    delete urlVars.t;
  }
  if (isPlaybackTimelineOpen) {
    urlVars.playbackTimelineOpen = true;
  } else {
    delete urlVars.playbackTimelineOpen;
  }
  if (activeSensors) {
    urlVars.activeSensors = activeSensors;
  } else {
    delete urlVars.activeSensors;
  }
  if (selectedLocationPinCoords) {
    urlVars.pinnedPoint = selectedLocationPinCoords;
  } else {
    delete urlVars.pinnedPoint;
  }
  var urlVarsString = "?";
  for (var urlVar in urlVars) {
    urlVarsString += urlVar + "=" + urlVars[urlVar] + "&";
  }
  // Remove trailing &
  urlVarsString = urlVarsString.slice(0, -1);
  return parentUrl + urlVarsString;
}


// TODO: Remove this and use jQuery UI tooltip or make this more general
function setButtonTooltip(text, $target, duration, position) {
  if ($tooltip.is(':visible') || ($target && ($target.hasClass("ui-button") && $target.button("option", "disabled")))) {
    return;
  }
  position = {
    at: position && position.at ? position.at : "top",
    my: position && position.my ? position.my : "bottom-10"
  };
  if (text) {
    $tooltipContent.html(Util.sanitizeHTMLStr(text));
    $tooltip.show();
    $tooltip.position({
      at: position.at,
      of: $target,
      my: position.my,
      collision: "flip fit",
      using: function (obj,info) {
        $(this).removeClass("left right top bottom");
        var horizontalShiftAmt = 36;
        if (info.vertical == "top") {
          $(this).addClass("top");
        } else if (info.vertical == "bottom") {
          $(this).addClass("bottom");
        }
        if (info.horizontal == "right") {
          obj.left += horizontalShiftAmt;
          $(this).addClass("right");
        } else if (info.horizontal == "left") {
          obj.left -= horizontalShiftAmt;
          $(this).addClass("left");
        }
        $(this).css({
          left: obj.left + 'px',
          top: obj.top + 'px'
        });
      }
    });
  } else {
    $tooltip.hide();
  }

  if (duration) {
    clearTimeout($tooltip.hideTimer);
    $tooltip.hideTimer = setTimeout(function() {
      $tooltip.hide();
    }, duration);
  } else {
    // Need a delay, otherwise we trigger this click event??
    setTimeout(function() {
      $(document).one("click", function() {
        $tooltip.hide();
      });
    }, 20);
  }
}


function isSensorMarkerVisible(sensorMarker) {
  if (sensorMarker && ((typeof(sensorMarker.getGoogleMapMarker) == "function" && sensorMarker.getGoogleMapMarker().visible) || sensorMarker.visible)) {
    return true;
  }
  return false;
}


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
  $("#share-picker-mobile").on("click", function() {
    $(".shareViewModal").dialog('open');
  });

  $("#city-picker").show().button({
    icons: {
      primary: "ui-icon-custom-city-picker-black"
    },
    text: false
  }).on("click", function() {
    $("#city-picker-controls .btn-mobileSelect-gen").trigger("click");
  });
  $("#city-picker-mobile").on("click", function() {
    $("#city-picker-controls .btn-mobileSelect-gen").trigger("click");
  });

  $("#help-tour").show().button({
    icons: {
      primary: "ui-icon-custom-help-tour-black"
    },
    text: false
  }).on("click", function() {
    siteTourShort();
  });
  $("#help-tour-mobile").on("click", function() {
    $("#active.mobile-menu-toggle").prop("checked", false);
    siteTourShort();
  });

  $("#reach-out").show().button({
    icons: {
      primary: "ui-icon-custom-reach-out-black"
    },
    text: false
  }).on("click", function() {
    $(".reachOutModal").dialog('open');
  });
  $("#reach-out-mobile").on("click", function() {
    $(".reachOutModal").dialog('open');
  });

  $("#methodology").show().button({
    icons: {
      primary: "ui-icon-custom-methodology-black"
    },
    text: false
  }).on("click", function() {
    $(".methodologyModal").dialog('open');
  });
  $("#methodology-mobile").on("click", function() {
    $(".methodologyModal").dialog('open');
  });

  $("#add-placemarker").show().button({
    icons: {
      primary: "ui-icon-add-placemarker"
    },
    text: false
  }).on("click", function() {
      var marker = new google.maps.Marker({
        map: map,
        draggable: true,
        animation: google.maps.Animation.DROP,
        position: map.getCenter(),
        icon: {
          url: ASSETS_ROOT + "img/pointer.png",
          scaledSize: new google.maps.Size(16,35),
          size: new google.maps.Size(16,35),
          origin: new google.maps.Point(0, 0)
        },
        title: "Placemarker"
      });
      google.maps.event.addListener(marker, "dblclick", function (e) {
        this.setMap(null);
      });
      userPlacemarkes.push(marker);
  });
  $("#add-placemarker-mobile").on("click", function() {

  });

  $("#remove-placemarkers").show().button({
    icons: {
      primary: "ui-icon-remove-placemarkers"
    },
    text: false
  }).on("click", function() {
    clearUserAddedMarkers();
  });
  $("#remove-placemarkers-mobile").on("click", function() {

  });

  $(".plume-expand-icon").on("click", function() {
    $(".backtraceSettingsModal").dialog('open');
  });

  $("#toggle-backtrace-likelihood").on("click", async function() {
    backtraceMode = $(this).prop("checked") ? "1" : "0";
    backtraceMode == 1 ? $("#backtrace-legend-row, #backtrace-details-legend-row").removeClass("force-hidden") : $("#backtrace-legend-row, #backtrace-details-legend-row").addClass("force-hidden");
    worldMask.setAllVisible(false);
    await drawFootprint(selectedLocationPin.position.lat(), selectedLocationPin.position.lng(), true, true);
  });

  $("#toggle-uncertainty-details").on("click", async function() {
    uncertaintyDetailLevel = $(this).prop("checked") ? "2" : "1";
    await drawFootprint(selectedLocationPin.position.lat(), selectedLocationPin.position.lng(), true, true);
    if (isSensorMarkerVisible(selectedSensorMarker)) {
      updateInfoBar(selectedSensorMarker);
    } else if (selectedLocationPinVisible()) {
      updateInfoBar(overlay);
    }
  });

  initHeatmapListeners();

  $infobarPollution = $("#infobar-pollution");
  $infobarWind = $("#infobar-wind");
  $infobarPlume = $("#infobar-plume");
  $infobarHeader = $("#infobar-location-header");
  $playbackTimelineContainer = $("#playback-timeline-container");
  $controls = $("#controls");
  $calendarChosenDayIndicator = $(".calendar-specific-day");
  $calendarBtn = $("#calendar-btn");
  $dayTimeToggle = $(".timestampPreview");
  $infobarComponentContainer = $("#infobar-component-container");
  $infobarInitial = $("#infobar-initial");
  $citySelector = $("#city-selector");
  $cityName = $("#city_name");
  $map = $("#map");
  $legend = $("#legend");
  $currentDateLegendText = $("#current-date-legend");
  $currentClockPreviewTime = $("#playback-timeline-container #currentTime");
  $searchBoxClear = $(".searchBoxClearIcon");
  if (isMobileView()) {
    $searchBox = $(".searchBoxMobile");
  } else {
    $searchBox = $(".searchBox");
  }
  $searchBoxIcon = $(".searchBoxIcon");
  $tooltip = $(".button-tooltip");
  $tooltipContent = $(".button-tooltip").find("p");
  verticalTouchScroll($infobarInitial);
}


function setupGoogleMapsSearchPlaceChangedHandlers() {
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
    if (isMobileView()) {
      $("#active.mobile-menu-toggle").prop("checked", false);
      // Need a delay, otherwise tapping a search autocomplete choice triggers a click to the original
      // mobile menu below the modal.
      setTimeout(function () {
        $(".searchModal").dialog('close');
      }, 100);
    }
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
}


async function determineSensorAndUpdateInfoBar() {
  var primaryInfoPopulator = selectedSensorMarker;
  var found = false;
  // Handle case where a user has clicked on the map where a trax sensor can be but it is not yet visible.
  // As time plays, however, it may become visible, so allow for the info panel to see this info when the train passes by.
  for (var x = 0; x < traxMarkers.length; x++) {
    if (!selectedSensorMarker && traxMarkers[x].visible && traxMarkers[x].getBounds().contains(selectedLocationPin.position)) {
      primaryInfoPopulator = traxMarkers[x];
      selectedSensorMarker = primaryInfoPopulator;
      found = true;
      break;
    }
  }
  if (!found) {
    var markers = Object.keys(available_cities[selectedCity].sensors).map(function(k){return available_cities[selectedCity].sensors[k]['marker'];}).filter(marker => marker && marker.getGoogleMapMarker().clickable);
    for (var marker of markers) {
      if (selectedLocationPinVisible() && !selectedSensorMarker && isSensorMarkerVisible(marker) &&
          (typeof(marker.getBounds) === "function" && marker.getGoogleMapMarker().getBounds().contains(selectedLocationPin.position)) ||
          selectedLocationPinVisible() && marker.getGoogleMapMarker().position.lat().toFixed(4) == selectedLocationPin.position.lat().toFixed(4) && marker.getGoogleMapMarker().position.lng().toFixed(4) == selectedLocationPin.position.lng().toFixed(4)) {
        primaryInfoPopulator = marker;
        selectedSensorMarker = primaryInfoPopulator;
        found = true;
        break;
      }
    }
  }

  // animate footprint
  var overlayData = overlay.getData();
  if (Object.keys(overlayData).length > 0) {
    await drawFootprint(overlayData.lat, overlayData.lng, false, true);
  }

  if (!primaryInfoPopulator) {
    primaryInfoPopulator = overlay;
  }

  // Update info panel
  if (primaryInfoPopulator) {
    updateInfoBar(primaryInfoPopulator);
    if (primaryInfoPopulator.getData() && typeof(primaryInfoPopulator.getData().pm25_channel) == "string") {
      $(".chart-btn").removeClass("disabled");
    }
  }
}


async function handleDraw(timeInEpoch) {
  if (sensorsEnabledState['trax']) {
    await getTraxInfoByPlaybackTime(timeInEpoch);
  }

  await showSensorMarkersByTime(timeInEpoch);

  await handleSmellReports(timeInEpoch);

  await waitForSensorsLoaded();

  if (selectedLocationPinVisible()) {
    determineSensorAndUpdateInfoBar();
  }

  if (infowindow) {
    infowindow.close();
  }
}


async function drawFootprint(lat, lng, fromClick, wasVirtualClick, footprintData) {
  if (!fromClick && !selectedLocationPinVisible()) {
    return;
  }

  var fromTour = isInTour();
  if (!fromTour && !wasVirtualClick && typeof(drawFootprint.firstTime) == 'undefined' && localStorage.dontShowFootprintPopup != "true") {
    $footprint_dialog.dialog("open");
    drawFootprint.firstTime = false; //do the initialization
  }

  var previousFootprintData = overlay.getData();
  // Clear existing footprint if there is one and we are not stepping through time
  if (fromClick) {
    // TODO: Stop re-centering map to where a user clicked. Has this been annoying to users?
    //map.panTo({lat: lat, lng: lng});
    if (overlay) {
      overlay.setMap(null);
      overlay.setData({});
    }
  }

  var playbackTimeInMs = playbackTimeline.getPlaybackTimeInMs();

  var m_date = moment(playbackTimeInMs).tz(selected_city_tmz);

  // Footprints are hourly
  var m_closestDate = m_date.startOf("hour");
  var closestDate = m_closestDate.toDate();
  var closestDateEpoch = m_closestDate.valueOf();
  var isoString = closestDate.toISOString();

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
  // If the two digit precision ends with trailing zero in the *second* digit, it is removed.
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

  var data = footprintData;
  var iconPath;
  var loc = latTrunc + "," + lngTrunc;


  var parsedIsoString = isoString.replace(/:/g,"-").split(".")[0];
  if (heatmapModeEnabled) {
    // Pass through
  } else if (plume_backtraces[loc] && plume_backtraces[loc][closestDateEpoch]) {
    data = plume_backtraces[loc][closestDateEpoch];
  } else {
    var lookup = STILT_GCLOUD_BUCKET + "%2F" + parsedIsoString + "%2F" + lngTrunc + "%2F" + latTrunc + "%2F" + "1" + "%2F" + "footprint.png";
    if (runRealTime) {
      var time = parsedIsoString.replace(/-|T/g,"").substring(0,10);
      var region = available_cities[selectedCity].name.toLowerCase().replaceAll(" ","_");
      if (useGFSMetOverride) {
        region += "_gfs";
      }
      lookup = "https://api2.airtracker.createlab.org/get_footprint?" + "lat=" + latTrunc + "&" + "lon=" + lngTrunc + "&" + "time=" + time + "&" +  "region=" + region
      $("#heatmap-loading-mask").addClass("visible");
    }

    try {
      var result = await $.ajax({
        url: lookup,
        dataType : 'json',
      });
      if (runRealTime) {
        $("#heatmap-loading-mask").removeClass("visible");
        result = result.data;
      }

      data = {
        image: result.mediaLink,
        metadata: result.metadata
      };
    } catch(e) {
      // Either there is a permission error (not public) or the file does not exist

      if (runRealTime) {
        $("#heatmap-loading-mask").removeClass("visible");
      }
    }

    if (!plume_backtraces[loc]) {
      plume_backtraces[loc] = {};
    }
  }

  var tmp = m_closestDate.tz("UTC").format("YYYYMMDDHHmm") + "Z";
  var formatted_tmp = tmp + "_" + lngTrunc + "_" + latTrunc + "_1";
  var uncertaintyData = await handleFootprintUncertainty(formatted_tmp);

  overlayData.uncertainty = uncertaintyData;

  if (data) {
    overlayData['hasData'] = true;
    iconPath = ASSETS_ROOT + 'img/black-pin.png';

    // Cache footprint data for current session
    if (!heatmapModeEnabled) {
      plume_backtraces[loc][closestDateEpoch] = data;
    }

    var url = data.image;

    if (!heatmapModeEnabled && backtraceMode == "0") {
      url = await alterOverlayImage(url);
    }

    overlay.set('image', url);

    const bounds = new google.maps.LatLngBounds(
      new google.maps.LatLng(parseFloat(data.metadata.ymin) + latOffset, parseFloat(data.metadata.xmin) + lngOffset),
      new google.maps.LatLng(parseFloat(data.metadata.ymax) + latOffset, parseFloat(data.metadata.xmax) + lngOffset)
    );
    overlay.set('bounds', bounds);
    overlay.setMap(map);
    overlay.show();
    if (heatmapModeEnabled) {
      worldMask.setAllVisible(false);
    } else if (backtraceMode == "0") {
      worldMask.setMaskCut(overlay.bounds.getSouthWest(), overlay.bounds.getNorthEast());
    }
  } else {
    overlayData['hasData'] = false;
    var imagePath = 'img/white-pin2.png';
    if (heatmapModeEnabled) {
      imagePath = 'img/black-pin.png';
    }
    if (runRealTime) {
      $("#heatmap-loading-mask").removeClass("visible");
    }
    iconPath = ASSETS_ROOT + imagePath;
    if (heatmapModeEnabled) {
      worldMask.setAllVisible(false);
    } else if (!heatmapModeEnabled && backtraceMode == "0") {
      worldMask.setMaskFull();
    }
    // Hide prior backtrace if no new one is available for the selected time
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

  iconPath += "#selectedLocationPin";

  if (selectedLocationPin) {
    selectedLocationPin.setPosition(new google.maps.LatLng(lat,lng));
    selectedLocationPin.setIcon(iconPath);
    if (fromClick) {
      selectedLocationPin.setVisible(true);
      if (!fromTour) {
        // In order to do the 'drop' animation again, we need to first dissociate the pin from the map.
        // Is this worse than just recreating the pin each time? I don't know...
        selectedLocationPin.setMap(null);
        selectedLocationPin.setMap(map);
        selectedLocationPin.setAnimation(google.maps.Animation.DROP);
      }
    }
  } else {
    selectedLocationPin = new google.maps.Marker({
      position: new google.maps.LatLng(lat,lng),
      map,
      title: "Source area location placemarker",
      animation: fromClick && !fromTour ? google.maps.Animation.DROP : null,
      icon: iconPath,
      /* This is required to ensure that the element always remain in the DOM tree.
         Otherwise, some seemingly magical things occur when lots of markers are added to the map.
      */
      optimized: false,
      zIndex: 99999999
    });
    google.maps.event.addListener(selectedLocationPin, "dblclick", function (e) {
      if (selectedLocationPin) {
        selectedLocationPin.setVisible(false);
      }
      overlay.setMap(null);
      overlay.setData({});
      resetInfobar();
      selectedSensorMarker = null;
      worldMask.setAllVisible(false);
      // Default zIndex for marker layer pane
      map.getMapPanes().markerLayer.style.zIndex = 103;
    });
  }

  // Enable/Disable chart button based on whether a sensor was clicked and whether it has pm25 readings.
  selectedSensorMarker && typeof(selectedSensorMarker.getData().pm25_channel) == "string" ? $(".chart-btn").removeClass("disabled") : $(".chart-btn").addClass("disabled");

  // Enable/Disable 'generate source area heatmap' button whether we have clicked inside or outside a valid city bounds
  available_cities[selectedCity].footprint_region.getBounds().contains(selectedLocationPin.getPosition()) ? $("#heatmap-modal-button").removeClass("disabled") : $("#heatmap-modal-button").addClass("disabled");

  // Ensure that the clicked location pin is above the masked layer and that all markers are below the mask layer
  setTimeout(function() {
    var $locationPinElm = $(map.getMapPanes().markerLayer).find("img[src*=selectedLocationPin]").parent();
    $locationPinElm.prependTo(map.getMapPanes().overlayLayer);
    map.getMapPanes().markerLayer.style.zIndex = 10;
  }, 200);
}


function toggleInfobar() {
  $infobar.toggleClass("closed");
}


function expandInfobar() {
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
  changeBrowserUrlState();
}


async function loadSensorsListForCity(city_locode) {
  available_cities[city_locode].sensors = {};

  for (let sensor_type of available_cities[city_locode].available_sensor_types) {
    // Ignore this type. Technically every location should have this feature, since that's the point of AirTracker
    if (sensor_type == "backtrace") continue;
    // TRAX is loaded from Firestore
    if (sensor_type == "trax") continue;
    // Load json file corresponding to the sensor type
    let markersList = await loadJsonData(CITY_DATA_ROOT + city_locode + "/" + sensor_type + ".json");
    for (let marker of markersList.markers) {
      available_cities[city_locode].sensors[marker['name']] = {"info" : marker};
    }
  }
}


async function createFacilityMarkersForCity(city_locode) {
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
      icon: {
        url: ASSETS_ROOT + 'img/facility-icon-magenta.png',
        /*scaledSize: new google.maps.Size(8, 12)*/
      },
      labelClass: "facilityMarker",
      visible: true
    });
    available_cities[city_locode].facility_data.markers.push(facility_marker);
  }
}


async function loadSensorPlaceholderListForCity(city_locode) {
  let sensor_placeholder_list = await loadJsonData(CITY_DATA_ROOT + city_locode + "/placeholders.json");
  for (let sensor_placeholder of sensor_placeholder_list.placeholders) {
    let sensor_placeholder_marker = new MarkerWithLabel({
      position: new google.maps.LatLng(sensor_placeholder["Lat"], sensor_placeholder["Lon"]),
      draggable: false,
      clickable: true,
      map: map,
      title: sensor_placeholder["Name"],
      labelContent: "",
      labelAnchor: new google.maps.Point(0,0),
      data: {},
      icon: ASSETS_ROOT + 'img/placeholder_sensor3.png',
      labelClass: "sensorPlaceholder",
      visible: true,
      getSensorType: function() { return "placeholder"; },
      getGoogleMapMarker: function() { return this; }
    });
    google.maps.event.addListener(sensor_placeholder_marker, "click", async function (e) {
      await drawFootprint(e.latLng.lat(),e.latLng.lng(), true, false);
    });
    available_cities[city_locode].sensor_placeholder_markers.push(sensor_placeholder_marker);
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
      available_cities["US-SLC"].sensors[marker_info['name']] = {"info" : marker_info};
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
  var marker_type = event.data.marker_type;

  // If the day has changed since we requested the data, don't show it
  if (epochtime_milisec != timeline.selectedDayInMs) {
    setSensorDataLoaded(marker_type);
    return;
  }

  var sensor_names = Object.keys(result);
  var playbackTimeInMs = playbackTimeline.getPlaybackTimeInMs();
  for (var i = 0; i < info.length; i++) {
    var sensor = available_cities[selectedCity].sensors[info[i]['name']];

    var sensorTimes = result[sensor_names[i]].data[epochtime_milisec].data.map(entry => entry.time * 1000);
    var indexOfAvailableTime = findExactOrClosestTime(sensorTimes, playbackTimeInMs, "down");
    var newData = result[sensor_names[i]].data[epochtime_milisec].data[indexOfAvailableTime];
    if (newData && (playbackTimeInMs < sensorTimes[indexOfAvailableTime]) || (Math.abs(sensorTimes[indexOfAvailableTime] - playbackTimeInMs) > monitorGapThresholdInMs)) {
      newData = {};
    }

    if (sensor && sensor.data) {
      // UPDATE DATA FOR MARKER
      var marker = sensor['marker'];
      marker.setData(parseSensorMarkerDataForPlayback(newData, is_current_day, info[i]));
      marker.updateMarker();
      marker.getGoogleMapMarker().setVisible(true);
      if (i == info.length - 1) {
        setSensorDataLoaded(marker_type);
      }
    } else {
      // CREATE MARKER FOR FIRST TIME
      createAndShowSensorMarker(newData, epochtime_milisec, is_current_day, info[i], i, info.length);
    }
  }
  jQuery.extend(true, available_cities[selectedCity].sensors, result);
}


function setSensorDataLoaded(marker_type) {
  sensorLoadingDeferrers[marker_type].isProcessing = false;
  sensorLoadingDeferrers[marker_type].resolve(null);
}


async function waitForSensorsLoaded() {
  for (let sensor_type in sensorLoadingDeferrers) {
    // TODO: Gross
    if (sensorLoadingDeferrers[sensor_type].isQueued) {
      await new Promise(r => setTimeout(r, 50));
    }
    await sensorLoadingDeferrers[sensor_type].promise;
  }
}


function createAndShowSensorMarker(data, epochtime_milisec, is_current_day, info, i, num_sensors) {
  // TODO: Move to json file?
  var getMarkerIcon = function(marker_type) {
    if (marker_type == "air_now") {
      return "circle";
    } else {
      return "square";
    }
  };

  // TODO: Move to json file?
  var getMarkerIconSize = function(marker_type) {
    if (marker_type != "air_now") {
      return 12;
    } else {
      return null;
    }
  };

  return new CustomMapMarker({
    "type": getSensorType(info),
    "sensor_type" : info['marker_type'],
    "marker_icon" : getMarkerIcon(info['marker_type']),
    "marker_icon_size" : getMarkerIconSize(info['marker_type']),
    "marker_draw_level_padding" : info['marker_type'] == "air_now" ? 10 : null,
    "data": parseSensorMarkerDataForPlayback(data, is_current_day, info),
    "click": function (marker) {
      selectedSensorMarker = marker;
      handleSensorMarkerClicked(marker);
    },
    "complete": function (marker) {
      var sensorName = info['name'];
      available_cities[selectedCity].sensors[sensorName].marker = marker;
      if (heatmapModeEnabled) {
        marker.updateMarker("disable");
      }
      showMarkers([marker], true);
      if (i == num_sensors - 1) {
        setSensorDataLoaded(info['marker_type']);
      }
    }
  });
}


function parseSensorMarkerDataForPlayback(data, is_current_day, info) {
  var sensor_type = getSensorType(info);
  if (typeof sensor_type === "undefined") return undefined;
  var marker_sources = sensor_type.startsWith("WIND_ONLY") ? info["sensors"]["wind_direction"]["sources"] : info["sensors"][sensor_type]["sources"];
  var most_recent_data_source = marker_sources[marker_sources.length - 1];
  var marker_data = {
    "is_current_day": typeof(is_current_day) === "undefined" ? true : is_current_day,
    "name": info["name"],
    "latitude": info["latitude"],
    "longitude": info["longitude"],
    // NOTE: This only gets the most recent feed id. There may be an older one, that is no longer used but has past data.
    "feed_id": most_recent_data_source["feed"],
    // "feed_channels": Object.keys(info["sensors"])
    "pm25_channel" : !sensor_type.startsWith("WIND_ONLY") ? most_recent_data_source["channel"] : []
  };
  if (typeof data === "undefined") return marker_data;
  // For PM25 or VOC (these two types cannot both show up in info)
  if (typeof data[sensor_type] !== "undefined" && !sensor_type.startsWith("WIND_ONLY")) {
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
    var wind_val;
    if (typeof data["wind_speed"] === "object") {
      wind_val = data["wind_speed"]["value"];
    } else {
      wind_val = data["wind_speed"];
    }
    var channelName = info.sensors.wind_speed.sources[0].channel.toLowerCase();
    if (channelName.endsWith("rws")) {
      // knots to mph
      // AirNow sometimes has RWS (rather than WS) for wind speed, which is in knots (as opposed to m/s).
      wind_val = wind_val * 1.15078;
    } else if (!channelName.endsWith("mph")) {
      // m/s to mph
      // In general, wind data in ESDR appears to be in m/s. However, sometimes the person who wrote the relevant scraper
      // was kind enough to include units in the channel name, so we can check on that to see if the data is actually mph.
      wind_val = wind_val * 2.23694;
    }
    marker_data["wind_speed"] = roundTo(wind_val, 2);
  }
  return marker_data;
}


function getSensorType(info) {
  var sensor_type;
  if (Object.keys(info["sensors"]).indexOf("wind_direction") > -1 && Object.keys(info["sensors"]).indexOf("PM25") == -1) {
    if (typeof(info["clickable"]) != "undefined" && !info["clickable"]) {
      sensor_type = "WIND_ONLY2";
    } else {
      sensor_type = "WIND_ONLY";
    }
  } else if (Object.keys(info["sensors"]).indexOf("PM25") > -1) {
    sensor_type = "PM25";
  } else if (Object.keys(info["sensors"]).indexOf("VOC") > -1) {
    sensor_type = "VOC";
  }
  return sensor_type;
}


async function loadAvailableCities() {
  let result;
  let city_selector_data = [];
  try {
      result = await $.ajax({
        url: CITY_DATA_ROOT + "cities.json",
        dataType : 'json',
      });
      available_cities = result?.cities ? result.cities : {};
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
          visible: false,
          zIndex: 99999999
        });
        available_cities[city_locode].footprint_region = cityClickRegion;

        let city_title = city['name'] + ", " + city['state_code'];
        let city_data = city;
        city_data['city_locode'] = city_locode;
        let city_icon_path = city['is_active'] ? 'img/city_icon.png' : 'img/city_icon_inactive.png';
        let label_class = city['is_active'] ? 'cityMapMarker' : 'cityMapMarker cityMapMarker-inactive';
        let city_marker = new MarkerWithLabel({
          position: new google.maps.LatLng(city['lat'], city['lon']),
          draggable: false,
          clickable: true,
          map: map,
          title: city_title,
          labelContent: city_title,
          labelAnchor: new google.maps.Point(0,-8),
          labelClass: label_class,
          data: city_data,
          icon: ASSETS_ROOT + city_icon_path + '#' + city_locode,
        });
        google.maps.event.addListener(city_marker, "click", function (e) {
          map.setCenter({lat: this.data['lat'], lng: this.data['lon']});
          map.setZoom(window.innerWidth <= 450 ? this.data['zoom'] - 1 : this.data['zoom']);
        });
        available_cities[city_locode].marker = city_marker;
        available_cities[city_locode].facility_data.markers = [];
        available_cities[city_locode].sensor_placeholder_markers = [];
        available_cities[city_locode].smell_report_markers = [];
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
            if ($selectedOption.length) {
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
          $("#active.mobile-menu-toggle").prop("checked", false);
        }
      })
      // Set up template for non-ref sensors
      var tpl_source = document.getElementById("sensors-tpl").innerHTML;
      var template = Handlebars.compile(tpl_source);
      var data = result.sensor_mappings;
      document.getElementById('additional-sensors').innerHTML = template(data);
  } catch (error) {
      console.error(error);
  }
}


async function loadJsonData(url) {
  let result = await $.ajax({
    url: url,
    dataType : 'json',
  });
  return result;
}


// Safely get the value from a variable, return a default value if undefined
function safeGet(v, default_val) {
  if (typeof default_val === "undefined") default_val = "";
  return (typeof v === "undefined") ? default_val : v;
}


function updateSensorsEnabledState(sensorType, state) {
  sensorsEnabledState[sensorType] = state;
  changeBrowserUrlState();
}


// TODO: Refactor so we are not passing in a marker but pulling state elsewhere.
function updateInfoBar(marker) {
  if (!marker || !selectedLocationPinVisible()) return;

  changeBrowserUrlState();

  var markerData = marker.getData();

  // This is likely the case where we clicked on TRAX and incremented time, thus that marker is no longer valid.
  if (!markerData) {
    if (overlay) {
      markerData = overlay.getData();
    }
  }

  // Handle the case where multiple markers are stacked (e.g. pm25 for non-AirNow + wind)
  if (markerData.feed_id) {
    var multi_sensor_marker = Object.entries(available_cities[selectedCity].sensors).filter(([k,v]) => v.info.name.startsWith(markerData.name)).map(([k,v]) => v.marker.getData());

    if (multi_sensor_marker.length > 1) {
      markerData = Object.assign({}, ...multi_sensor_marker);
      markerData.name = markerData.name.replace(" Met", "");
    }
  }

  var isDaySummary = !markerData['is_current_day'] && markerData.sensorType != "trax";

  var markerDataTimeInMs = markerData.sensorType ==  "trax" || markerData.sensorType  == "backtrace" ? markerData['epochtimeInMs'] : markerData['sensor_data_time'] || markerData['wind_data_time'];
  var markerDataTimeMomentFormatted = moment.tz(markerDataTimeInMs, selected_city_tmz).format("h:mm A (zz)");

  // Set infobar header to sensor name (if TRAX, PurpleAir, etc) or clicked lat/lon coords otherwise
  $infobarHeader.show();
  var infobarHeader = $infobarHeader[0];
  var markerName = markerData.sensorType ==  "trax" ? "TRAX "+ formatTRAXLineName(marker.traxId) + " Line" : markerData.name;
  infobarHeader.innerHTML = markerName;

  // Show sensor pollution value (PM25) in infobar
  var sensorVal = markerData.sensorType == "trax" ? markerData['pm25'] : markerData['sensor_value'] ;
  if (isSensorMarkerVisible(selectedSensorMarker)) {
    if (isDaySummary) {
      setInfobarSubheadings($infobarPollution,"",sensorVal,PM25_UNIT,"Daily Max at "  + markerDataTimeMomentFormatted);
    } else {
      if (sensorVal >= 0) {
        setInfobarSubheadings($infobarPollution,"",sensorVal,PM25_UNIT,markerDataTimeMomentFormatted);
      } else {
        // Clicked on a trax sensor, which is now invisible since the time does not match for it.
        setInfobarUnavailableSubheadings($infobarPollution,"Click on the nearest sensor to see pollution measurements.");
      }
    }
  } else {
    setInfobarUnavailableSubheadings($infobarPollution,"Click on the nearest sensor to see pollution measurements.")
  }

  // If time selected, show sensor wind in infobar
  if (selectedSensorMarker) {
    if (isDaySummary) {
      setInfobarUnavailableSubheadings($infobarWind,"Click the clock icon to explore wind information for this past day.");
    } else {
      if (markerData['wind_direction']) {
        setInfobarSubheadings($infobarWind,"",getWindDirFromDeg(markerData['wind_direction']), " at " + markerData['wind_speed'] + " mph",markerDataTimeMomentFormatted);
      } else {
        setInfobarUnavailableSubheadings($infobarWind,"Click on the nearest sensor (with an arrow) to see wind measurements.");
      }
    }
  } else {
    setInfobarUnavailableSubheadings($infobarWind,"Click on the nearest sensor (with an arrow) to see wind measurements.");
  }

  // Show plume backtrace information
  if (overlay) {
    var overlayData = overlay.getData();
    var infoStr = "";
    //var uncertaintyDetailLevel = Util.parseVars(window.location.href).uncertaintyDetail;
    if (overlayData.hasData) {
      var tm = moment.tz(overlayData['epochtimeInMs'], selected_city_tmz).format("h:mm A (zz)");
      if (uncertaintyDetailLevel && overlayData.uncertainty) {
        if (uncertaintyDetailLevel == "1") {
          setInfobarSubheadings($infobarPlume,"",overlayData.uncertainty.label,"Model Confidence",tm);
          $infobarPlume.children(".infobar-text");
          $("#infobar-plume-section").removeClass("detailed");
        } else if (uncertaintyDetailLevel == "2") {
          setInfobarSubheadings($infobarPlume,"","","",tm);
          createUncertaintyTable($infobarPlume,overlayData.uncertainty);
          $("#infobar-plume-section").addClass("detailed");
        }
      } else {
        infoStr = "Snapshot from model at " + tm;
        setInfobarSubheadings($infobarPlume,infoStr,"","","");
      }
      //$infobarPlume.children(".infobar-unit").show();
    } else {
      var pollution_time = playbackTimeline.getPlaybackTimeInMs();
      if (selectedSensorMarker) {
        pollution_time = markerDataTimeInMs;
      }
      infoStr = "No pollution backtrace available at " + moment.tz(pollution_time, selected_city_tmz).format("h:mm A (zz)");
      setInfobarUnavailableSubheadings($infobarPlume,infoStr);
      $infobarPlume.children(".infobar-text").removeClass('display-unset');
      //$infobarPlume.children(".infobar-unit").hide();
      $infobarPlume.children(".infobar-table").hide();
    }
  }
}


function createUncertaintyTable($element, data) {
  for (const x in data) {
    if (typeof(data[x]) === 'number') {
      data[x] = roundTo(data[x],2);
    }
  }
  var confidenceColor = "green";
  if (data.label === "Low") {
    confidenceColor = "darkred";
  } else if (data.label === "Medium") {
    confidenceColor = "goldenrod";
  }
  var tableString = "";
  tableString += "<table><tr><th></th><th>Wind Speed (m/s)</th><th>Wind Direction (deg)</th></tr>";
  tableString += "<tr><th>HRRR</th><td>"+data.hrrr_ws+"</td><td id='hrrr-wd'>"+data.hrrr_wd+"</td></tr>";
  tableString += "<tr><th>Kriged</th><td>"+data.kriged_ws+"</td><td id='kriged-wd'>"+data.kriged_wd+"</td></tr>";
  tableString += "<tr><th>Error</th><td>"+data.wind_speed_err+"</td><td>"+data.wind_direction_err+"</td></tr>";
  tableString += "<tr><td colspan='3' style='font-weight:bold;color:" + confidenceColor + "'>"+data.label + " Model Confidence</td></tr>";
  $element.children(".infobar-text")[0].innerHTML = tableString;
  $element.children(".infobar-text").children("table").addClass("infobar-table");

  if (data.hrrr_u){
    $("#hrrr-wd").on("click", function() {
      setButtonTooltip("u: " + data.hrrr_u + "  v: " + data.hrrr_v, $(this), null);
    });

    $("#kriged-wd").on("click", function() {
      setButtonTooltip("u: " + data.kriged_u + "  v: " + data.kriged_v, $(this), null, {at: "top"});
    });
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
  setInfobarSubheadings($element,text,"-","No Data","-");
  $element.children(".infobar-data").hide();
  $element.children(".infobar-data-intro").hide();
  $element.children(".infobar-unit").addClass('mobile-only-error');
  $element.children(".infobar-time").hide();
}


async function handleSensorMarkerClicked(marker) {
  await drawFootprint(marker.getData()['latitude'], marker.getData()['longitude'], true);

  updateInfoBar(marker);

  // TODO: Add message to say only PM25 sensors can be graphed?
  if (timeSeriesModeEnabled && marker.getData() && typeof(marker.getData().pm25_channel) == "string") {
    addPlotToLegend(selectedSensorMarker.getData(), null, true);
  }

  if (heatmapModeEnabled && !timeSeriesModeEnabled) {
    $(".chart-btn").trigger("click");
  }
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


async function handleMapClicked(mapsMouseEvent) {
  var wasVirtualClick = mapsMouseEvent.fromVirtualClick;
  var fromClick = wasVirtualClick || !!mapsMouseEvent.domEvent;

  selectedSensorMarker = null;

  await drawFootprint(mapsMouseEvent.latLng.lat(),mapsMouseEvent.latLng.lng(), fromClick, wasVirtualClick);
  updateInfoBar(overlay);

  if (heatmapModeEnabled && timeSeriesModeEnabled) {
    hideTimeSeriesUI();
  }
}


function getWindDirFromDeg(deg) {
  // NOTE:
  // Wind information is reported in the direction _from_ which the wind is coming.
  // We say _from_ in the info window but our wind icon is showing _to_
  var val = Math.round((deg / 22.5) + 0.5);
  var arr = ["N","NNE","NE","ENE","E","ESE", "SE", "SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return arr[(val % 16)];
}


function hideMarkersByCity(city_locode, fromTimeChange) {
  var currentCity = available_cities[city_locode];
  // Get sensors
  var markers = Object.keys(currentCity.sensors).map(function(k){return currentCity.sensors[k]['marker'];});
  if (!fromTimeChange) {
    // Get facility icon markers
    markers = markers.concat(currentCity.facility_data.markers);
    // Get placeholder markers
    markers = markers.concat(currentCity.sensor_placeholder_markers);
    // Get smell report markers
    markers = markers.concat(currentCity.smell_report_markers[selected_day_start_epochtime_milisec]);
  }
  hideMarkers(markers);
  if (currentCity.facility_data.boundaries) {
    currentCity.facility_data.boundaries.setStyle({visible: false});
  }
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
  if (available_cities[selectedCity].has_sensor_placeholders) {
    markers = markers.concat(available_cities[city_locode].sensor_placeholder_markers);
  }
  showMarkers(markers);
}


function showMarkers(markers, isFirstTime) {
  var zoom = map.getZoom();
  drewMarkersAtLeastOnce = true;
  markers = safeGet(markers, []);
  let filterExcludes = Object.keys(sensorsEnabledState).filter(key => sensorsEnabledState[key] === false);
  for (var i = 0; i < markers.length; i++) {
    if ((typeof(markers[i]) !== "undefined" && markers[i].getMarkerType && markers[i].getMarkerType() == "smell") || (typeof(markers[i]) !== "undefined" &&  !filterExcludes.includes(markers[i].getSensorType()))) {
      if (isFirstTime) {
        markers[i].setMap(map);
      } else {
        markers[i].getGoogleMapMarker().setVisible(zoom >= MAP_ZOOM_CHANGEOVER_THRESHOLD);
      }
    }
  }
}


function setupTimeline(startTime, initCallback) {
  var options = {
    playbackTimeInMs: startTime,
    clickEvent: function() {
      handleDraw(playbackTimeline.getPlaybackTimeInMs());
    },
    initCallback: function() {
      if (typeof(initCallback) == "function") {
        initCallback();
      }
    }
  };
  // global function in timeline.js
  initTimeline(options);
}


function resetMapToCitiesOverview(city_locode) {
  resetAllTrax();
  hideMarkersByCity(city_locode);
  available_cities[city_locode].marker.setVisible(true);
  available_cities[city_locode].footprint_region.setVisible(false);
  $citySelector.val("");
  handleControlsUI("disable");
  toggleOffAllNonForcedSensors();
  clearUserAddedMarkers();
  selectedCity = "";
  $legend.hide();
  $("#infobar-back-arrow-container").trigger("click");
  $("#add-placemarker, #remove-placemarkers").addClass("disabled");
}


function clearUserAddedMarkers() {
  for (var i = 0; i < userPlacemarkes.length; i++) {
    userPlacemarkes[i].setMap(null);
  }
  userPlacemarkes = [];
  // Remove footprint pin if visible
  if (selectedLocationPinVisible()) {
    google.maps.event.trigger(selectedLocationPin, "dblclick");
  }
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


function updateSensorsByEpochTime(playbackTimeInMs, animating) {
  if (!selectedCity) return;

  var activeSensorToggles = $("#legend-table input:checked").map(function() { return $(this).data("marker-type");}).toArray();
  activeSensorToggles.push("air_now");

  var markers_with_data_for_chosen_epochtime = {markers_to_show: [], marker_types_to_load: []};
  for (var sensorName in available_cities[selectedCity].sensors) {
    var sensor = available_cities[selectedCity].sensors[sensorName];
    if (!sensor.data || !sensor.data[selected_day_start_epochtime_milisec]) {
      var sensor_marker_type = sensor.info.marker_type;
      if (!activeSensorToggles.includes(sensor_marker_type)) continue;
      if (markers_with_data_for_chosen_epochtime.marker_types_to_load.indexOf(sensor_marker_type) == -1) {
        markers_with_data_for_chosen_epochtime.marker_types_to_load.push(sensor_marker_type);
      }
      continue;
    }

    var fullDataForDay = sensor.data[selected_day_start_epochtime_milisec].data;

    var sensorTimes = fullDataForDay.map(entry => entry.time * 1000);
    var indexOfAvailableTime = findExactOrClosestTime(sensorTimes, playbackTimeInMs, "down");
    var forceType = "";
    if (heatmapModeEnabled) {
      forceType = "disabled";
    }
    if (indexOfAvailableTime >= 0 && sensor.marker) {
      var dataToShow = fullDataForDay[indexOfAvailableTime];
      if (dataToShow && (playbackTimeInMs < sensorTimes[indexOfAvailableTime]) || (Math.abs(sensorTimes[indexOfAvailableTime] - playbackTimeInMs) > monitorGapThresholdInMs)) {
        dataToShow = {};
      }
      sensor.marker.setData(parseSensorMarkerDataForPlayback(dataToShow, animating, sensor.info));
      markers_with_data_for_chosen_epochtime.markers_to_show.push(sensor.marker);
    }
    sensor.marker.updateMarker(forceType);
  }
  return markers_with_data_for_chosen_epochtime;
}


async function showSensorMarkersByTime(epochtime_milisec) {
  if (!selectedCity) return;
  if (typeof epochtime_milisec == "undefined") return;

  // Check if current day
  // Previous code differentiated between showing current day values and 'max' values for prior days.
  // We no longer want to show 'max' values anymore and instead the value at the time being looked at.
  // To do this, we always treat the mode as 'is_current_day'
  var is_current_day = true;
  //var date_str_sensor = moment(epochtime_milisec).tz(selected_city_tmz).format("YYYY-MM-DD");
  //var is_current_day = date_str_sensor === current_day_str;

  var markers_with_data_at_or_near_chosen_epochtime = updateSensorsByEpochTime(epochtime_milisec, true);

  if (markers_with_data_at_or_near_chosen_epochtime.markers_to_show.length > 0) {
    // Make sensors markers visible on the map
    showMarkers(markers_with_data_at_or_near_chosen_epochtime.markers_to_show, false);
  }

  if (markers_with_data_at_or_near_chosen_epochtime.marker_types_to_load.length > 0) {
    var markers = Object.keys(available_cities[selectedCity].sensors).map(function(k){return available_cities[selectedCity].sensors[k]['marker'];});
    markers = markers.filter(x => markers_with_data_at_or_near_chosen_epochtime.markers_to_show.indexOf(x) === -1);
    hideMarkers(markers);

    // The worker may already be processing so terminate it and create a new one.
    // There is overhead to this but significantly less than having it finish
    // whatever the last worker was doing.
    if (Object.keys(sensorLoadingDeferrers).find(key => sensorLoadingDeferrers[key].isProcessing === true)) {
      dataFormatWorker.terminate();
      createDataPullWebWorker();
    }

    var previous_marker_type;
    for (var marker_type of markers_with_data_at_or_near_chosen_epochtime.marker_types_to_load) {
      sensorLoadingDeferrers[marker_type] = new Deferred();
      sensorLoadingDeferrers[marker_type].isProcessing = true;

      let marker_info_list = Object.values(available_cities[selectedCity].sensors).reduce(function(result, sensor) {
        if (sensor.info.marker_type == marker_type) {
          result.push(sensor.info);
        }
        return result;
      }, []);

      if (previous_marker_type) {
        await sensorLoadingDeferrers[previous_marker_type].promise;
      }
      previous_marker_type = marker_type;

      dataFormatWorker.postMessage({
          epochtime_milisec: timeline.selectedDayInMs,
          sensors_list: marker_info_list,
          marker_type: marker_type,
          is_current_day : is_current_day,
          playback_timeline_increment_amt : playbackTimeline.getIncrementAmt()
      });
    }
  }
}


function handleTimelineToggling(e) {
  if (e) {
    var $currentTarget = $(e.currentTarget);
  }
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
    playbackTimeline.handleTimelineDateDisabling();
    playbackTimeline.seekTo(playbackTimeline.getCurrentFrameNumber(), true);
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
    $currentClockPreviewTime.text(playbackTimeline.getCurrentHumanReadableTime());
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
  });

  $("#footprint-first-click-dialog input[type='checkbox']").on("click", function(){
    if ($(this).prop("checked")){
      localStorage.dontShowFootprintPopup = "true";
    }
  });
}


// Add horizontal scroll touch support to a jQuery HTML element.
function touchHorizontalScroll($elem) {
  var scrollStartPos = 0;
  $elem.on("touchstart", function(e) {
    scrollStartPos = this.scrollLeft + e.originalEvent.touches[0].pageX;
    e.preventDefault();
  }).on("touchmove", function(e) {
    this.scrollLeft = scrollStartPos - e.originalEvent.touches[0].pageX;
    e.preventDefault();
  });
}


// Add vertical scroll touch support to an HTML element
function verticalTouchScroll($elem){
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
}


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


function pad(n) { return (n < 10 ? '0' : '') + n.toString(); }


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


function roundDate(date, duration, method) {
  return moment.tz((Math[method]((+date) / (+duration)) * (+duration)), selected_city_tmz);
}


function Deferred() {
  var self = this;
  this.promise = new Promise(function(resolve, reject) {
    self.reject = reject;
    self.resolve = resolve;
  });
}


async function handleFootprintUncertainty(lookupStr) {
  var docRefString = lookupStr;
  const snapshot = await db.collection("hrrr-uncertainty-kriged").doc(docRefString).get();
  var data = snapshot.data();
  if (!data) {
    return;
  }
  var label;
  if (data.wind_direction_err < 30) {
    if (data.wind_speed_err < 1) {
      label = "High";
    } else {
      label = "Medium";
    }
  } else if (data.wind_speed_err < 1) {
    label = "Medium";
  } else {
    label = "Low";
  }
  data.label = label;
  return data;
}


async function loadImage(src) {
  return await new Promise((resolve, reject) => {
    let img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.crossOrigin = "Anonymous";
    img.src = src;
  });
}


async function alterOverlayImage(url) {
  var image = await loadImage(url);
  var canvas =  document.createElement("canvas");
  var ctx = canvas.getContext('2d');
  canvas.width = image.width;
  canvas.height = image.height;
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  for(var i = 0; i < imageData.data.length; i += 4) {
    let r = imageData.data[i+0], g = imageData.data[i+1], b = imageData.data[i+2];
    let a = imageData.data[i+3];
    let s = Math.max(r, g, b) - Math.min(r, g, b); // color saturation
    r = g = b = 200;
    if (a < 128) {
      // Outside backtrace; heavy grey overlay
       a = 255;
    } else {
      // Inside backtrace; alpha goes to zero as saturation increases
      let gain = 14; // higher gain means sharper transition
      a = Math.max(0, 255 - s * gain);
    }
    imageData.data[i+0] = r;
    imageData.data[i+1] = g;
    imageData.data[i+2] = b;
    imageData.data[i+3] = a;
  }

  ctx.putImageData(imageData, 0, 0);

  return canvas.toDataURL();
}


function MaskClass(map) {
  var MAP_MAX_LAT = 85;
  var MAP_MIN_LAT = -85.05115;
  var MAP_MAX_LNG = 180;
  var MAP_MIN_LNG = -180;

  // Create 4 rectangles to mask off the area
  var rectangleMaskOptions = {
    map: map,
    fillColor: "#c8c8c8",
    fillOpacity: 0.8,
    strokeOpacity: 0,
    clickable: false,
    zIndex: 99999999
  };
  this.rectangleWorld = new google.maps.Rectangle(rectangleMaskOptions);
  this.rectangle1 = new google.maps.Rectangle(rectangleMaskOptions);
  this.rectangle2 = new google.maps.Rectangle(rectangleMaskOptions);
  this.rectangle3 = new google.maps.Rectangle(rectangleMaskOptions);
  this.rectangle4 = new google.maps.Rectangle(rectangleMaskOptions);


  this.setMaskFull = function() {
    this.rectangleWorld.setBounds(
      new google.maps.LatLngBounds(
        new google.maps.LatLng(MAP_MIN_LAT, MAP_MIN_LNG),
        new google.maps.LatLng(MAP_MAX_LAT, MAP_MAX_LNG)));

    this.setMaskFullVisible(true);
    this.setMaskCutVisible(false);
  };

  // Place the cut-out
  this.setMaskCut = function(boundsSouthWest, boundsNorthEast){
      var swLat = boundsSouthWest.lat();
      var swLng = boundsSouthWest.lng();
      var neLat = boundsNorthEast.lat();
      var neLng = boundsNorthEast.lng();

      this.rectangle1.setBounds(
        new google.maps.LatLngBounds(
          new google.maps.LatLng(neLat, MAP_MIN_LNG),
          new google.maps.LatLng(MAP_MAX_LAT, MAP_MAX_LNG)));

      this.rectangle2.setBounds(
        new google.maps.LatLngBounds(
          new google.maps.LatLng(MAP_MIN_LAT, MAP_MIN_LNG),
          new google.maps.LatLng(swLat, MAP_MAX_LNG)));

      this.rectangle3.setBounds(
        new google.maps.LatLngBounds(
          new google.maps.LatLng(swLat, MAP_MIN_LNG),
          new google.maps.LatLng(neLat, swLng)));

      this.rectangle4.setBounds(
        new google.maps.LatLngBounds(
          new google.maps.LatLng(swLat, neLng),
          new google.maps.LatLng(neLat, MAP_MAX_LNG)));

      this.setMaskCutVisible(true);
      this.setMaskFullVisible(false);
  };

  this.setAllVisible = function(visibility) {
    this.setMaskCutVisible(visibility);
    this.setMaskFullVisible(visibility);
  };

  // Show/hide the cut mask
  this.setMaskCutVisible = function(visibility) {
    this.rectangle1.setVisible(visibility);
    this.rectangle2.setVisible(visibility);
    this.rectangle3.setVisible(visibility);
    this.rectangle4.setVisible(visibility);
  };

  // Show/hide the full mask
  this.setMaskFullVisible = function(visibility) {
    this.rectangleWorld.setVisible(visibility);
  };

}


async function handleSmellReports(epochtime_milisec) {
  if (!selectedCity || !available_cities[selectedCity].has_smell_reports) return;

  var epochtime_sec = parseInt(epochtime_milisec / 1000);
  var smell_report_markers = available_cities[selectedCity].smell_report_markers[selected_day_start_epochtime_milisec];
  // Hide previously visible smell reports
  if (previous_selected_day_start_epochtime_milisec) {
    var previous_smell_report_markers = available_cities[selectedCity].smell_report_markers[previous_selected_day_start_epochtime_milisec];
    hideMarkers(previous_smell_report_markers);
  }
  if (smell_report_markers === undefined) {
    await loadAndCreateSmellMarkers(epochtime_milisec, epochtime_sec);
  } else {
    var smell_report_markers_to_hide = [];
    var smell_report_markers_to_show = [];
    smell_report_markers.forEach((s) => (s.getData().observed_at <= epochtime_sec ? smell_report_markers_to_show : smell_report_markers_to_hide).push(s));
    hideMarkers(smell_report_markers_to_hide);
    showMarkers(smell_report_markers_to_show);
  }

  for (const marker of available_cities[selectedCity].smell_report_markers[selected_day_start_epochtime_milisec]) {
    var markerTimeInMs = marker.getData().observed_at * 1000;
    var opacity = Math.abs(markerTimeInMs - playbackTimeline.getPlaybackTimeInMs()) <= 3600000 ? 1 : 0.30;
    marker.setOpacity(opacity);
  }
}


async function loadAndCreateSmellMarkers(epochtime_milisec, epochtime_sec) {
  var m_d = moment(epochtime_milisec).tz(selected_city_tmz);
  var start_time = m_d.startOf("day").unix();
  var end_time = m_d.endOf("day").unix();
  var state_id = 1; // PA
  await $.ajax({
    "url": "https://api.smellpittsburgh.org/api/v2/smell_reports?start_time=" + start_time + "&end_time=" + end_time + "&state_ids=" + state_id + "&timezone_string=" + encodeURIComponent(selected_city_tmz),
    "success": function (data) {
      for (var i = 0; i < data.length; i++) {
        createAndShowSmellMarker(data[i], epochtime_sec);
      }
    },
    "error": function (response) {
      console.log("server error:", response);
    }
  });
}


function createAndShowSmellMarker(data, epochtime_sec) {
  return new CustomMapMarker({
    "type": "smell",
    "data": data,
    "initZoomLevel": map.getZoom(),
    "click": function (marker) {
      handleSmellMarkerClicked(marker);
    },
    "complete": function (marker) {
      marker.setMap(map);
      if (marker.getData().observed_at > epochtime_sec) {
        hideMarkers([marker]);
      }
      if (!available_cities[selectedCity].smell_report_markers[selected_day_start_epochtime_milisec]) {
        available_cities[selectedCity].smell_report_markers[selected_day_start_epochtime_milisec] = [];
      }
      available_cities[selectedCity].smell_report_markers[selected_day_start_epochtime_milisec].push(marker);
    }
  });
}


async function handleSmellMarkerClicked(marker) {
  var mapMarker = marker.getGoogleMapMarker();

  var smellReportTimeInMs = marker.getData().observed_at * 1000;
  var m = moment.tz(smellReportTimeInMs, selected_city_tmz);
  var closestM = roundDate(m, moment.duration(playbackTimeline.getIncrementAmt(), "minutes"), "ceil");
  var startOfDayForNewSelectedTime = m.clone().startOf("day");
  var timeLapsedInMin = closestM.diff(startOfDayForNewSelectedTime, 'minutes');
  var frame = $(".materialTimelineTick[data-minutes-lapsed='" + timeLapsedInMin + "']").data("frame");
  playbackTimeline.seekTo(frame);

  // Remove highlight of popup close button
  // Apparently we need a slight delay to allow for the button to initially be focused
  setTimeout(function() {
    document.activeElement.blur();
  }, 50);

  await drawFootprint(mapMarker.position.lat(), mapMarker.position.lng(), true);
  updateInfoBar(overlay);
  infowindow.setContent(marker.getContent());
  infowindow.open(map, mapMarker);
}


async function toggleFacilities(makeVisible) {
  if (!selectedCity) return;

  if (available_cities[selectedCity].facility_data.has_markers) {
    var facility_markers = available_cities[selectedCity].facility_data.markers;
    if (facility_markers.length > 0) {
      for (let facility_marker of facility_markers) {
        facility_marker.setVisible(makeVisible);
      }
    } else {
      await createFacilityMarkersForCity(selectedCity);
    }
  }

  if (available_cities[selectedCity].facility_data.has_boundaries) {
    if (available_cities[selectedCity].facility_data.boundaries) {
      available_cities[selectedCity].facility_data.boundaries.setStyle({
        visible: makeVisible,
        strokeColor: '#ce3939',
        fillColor: 'red',
        strokeWeight: 1
      });
    } else {
      available_cities[selectedCity].facility_data.boundaries = new google.maps.Data();

      available_cities[selectedCity].facility_data.boundaries.loadGeoJson(
        CITY_DATA_ROOT + selectedCity + "/facilities-boundaries-v2.geojson"
      );

      available_cities[selectedCity].facility_data.boundaries.setStyle({
        visible: true,
        strokeColor: '#ce3939',
        fillColor: 'red',
        strokeWeight: 1
       });

      function mouseOverDataItem(mouseEvent) {
        const NEI = mouseEvent.feature.getProperty('NEI');
        const FRS = mouseEvent.feature.getProperty('FRS');
        const NAICS_Desc = mouseEvent.feature.getProperty('NAICS_Desc');

        const titleText = "NEI:  " + NEI + "\n" + "FRS:  " + FRS + "\n" + "NAICS:  " + NAICS_Desc;

        if (titleText) {
          map.getDiv().setAttribute('title', titleText);
        }
      }

      function mouseOutOfDataItem(mouseEvent) {
        map.getDiv().removeAttribute('title');
      }

      available_cities[selectedCity].facility_data.boundaries.addListener('mouseover', mouseOverDataItem);
      available_cities[selectedCity].facility_data.boundaries.addListener('mouseout', mouseOutOfDataItem);

      available_cities[selectedCity].facility_data.boundaries.setMap(map);
    }
  }
}
