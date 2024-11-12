var heatmapModeEnabled = false;
// store in a more general global state var?
var wasTraxEnabled = false;

function handleHeatmapMode() {
  // TODO: Do we want custom more-info button for heatmaps?
  $(".more-info-grapher").hide();

  if (overlay) {
    overlay.setMap(null);
    overlay.setData({});
    worldMask.setAllVisible(false);
    // Default zIndex for marker layer pane
    map.getMapPanes().markerLayer.style.zIndex = 103;
  }

  if (selectedSensorMarker && typeof(selectedSensorMarker.getData().graphable_channel) == "string") {
    $("#infobar-content .chart-btn").trigger("click");
    $("#heatmap input[name='date-picker-selector']:checked").trigger("click");
  }

  handleControlsUI("disable");

  showSensorMarkersByTime(playbackTimeline.getPlaybackTimeInMs());
  if ($traxToggle.prop("checked")) {
    wasTraxEnabled = true;
    $traxToggle.trigger("click");
  }
  $traxToggle.parent().addClass("disabled");
}


function hideHeatmapUI() {
  heatmapModeEnabled = false;
  $("#heatmap").hide();
  $("#heatmap-dates").val("");
  if (wasTraxEnabled) {
    wasTraxEnabled = false;
    $traxToggle.trigger("click");
  }
  $traxToggle.parent().removeClass("disabled");
}


function initHeatmapListeners() {
  $("input[name='date-picker-selector']").on("click", function() {
    if ($(this).prop("id") == "manual-collection-radio") {
      if (timeSeriesModeEnabled) {
        $("#timeseries").show();
        $(window).trigger("resize");
      }
    } else {
      if (timeSeriesModeEnabled) {
        $("#timeseries").hide();
      }
    }
  });
}


function getPrettyRanges(array, type) {
  var dayOfWeekMapping = {
    "0" : "Mon",
    "1" : "Tue",
    "2" : "Wed",
    "3" : "Thur",
    "4" : "Fri",
    "5" : "Sat",
    "6" : "Sun"
  };

  var monthMapping = {
    "1" : "January",
    "2" : "February",
    "3" : "March",
    "4" : "April",
    "5" : "May",
    "6" : "June",
    "7" : "July",
    "8" : "August",
    "9" : "September",
    "10" : "October",
    "11" : "November",
    "12" : "December"
  };

  if (type == "dayofweek") {
    mapping = dayOfWeekMapping;
  } else if (type == "month") {
    mapping = monthMapping;
  }

  var output = [];
  for (var range of array) {
    var prettyRange;
    var splitRange = range.split("-");
    if (splitRange.length == 1) {
      prettyRange = [mapping[splitRange[0]]];
    } else {
      prettyRange = [mapping[splitRange[0]] + "-" + mapping[splitRange[1]]];
    }
    output.push(prettyRange);
  }
  return output;
}


function getNumberRanges(array) {
  array = array.sort((a, b) => (a - b));
  var ranges = [], rstart, rend;
  for (var i = 0; i < array.length; i++) {
    rstart = array[i];
    rend = rstart;
    while (array[i + 1] - array[i] == 1) {
      rend = array[i + 1]; // increment the index if the numbers sequential
      i++;
    }
    ranges.push(rstart == rend ? rstart +'' : rstart + '-' + rend);
  }
  return ranges;
}


function computeRRule() {
  var m_startDateTime = moment.tz($("#datetimepicker-start").val(), "MM/DD/yyyy h A", selected_city_tmz);
  var m_endDateTime = moment.tz($("#datetimepicker-end").val(), "MM/DD/yyyy h A", selected_city_tmz).subtract(1, "hour");

  var months_between = Array.from({ length: m_endDateTime.diff(m_startDateTime, 'month') + 1 }, (_, index) =>
    moment.tz(m_startDateTime, selected_city_tmz).add(index, 'month').format('M'),
  );

  // Disable days, months, hours that are not in the range of the start/end above
  $("#month input[name='bymonth']").prop("disabled", false);
  $("#month input[name='bymonth']").filter(function() {
    return !months_between.includes(this.value);
  }).prop("disabled", true);

  var months = $("#month input[name='bymonth']:checked:not(:disabled)").toArray().map(e => parseInt(e.value));

  var days_between = Array.from({ length: m_endDateTime.diff(m_startDateTime, 'day') + 1 }, (_, index) =>
    moment.tz(m_startDateTime, selected_city_tmz).add(index, 'day').format('ddd')
  );
  days_between = [...new Set(days_between)];
  var day_mapping = {"RRule.MO" : "Mon", "RRule.TU" : "Tue", "RRule.WE": "Wed", "RRule.TH" : "Thu", "RRule.FR" : "Fri", "RRule.SA" : "Sat", "RRule.SU" : "Sun"};
  $("#dayofweek input[name='byweekday']").prop("disabled", false);
  $("#dayofweek input[name='byweekday']").filter(function() {
    return !days_between.includes(day_mapping[this.value]);
  }).prop("disabled", true);

  var daysOfWeek = $("#dayofweek input[name='byweekday']:checked:not(:disabled)").toArray().map(e => eval(e.value));
  var daysOfWeekNums = $("#dayofweek input[name='byweekday']:checked:not(:disabled)").toArray().map(e => eval(e.value).weekday);

  // TODO: This could be done in a more optimized way, rather than producing so many duplicate hours
  var hours_between = Array.from({ length: m_endDateTime.diff(m_startDateTime, 'hour') + 1}, (_, index) =>
    moment.tz(m_startDateTime, selected_city_tmz).add(index, 'hour').format('H'),
  );
  hours_between = [...new Set(hours_between)];
  $("#hour input[name='byhour']").prop("disabled", false);
  $("#hour input[name='byhour']").filter(function() {
    return !hours_between.includes(this.value);
  }).prop("disabled", true);

  var frequencyRRule = $("#frequency").val();
  var isHourly = frequencyRRule == "RRule.HOURLY";
  var hours = $("#hour input:checked:not(:disabled)").map((_, checkbox) => parseInt(checkbox.value)).toArray();

  var intervals = parseInt($("#interval").val());

  var rule = new RRule({
    freq: eval($("#frequency").val()),
    interval: intervals,
    dtstart: new Date(Date.UTC(m_startDateTime.year(), m_startDateTime.month(), m_startDateTime.date(), m_startDateTime.hour(), 0, 0)),
    until: new Date(Date.UTC(m_endDateTime.year(), m_endDateTime.month(), m_endDateTime.date(), m_endDateTime.hour(), 0, 0)),
    byweekday: daysOfWeek,
    bymonth: months,
    tzid: selected_city_tmz,
    byhour: hours
  });

  $("#rrule-str").val(encodeURIComponent(rule.toString()));
  var message = currentLang.infobar.heatmap.selectedFrequencyMsg.t1.content + " ";
  message += m_startDateTime.format("MMMM DD, yyyy");
  message += " " + currentLang.infobar.heatmap.selectedFrequencyMsg.t2.content + " " + m_startDateTime.format("h A");
  if (isHourly) {
    if (intervals == 1) {
      message += " " + currentLang.infobar.heatmap.selectedFrequencyMsg.t3.content;
    } else {
      message += " " + currentLang.infobar.heatmap.selectedFrequencyMsg.t4.content + " " + intervals + " " + currentLang.infobar.heatmap.selectedFrequencyMsg.t5.content;
    }
    if (daysOfWeek.length < 7) {
      message += " " + currentLang.infobar.heatmap.selectedFrequencyMsg.t6.content + " " + getPrettyRanges(getNumberRanges(daysOfWeekNums), "dayofweek");
    }
    if (months.length < 12) {
      message += " " + currentLang.infobar.heatmap.selectedFrequencyMsg.t7.content + " " + getPrettyRanges(getNumberRanges(months), "month");
    }
  } else if (frequencyRRule == "RRule.DAILY") {
    if (intervals == 1) {
      message += " " + currentLang.infobar.heatmap.selectedFrequencyMsg.t8.content;
    } else {
      message += " " + currentLang.infobar.heatmap.selectedFrequencyMsg.t4.content + " " + intervals + " " + currentLang.infobar.heatmap.selectedFrequencyMsg.t9.content;
    }
    message += " " + currentLang.infobar.heatmap.selectedFrequencyMsg.t10.content + " " + getNumberRanges(hours);
    if (daysOfWeek.length < 7) {
      message += " " + currentLang.infobar.heatmap.selectedFrequencyMsg.t6.content + " " + getPrettyRanges(getNumberRanges(daysOfWeekNums), "dayofweek");
    }
    if (months.length < 12) {
      message += " " + currentLang.infobar.heatmap.selectedFrequencyMsg.t7.content + " " + getPrettyRanges(getNumberRanges(months), "month");
    }
  } else if (frequencyRRule == "RRule.WEEKLY") {
    if (intervals == 1) {
      message += " " + currentLang.infobar.heatmap.selectedFrequencyMsg.t11.content;
    } else {
      message += " " + currentLang.infobar.heatmap.selectedFrequencyMsg.t4.content + intervals + " " + currentLang.infobar.heatmap.selectedFrequencyMsg.t12.content;
    }
    message += " " + currentLang.infobar.heatmap.selectedFrequencyMsg.t15.content + " " + getNumberRanges(hours);
    if (daysOfWeek.length < 7) {
      message += " " + currentLang.infobar.heatmap.selectedFrequencyMsg.t6.content + " " + getPrettyRanges(getNumberRanges(daysOfWeekNums), "dayofweek");
    }
    if (months.length < 12) {
      message += " " + currentLang.infobar.heatmap.selectedFrequencyMsg.t7.content + " " + getPrettyRanges(getNumberRanges(months), "month");
    }
  } else if (frequencyRRule == "RRule.MONTHLY") {
    if (intervals == 1) {
      message += " " + currentLang.infobar.heatmap.selectedFrequencyMsg.t13.content;
    } else {
      message += " " + currentLang.infobar.heatmap.selectedFrequencyMsg.t4.content + " " + intervals + " " + currentLang.infobar.heatmap.selectedFrequencyMsg.t14.content;
    }
    message += " " + currentLang.infobar.heatmap.selectedFrequencyMsg.t10.content + getNumberRanges(hours);
    if (daysOfWeek.length < 7) {
      message += " " + currentLang.infobar.heatmap.selectedFrequencyMsg.t6.content + " " + getPrettyRanges(getNumberRanges(daysOfWeekNums), "dayofweek");
    }
    if (months.length < 12) {
      message += " " + currentLang.infobar.heatmap.selectedFrequencyMsg.t7.content + " " + getPrettyRanges(getNumberRanges(months), "month");
    }
  }

  message += " " + currentLang.infobar.heatmap.selectedFrequencyMsg.t15.content + " " + m_endDateTime.format("MMMM DD, yyyy");
  message += " " + currentLang.infobar.heatmap.selectedFrequencyMsg.t16.content + " " + m_endDateTime.format("h A");

  message += "<br><br>";

  var numDates;
  if (months.length == 0 || daysOfWeek.length == 0 || hours.length == 0) {
    numDates = 0;
    message = "";
    $("#get-heatmap").addClass("disabled");
    $("#get-heatmap-button-container").addClass("disabled-cursor");
  } else {
    numDates = rule.all().length;
    $("#get-heatmap").removeClass("disabled");
    $("#get-heatmap-button-container").removeClass("disabled-cursor");
  }

  message += numDates + " " + currentLang.infobar.heatmap.selectedFrequencyMsg.t17.content;
  return message;
}
