
    var util = new edaplotjs.Util();
    var timeline;
    var date_to_index;
    var current_date = "2020-11-29"; // the default date
    var current_year = current_date.split("-")[0];
    var widgets = new edaplotjs.Widgets();
    var $calendar_dialog;
    var $calendar_select;
    var plume_viz_data;

    // Handles the sending of cross-domain iframe requests.
    function post(type, data) {
      pm({
        target: window.parent,
        type: type,
        data: data,
        origin: document.referrer
      });
    }

    // Send the query string to the parent page, so that the parent can set the query string
    function sendQueryStringToParent(updated_query_url) {
      //post("update-parent-query-url", updated_query_url);
    }

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
      $("#calendar-btn").on("click", function () {
        if ($("#controls").hasClass("playbackTimelineOff")) {
          $calendar_dialog.dialog("open");
        }
      });

      // Add event to the calendar select
      $calendar_select = $("#calendar");
      $calendar_select.on("change", function () {
        $calendar_dialog.dialog("close");
        var $selected = $calendar_select.find(":selected");
        var selected_value = $selected.val();
        if (selected_value != -1 && selected_value != current_year) {
          current_year = selected_value;
          createTimeline(plume_viz_data[current_year]);
          timeline.selectFirstBlock();
        }
        // Have selector go back to showing default option
        $(this).prop("selectedIndex", 0);
      });
    }

    function drawCalendar(year_list) {
      $calendar_select.empty();
      $calendar_select.append($('<option selected value="-1">Select...</option>'));
      for (var i = year_list.length - 1; i >= 0; i--) {
        var year = year_list[i];
        $calendar_select.append($('<option value="' + year + '">' + year + '</option>'));
      }
    }

// Use the TimelineHeatmap charting library to draw the timeline
function createTimeline(data) {
  var $timeline_container = $("#timeline-container").empty();
  var chart_settings = {
    click: function ($e) {
      handleTimelineButtonClicked(parseInt($e.data("epochtime_milisec")));
      // TODO
      timeline.selectedDayInMs = $("#timeline-container .selected-block").data('epochtime_milisec');
      if (timeline.selectedDayInMs == startOfCurrentDateInMilisec) {
        $(".timestampPreview").text(currentHourString);
      } else {
        $(".timestampPreview").text("00:00");
      }
    },
    select: function ($e, obj) {
      // Update selected day in the legend
      $("#selected-day").html(String(new Date($e.data("epochtime_milisec"))).substr(4, 11));
      handleTimelineButtonSelected(parseInt($e.data("epochtime_milisec")));
      sendQueryStringToParent(obj);
    },
    data: data,
    useColorQuantiles: true,
    plotDataWhenCreated: false,
    //changes colorBin based on even division of data
    // 40 would not work as far to many days are over 40
    // like the whole bar would be black
    //colors are made to be similar to existing chart
    colorBin: [0, 16, 32, 46, 77, 183],
    colorRange: ["#ededed", "#dbdbdb", "#afafaf", "#848383", "#545454", "#000000"],
    columnNames: ["label", "value", "epochtime_milisec"],
    dataIndexForLabels: 0,
    dataIndexForValues: 1,
  };

  timeline = new edaplotjs.TimelineHeatmap("timeline-container", chart_settings);
  timeline.selectLastBlock();
  timeline.selectedDayInMs = $("#timeline-container .selected-block").data('epochtime_milisec');
   


  // Add horizontal scrolling to the timeline
  // Needed because Android <= 4.4 won't scroll without this
  addTouchHorizontalScroll($timeline_container);
}

function getCurrentSelectedDayInMs() {
  return timeline.selectedDayInMs;
}


function handleTimelineButtonClicked(epochtime_milisec) {

}

function handleTimelineButtonSelected(epochtime_milisec) {
  infowindow_smell.close();
  infowindow_PM25.close();
  hideSensorMarkersByTime(current_epochtime_milisec);
  showSensorMarkersByTime(epochtime_milisec);
  current_epochtime_milisec = epochtime_milisec;
}


function hideSensorMarkersByTime(epochtime_milisec) {
  if (typeof epochtime_milisec === "undefined") return;
  var r = sensors_cache[epochtime_milisec];
  if (typeof r == "undefined") return;
  hideMarkers(r["markers"]);
}

function hideMarkers(markers) {
  markers = safeGet(markers, []);
  for (var i = 0; i < markers.length; i++) {
    if (typeof markers[i] !== "undefined") {
      markers[i].setMap(null);
      markers[i].reset();
    }
  }
}


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
      });
    }

    function initTimeline() {
      widgets.setCustomLegend($("#legend"));
        //loadInitialTimeLine();
        loadAndCreateTimeline(function() {
          $("#calendar-btn").prop("disabled", false)
          $(".timestampPreview").removeClass("disabled");
          $(".playbackButton").button("enable");
        });
        // Set the calendar button eventss
        initCalendarBtn();
    }


    function generateURL(domain, path, parameters) {
      parameters = safeGet(parameters, {});
      // TODO: Ignore bay area related results for now
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


    function getInitialTimeRange() {
      // The starting time is the first day of the year
      var start_time = new Date(new Date().getFullYear(), 0, 1).getTime()
      // The ending time is the current time
      var end_time = Date.now();
      return {
        "start_time": start_time,
        "end_time": end_time
      };
    }

    function loadInitialTimeLine(callback) {
      var T = getInitialTimeRange();
      loadAndUpdateTimeLine(T["start_time"], T["end_time"], callback);
    }

    function loadAndUpdateTimeLine(start_time, end_time, callback) {
      loadTimelineData(start_time, end_time, function (data) {
        timeline.updateBlocks(formatDataForTimeline(data, new Date(end_time)));
        timeline.clearBlockSelection();
        timeline.selectLastBlock();
        if (typeof callback === "function") {
          callback();
        }
      });
    }

    function loadAndCreateTimeline(callback) {
      // Create the timeline
      var T = getInitialTimeRange();
      loadTimelineData(T["start_time"], T["end_time"], function (data) {
        createTimeline(formatDataForTimeline(data, new Date(T["end_time"])));
        if (typeof(callback) == "function") {
          callback();
        }
      });
    }

    function loadTimelineData(start_time, end_time, callback) {
      $.ajax({
        "url": generateURLForSmellReports({
          "group_by": "day",
          "aggregate": "true",
          "smell_value": "3,4,5",
          "start_time": parseInt(start_time / 1000).toString(),
          "end_time": parseInt(end_time / 1000).toString()
        }),
        "success": function (data) {
          if (typeof callback === "function") {
            if (isDictEmpty(data)) {
              // Fill out data if empty
              var dt = new Date(start_time);
              var k = dt.getFullYear() + "-" + ("0" + (dt.getMonth() + 1)).slice(-2) + "-" + ("0" + dt.getDate()).slice(-2);
              data[k] = 0;
            }
            callback(data);
          }
        },
        "error": function (response) {
          console.log("server error:", response);
        }
      });
    }

    function formatDataForTimeline(data, pad_to_date_obj) {
      var current_date_obj = new Date();
      if (pad_to_date_obj.getTime() > current_date_obj.getTime()) {
        pad_to_date_obj = current_date_obj;
      }
      var batch_3d = []; // 3D batch data
      var batch_2d = []; // the inner small 2D batch data for batch_3d
      var sorted_day_str = Object.keys(data).sort();
      var last_month;

      // If no data, need to add the current day to the list
      if (sorted_day_str.length == 0) {
        sorted_day_str = [dataObjectToString(new Date())];
      }

      // If the first one is not the first day of the month, we need to insert it
      if (sorted_day_str.length > 0) {
        var first_str_split = sorted_day_str[0].split("-");
        var first_day = parseInt(first_str_split[2]);
        if (first_day != 1) {
          var first_year = parseInt(first_str_split[0]);
          var first_month = parseInt(first_str_split[1]);
          var k = first_year + "-" + first_month + "-01";
          sorted_day_str.unshift(k);
        }
      }

      for (var i = 0; i < sorted_day_str.length; i++) {
        // Get current day and count
        var day_str = sorted_day_str[i];
        var day_obj = dateStringToObject(day_str);
        var count = parseInt(safeGet(data[day_str], 0));
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
        var label = day_obj.toDateString().split(" ");
        label = label[1] + " " + label[2];
        var day_obj_time = day_obj.getTime();
        batch_2d.push([label, count, day_obj_time]);
        // Check if we need to pad missing days of the future
        var next_day_obj;
        if (i < sorted_day_str.length - 1) {
          next_day_obj = dateStringToObject(sorted_day_str[i + 1]);
        } else {
          next_day_obj = pad_to_date_obj; // future date is the next date
        }
        var diff_days = getDiffDays(day_obj, next_day_obj);
        // Push missing days into the 2D array if necessary
        if (diff_days > 1) {
          for (var j = 1; j < diff_days; j++) {
            var day_obj_time_j = day_obj_time + 86400000 * j;
            var day_obj_j = new Date(day_obj_time_j);
            var label_j = day_obj_j.toDateString().split(" ");
            label_j = label_j[1] + " " + label_j[2];
            batch_2d.push([label_j, 0, day_obj_time_j]);
          }
        }
      }
      if (batch_2d.length > 0) batch_3d.push(batch_2d);
      return batch_3d;
    }

    // Compute the difference of the number of days of two date objects
    // Notice that d2 must be larger than d1
    function getDiffDays(d1, d2) {
      // Need to subtract timezone offset for daylight saving issues
      var d2_time = d2.getTime() - d2.getTimezoneOffset() * 60000;
      var d1_time = d1.getTime() - d1.getTimezoneOffset() * 60000;
      return Math.ceil((d2_time - d1_time) / 86400000);
    }



    function roundTo(val, n) {
      var d = Math.pow(10, n);
      return Math.round(parseFloat(val) * d) / d;
    }

    function dateStringToObject(str) {
      var str_split = str.split("-");
      var year = parseInt(str_split[0]);
      var month = parseInt(str_split[1]);
      var day = parseInt(str_split[2]);
      return new Date(year, month - 1, day);
    }

    function dataObjectToString(date_obj) {
      var year = date_obj.getFullYear();
      var month = date_obj.getMonth() + 1;
      var day = date_obj.getDate();
      return year + "-" + month + "-" + day;
    }

    function isMobile() {
      var useragent = navigator.userAgent;
      return useragent.indexOf("iPhone") != -1 || useragent.indexOf("Android") != -1;
    }

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
      }).on("touchend touchcancel", function (e) {
        // TODO: Flick/swip ability
        //endTime = new Date().getTime();
        //if (endTouchX && endTime - startTime < 100) {
        //  var flickVal = 200 * Math.abs(newPos - scrollStartPos) / (endTime - startTime);
        //  if (endTouchX > startTouchX) flickVal *= -1;
        //  this.scrollLeft = this.scrollLeft + flickVal;
        //}
      });
    }

    function unique(array) {
      return array.filter(function (item, i, ar) {
        return ar.indexOf(item) === i;
      })
    }

    // Is dictionary empty
    function isDictEmpty(dict) {
      return Object.keys(dict).length === 0;
    }

    // Get the end day of the current month
    function firstDayOfNextMonth(date_obj) {
      return new Date(date_obj.getFullYear(), date_obj.getMonth() + 1, 1);
    }

    // Get the first day of the previous month
    function firstDayOfPreviousMonth(date_obj) {
      return new Date(date_obj.getFullYear(), date_obj.getMonth() - 1, 1);
    }

    // Get the first day of the current month
    function firstDayOfCurrentMonth(date_obj) {
      return new Date(date_obj.getFullYear(), date_obj.getMonth(), 1);
    }

    // Check if a string yyyy-mm-dd is a valid date
    function isValidDate(date_string) {
      var reg_ex = /^\d{4}-\d{2}-\d{2}$/;
      if (!date_string.match(reg_ex)) return false; // invalid format
      var d = new Date(date_string);
      var d_time = d.getTime();
      if (!d_time && d_time !== 0) return false; // NaN value, invalid date
      return d.toISOString().slice(0, 10) === date_string;
    }

    // Month here is 1-indexed (January is 1, February is 2, etc). This is
    // because we are using 0 as the day so that it returns the last day
    // of the last month, so you have to add 1 to the month number
    // so it returns the correct amount of days
    function daysInMonth(year, month) {
      return new Date(year, month, 0).getDate();
    }

    // Check if the date object is the current month in the real-world time
    function isCurrentMonth(date_obj) {
      var now = new Date();
      if (now.getFullYear() == date_obj.getFullYear() && now.getMonth() == date_obj.getMonth()) {
        return true;
      } else {
        return false;
      }
}