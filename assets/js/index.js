var map;
//var isMobileDevice = navigator.userAgent.match(/CrOS/) != null && (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Windows Phone|Mobile/i.test(navigator.userAgent));

var TRAX_COLLECTION_NAME = "trax-dev";
var STILT_COLLECTION_NAME = "stilt-prod";

var pm25ColorLookup = function(pm25) {
  var color;
  if (pm25 >= 250.5) {
    color = "#7e0023";
  } else if (pm25 >= 150.5) {
    color = "#99004c";
  } else if (pm25 >= 55.5) {
    color = "#ff0000";
  } else if (pm25 >= 35.5) {
    color = "#ff7e00";
  } else if (pm25 >= 12.1) {
    color = "#ffff00";
  } else if (pm25 >= 0) {
    color = "#00e400";
  } else {
    color = "#000000";
  }
  return color;
}

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
    "name": "Cooper View AirNow",
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
var sensors_cache = {}

// This should be the starting time of today's date
var current_epochtime_milisec = (new Date()).setHours(0,0,0,0);

var selectedLocation;
var overlay;

var db;

var infowindow_smell;
var infowindow_PM25;

var currentDate = new Date();
var startOfCurrentDateInMilisec = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate()).getTime();
var currentHour = currentDate.getHours();
var current24HourString = pad(currentHour) + ":00";
var current12HourString = convertFrom24To12Format(current24HourString);


// Touch support
var hasTouchSupport = isTouchDevice();
var hasPointerSupport = isPointerDevice();
var tappedTimer = null;
var lastDist = null;
var lastLocation;
var thisLocation;
var isTouchMoving = false;
var touchStartTargetElement;
var currentTouchCount = 0;

var traxDataByHourlyEpochTimeInMs = {};
var traxLocations = {};

function resetAllTraxColors() {
  for (trax in traxLocations) {
    var marker = traxLocations[trax].marker;
    marker.setOptions({
      fillColor: "#000000",
      strokeColor: "#000000",
      fillOpacity: 0,
      strokeOpacity: 0
    })
    marker.setVisible(false);
  }
}

function setTraxOpacityAndColor(currentPlaybackTimeInMs) {
  var opacity;
  var oneHourInMs = 3600000;
  var options = {};
  for (site in traxLocations) {
    var marker = traxLocations[site].marker;
    var dataWithinPlaybackHour = traxDataByHourlyEpochTimeInMs[currentPlaybackTimeInMs][site];
    if (dataWithinPlaybackHour) {
      var color = pm25ColorLookup(dataWithinPlaybackHour.pm25);
      var timeDiff = Math.abs(currentPlaybackTimeInMs - (dataWithinPlaybackHour.epochtimeInSec * 1000));
      opacity = Math.min(1, (timeDiff / oneHourInMs) + .05);
      options.fillColor = color;
      options.strokeColor = color;
      options.fillOpacity = opacity;
      options.strokeOpacity = Math.max(0, opacity - 0.2);
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
    resetAllTraxColors();
  }
}

async function getTraxInfoByPlaybackTime() {
  var playbackTimeInMs = playbackTimeline.getPlaybackTimeInMs();
  if (traxDataByHourlyEpochTimeInMs[playbackTimeInMs]) {
    setTraxOpacityAndColor(playbackTimeInMs);
    return;
  }
  traxDataByHourlyEpochTimeInMs[playbackTimeInMs] = {};


  var d = new Date(0);
  d.setUTCMilliseconds(playbackTimeInMs);
  var startDate = new Date(d)
  var endDate = new Date(d.setUTCHours(d.getUTCHours() + 1));
  const snapshot  = await db.collection(TRAX_COLLECTION_NAME).where('time', '>=', startDate).where('time', '<', endDate).get();
  if (!snapshot.empty) {
    snapshot.forEach(doc => {
      var data = doc.data();
      var site = data.site;
      var epochtimeInSec = data.time.seconds;
      traxDataByHourlyEpochTimeInMs[playbackTimeInMs][site] = {pm25: data.pm25, epochtimeInSec: epochtimeInSec};
      traxLocations[site].marker.data = {mostRecentPm25Reading: data.pm25, mostRecentReadingTimeInSec: epochtimeInSec};
    });
    setTraxOpacityAndColor(playbackTimeInMs);
  } else {
    console.log("no trax data found found for:", playbackTimeInMs);
    resetAllTraxColors();
  }
}

async function initMap() {
  map = new google.maps.Map(document.getElementById("map"), {
    center: { lat: 40.758701, lng: -111.876183 },
    zoom: 11,
    streetViewControl: false,
    fullscreenControl: false,
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

  // Set information window
  infowindow_smell = new google.maps.InfoWindow({
    pixelOffset: new google.maps.Size(-1, 0),
    maxWidth: 250
  });
  infowindow_PM25 = new google.maps.InfoWindow({
    pixelOffset: new google.maps.Size(0, 37),
    maxWidth: 250
  });
  //infowindow_PM25 = document.getElementById("infowindow_PM25")

  // Change the style of the info window
  infowindow_smell.addListener("domready", function () {
    styleInfoWindowCloseButton();
  });
  infowindow_PM25.addListener("domready", function () {
    styleInfoWindowCloseButton();
  });

  map.addListener("click", (mapsMouseEvent) => {
    handleMapClicked(mapsMouseEvent);
  });

  $("#infobar-close").on("click",closeInfobar);

  //$("#infobar-close-handle").on("touchmove",closeInfobar);

  var $infobar = $("#infobar");

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
      currentYPos = e.pageY;
      if (lastYPos > e.pageY) {
        lastYDirection = "down";
      } else if (lastYPos < e.pageY) {
        lastYDirection = "up";
      }
      lastYPos = currentYPos;
      var dist = startYPos - currentYPos;
      var maxHeight = Math.min(295, (startHeight - dist));
      $infobar.height(maxHeight);
    });
    $(document).one("mouseup.infocontainer", function(e) {
      if (lastYDirection && lastYDirection == "up") {
        $infobar.stop(true, false).animate({
          height: "40%"
        });
        $infobar.addClass("maximized");
      } else if (lastYDirection && lastYDirection == "down") {
        $infobar.stop(true, false).animate({
          height: "0px"
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
      $infobar.height("");
    }
  });

  $("#controls").on("click", ".playbackButton, #calendar-btn, .timestampPreview", handleTimelineToggling);

  $("#timestampPreviewContent").text(current12HourString);
  loadSensorList(sensors);

  if (hasTouchSupport || hasPointerSupport()) {
    //var controlsElem = document.getElementById("controls");
    $("#controls, #infobar").on("touchstart", touch2Mouse);
    $("#controls, #infobar").on("touchmove", touch2Mouse);
    $("#controls, #infobar").on("touchend", touch2Mouse);
    $("#controls, #infobar").on("touchcancel", touch2Mouse);
  }

  //------------------- create custom map overlay to draw footprint ---------------------------------
  class FootprintOverlay extends google.maps.OverlayView {
    constructor(bounds, image) {
      super();
      this.bounds = bounds;
      this.image = image;
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

  // TODO: Need pollyfill
  new ResizeObserver(playbackTimeline.refocusTimeline).observe($(".materialTimeline")[0]);

  // Draw TRAX locations on the map
  traxLocations = await getTraxLocations();
  for (const trax in traxLocations) {
    const cityCircle = new google.maps.Circle({
      strokeOpacity: 0,
      strokeWeight: 2,
      fillColor: "#000000",
      fillOpacity: 0,
      map,
      center: traxLocations[trax],
      radius: 80
    });
    cityCircle.traxId = trax;
    traxLocations[trax]['marker'] = cityCircle;
    google.maps.event.addListener(cityCircle, 'click', function (e) {
      console.log(this.traxId)
    });
  }

  expandInfobar();
  $(".infobar-component").hide();
  $("#infobar-initial").show();
  // END OF INIT
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

function drawFootprint(lat, lng) {
  console.log('drawing footprint!')

  //clear existing footprint if there is one
  if (overlay) {
    overlay.setMap(null);
  }

  var coords = {xmin: lng - 0.5,
    ymin: lat - 0.5,
    xmax: lng + 0.5,
    ymax: lat + 0.5}

  const bounds = new google.maps.LatLngBounds(
    new google.maps.LatLng(coords.ymin, coords.xmin),
    new google.maps.LatLng(coords.ymax, coords.xmax)
  );

  console.log(lat,lng);
  //console.log(timeline.selectedDayInMs)

  var d = new Date(0);
  d.setUTCSeconds(playbackTimeline.getPlaybackTimeInMs() / 1000);
  //"2021-01-13T21:53:44.495Z"
  var isoString = d.toISOString();
  var yearMonthDay = isoString.split("T")[0].split("-");
  var hourMinute = isoString.split("T")[1].split(":")

  var docRefString = yearMonthDay[0] + yearMonthDay[1] + yearMonthDay[2] + hourMinute[0] + hourMinute[1] + "_" + lng.toFixed(2) + "_" + lat.toFixed(2) + "_1";
  var docRef = db.collection(STILT_COLLECTION_NAME).doc(docRefString);
  console.log(docRefString)

  docRef
    .get()
    .then((doc) => doc.data())
    .then((data) => {
      if (data) {
        console.log(data);
        return data;
      }
      //TODO: show error in plume infobar
      $("#infobar-about-section")[0].style = "text-align: center"
      $("#infobar-about-section > i")[0].innerHTML = "No pollution backtrace available at: " + docRefString;
      $("#infobar-error-icon")[0].style = "display: table";
      //selectedLocation.setIcon();
      expandInfobar();
      selectedLocation = new google.maps.Marker({
        position: new google.maps.LatLng(lat,lng),
        map,
        title: "Selected Location",
        animation: google.maps.Animation.DROP,
        icon: 'assets/img/gray-pin.png'
      });
      //selectedLocation.setOpacity(.5);
      throw new Error("document not found");
    })
    .then(({ image, location, time, extent }) => {
      //console.log(image);
      //console.log(location);
      overlay.set('image',image);
      const bounds = new google.maps.LatLngBounds(
        new google.maps.LatLng(extent.ymin, extent.xmin),
        new google.maps.LatLng(extent.ymax, extent.xmax)
      );
      overlay.set('bounds',bounds);

      //overlay.set('opacity',0.1);
      overlay.setMap(map);

      expandInfobar();

      selectedLocation = new google.maps.Marker({
        position: new google.maps.LatLng(lat,lng),
        map,
        title: "Selected Location",
        animation: google.maps.Animation.DROP
      });

      $("#infobar-about-section")[0].style = "text-align: auto; font-style: auto";
      $("#infobar-about-section > i")[0].innerHTML = "Our model shows that particles originated from the XX direction.";
      $("#infobar-error-icon")[0].style = "display: none";
    })
    .catch(console.error);

}

function closeInfobar() {
  var infobar = $("#infobar")[0];
  infobar.style.visibility = 'hidden';
  overlay.setMap(null);
  if(selectedLocation) {
    selectedLocation.setMap(null)
  }
}

function expandInfobar() {
  //get infobar element
  var infobar = $("#infobar")[0];
  infobar.style.visibility = 'visible';
  $(".infobar-component").show();
  $("#infobar-initial").hide();
}

//if ($(window).width() < 450) {
//  $( ".custom-legend" ).accordion( "option", "active", false );
//}

function styleInfoWindowCloseButton() {
  $(".gm-style-iw").next().css({
    "-ms-transform": "scale(1.3, 1.3)",
    "-webkit-transform": "scale(1.3, 1.3)",
    "transform": "scale(1.3, 1.3)"
  });
}

function loadSensorList(sensors) {
  for (var i = 0; i < sensors.length; i++) {
    var markers = sensors[i].markers;
    for (var j = 0; j < markers.length; j++) {
      sensors_list.push(markers[j]);
    }
  }
  // TODO: timeline block click events
  var options = {
    clickEvent: function() {
      closeInfobar();
    }
  }
  initTimeline(options);
  playbackTimeline = new create.CustomTimeline2();
}

function loadAndCreateSensorMarkers(epochtime_milisec, info, is_current_day, i) {
  // Generate a list of urls that we need to request
  var urls = generateSensorDataUrlList(epochtime_milisec, info);

  // Request urls and load all sensor data
  loadSensorData(urls, function (responses) {
    // Merge all sensor data
    var data = formatAndMergeSensorData(responses, info);
    // Roll the sensor data to fill in some missing values
    data = rollSensorData(data, info);
    // For VOC sensors with faster sampling rates, we need to average data points
    data = aggregateSensorData(data, info);
    // Create markers
    createAndShowSensorMarker(data, epochtime_milisec, is_current_day, info, i);
    //createMarkerTableFromSensorData(data, epochtime_milisec, info, i);
  });
}

function createAndShowSensorMarker(data, epochtime_milisec, is_current_day, info, i) {
  return new CustomMapMarker({
    "type": getSensorType(info),
    "data": parseSensorMarkerData(data, is_current_day, info),
    "click": function (marker) {
      handleSensorMarkerClicked(marker);
    },
    "complete": function (marker) {
      // Make the maker visible on the map when the maker is created
      // Make sure that the desired time matches the current time
      // (if user selects the time block too fast, they will be different)
      if (epochtime_milisec == current_epochtime_milisec) {
        showMarkers([marker]);
      }
      // Cache markers
      sensors_cache[epochtime_milisec]["is_current_day"] = is_current_day;
      sensors_cache[epochtime_milisec]["markers"][i] = marker;
    }
  });
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

function loadSensorData(urls, callback) {
  var deferreds = [];
  var responses = [];
  for (var i = 0; i < urls.length; i++) {
    deferreds.push($.getJSON(urls[i], function (json) {
      responses.push(json);
    }));
  }
  $.when.apply($, deferreds).then(function () {
    if (typeof callback === "function") {
      callback(responses);
    }
  });
}

function formatAndMergeSensorData(responses, info, method) {
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

// For faster sampling rates, we need to aggregate data points
function aggregateSensorData(data, info) {
  var sensor_type = getSensorType(info);
  if (sensor_type == "PM25" || sensor_type == "WIND_ONLY") {
    return data;
  }
  if (data["data"].length <= 1) {
    return data;
  }

  var data_cp = $.extend({}, data); // copy object
  data_cp["data"] = [];
  var L = data["data"].length;
  var current_time = data["data"][L - 1]["time"];
  var current_sum = data["data"][L - 1][sensor_type];
  var current_counter = 1;
  var threshold = 1800; // average previous 30 minutes of data
  for (var i = L - 2; i >= 0; i--) {
    var time = data["data"][i]["time"];
    var value = data["data"][i][sensor_type];
    if (current_time - time < threshold) {
      current_sum += value;
      current_counter++;
    } else {
      var pt = {
        "time": current_time
      };
      pt[sensor_type] = roundTo(current_sum / current_counter, 0);
      data_cp["data"].unshift(pt);
      current_time = time;
      current_sum = value;
      current_counter = 1;
    }
  }
  var pt = {
    "time": current_time
  };
  pt[sensor_type] = roundTo(current_sum / current_counter, 0);
  data_cp["data"].unshift(pt);

  return data_cp;
}

// Safely get the value from a variable, return a default value if undefined
function safeGet(v, default_val) {
  if (typeof default_val === "undefined") default_val = "";
  return (typeof v === "undefined") ? default_val : v;
}

/*
function createMarkerTableFromSensorData(data, epochtime_milisec, info, i) {
  // When animating, we are actually hiding and showing all pre-created markers
  // Create a table of sensor markers that correspond to different timestamps for animation
  // One dimension is the marker itself
  // One dimension is the timestamp
  sensors_cache[epochtime_milisec]["marker_table"][i] = [];
  for (var j = 0; j < data["data"].length; j++) {
    var marker_data = parseSensorMarkerData(data, true, info, j);
    createSensorMarkerForAnimation(marker_data, epochtime_milisec, info, i, j);
  }
}
*/

function handleSensorMarkerClicked(marker) {
  if (selectedLocation) { selectedLocation.setMap(null) };

  //set infobar header to name
  var infobarHeader = $("#infobar-header > h2")[0];
  infobarHeader.innerHTML = marker.getData()['name'];

  //show sensor pollution value in infobar
  var infobarPollution = $("#infobar-pollution")[0];
  infobarPollution.innerHTML = formatPM25(marker.getData()['sensor_value']);

  //if time selected, show sensor wind in infobar
  var infobarWind = $("#infobar-wind")[0];
  infobarWind.innerHTML = formatWind(marker.getData()['wind_speed'], marker.getData()['wind_direction']);

  drawFootprint(marker.getData()['latitude'], marker.getData()['longitude']);

  //infowindow_smell.close();

  //document.getElementById("infobar-header").innerHTML = marker.getContent();

  //var marker_type = marker.getMarkerType();
  //if (marker_type == "PM25" || marker_type == "WIND_ONLY") {
  //  infowindow_PM25.setContent(marker.getContent());
  //  infowindow_PM25.open(map, marker.getGoogleMapMarker());
}

function formatPM25(val) {
  if (val){
    return val + " μg/m3";
  }
  else {
    return "No PM 2.5 data available";
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
    returnString+= " from " + getWindDirFromDeg(deg) + " direction"
  }
  if (!returnString) {
    return "No wind data available";
  }
  return returnString;
}


function handleMapClicked(mapsMouseEvent) {

  //drop pin
  if (selectedLocation) { selectedLocation.setMap(null) };

  //set infobar header to lat/lng
  var infobarHeader = $("#infobar-header > h2")[0];
  var lat = roundTo(mapsMouseEvent.latLng.lat(), 5);
  var lng = roundTo(mapsMouseEvent.latLng.lng(), 5);
  infobarHeader.innerHTML = lat + ", " + lng;

    //show default text for sensor pollution value in infobar
  var infobarPollution = $("#infobar-pollution")[0];
  infobarPollution.innerHTML = "<i>Click on the nearest sensor to see pollution measurements</i>";

  //show default text for sensor wind in infobar
  var infobarWind = $("#infobar-wind")[0];
  infobarWind.innerHTML = "<i>Click on the nearest sensor to see wind measurements</i>";

  drawFootprint(mapsMouseEvent.latLng.lat(),mapsMouseEvent.latLng.lng());

  //infowindow_smell.close();

  //document.getElementById("infobar-header").innerHTML = marker.getContent();

  //var marker_type = marker.getMarkerType();
  //if (marker_type == "PM25" || marker_type == "WIND_ONLY") {
  //  infowindow_PM25.setContent(marker.getContent());
  //  infowindow_PM25.open(map, marker.getGoogleMapMarker());
}

function getWindDirFromDeg(deg) {
  var val = Math.round((deg/22.5)+.5);
  var arr = ["N","NNE","NE","ENE","E","ESE", "SE", "SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return arr[(val % 16)];
}


function showMarkers(markers) {
  markers = safeGet(markers, []);
  for (var i = 0; i < markers.length; i++) {
    if (typeof markers[i] !== "undefined") {
      markers[i].setMap(map);
    }
  }
}

function roundTo(val, n) {
  var d = Math.pow(10, n);
  return Math.round(parseFloat(val) * d) / d;
}

function showSensorMarkersByTime(epochtime_milisec) {
  if (typeof epochtime_milisec == "undefined") return;
  // Check if data exists in the cache
  // If not, load data from the server
  var r = sensors_cache[epochtime_milisec];
  if (typeof r != "undefined") {
    // Make sensors markers visible on the map
    showMarkers(r["markers"]);
  } else {
    // Check if current day
    var date_str_sensor = (new Date(epochtime_milisec)).toDateString();
    var date_str_now = (new Date()).toDateString();
    var is_current_day = date_str_sensor === date_str_now;
    // For each sensor, load data from server and create a marker
    sensors_cache[epochtime_milisec] = {
      "markers": [],
      "marker_table": []
    };
    for (var i = 0; i < sensors_list.length; i++) {
      loadAndCreateSensorMarkers(epochtime_milisec, sensors_list[i], is_current_day, i);
    }
  }
}

function handleTimelineToggling(e) {
  var $currentTarget = $(e.currentTarget);
  if ($("#controls").hasClass("playbackTimelineOff")) {
    if ($currentTarget.prop("id") == "calendar-btn") return;

    // TODO
    if ($("#timeline-container .selected-block").data('epochtime_milisec') == startOfCurrentDateInMilisec) {
      var captureTimes = playbackTimeline.getCaptureTimes();
      var captureTimeIdx = captureTimes.indexOf(current12HourString);
      playbackTimeline.seekTo(captureTimeIdx);
    } else {
      playbackTimeline.seekTo(0);
    }

    $("#controls").removeClass("playbackTimelineOff");
    $(".calendar-specific-day").text($(".selected-block").data("label")).removeClass("hidden");
    $("#calendar-btn").addClass("playbackTimelineOn calendar-specific-day-icon").removeClass("force-hidden").prop("title", "Choose a different day");
    //$(".timestampPreview").addClass("force-hidden");
    $(".timestampPreview").addClass("force-no-visibility");

  } else {
    if ($currentTarget.hasClass("playbackButton")) return;
    $(".calendar-specific-day").addClass("hidden");
    $("#calendar-btn").removeClass("playbackTimelineOn calendar-specific-day-icon").addClass("force-hidden").prop("title", "Calendar");
    //$(".timestampPreview").removeClass("force-hidden");
    $(".timestampPreview").removeClass("force-no-visibility");
    playbackTimeline.stopAnimate();
    $("#controls").addClass("playbackTimelineOff");
    $(".selected-block")[0].scrollIntoView(false);
    // TODO: Perhaps leave the last hour that was up?
    playbackTimeline.seekTo(0);
  }

}

function pad(n) { return (n < 10 ? '0' : '') + n.toString(); };


function convertFrom24To12Format(time24) {
  var [sHours, minutes] = time24.match(/([0-9]{1,2}):([0-9]{2})/).slice(1);
  var period = +sHours < 12 ? 'AM' : 'PM';
  var hours = +sHours % 12 || 12;
  return hours + ":" + minutes + " " + period;
}


function isPointerDevice() {
  return typeof(PointerEvent) !== "undefined";
};

function isTouchDevice() {
  return typeof(TouchEvent) !== "undefined";
};


// Map touch events to mouse events.
var touch2Mouse = function(e) {
  e.preventDefault();

  var theTouch = e.changedTouches[0];
  var thisTouchCount = e.touches.length;
  if (thisTouchCount) {
    currentTouchCount = thisTouchCount;
  } else {
    currentTouchCount = 0;
  }
  var mouseEvent;
  var theMouse;

  switch (e.type) {
    case "touchstart":
      mouseEvent = "mousedown";
      touchStartTargetElement = theTouch;

      if (tappedTimer && thisTouchCount == 2) {
        // stop single tap callback
        clearTimeout(tappedTimer);
        tappedTimer = null;
        return;
      }

      if (tappedTimer) {
        clearTimeout(tappedTimer);
        tappedTimer = null;

        theMouse = document.createEvent("MouseEvent");
        theMouse.initMouseEvent('dblclick', true, true, window, 1, theTouch.screenX, theTouch.screenY, theTouch.clientX, theTouch.clientY, false, false, false, false, 0, null);
        theTouch.target.dispatchEvent(theMouse);
      }

      tappedTimer = setTimeout(function() {
        tappedTimer = null;
      }, 350);

      isTouchMoving = false;
      break;
    case "touchcancel":
    case "touchend":
      mouseEvent = "mouseup";
      lastDist = null;
      // Take into account a slight epsilon due to a finger potentially moving just a few pixels when touching the screen
      var notRealTouchMove = isTouchMoving && touchStartTargetElement && Math.abs(touchStartTargetElement.clientX - theTouch.clientX) < 10 && Math.abs(touchStartTargetElement.clientY - theTouch.clientY) < 10;
      if (hasTouchSupport && (!isTouchMoving || notRealTouchMove) && touchStartTargetElement && touchStartTargetElement.target == document.elementFromPoint(theTouch.clientX, theTouch.clientY)) {
        theMouse = document.createEvent("MouseEvent");
        theMouse.initMouseEvent('click', true, true, window, 1, theTouch.screenX, theTouch.screenY, theTouch.clientX, theTouch.clientY, false, false, false, false, 0, null);
        theTouch.target.dispatchEvent(theMouse);
        // Dispatching a mouse click event does not give focus to some elements, such as input fields. Trigger focus ourselves.
        $(theTouch.target).focus();
      }

      isTouchMoving = false;

      if (thisTouchCount == 1) {
        // Handle going from 2 fingers to 1 finger pan.
        theTouch = e.touches[0];

        theMouse = document.createEvent("MouseEvent");
        theMouse.initMouseEvent("mouseup", true, true, window, 1, theTouch.screenX, theTouch.screenY, theTouch.clientX, theTouch.clientY, false, false, false, false, 0, null);
        theTouch.target.dispatchEvent(theMouse);

        theMouse = document.createEvent("MouseEvent");
        theMouse.initMouseEvent("mousedown", true, true, window, 1, theTouch.screenX, theTouch.screenY, theTouch.clientX, theTouch.clientY, false, false, false, false, 0, null);
        theTouch.target.dispatchEvent(theMouse);

        return;
      }
      break;
    case "touchmove":
      mouseEvent = "mousemove";
      isTouchMoving = true;

      if (thisTouchCount == 1) {
        // Translate
      } else if (thisTouchCount == 2) {
        if (!$(e.target).hasClass("dataPanesContainer")) return;

        var dist = Math.abs(Math.sqrt((e.touches[0].pageX - e.touches[1].pageX) * (e.touches[0].pageX - e.touches[1].pageX) + (e.touches[0].pageY - e.touches[1].pageY) * (e.touches[0].pageY - e.touches[1].pageY)));
        thisLocation = {
          pageX: (e.touches[0].pageX + e.touches[1].pageX) / 2,
          pageY: (e.touches[0].pageY + e.touches[1].pageY) / 2
        };

        lastDist = dist;
        lastLocation = thisLocation;

        return;
      } else {
        // TODO: More than 2 finger support
        return;
      }
      break;
    default:
      return;
  }

  theMouse = document.createEvent("MouseEvent");
  theMouse.initMouseEvent(mouseEvent, true, true, window, 1, theTouch.screenX, theTouch.screenY, theTouch.clientX, theTouch.clientY, false, false, false, false, 0, null);
  theTouch.target.dispatchEvent(theMouse);
};