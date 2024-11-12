"use strict";

var util = new edaplotjs.Util();
var timeline;
var widgets = new edaplotjs.Widgets();
var $calendar_dialog;
var $calendar_select;
var plume_viz_data;


function getShareQuery(date_str) {
  return "?date=" + date_str;
}

function buildDateIndexMap(data) {
  var m = {};
  for (var k in data) {
    var m_k = {}
    var data_k = data[k]["data"];
    var L = data_k.length;
    for (var i = 0; i < L; i++) {
      var d = data_k[i];
      m_k[d[3]] = L - i - 1;
    }
    m[k] = m_k;
  }
  return m;
}

function initCalendarBtn() {
  // Create the calendar dialog
  $calendar_dialog = widgets.createCustomDialog({
    selector: "#calendar-dialog",
    full_width_button: true,
    show_cancel_btn: false
  });

  // Add event to the calendar button
  $("#calendar-year").on("click", function () {
    //if ($("#controls").hasClass("playbackTimelineOff")) {
      drawCalendar(Object.keys(timeline.calendarYearGroupings));
      $calendar_dialog.dialog("open");
    //}
  });

  // Add event to the calendar select
  $calendar_select = $("#calendar");
  $calendar_select.on("change", function () {
    $calendar_dialog.dialog("close");
    var $selected = $calendar_select.find(":selected");
    var selected_value = $selected.val();
    if (selected_value != -1 && selected_value != timeline.activeYear) {
      timeline.activeYear = selected_value;
      $("#selected_year").text(selected_value)
      defaultTimelineUpdatedCallback(timeline.calendarYearGroupings[selected_value], null);
      handleDraw(playbackTimeline.getPlaybackTimeInMs());
    }
    // Have selector go back to showing default option
    //$(this).prop("selectedIndex", 0);
  });
}

function drawCalendar(year_list) {
  var priorSelectElmVal = $calendar_select.find(":selected").val();
  var $selectedElm;
  $calendar_select.empty();
  $calendar_select.append($('<option value="-1">Select...</option>'));
  for (var i = year_list.length - 1; i >= 0; i--) {
    var year = year_list[i];
    $calendar_select.append($('<option value="' + year + '">' + year + '</option>'));
  }
  if (priorSelectElmVal && priorSelectElmVal != -1) {
    $selectedElm = $calendar_select.find("option[value='" + priorSelectElmVal + "']");
  } else {
    // Select 2nd element, as that is the most recent year of data
    $selectedElm = $calendar_select.children().eq(1);
  }
  $selectedElm.prop("selected","selected");
}

function formatDataForCalendar(data) {
  return Object.entries(data).reduce((result, entry) => {
    var dateStr = entry[0];
    const year = dateStr.split('-')[0];
    if (!result[year]) {
      result[year] = {};
    }
    result[year][entry[0]] = entry[1];
    return result;
  }, {});
}

// Use the TimelineHeatmap charting library to draw the timeline
function createTimeline(data, options) {
  var $timeline_container = $("#timeline-container").empty();
  var chart_settings = {
    click: function ($e) {
      handleTimelineButtonClicked(parseInt($e.data("epochtime_milisec")), $e.data("label"));
      if (typeof(options.clickEvent == "function")) {
        options.clickEvent();
      }
    },
    select: function ($e, obj) {
      handleTimelineButtonSelected(parseInt($e.data("epochtime_milisec")));
    },
    data: data,
    useColorQuantiles: true,
    plotDataWhenCreated: false,
    //changes colorBin based on even division of data
    // These used to be EPA AQI levels (https://www.airnow.gov/aqi/aqi-basics/)
    //[50, 101, 151, 201, 301]
    // Now they are WHO PM2.5 levels
    colorBin: [4.9, 14.9, 54.9, 124.9, 999],
    //colorRange: ["#00ff00", "#ffff00","#ff9900","#ff0000","#9900ff","#680c22"],
    //colorRange: ["#ededed", "#dbdbdb", "#afafaf", "#848383", "#545454", "#000000"],
    columnNames: ["label", "value", "epochtime_milisec", "year"],
    dataIndexForLabels: 0,
    dataIndexForValues: 1,
  };

  timeline = new edaplotjs.TimelineHeatmap("timeline-container", chart_settings);

  // Add horizontal scrolling to the timeline
  // Needed because Android <= 4.4 won't scroll without this
  addTouchHorizontalScroll($timeline_container);
}


function getCurrentSelectedDayInMs() {
  return timeline.selectedDayInMs;
}


async function handleTimelineButtonClicked(epochtime_milisec, day_label) {
  // This method gets called after "handleTimelineButtonSelected"

  timeline.selectedDay = day_label;
  // Change time in URL to newly clicked day
  changeBrowserUrlState();
}

async function handleTimelineButtonSelected(epochtime_milisec) {
  // This method gets called before "handleTimelineButtonClicked"

  if (selected_day_start_epochtime_milisec) {
    previous_selected_day_start_epochtime_milisec = selected_day_start_epochtime_milisec;
  }
  selected_day_start_epochtime_milisec = epochtime_milisec;
  timeline.selectedDayInMs = epochtime_milisec;

  var timeInc;
  var playbackTimeInMs = playbackTimeline.getPlaybackTimeInMs();
  var timeObj = moment.tz(epochtime_milisec, selected_city_tmz);
  var currentDate = moment().tz(selected_city_tmz);
  var currentDateRounded = roundDate(currentDate, moment.duration(playbackTimeline.getIncrementAmt(), "minutes"), "floor");
  if (playbackTimeInMs == 0) {
    timeInc = {hour:currentDateRounded.hour(), minute:currentDateRounded.minute(), second:0, millisecond:0};
  } else {
    var priorTimeObj = moment.tz(playbackTimeInMs, selected_city_tmz);
    var elapsedTimeInMin = Math.min((priorTimeObj.hour() * 60 + priorTimeObj.minute()), (currentDateRounded.hour() * 60 + currentDateRounded.minute()));
    timeInc = {hour:(Math.floor(elapsedTimeInMin / 60) % 24), minute:(elapsedTimeInMin % 60), second:0, millisecond:0};
  }
  var newPlaybackTimeInMs = timeObj.set(timeInc).valueOf();
  playbackTimeline.setPlaybackTimeInMs(newPlaybackTimeInMs, true);
  playbackTimeline.setCurrentFrameNumber(playbackTimeline.getFrameNumberFromPlaybackTime(newPlaybackTimeInMs));
  var mostRecentDayStrFull = timeObj.format("MMM DD YYYY");
  // Update selected day in the legend
  $currentDateLegendText.text(mostRecentDayStrFull);
  // Update timestamp preview displayed under clock button
  $currentClockPreviewTime.text(playbackTimeline.getCurrentHumanReadableTime());

  // Reposition charts so that the selected day is in the center
  // if (plotManager) {
  //   repositionCharts();
  // }
}


/*function hideMarkers(markers) {
  markers = safeGet(markers, []);
  for (var i = 0; i < markers.length; i++) {
    if (typeof markers[i] !== "undefined") {
      markers[i].setMap(null);
      markers[i].reset();
    }
  }
}*/

function initTimeline(options) {
  widgets.setCustomLegend($("#legend"));
  loadAndCreateTimeline(function() {
    $("#timeline-handle").removeClass('force-no-visibility');
    playbackTimeline = new create.CustomTimeline2();
    if (selected_day_start_epochtime_milisec) { // If a day has already been set
      // Pass 'true' to not change browser state.
      playbackTimeline.setPlaybackTimeInMs(options.playbackTimeInMs, true);
      timeline.selectBlockByEpochTime(selected_day_start_epochtime_milisec);
      //timeline.selectedDayInMs = selected_day_start_epochtime_milisec;
    } else { // Otherwise default to last day
      timeline.selectLastBlock();
      //timeline.selectedDayInMs = timeline.getSelectedBlockData().epochtime_milisec;
    }
    $(".timestampPreview").removeClass("disabled");
    $(".playbackButton").button("enable");
    $("#calendar-btn").prop("disabled", false);
  }, options);
}


function generateURL(domain, path, parameters) {
  parameters = safeGet(parameters, {});
  //parameters["client_ids"] = [app_id_smellpgh, app_id_smellmycity];
  if (typeof desired_latlng_bbox !== "undefined") {
    // For example, latlng_bbox=30,-99,40,-88
    // Top-left corner is (30, -99), bottom-right corner is (40,-88)
    parameters["latlng_bbox"] = desired_latlng_bbox;
  }
  if (typeof parameters["timezone_string"] === "undefined") {
    parameters["timezone_string"] = encodeURIComponent(moment.tz.guess(true));
  }
  var api_params = "";
  var parameter_list = [];
  if (typeof parameters == "object") {
    var list = Object.keys(parameters);
    list.forEach(function (i) {
      parameter_list.push(encodeURIComponent(i) + "=" + encodeURIComponent(parameters[i]));
    });
    if (parameter_list.length > 0) {
      api_params += "?" + parameter_list.join("&");
    }
  } else {
    console.log("parameters is not an object");
  }
  return domain + path + api_params;
}

function generateURLForSmellReports(parameters) {
  return generateURL("https://api.smellpittsburgh.org/", "/api/v2/smell_reports", parameters);
}

function generateURLForMaxAvgPM25() {
  return CITY_DATA_ROOT + selectedCity + "/pm25_max_avg_dict.json";
}

function generateURLForAQI() {
  return CITY_DATA_ROOT + selectedCity + "/aqi_dict.json";
}

function generateURLForHourlyAQI() {
  return "https://airnowgovapi.com/andata/ReportingAreas/" + available_cities[selectedCity].airnow_hourly_aqi;
}

function defaultTimelineUpdatedCallback(data, callback) {
  timeline.updateBlocks(formatDataForTimeline(data, null));
  timeline.clearBlockSelection();
  // TODO: When we switch timelines, do we want to load the most recent day for the city or the last day that was explored.
  // If we want the latter, we will need to add more logic to track the last day selected. For now we reset to the last available day
  // and default starting time.
  playbackTimeline.setPlaybackTimeInMs(0, true);
  timeline.selectLastBlock();
  timeline.activeCity = selectedCity;
  if (typeof callback === "function") {
    callback();
  }
  //timeline.selectedDayInMs = timeline.getSelectedBlockData().epochtime_milisec;
}

function loadAndUpdateTimeLine(callback) {
  if (timeline.aqiData[selectedCity]) {
    //console.log('revist')
    timeline.calendarYearGroupings = formatDataForCalendar(timeline.aqiData[selectedCity]);
    timeline.calendarLastYear = Object.keys(timeline.calendarYearGroupings).slice(-1);
    $("#selected_year").text(timeline.calendarLastYear);
    var dataToUse = timeline.calendarYearGroupings[timeline.calendarLastYear];
    defaultTimelineUpdatedCallback(dataToUse, callback);
  } else {
    //console.log('first time')
    loadTimelineData(null, null, function (data) {
      timeline.aqiData[selectedCity] = data;
      timeline.calendarYearGroupings = formatDataForCalendar(data);
      timeline.calendarLastYear = Object.keys(timeline.calendarYearGroupings).slice(-1);
      $("#selected_year").text(timeline.calendarLastYear);
      var dataToUse = timeline.calendarYearGroupings[timeline.calendarLastYear];
      defaultTimelineUpdatedCallback(dataToUse);
      if (typeof callback === "function") {
        callback();
      }
    });
  }
}

function loadAndCreateTimeline(callback, options) {
  // Create the timeline
  // Start and end time are not passed in and will be based on
  // available AQI data
  //console.log('first time ever')
  loadTimelineData(null, null, function (data) {
    var calendarYearGroupings = formatDataForCalendar(data);
    var yearToUse;
    var calendarLastYear = Object.keys(calendarYearGroupings).slice(-1);
    if (options.playbackTimeInMs) {
      yearToUse = moment.tz(options.playbackTimeInMs, selected_city_tmz).format("YYYY");
    } else {
      yearToUse = calendarLastYear;
    }
    $("#selected_year").text(yearToUse);
    var newData = calendarYearGroupings[yearToUse];
    createTimeline(formatDataForTimeline(newData, null), options);
    timeline.activeCity = selectedCity;
    timeline.aqiData = {};
    timeline.aqiData[selectedCity] = data;
    timeline.calendarYearGroupings = calendarYearGroupings;
    timeline.calendarLastYear = calendarLastYear;
    if (typeof(callback) == "function") {
      callback();
      options.initCallback();
    }
  });
}

function loadTimelineData(start_time, end_time, callback) {
  $.ajax({
    "url": generateURLForMaxAvgPM25(),//generateURLForAQI(),
    "success": function (data) {
      callback(data)
      
      // // If the city is marked as active, also pull in data from today, otherwise
      // // only show data that was last cached in the city's corresponding aqi_dict.json.
      // if (available_cities[selectedCity].is_active) {
      //   loadTimelineDataToday(data, callback);
      // } else {
      //   callback(data);
      // }
    },
    "error": function (response) {
      console.log("server error:", response);
    }
  });
}

function loadTimelineDataToday(fullData, callback){
  if (!available_cities[selectedCity].airnow_hourly_aqi) {
    callback(fullData);
    return;
  }
  $.ajax({
    "url": generateURLForHourlyAQI(),
    "dataType": "json",
    "success": function (data) {
      if (typeof callback === "function") {
        var parsed = data;
        // Most recent date and data point
        // The hourly timestamps are actualy in UTC. whereas the daily timestamps
        // show midnight, and are marked as UTC, but are NOT actually UTC midnight.
        var date = parsed["utcDateTimes"].pop() + "Z";
        var mDate = moment(date);
        var startTimeOfDate = moment(date).tz(selected_city_tmz).startOf("day");
        //startOfLatestAvailableDay = startTimeOfDate.tz(selected_city_tmz).valueOf();
        var startTimeOfDateFormatted = startTimeOfDate.format("YYYY-MM-DD HH:mm:ss");
        //mostRecentUpdate12HourTimeForLocation = mDate.clone();
        //if (mDate.minute() > 30){
        //  mostRecentUpdate12HourTimeForLocation = mostRecentUpdate12HourTimeForLocation.tz(DEFAULT_TZ).minute(30).second(0);
        //} else{}
        //mostRecentUpdate12HourTimeForLocation = mostRecentUpdate12HourTimeForLocation.tz(DEFAULT_TZ).format("h:mm A");
        //mostRecentUpdateEpochTimeForLocationInMs = mDate.tz(selected_city_tmz).valueOf();
        //mostRecentDayStr = mDate.tz(DEFAULT_TZ).format("MMM DD");
        var val = parsed["aqi"].pop();
        // We may be missing the previous day. Check and if so, get the max value
        // for the availabe time span.
        var possiblePreviousDayStr = mDate.tz(selected_city_tmz).format("YYYY-MM-DD");
        var possiblePreviousDayTimeStr = possiblePreviousDayStr + " 00:00:00";
        var hasPreviousDayFromCurrent = Object.keys(fullData).some((dayStr) => moment.tz(dayStr, selected_city_tmz).format("YYY-MM-DD").indexOf(possiblePreviousDayStr));
        if (!hasPreviousDayFromCurrent) {
          var max = 0;
          for (var i = 0; i < parsed['aqi'].length; i++) {
            if (parsed['utcDateTimes'][i].indexOf(possiblePreviousDayStr) == -1) {
              break;
            }
            max = Math.max(max, parsed['aqi'][i]);
          }
          fullData[possiblePreviousDayTimeStr] = max;
        }
        fullData[startTimeOfDateFormatted] = val;
        callback(fullData);
      }
    },
    "error": function (response) {
      console.log("server error:", response);
    }
  });
}

/*function preprocessAQIData(raw_data) {
  var days = JSON.parse(raw_data)["utcDateTimes"].map(x => x.split(" ")[0]);
  var aqis = JSON.parse(raw_data)["aqi"];
  var result = {};
  days.forEach((key, i) => result[key] = aqis[i]);
  return result;
}*/

function formatDataForTimeline(data, pad_to_date_obj) {
  //var current_date_obj = new Date();
  //if (pad_to_date_obj.getTime() > current_date_obj.getTime()) {
  //  pad_to_date_obj = current_date_obj;
  //}

  ////data = formatDataForCalendar(data)['2023']

  var batch_3d = []; // 3D batch data
  var batch_2d = []; // the inner small 2D batch data for batch_3d

  var sorted_day_strs = Object.keys(data).sort();
  // TODODO
  //sorted_day_strs = sorted_day_strs.slice(sorted_day_strs.indexOf(available_cities[selectedCity].timeline_start_date + " 00:00:00"));
  var last_month;

  // If no data, exit
  if (sorted_day_strs.length == 0) {
    return;
    //sorted_day_str = [dataObjectToString(new Date())];
  }

  pad_to_date_obj = dateStringToObject(sorted_day_strs[sorted_day_strs.length - 1]);

  // If the first one is not the first day of the month, we need to insert it
  /*if (sorted_day_str.length > 0) {
    var first_str_split = sorted_day_str[0].split("-");
    var first_day = parseInt(first_str_split[2]);
    if (first_day != 1) {
      var first_year = parseInt(first_str_split[0]);
      var first_month = parseInt(first_str_split[1]);
      var k = first_year + "-" + String(first_month).padStart(2, "0") + "-01 00:00:00";
      sorted_day_str.unshift(k);
    }
  }*/

  for (var i = 0; i < sorted_day_strs.length; i++) {
    // Get current day and count
    var day_str = sorted_day_strs[i];
    var day_obj = dateStringToObject(day_str);
    //var count = parseInt(safeGet(data[day_str], 0));
    // We have an array of values, not just a single value
    // It's also never been counts here but rather air quality values (AQI, [max,average pm2.5 for a domain], etc)
    var count = data[day_str];
    // Check if we need to push the 2D array to 3D, and empty the 2D array
    var month = day_obj.getMonth();
    if (typeof last_month === "undefined") {
      last_month = month;
    } else {
      if (last_month != month) {
        batch_3d.push(batch_2d);
        batch_2d = [];
        last_month = month;
      }
    }
    // Push into the 2D array
    var m = moment.tz(day_obj, selected_city_tmz);
    var label = m.format("MMM DD");
    var day_obj_time = m.valueOf();
    var year = m.year();
    batch_2d.push([label, count, day_obj_time, year]);
    // Check if we need to pad missing days of the future
    var next_day_obj;
    if (i < sorted_day_strs.length - 1) {
      next_day_obj = dateStringToObject(sorted_day_strs[i + 1]);
    } else {
      next_day_obj = pad_to_date_obj; // future date is the next date
    }
    var diff_days = getDiffDays(day_obj, next_day_obj);
    // TODODO: Come back here; temp disabled
    // Push missing days into the 2D array if necessary
    // if (diff_days > 1) {
    //   for (var j = 1; j < diff_days; j++) {
    //     // Number of miliseconds in a day
    //     var day_obj_time_j = day_obj_time + 86400000 * j;
    //     var day_obj_j = new Date(day_obj_time_j);
    //     var label_j = day_obj_j.toDateString().split(" ");
    //     label_j = label_j[1] + " " + label_j[2];
    //     batch_2d.push([label_j, 0, day_obj_time_j]);
    //   }
    //}
  }
  if (batch_2d.length > 0) batch_3d.push(batch_2d);
  return batch_3d;
}

// Compute the difference of the number of days of two date objects
// Notice that d2 must be larger than d1
function getDiffDays(d1, d2) {
  return moment(d2).clone().startOf('day').diff(moment(d1).clone().startOf('day'), 'days');

  /*// Need to subtract timezone offset for daylight saving issues
  var d2_time = d2.getTime() - d2.getTimezoneOffset() * 60000;
  var d1_time = d1.getTime() - d1.getTimezoneOffset() * 60000;
  return Math.ceil((d2_time - d1_time) / 86400000);*/
}

function dateStringToObject(str, tz) {
  tz = tz ? tz : getSelectedCityTZ();
  return moment.tz(str, tz).toDate();
  /*var str_split = str.split("-");
  var year = parseInt(str_split[0]);
  var month = parseInt(str_split[1]);
  var day = parseInt(str_split[2]);
  return new Date(year, month - 1, day)*/
}

/*function dataObjectToString(date_obj) {
  return moment(date_obj).format("YYYY-MM-DD");
  //var year = date_obj.getFullYear();
  //var month = date_obj.getMonth() + 1;
  //var day = date_obj.getDate();
  //return year + "-" + month + "-" + day;
}*/

/*function isMobile() {
  var useragent = navigator.userAgent;
  return useragent.indexOf("iPhone") != -1 || useragent.indexOf("Android") != -1;
}*/

function addTouchHorizontalScroll(elem) {
  var scrollStartPos, startTime, endTime, newPos, startTouchX, endTouchX;
  $(elem).on("touchstart", function (e) {
    startTime = new Date().getTime();
    newPos = 0;
    endTouchX = null;
    startTouchX = e.originalEvent.touches[0].pageX;
    scrollStartPos = this.scrollLeft + startTouchX;
    e.preventDefault();
  }).on("touchmove", function (e) {
    endTouchX = e.originalEvent.touches[0].pageX;
    newPos = scrollStartPos - endTouchX;
    this.scrollLeft = newPos;
    e.preventDefault();
  });/*.on("touchend touchcancel", function (e) {
    // TODO: Flick/swip ability
    //endTime = new Date().getTime();
    //if (endTouchX && endTime - startTime < 100) {
    //  var flickVal = 200 * Math.abs(newPos - scrollStartPos) / (endTime - startTime);
    //  if (endTouchX > startTouchX) flickVal *= -1;
    //  this.scrollLeft = this.scrollLeft + flickVal;
    //}
  });*/
}

/*function unique(array) {
  return array.filter(function (item, i, ar) {
    return ar.indexOf(item) === i;
  })
}*/

// Is dictionary empty
/*function isDictEmpty(dict) {
  return Object.keys(dict).length === 0;
}*/

// Get the end day of the current month
/*function firstDayOfNextMonth(date_obj) {
  return new Date(date_obj.getFullYear(), date_obj.getMonth() + 1, 1);
}*/

// Get the first day of the previous month
/*function firstDayOfPreviousMonth(date_obj) {
  return new Date(date_obj.getFullYear(), date_obj.getMonth() - 1, 1);
}*/

// Get the first day of the current month
/*function firstDayOfCurrentMonth(date_obj) {
  return new Date(date_obj.getFullYear(), date_obj.getMonth(), 1);
}*/

// Check if a string yyyy-mm-dd is a valid date
/*function isValidDate(date_string) {
  var reg_ex = /^\d{4}-\d{2}-\d{2}$/;
  if (!date_string.match(reg_ex)) return false; // invalid format
  var d = new Date(date_string);
  var d_time = d.getTime();
  if (!d_time && d_time !== 0) return false; // NaN value, invalid date
  return d.toISOString().slice(0, 10) === date_string;
}*/

// Month here is 1-indexed (January is 1, February is 2, etc). This is
// because we are using 0 as the day so that it returns the last day
// of the last month, so you have to add 1 to the month number
// so it returns the correct amount of days
/*function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}*/

// Check if the date object is the current month in the real-world time
/*function isCurrentMonth(date_obj) {
  var now = new Date();
  if (now.getFullYear() == date_obj.getFullYear() && now.getMonth() == date_obj.getMonth()) {
    return true;
  } else {
    return false;
  }
}*/
