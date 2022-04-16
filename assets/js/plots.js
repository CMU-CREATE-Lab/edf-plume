var markerTimeseriesPlots = {};
var ESDR_API_ROOT_URL = 'https://esdr.cmucreatelab.org/api/v1';
var timeSeriesModeEnabled;
var timeSeriesColors = [
  "#000000",
  "#911eb4",
  "#4363d8",
  "#952800",
  "#607D8B",
];
var usedTimSeriesColors = [];
var chartsInitialized = false;
var plotManager;


window.grapherLoad = function() {
  plotManager = new org.bodytrack.grapher.PlotManager("date_axis");
}


async function loadNewDay(epochtime_millisec) {
  $("#timeline-container .block-click-region[data-epochtime_milisec='" + epochtime_millisec + "']").trigger("click");
  $calendarChosenDayIndicator.text($(".selected-block").data("label"));
  await waitForSensorsLoaded();
}


function initPlots() {
  addPlot(selectedSensorMarker.getData());
}

function addPlot(markerData) {
  var feedIdOrApiKey = markerData.feed_id;
  var channelName = markerData.pm25_channel;
  var plotName = "plot_" + feedIdOrApiKey;
  var color = markerData.color ? markerData.color : timeSeriesColors[Object.keys(markerTimeseriesPlots).length];

  plotManager.addDataSeriesPlot(plotName, createDatasource(feedIdOrApiKey, channelName), "plot_container", "y_axis", null, null, {
    "styles" : [
       // lineWidth is always '1' when in webgl mode
       { type : "line", lineWidth : 1, color : color, show : true },
       { type : "circle", radius : 3, lineWidth : 1, color : color, show : true, fill : true }
    ],
    "highlight" : {
      "styles" : [
         {
            "type" : "circle",
            "radius" : 3,
            "lineWidth" : 1,
            "show" : true,
            "color" : "#ff0000",
            "fill" : true
         }
      ]
    }
  });

  addPlotToLegend(markerData, true);

  var plot = plotManager.getPlotContainer("plot_container").getPlot(plotName);
  // add the data point listener to handle mouse events
  plot.addDataPointListener(async function(dataPoint, event) {
    if (event && event.type == "mousedown") {
      var newSelectedTimeInMs = dataPoint.x * 1000;
      var m = moment.tz(newSelectedTimeInMs, selected_city_tmz);
      var closestM = roundDate(m, moment.duration(playbackTimeline.getIncrementAmt(), "minutes"), "floor")
      var closestTimeInMs = closestM.valueOf();
      var startOfDayForNewSelectedTime = m.clone().startOf("day");
      if (!moment.tz(playbackTimeline.getPlaybackTimeInMs(), selected_city_tmz).isSame(m, 'day')) {
        playbackTimeline.setPlaybackTimeInMs(closestTimeInMs);
        await loadNewDay(startOfDayForNewSelectedTime);
      }
      if (playbackTimeline && !playbackTimeline.isActive()) {
        handleTimelineToggling();
      }
      var timeLapsedInMin = closestM.diff(startOfDayForNewSelectedTime, 'minutes');
      //$(".materialTimelineTick[data-minutes-lapsed='" + timeLapsedInMin + "']").trigger("click");
      var frame = $(".materialTimelineTick[data-minutes-lapsed='" + timeLapsedInMin + "']").data("frame");
      playbackTimeline.seekTo(frame);
      //if (selectedLocationPinVisible()) {
      //  await drawFootprint(selectedLocationPin.position.lat(), selectedLocationPin.position.lng(), false);
      //}
    }
  });

}


var createDatasource = function(feedIdOrApiKey, channelName) {
  return function(level, offset, successCallback) {
    $.ajax({
      url: ESDR_API_ROOT_URL + "/feeds/" + feedIdOrApiKey + "/channels/" + channelName + "/tiles/" + level + "." + offset,
      dataType : 'json',
    }).done(function(result) {
      return successCallback(JSON.stringify(result.data));
    }).fail(function(result) {
      console.log("Error: ", result);
    });
  };
};


function addPlotToLegend(markerData, forceOn) {
  if (timeSeriesColors.length == 0) {
    $('.alert').fadeIn(1000).delay(5000).fadeOut(1000);
    return;
  }
  if (!markerTimeseriesPlots['plot_' + markerData.feed_id]) {
    var color = timeSeriesColors.shift();
    usedTimSeriesColors.push(color);
    $("#graph_legend_content").append('<tr data-plot-id=' + "plot_" + markerData.feed_id + ' data-channel=' + markerData.pm25_channel + '><td style="color:' + color + '">' + markerData.name + '</td><td><label class="switch2" title="Toggle plot"><input type="checkbox"' + (forceOn ? ' checked ' : '') + 'data-action-type="toggle-plot"><span class="slider round"><span class="input-state-text"></span></span></label></td><td><span class="remove_graph_plot" title="Remove plot from chart" data-action-type="remove-plot"></span></td></tr>');
    markerTimeseriesPlots['plot_' + markerData.feed_id] = {name : markerData.name, color: color};
  }
}


function handleTimeSeries() {
  // TODO:
  // Entirely disable mouse events on y-axis when in auto scale mode?

  plotManager.setTimeZone(selected_city_tmz);

  initPlots();

  plotManager.getDateAxis().constrainRangeTo({ min : Date.parse(available_cities[selectedCity].timeline_start_date) / 1000, max : Date.now() / 1000 });

  if (chartsInitialized) {
    setChartBackgroundColors();
    return;
  }

  plotManager.getPlotContainer().setAutoScaleEnabled(true, true);  // toggle autoscaling, with padding

  plotManager.setWillAutoResizeWidth(true, function() {
    return $("#timeseries").width()         // window width
           - $(".y_axis").width()           // Y axis width
           - $("#y_axis_label").height()    // Y axis label
           - 3;                             // grapher and Y axis borders
  });

  //plotManager.getDateAxis().setCursorEnabled(false);

  //plotManager.getDateAxis().setCursorColor("#000000");

  plotManager.setCursorDraggable(false);

  var positionLabels = function() {
    // define a function for positioning a label next to its axis
    var positionLabel = function(labelElementId, yAxisElementId) {
      var yAxisElement = $("#" + yAxisElementId);
      var yAxisWidth = yAxisElement.width();
      var yAxisHeight = yAxisElement.height();

      var yAxisLabelElement = $("#" + labelElementId);
      yAxisLabelElement.width(yAxisElement.height()); // set the width == height since we're rotating
      var yAxisLabelHeight = yAxisLabelElement.height();

      // compute the position of the y-axis label
      var yAxisLabelLeft = Math.round(yAxisWidth + yAxisLabelHeight / 2 - yAxisHeight / 2 + 4);
      var yAxisLabelTop = Math.round(yAxisHeight / 2 - yAxisLabelHeight / 2);
      yAxisLabelElement.css("top", yAxisLabelTop + "px").css("left", yAxisLabelLeft + "px");
    };

    positionLabel('y_axis_label', 'y_axis');
  };

  // set the initial position of the labels
  positionLabels();

  // Handle plot toggling/removing
  $("#grapher_legend").on("click", ".switch2 input, .remove_graph_plot", function(e) {
    var $target = $(e.target);
    var actionType = $target.data("action-type");
    var $elm = $(this).parents("tr").first();

    var plotName = $elm.data("plot-id");
    var plotId = plotName.split("plot_")[1];
    var channelName = $elm.data("channel");

    if (actionType == "toggle-plot") {
      if ($target.prop("checked")) {
        addPlot({feed_id: plotId, pm25_channel: channelName, color: markerTimeseriesPlots[plotName].color});
      } else {
        plotManager.getPlotContainer("plot_container").removePlot(plotName);
      }
    } else if (actionType == "remove-plot") {
      plotManager.getPlotContainer("plot_container").removePlot(plotName);
      $target.parents("tr").remove();
      var color = usedTimSeriesColors.splice(usedTimSeriesColors.indexOf(markerTimeseriesPlots[plotName].color), 1)[0];
      timeSeriesColors.push(color);
      delete markerTimeseriesPlots[plotName];
    }
  });

  setChartBackgroundColors();

  $("#zoomGrapherIn").on("click", function() {
    zoomGrapher(0.7);
  });

  $("#zoomGrapherOut").on("click", function() {
    zoomGrapher(1.3);
  });

  $("#back-arrow-container").on("click", function() {
    timeSeriesModeEnabled = false;
    plotManager.getPlotContainer("plot_container").removeAllPlots();
    markerTimeseriesPlots = {};
    timeSeriesColors.push(usedTimSeriesColors);
    timeSeriesColors.flat();
    $("#graph_legend_content").empty();
    $("#infobar").removeClass("timeseries");
    $("#timeseries").hide();
  });

  var fixedCursorPosition = playbackTimeline.getPlaybackTimeInMs() / 1000;
  plotManager.getDateAxis().setCursorPosition(fixedCursorPosition);

  chartsInitialized = true;
}


// Color chart background based on PM25 levels
function setChartBackgroundColors() {
  var boxen = {};
  var boxenColors = ['#52b947', '#f3ec19', '#f57e20', '#ed1f24', '#991b4f'];
  var boxenConcentrationLevels = [0, 12, 35, 55, 150];

  var boxenCountLevels = [0, 500, 1000, 2000, 4000, 8000];
  var boxenAxisChangeListener = null;

  var isParticleConcentrationChannel = true;
  var isParticleCountChannel = false;
  var isShowingColoredRanges = (isParticleConcentrationChannel || isParticleCountChannel);

  boxen.colors = boxenColors;

  var yAxis = plotManager.getYAxis();
  yAxis.removeAxisChangeListener(boxenAxisChangeListener);
  boxenAxisChangeListener = null;
  if (isParticleConcentrationChannel) {
    boxen.levels = boxenConcentrationLevels;
    yAxis.constrainRangeTo(0, 640, true);
    boxenAxisChangeListener = function() {
      adjustBoxen(boxen, "#plot_container");
    };
    yAxis.addAxisChangeListener(boxenAxisChangeListener);
  } else if (isParticleCountChannel) {
    boxen.levels = boxenCountLevels;
    yAxis.constrainRangeTo(0, 16000, true);
    boxenAxisChangeListener = function() {
      adjustBoxen(boxen, "#plot_container");
    };
    yAxis.addAxisChangeListener(boxenAxisChangeListener);
  } else {
    yAxis.constrainRangeTo(-1 * Number.MAX_VALUE, Number.MAX_VALUE);
  }
  removeBoxen();
  if (isShowingColoredRanges) {
    drawBoxen(boxen, "#plot_container");
    adjustBoxen(boxen, "#plot_container");
  }
  sizeBoxen(boxen, "#plot_container", 0);

  if (!chartsInitialized) {
    $(window).resize(function() {
      sizeBoxen(boxen, "#plot_container", 0);
    });
  }
}


function drawBoxen(boxen, plotArea) {
  removeBoxen();
  var boxTemplate = Handlebars.compile('<div id="level_{{level}}" class="color_box" style="background-color:{{color}}; z-index:{{zIndex}};"></div>');
  boxen.levels.forEach(function(level, index) {
     var boxElement = boxTemplate({
        level : level,
        color : boxen.colors[index],
        zIndex : index - boxen.levels.length
     });
     $(plotArea).prepend(boxElement);
  });
}


function removeBoxen() {
  $('.color_box').remove();
}


function adjustBoxen(boxen, plotArea) {
  if (boxen.levels) {
     var axis = plotManager.getYAxis();
     var plotAreaElement = $(plotArea);
     boxen.levels.forEach(function(level) {
        var range = axis.getRange();
        $("#level_" + level)
              .height((range.max - level) / (range.max - range.min) * plotAreaElement.height())
              .css("max-height", plotAreaElement.height());
     });
  }
}


function sizeBoxen(boxen, plotArea, extra) {
  if (boxen.levels) {
     var plotAreaElement = $(plotArea);
     boxen.levels.forEach(function(level) {
        $("#level_" + level)
              .width(plotAreaElement.width() + extra + 1)
              .css("left", plotAreaElement.css("left"));
     });
  }
}

function zoomGrapher(scale) {
  var dateAxis = plotManager.getDateAxis();
  var range = dateAxis.getRange();
  var min_time = range.min;
  var max_time = range.max;
  var mean_time = (max_time + min_time) / 2;
  var range_half_scaled = scale * (max_time - min_time) / 2;
  dateAxis.setRange(mean_time-range_half_scaled,mean_time+range_half_scaled);
}
