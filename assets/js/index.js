"use strict";

var isLocal = ["localhost", "file:", "192.168"].some(str => window.location.href.includes(str));
var ASSETS_ROOT = isLocal ? "./assets/" : "https://edf.createlab.org/assets/";

var TRAX_COLLECTION_NAME = "trax-dev";
//var STILT_COLLECTION_NAME = "stilt-prod";
var STILT_GCLOUD_BUCKET = "https://storage.googleapis.com/storage/v1/b/{BUCKET_NAME}/o/by-simulation-id";
var CLOUD_STORAGE_PARENT_URL = "https://storage.googleapis.com/{BUCKET_NAME}/by-simulation-id";
var CITY_DATA_ROOT = "https://edf.createlab.org/assets/data/cities/";
var CITY_DATA_ROOT_LOCAL = "./assets/data/cities/";
//var HRRR_UNCERTAINTY_COLLECTION_NAME = "hrrr-uncertainty-v2-dev";
var PM25_UNIT = "ug/m3";
var MAP_ZOOM_CHANGEOVER_THRESHOLD = 8;
var FACILITY_MARKERS_TOGGLE_ZOOM_THRESHOLD = 13;

// Increase/decrease for more or less TRAX data to look back at
var traxDataIntervalInMin = 60;
var traxDataIntervalInMs = traxDataIntervalInMin * 60000; // 60000 ms = 1 minute

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
var overlay;
var db;
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

var isPlaybackTimelineToggling = false;
var inTour = false;

var traxDataByEpochTimeInMs = {};
var traxLocations = {};
var traxMarkers = [];
var sensorsEnabledState = {};
var sensorLoadingDeferrers = {};

var worldMask;


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
var $purpleAirToggle;
var $clarityToggle;
var $traxToggle;
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


//var showHrrrWindDirectionError;
//var showHrrrWindSpeedError;
//var hrrrWindErrorPointLocations = {};
var defaultHomeView = {lat: 38.26796, lng: -100.57088, zoom: window.innerWidth <= 450 ? 4 : 5};
var startingView = Object.assign({}, defaultHomeView);

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

  //showHrrrWindSpeedError = urlVars.showHrrrWindError == "speed";
  //showHrrrWindDirectionError = urlVars.showHrrrWindError == "direction";
  /*infowindow = new google.maps.InfoWindow({
    visible: true,
    content: ''
  });*/

  var shareView = urlVars.v;

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

  $(".more-info").on("click", function() {
    setButtonTooltip("Data displayed is from the closest available capture time, in relation to the selected playback time.", $(this), null, {at: "top", my: 'left bottom-10'})
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
      $(document).trigger("click");
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
          $(document).trigger("click");
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

  $(".searchModal").dialog({
    resizable: false,
    autoOpen: false,
    dialogClass: "customDialog",
    modal: true,
    position: { of: window, my: "top+40", at: "top" },
    open: function() {
      $('.ui-widget-overlay').css({ opacity: '1', background: "#878787" });
    }
  })

  $(".close-modal").on("click", function() {
    $(this).parent().dialog('close');
  });

  $(window).resize(function() {
    if (!isMobileView()) {
      $(".shareViewModal, .reachOutModal").dialog("option", "position", {my: "center", at: "center", of: window});
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

  $("#legend-table td input").on("click", function(e) {
    var isChecked = $(e.target).prop("checked");
    var markerType = $(e.target).data("marker-type");
    if (markerType == "trax") {
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
  })

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


function siteTour() {
  var defaultTourStepTitle = "Air Tracker Tour";

  // TODO: Make tour views/text fit better for mobile
  var steps = [];

  var step_1_text = "This tour covers the basics of Air Tracker. <br> <br> To start, click 'Next'.";
  if (!isMobileView()) {
    step_1_text += "<br><br> You can also use the forward/backward arrow keys on your keyboard.";
  }
  var step_1 = {
    title: defaultTourStepTitle,
    intro: step_1_text
  }

  var step_2 = {
    title: defaultTourStepTitle,
    element: null,
    intro: "Cities featured by Air Tracker are marked with a blue icon on the map. You can click these icons to have the system zoom you in or you can manually zoom in yourself.",
    highlightPaddings: {width: 86, height: 40, left: -57, top: -50}

  }

  var step_3_text = "You can also select a city by clicking on the city building icon in the upper left corner.";
  var step_3_element = document.querySelector('#city-picker');
  var step_3_position = "right";
  if (isMobileView()) {
    step_3_text = "You can also select a city by clicking on this menu and choosing 'City Picker'.";
    step_3_element = document.querySelector('.mobile-menu-toggle.menu-btn');
    step_3_position = "left";
  }
  var step_3 = {
    title: defaultTourStepTitle,
    element: step_3_element,
    intro: step_3_text,
    position: step_3_position
  }

  var step_4 = {
    title: defaultTourStepTitle,
    intro: "Air Tracker is interactive and works within the dotted lines around each featured city. Click on any location within the box to create a 'back trace' from that point of interest."
  }

  var step_5 = {
    title: defaultTourStepTitle,
    element: null,
    intro: "A back trace shows the area where a pollution source is most likely to be found. The darker purple indicates the area with the strongest contribution to the back trace. <br> <br> Watch <a target='_blank' href='https://drive.google.com/file/d/1uVzPw4l0GT2S8FcYwGHT430MkIejNXHg/preview'>this video</a> for the basics on what a back trace is.",
    highlightPaddings:  {top: -50, left: -50, width: 150, height: 400}
  }

  tourObj = introJs().setOptions({
    autoPosition: false,
    exitOnOverlayClick: false,
    showProgress: true,
    showBullets: false,
    steps: [
      step_1,
      step_2,
      step_3,
      step_4,
      step_5,
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
      selector: "div.gmnoprint[role='menubar']",
      intro: "You can change the style of the base map to either be satellite view or default roadmap view.",
      position: "left",
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
      element: document.querySelector("#reach-out"),
      intro: "Thank you for following along. <br><br> If you have further questions about the methodologies used in this tool or would like to contact us, please click the email icon on the side panel after exiting the tour. <br><br> Happy Exploring!",
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

      // Turn off any sensors that can be toggled
      toggleOffAllNonForcedSensors();

      // If we are starting the tour with the playback timeline up, close it.
      if (playbackTimeline && playbackTimeline.isActive()) {
        handleTimelineToggling();
      }

      // If we had a city selected, go to the last availabe day
      if (selectedCity && timeline && timeline.getSelectedBlock().data().index != 0) {
        $(".block-click-region[data-epochtime_milisec='" + timeline.getLastBlockData().epochtime_milisec + "']").trigger("click");
        await waitForSensorsLoaded();
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
      this._introItems[this._currentStep].position = "right";
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
      await waitForSensorsLoaded();
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
      if (isMobileView()) {
        $(".custom-legend").accordion( "option", "active", false);
        this._introItems[this._currentStep].position = "top-middle-aligned";
      } else {
        this._introItems[this._currentStep].position = "right";
      }

      setTimeout(() => {
        this.refresh();
      }, 500);
    } else if (this._currentStep == 5) {
      // 3:45 AM
      playbackTimeline.seekTo(12, true);
      $(".block-click-region[data-epochtime_milisec='1635919200000']").trigger("click");

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
      this._introItems[this._currentStep].element = document.querySelector("div.gmnoprint[role='menubar']");
      this._introItems[this._currentStep].position = "left";
      this.refresh();
    } else if (this._currentStep == 8) {
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
    } else if (this._currentStep == 9) {
      // uses step 8 div
      var id = "tour-manual-region-8";
      this._introItems[this._currentStep].element = document.querySelector("#" + id);
      this._introItems[this._currentStep].position = "left";
      this.refresh();
    } else if (this._currentStep == 10) {
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
        await waitForSensorsLoaded()
      }
      // uses step 8 div
      var id = "tour-manual-region-8";
      this._introItems[this._currentStep].element = document.querySelector("#" + id);
      this._introItems[this._currentStep].position = "right";
      this.refresh();
    } else if (this._currentStep == 11) {
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
      // uses step 8 div
      var id = "tour-manual-region-8";
      this._introItems[this._currentStep].element = document.querySelector("#" + id);
      this._introItems[this._currentStep].position = "right";
      await setAsyncTimeout(() => {
        this.refresh();
      }, 450);
    } else if (this._currentStep == 12) {
      // 9:30 PM
      playbackTimeline.seekTo(86);
      // uses step 8 div
      var id = "tour-manual-region-8";
      this._introItems[this._currentStep].element = document.querySelector("#" + id);
      this._introItems[this._currentStep].position = "left";
      this.refresh();

      if (!selectedLocationPinVisible()) {
        var marker = available_cities["US-SLC"].sensors["Hawthorne AirNow"].marker.getGoogleMapMarker();
        google.maps.event.trigger(marker, "click");
      }
    } else if (this._currentStep == 13) {
      if (selectedLocationPinVisible()) {
        google.maps.event.trigger(selectedLocationPin, "click");
      }
      $purpleAirToggle.prop("checked", false).trigger("change");
      toggleMarkersByMarkerType("purple_air", false);
    } else if (this._currentStep == 14) {
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
      $purpleAirToggle.prop("checked", true).trigger("change");

      // Turn back on if they exist, otherwise pull them
      await handlePurpleAirTourData();
    } else if (this._currentStep == 15) {
      toggleMarkersByMarkerType("purple_air", false);

      if (sensorsEnabledState['trax']) {
        $traxToggle.trigger("click");
      }
      $purpleAirToggle.prop("checked", false).trigger("change");
    } else if (this._currentStep == 16) {
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

      if (!sensorsEnabledState['trax']) {
        $traxToggle.trigger("click");
      }
    } else if (this._currentStep == 17) {
      if (sensorsEnabledState['trax']) {
        $traxToggle.trigger("click");
      }
      if (!selectedLocationPinVisible()) {
        google.maps.event.trigger(available_cities["US-SLC"].sensors["Hawthorne AirNow"].marker.getGoogleMapMarker(), "click");
      }
      if (playbackTimeline && !playbackTimeline.isActive()) {
        handleTimelineToggling();
      }
    } else if (this._currentStep == 18) {
      if (selectedLocationPinVisible()) {
        google.maps.event.trigger(selectedLocationPin, "click");
      }
      setTimeout(() => {
        this.refresh();
      }, 50);
    } else if (this._currentStep == 19) {
      if (playbackTimeline && playbackTimeline.isActive()) {
        handleTimelineToggling();
      }
      await setAsyncTimeout(() => {
        this.refresh()
      }, 75);
    } else if (this._currentStep == 21) {
      if (playbackTimeline && !playbackTimeline.isActive()) {
        handleTimelineToggling();
      }
      google.maps.event.trigger(available_cities["US-SLC"].marker, "click");
    } else if (this._currentStep == 27) {
      google.maps.event.trigger(available_cities["US-SLC"].marker, "click");
      setTimeout(() => {
        if (playbackTimeline && !playbackTimeline.isActive()) {
          handleTimelineToggling();
          this._introItems[this._currentStep].element = document.querySelector("#calendar-btn"),
          this._introItems[this._currentStep].position = "top-left-aligned";
          this.refresh();
        }
      }, 30)
    } else if (this._currentStep == 28) {
      $(".close-modal").trigger("click");
      if (playbackTimeline && playbackTimeline.isActive()) {
        handleTimelineToggling();
      }
    } else if (this._currentStep == 29) {
      $("#share-picker").trigger("click");
    } else if (this._currentStep == 30) {
      $("#share-picker").trigger("click");
    } else if (this._currentStep == 31) {
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
    toggleMarkersByMarkerType("purple_air", false);
    // Turn off purple air UI toggle
    $purpleAirToggle.prop("checked", false).trigger("change");
    // TRAX may still be up, hide them
    if (sensorsEnabledState['trax']) {
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

      await waitForSensorsLoaded();
      sensorLoadingDeferrers[marker_type] = new Deferred();
      sensorLoadingDeferrers[marker_type].isProcessing = true;

      dataFormatWorker.postMessage(
      { epochtime_milisec: timeline.selectedDayInMs,
        sensors_list: marker_info_list,
        marker_type: marker_type,
        is_current_day : is_current_day}
      );
      break;
    }
  }
}


function toggleOffAllNonForcedSensors() {
  var activeSensors = Object.keys(sensorsEnabledState).filter(key => sensorsEnabledState[key] === true);
  for (let activeSensorType of activeSensors) {
    if (sensorsEnabledState[activeSensorType]) {
      // TODO: Perhaps cache (earlier on) and store the selector in the sensorsEnabledState dict
      $("#toggle-" + activeSensorType.replace("_", "-")).trigger("click");
    }
  }
}


async function getCityInBounds() {
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
    showSensorMarkersByTime(playbackTimeline.getPlaybackTimeInMs());
    if (available_cities[selectedCity].has_smell_reports) {
      handleSmellReports(playbackTimeline.getPlaybackTimeInMs());
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

    if (available_cities[selectedCity].has_smell_reports) {
      $("#smell-report-legend-row").show();
    } else {
      $("#smell-report-legend-row").hide();
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
            $("#toggle-" + sensorType.replace("_", "-")).trigger("click");
          }
        }
        if (urlVars.pinnedPoint) {
          await waitForSensorsLoaded();
          var latLng = urlVars.pinnedPoint.split(",");
          google.maps.event.trigger(map, "click", {latLng: new google.maps.LatLng(latLng[0], latLng[1]), fromVirtualClick: true});
          // Need a delay for the click to fully register
          setTimeout(function() {
            determineSensorAndUpdateInfoBar();
          }, 300)
        }

      });
    }
  } else {
    // If we previously had a city up and we've panned awway, hide its markers.
    if (lastSelectedCity) {
      resetMapToCitiesOverview(lastSelectedCity)
    }
  }
  zoomChangedSinceLastIdle = false;
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
  }
  if (text) {
    $tooltipContent.text(text);
    $tooltip.show();
    $tooltip.position({
      at: position.at,
      of: $target,
      my: position.my,
      collision: "flip fit",
      using: function (obj,info) {
        $(this).removeClass("left right");
        var horizontalShiftAmt = 28;
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
    siteTour();
  });
  $("#help-tour-mobile").on("click", function() {
    $("#active.mobile-menu-toggle").prop("checked", false);
    siteTour();
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
  $clarityToggle = $("#toggle-clarity");
  $traxToggle = $("#toggle-trax");
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
    $searchBox = $(".searchBox")
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
      }, 100)
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
    var markers = Object.keys(available_cities[selectedCity].sensors).map(function(k){return available_cities[selectedCity].sensors[k]['marker'];}).filter(marker => marker);
    for (var marker of markers) {
      if (selectedLocationPinVisible() && !selectedSensorMarker && isSensorMarkerVisible(marker) &&
          (typeof(marker.getBounds) === "function" && marker.getGoogleMapMarker().getBounds().contains(selectedLocationPin.position)) ||
          selectedLocationPinVisible() && marker.getGoogleMapMarker().position.lat() == selectedLocationPin.position.lat() && marker.getGoogleMapMarker().position.lng() == selectedLocationPin.position.lng()) {
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
  }
}

async function handleDraw(timeInEpoch) {
  if (sensorsEnabledState['trax']) {
    await getTraxInfoByPlaybackTime(timeInEpoch);
  }
  // TODO: Handle HRRR Wind Error visual
  //if (showHrrrWindDirectionError || showHrrrWindSpeedError) {
  //  handleHrrrWindErrorPointsByEpochTime(timeInEpoch);
  //}
  await showSensorMarkersByTime(timeInEpoch);

  await handleSmellReports(timeInEpoch);

  await waitForSensorsLoaded()

  if (selectedLocationPinVisible()) {
    determineSensorAndUpdateInfoBar();
  }

  if (infowindow) {
    infowindow.close();
  }
}


async function drawFootprint(lat, lng, fromClick, wasVirtualClick) {
  if (!fromClick && !selectedLocationPinVisible()) {
    return;
  }

  var backtraceMode = Util.parseVars(window.location.href).backtraceMode;

  var fromTour = isInTour();
  if (!fromTour && !wasVirtualClick && typeof(drawFootprint.firstTime) == 'undefined' && localStorage.dontShowFootprintPopup != "true") {
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

  var data;
  var iconPath;
  var loc = latTrunc + "," + lngTrunc;

  var tmp = m_closestDate.format("YYYYMMDDHHmm") + "Z";
  var formatted_tmp = tmp + "_" + lngTrunc + "_" + latTrunc + "_1";
  var uncertaintyData = await handleFootprintUncertainty(formatted_tmp);

  overlayData.uncertainty = uncertaintyData;

  var parsedIsoString = isoString.replace(/:/g,"-").split(".")[0];
  if (plume_backtraces[loc] && plume_backtraces[loc][closestDateEpoch]) {
    data = plume_backtraces[loc][closestDateEpoch];
  } else {
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
    iconPath = ASSETS_ROOT + 'img/black-pin.png';

    plume_backtraces[loc][closestDateEpoch] = data;

    var url = data.image;

    if (backtraceMode == "1") {
      url = CLOUD_STORAGE_PARENT_URL + "/" + parsedIsoString + "/" + lngTrunc + "/" + latTrunc + "/" + "1" + "/" + "footprint.png";
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
    if (backtraceMode == "1") {
      worldMask.setMaskCut(overlay.bounds.getSouthWest(), overlay.bounds.getNorthEast());
    }
  } else {
    overlayData['hasData'] = false;
    iconPath = ASSETS_ROOT + 'img/white-pin2.png';
    if (backtraceMode == "1") {
      worldMask.setMaskFull();
    }
    /*if (!fromClick && previousFootprintData.hasData) {
      if (overlay) {
        overlay.hide();
      }
    }*/
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
      icon: iconPath,
      /* This is required to ensure that the element always remain in the DOM tree.
         Otherwise, some seemingly magical things occur when lots of markers are added to the map.
      */
      optimized: false,
      zIndex: 99999999
    });
    google.maps.event.addListener(selectedLocationPin, "click", function (e) {
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
  for (var sensor_type in sensorLoadingDeferrers) {
    await sensorLoadingDeferrers[sensor_type].promise;
  }
}


function createAndShowSensorMarker(data, epochtime_milisec, is_current_day, info, i, num_sensors) {
  // TODO: Move to json file?
  var getMarkerIcon = function(marker_type) {
    if (marker_type == "air_now") {
      return "circle";
    } else if (marker_type == "purple_air") {
      return "square";
    } else if (marker_type == "clarity") {
      return "diamond";
    } else {
      return null;
    }
  }

  // TODO: Move to json file?
  var getMarkerIconSize = function(marker_type) {
    if (marker_type == "purple_air") {
      return 12;
    } else if (marker_type == "clarity") {
      return 20;
    } else {
      return null;
    }
  }

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
          visible: false,
          zIndex: 99999999
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

  var isDaySummary = !markerData['is_current_day'] && markerData.sensorType != "trax";

  var markerDataTimeInMs = markerData.sensorType ==  "trax" || markerData.sensorType  == "backtrace" ? markerData['epochtimeInMs'] : markerData['sensor_data_time'] || markerData['wind_data_time'];
  var markerDataTimeMomentFormatted = moment.tz(markerDataTimeInMs, selected_city_tmz).format("h:mm A (zz)");

  // Set infobar header to sensor name (if TRAX or AirNow) or clicked lat/lon coords otherwise
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
    var uncertaintyDetailLevel = Util.parseVars(window.location.href).uncertaintyDetail;
    if (overlayData.hasData) {
      var tm = moment.tz(overlayData['epochtimeInMs'], selected_city_tmz).format("h:mm A (zz)");
      if(uncertaintyDetailLevel && overlayData.uncertainty) {
        if (uncertaintyDetailLevel == "1") {
          setInfobarSubheadings($infobarPlume,"",overlayData.uncertainty.label,"Model Confidence",tm);
          $infobarPlume.children(".infobar-text").addClass('display-unset');
        } else if (uncertaintyDetailLevel == "2") {
          createUncertaintyTable($infobarPlume,overlayData.uncertainty);
        }
      } else {
        infoStr = "Snapshot from model at " + tm;
        setInfobarSubheadings($infobarPlume,infoStr,"","","");
      }
    } else {
      var pollution_time = playbackTimeline.getPlaybackTimeInMs();
      if (selectedSensorMarker) {
        pollution_time = markerDataTimeInMs;
      }
      infoStr = "No pollution backtrace available at " + moment.tz(pollution_time, selected_city_tmz).format("h:mm A (zz)");
      setInfobarUnavailableSubheadings($infobarPlume,infoStr);
      $infobarPlume.children(".infobar-text").removeClass('display-unset');
      $infobarPlume.children(".infobar-unit").hide();
      $infobarPlume.children(".infobar-table").hide();
    }
  }
}

function createUncertaintyTable($element, data) {
  for(const x in data) {
    if(typeof(data[x]) === 'number') {
      data[x] = roundTo(data[x],2)
    }
  }
  var confidenceColor = "green"
  if (data.label === "Low"){
    confidenceColor = "darkred"
  }
  else if (data.label === "Medium") {
    confidenceColor = "goldenrod"
  }


  var tableString = ""
  tableString += "<table><tr><th></th><th>Wind Speed (m/s)</th><th>Wind Direction (deg)</th></tr>"
  tableString += "<tr><th>HRRR</th><td>"+data.hrrr_ws+"</td><td>"+data.hrrr_wd+"</td></tr>"
  tableString += "<tr><th>Kriged</th><td>"+data.kriged_ws+"</td><td>"+data.kriged_wd+"</td></tr>"
  tableString += "<tr><th>Error</th><td>"+data.wind_speed_err+"</td><td>"+data.wind_direction_err+"</td></tr>"
  tableString += "<tr><td></td><td colspan='2' style='font-weight:bold;color:" + confidenceColor + "'>"+data.label + " Confidence</td></tr>"
  $element.children(".infobar-text")[0].innerHTML = tableString
  $element.children(".infobar-text").children("table").addClass("infobar-table")
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


async function handleMapClicked(mapsMouseEvent) {
  var wasVirtualClick = mapsMouseEvent.fromVirtualClick;
  var fromClick = wasVirtualClick || !!mapsMouseEvent.domEvent;

  selectedSensorMarker = null;

  await drawFootprint(mapsMouseEvent.latLng.lat(),mapsMouseEvent.latLng.lng(), fromClick, wasVirtualClick);
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
    // Get placeholder markers
    markers = markers.concat(available_cities[city_locode].sensor_placeholder_markers);
    // Get smell report markers
    markers = markers.concat(available_cities[city_locode].smell_report_markers[selected_day_start_epochtime_milisec]);
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
  }
  // global function in timeline.js
  initTimeline(options);
}

function resetMapToCitiesOverview(city_locode) {
  resetAllTrax();
  //resetAllHrrrWindErrorPoints();
  hideMarkersByCity(city_locode);
  available_cities[city_locode].marker.setVisible(true);
  available_cities[city_locode].footprint_region.setVisible(false);
  $citySelector.val("");
  $controls.hide();
  $("#map, #infobar").addClass("no-controls");
  toggleOffAllNonForcedSensors();
  if (selectedLocationPinVisible()) {
    google.maps.event.trigger(selectedLocationPin, "click");
  }
  selectedCity = "";
  $legend.hide();
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

  var activeSensorToggles = $("#legend-table input:checked").map(function() { return $(this).data("marker-type")}).toArray();
  activeSensorToggles.push("air_now");

  var markers_with_data_for_chosen_epochtime = {markers_to_show: [], marker_types_to_load: []};
  for (var sensorName in available_cities[selectedCity].sensors) {
    var sensor = available_cities[selectedCity].sensors[sensorName];
    if (!sensor.data || !sensor.data[selected_day_start_epochtime_milisec]) {
      var sensor_marker_type = sensor.info.marker_type;
      if (!activeSensorToggles.includes(sensor_marker_type)) continue;
      if (markers_with_data_for_chosen_epochtime.marker_types_to_load.indexOf(sensor_marker_type) == -1) {
        markers_with_data_for_chosen_epochtime.marker_types_to_load.push(sensor_marker_type)
      }
      continue;
    }

    var fullDataForDay = sensor.data[selected_day_start_epochtime_milisec].data;

    var sensorTimes = fullDataForDay.map(entry => entry.time * 1000);
    var indexOfAvailableTime = findExactOrClosestTime(sensorTimes, playbackTimeInMs, "down");
    if (indexOfAvailableTime >= 0 && sensor.marker) {
      sensor.marker.setData(parseSensorMarkerDataForPlayback(fullDataForDay[indexOfAvailableTime], animating, sensor.info));
      sensor.marker.updateMarker();
      markers_with_data_for_chosen_epochtime.markers_to_show.push(sensor.marker);
    }
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
    hideMarkers(markers)

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

      dataFormatWorker.postMessage(
      { epochtime_milisec: timeline.selectedDayInMs,
        sensors_list: marker_info_list,
        marker_type: marker_type,
        is_current_day : is_current_day }
      );

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
    // Disable time ticks for current day that have not occured yet for that city
    var playbackTimeInMs = playbackTimeline.getPlaybackTimeInMs();
    var currentDate = moment().tz(selected_city_tmz);
    var $timeTicks = $("#playback-timeline-container .materialTimeline span.materialTimelineTick");
    $timeTicks.removeClass("disabled");
    if (currentDate.isSame(moment.tz(playbackTimeInMs, selected_city_tmz), 'day')) {
      var latestClosestTime = roundDate(currentDate, moment.duration(15, "minutes"), "floor");
      // TODO: Note does not take DST start/end into account
      var numMinutesElapsedForLatestClosestTime = latestClosestTime.get('hour') * 60 + latestClosestTime.get('minute');
      $timeTicks.filter("[data-minutes-lapsed='" + numMinutesElapsedForLatestClosestTime + "']").nextAll().addClass("disabled");
    }
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
  })

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
  })
}


async function handleFootprintUncertainty(lookupStr) {
  if (selectedCity !== 'US-SLC') {
    return;
  }

  var docRefString = lookupStr;
  const snapshot = await db.collection("hrrr-uncertainty-kriged").doc(docRefString).get();
  var data = snapshot.data();
  if (!data) {
    return;
  }
  var label;
  if (data.wind_direction_err < 30) {
    if (data.wind_speed_err < 1) {
      label = "High"
    } else {
      label = "Medium"
    }
  } else if (data.wind_speed_err < 1) {
    label = "Medium"
  } else {
    label = "Low"
  }
  data.label = label;
  return data;
}


async function loadImage(src) {
  return await new Promise((resolve, reject) => {
    let img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.crossOrigin = "Anonymous";
    img.src = src;
  })
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
  }

  // Show/hide the cut mask
  this.setMaskCutVisible = function(visibility) {
    this.rectangle1.setVisible(visibility);
    this.rectangle2.setVisible(visibility);
    this.rectangle3.setVisible(visibility);
    this.rectangle4.setVisible(visibility);
  }

  // Show/hide the full mask
  this.setMaskFullVisible = function(visibility) {
    this.rectangleWorld.setVisible(visibility);
  };

}


async function handleSmellReports(epochtime_milisec) {
  var epochtime_sec = parseInt(epochtime_milisec / 1000);
  var smell_report_markers = available_cities[selectedCity].smell_report_markers[selected_day_start_epochtime_milisec];
  // Hide previously visible smell reports
  if (previous_selected_day_start_epochtime_milisec) {
    var previous_smell_report_markers = available_cities[selectedCity].smell_report_markers[previous_selected_day_start_epochtime_milisec];
    hideMarkers(previous_smell_report_markers);
  }
  if (smell_report_markers === undefined) {
    loadAndCreateSmellMarkers(epochtime_milisec, epochtime_sec);
  } else {
    var smell_report_markers_to_hide = [];
    var smell_report_markers_to_show = []
    smell_report_markers.forEach((s) => (s.getData().observed_at <= epochtime_sec ? smell_report_markers_to_show : smell_report_markers_to_hide).push(s));
    hideMarkers(smell_report_markers_to_hide);
    showMarkers(smell_report_markers_to_show);
  }
}


async function loadAndCreateSmellMarkers(epochtime_milisec, epochtime_sec) {
  var m_d = moment(epochtime_milisec).tz(selected_city_tmz);
  var start_time = m_d.startOf("day").unix();
  var end_time = m_d.endOf("day").unix();
  var state_id = 1; // PA
  $.ajax({
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

function handleSmellMarkerClicked(marker) {
  infowindow.setContent(marker.getContent());
  infowindow.open(map, marker.getGoogleMapMarker());

  // Remove highlight of popup close button
  // Apparently need a slight delay to allow for the button to initially be focused
  setTimeout(function() {
    document.activeElement.blur();
  }, 50);
}