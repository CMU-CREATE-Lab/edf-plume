/**
 * @license
 * Redistribution and use in source and binary forms ...
 *
 * Class for managing material UI
 *
 * Dependencies:
 *  jQuery (http://jquery.com/)
 *
 * Copyright 2019 Carnegie Mellon University. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without modification, are
 * permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this list of
 * conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above copyright notice, this list
 * of conditions and the following disclaimer in the documentation and/or other materials
 * provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY CARNEGIE MELLON UNIVERSITY ''AS IS'' AND ANY EXPRESS OR IMPLIED
 * WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
 * FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL CARNEGIE MELLON UNIVERSITY OR
 * CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
 * ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 * NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF
 * ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * The views and conclusions contained in the software and documentation are those of the
 * authors and should not be interpreted as representing official policies, either expressed
 * or implied, of Carnegie Mellon University.
 *
 * Authors:
 *  Paul Dille (pdille@andrew.cmu.edu)
 *
 */

"use strict";


//
// CODE
//
var create = {};
(function() {
  create.CustomTimeline2 = function(settings) {
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // Class variables
    //

    var captureTimes;
    var numFrames;
    var currentFrameNumber;
    var playbackTimeInMs = 0;
    // Change to make more/less coarse playback
    var incrementAmtInMin = 15;
    // Change how fast it animates. Note that better caching will need to be involved if too low of a value is used.
    var animateIntervalInMs = 1000;
    var seekTooltipState = "none";


    // DOM elements
    var viewerDivId = "playback-timeline-container"
    var $timeline = $("#" + viewerDivId + " .materialTimeline");
    var $timeJumpOptions;
    var $rightSeekControl = $("#" + viewerDivId + " .rightSeekControl");
    var $leftSeekControl = $("#" + viewerDivId + " .leftSeekControl");
    var $timelineTicks;
    var $selectedTimelineTick;
    var startDownX;
    var $customPlay;
    var $anchor;


    // Flags
    var isAnimating = false;
    var animateInterval = null;
    var isTimelineActive = false;
    var isTimelinePaused = true;
    var seekHoldTimeout;
    //var didScroll = false;
    //var scrollEndTimeout = null;
    var mouseDown = false;


    var initPlayPause = function() {
      $customPlay = $(".playbackButton");

      $customPlay.button({
        icons: {
          primary: "ui-icon-custom-play"
        },
        text: false,
        disabled: true
      }).attr({
        "title": "Play"
      }).data("state", "paused");

      $customPlay.on("click", function() {
        if ($(this).data("state") == "playing") {
          handleAnimate(false);
        } else {
          handleAnimate(true);
        }
       });
    };


    var handleAnimate = function(doAnimate) {
      if (isAnimating && doAnimate) return;
      if (doAnimate) {
        animateInterval = setInterval(function() {
          seekControlAction("right");
        }, animateIntervalInMs);
        isAnimating = true;
        seekControlAction("right");
        setPlaybackButtonState("play");
      } else {
        stopAnimate();
      }
    };


    var createTimelineSlider = function() {
      var currentTimelineHTML = "";
      var timeSeekSelectOptionsHTML = "<select id='timeJumpOptions'>";
      captureTimes = [];
      var hour = -1;
      var multipler = 60/incrementAmtInMin;
      var numIntervals = 24*multipler;
      for (var i = 0; i < numIntervals; i++) {
        var min = i % multipler == 0 ? 0 : min + incrementAmtInMin;
        var newHour = i % multipler == 0 ? hour + 1 : hour;
        var hourChange = false;
        if (newHour != hour) {
          hour = i % multipler == 0 ? hour + 1 : hour;
          hourChange = true;
        }
        var TimeStamp24Hour = pad(hour) + ":" + pad(min);
        var TimeStamp12Hour = convertFrom24To12Format(TimeStamp24Hour)
        captureTimes.push(TimeStamp12Hour);
        currentTimelineHTML += "<span class='materialTimelineTick' data-minutes-lapsed='" + (i * incrementAmtInMin) +"' data-increment='" + incrementAmtInMin + "' data-frame='" + i + "'>" + captureTimes[i] + "</span>";
        if (hourChange) {
          timeSeekSelectOptionsHTML += `<option value='${i}'>${TimeStamp12Hour}</option>`;
        }
      }
      numFrames = captureTimes.length;
      $anchor = $("<div class='anchor'><span class='anchorTZ'></span></div>");
      $timeline.append($(currentTimelineHTML), $anchor);
      $playbackTimelineAnchor = $("#playback-timeline-container .anchor");
      timeSeekSelectOptionsHTML += "</select>";
      $("#timeJumpControl").append(timeSeekSelectOptionsHTML);
      $timeJumpOptions = $("#" + viewerDivId + " #timeJumpOptions");
      $timeline.on("mousedown", function(e) {
        mouseDown = true;
        if (typeof(e.pageX) === "undefined") {
          startDownX = e.clientX;
        } else {
          startDownX = e.pageX;
        }
      });

      // TODO
      touchHorizontalScroll($timeline)

      //// TODO: Do we want this only for mobile?
      /*$timeline.on("scroll", function(e) {
        if (!isActive()) return;
        didScroll = true;
        window.clearTimeout(scrollEndTimeout);
        // Set a timeout to run after scrolling ends
        scrollEndTimeout = setTimeout(function() {
          if (mouseDown) return;
          $timeline.trigger("mouseup");
        }, 100);
      });*/


      //// TODO: Do we want this only for mobile?
      /*$timeline.on("mouseup", function(e) {
        e.preventDefault();
        e.stopPropagation();
        mouseDown = false;
        if (didScroll && !isPlaybackTimelineToggling && isPaused()) {
          didScroll = false;
          var selection = document.querySelector(".anchorHighlight");
          var rectSelection = selection.getBoundingClientRect();
          var intersect = [];
          // Iterate over all LI elements.
          [].forEach.call(document.querySelectorAll(".materialTimelineTick"), function(timeTick) {
            var rect = timeTick.getBoundingClientRect();

            if (rect.top + rect.height >= rectSelection.top
              && rect.left + rect.width >= rectSelection.left
              && rect.bottom - rect.height <= rectSelection.bottom
              && rect.right - rect.width <= rectSelection.right) {
                intersect.push(timeTick)
            }
          });
          updateTimelineSlider(null, $(intersect.pop()), false, false, true);
          refocusTimeline();
          return;
        }
        var endDownX;
        if (typeof(e.pageX) === "undefined") {
          endDownX = e.clientX;
        } else {
          endDownX = e.pageX;
        }
        var diff = (startDownX - endDownX);
        var threshold = 10;
        if ((diff + threshold) < 0) {
          // Swiping right actually means going backwards, aka "left"
          seekControlAction("left");
        } else if ((diff - threshold) > 0) {
          // Swiping left actually means going forward, aka "right"
          seekControlAction("right");
        }
      });*/

      $timeline.on("click", ".materialTimelineTick", function() {
        updateTimelineSlider(null, $(this), false, false, true);
      });

      $timelineTicks = $("#" + viewerDivId + " .materialTimelineTick");

      //var startTimeElm = $("#" + viewerDivId + " .rightGroup").find(".materialTimelineTick:first");
      //timelineTickWidth = startTimeElm.outerWidth(true);

      //updateTimelineSlider(0, startTimeElm);

      // TODO: Need pollyfill
      new ResizeObserver(refocusTimeline).observe($(".materialTimeline")[0]);

      //$(window).on("resize", refocusTimeline);
    };


    function updateTimelineSlider(frameNum, timeTick, fromSync, fromRefocus, fromTickOnClickEvent, skipDraw) {
      var numMins = $(timeTick).data("frame") * parseInt($(timeTick).data("increment"));
      var newPlaybackTimeInMs = moment.tz(timeline.selectedDayInMs, selected_city_tmz).add(numMins, 'minutes').valueOf();
      if (newPlaybackTimeInMs == playbackTimeInMs && fromTickOnClickEvent) {
        return;
      }

      if (!fromRefocus) {
        currentFrameNumber = parseInt($(timeTick).data("frame"));
        setPlaybackTimeInMs(newPlaybackTimeInMs);
        if (!skipDraw) {
          handleDraw(playbackTimeInMs);
        }
        setTimezoneText();
        updateTimeJumpMenu();
      }

      if (!timeTick || timeTick.length == 0) {
        timeTick = $selectedTimelineTick.parent().find($('.materialTimelineTick[data-frame="' + frameNum + '"]'));
      }
      if (timeTick.length) {
        $selectedTimelineTick = timeTick;
        if (frameNum == null) {
          frameNum = currentFrameNumber;
        }
        var scrollOptions = {
          time: 200,
          validTarget: function(target) {
            return target === $timeline[0];
          }
        };
        if (fromSync) {
          scrollOptions.ease = null;
          scrollOptions.time = 0;
        }
        $timelineTicks.removeClass("materialTimelineTickSelected");
        $selectedTimelineTick.addClass("materialTimelineTickSelected");
        // Because the timeline isn't an infinite wrap around, once we approach either end of the scrollable area,
        // we no longer can be centered.
        window.scrollIntoView($selectedTimelineTick[0], scrollOptions);
      }
    };

    var setTimezoneText = function() {
      $("#playback-timeline-container .anchorTZ").text("(" + moment.tz(playbackTimeInMs, selected_city_tmz).zoneAbbr() + ")");
    }
    this.setTimezoneText = setTimezoneText;

    var updateTimeJumpMenu = function() {
      // The jump-to menu only shows hours, so we need to snap to the closest hour, rounding down.
      var ignoreSnapTo = (currentFrameNumber / (60 / playbackTimeline.getIncrementAmt())) % 1 == 0;
      var jumpFrame = currentFrameNumber;
      if (!ignoreSnapTo) {
        var m = moment.tz(playbackTimeline.getPlaybackTimeInMs(), selected_city_tmz);
        jumpFrame = captureTimes.indexOf(m.startOf('hour').format("h:mm A"));
      }
      $timeJumpOptions.val(jumpFrame);
    }
    this.updateTimeJumpMenu = updateTimeJumpMenu;

    var createTimeJump = function() {
      $timeJumpOptions.mobileSelect({
        id : "timeJumpOptionSelector",
        title : "Choose an hour to jump to:",
        animation : "none",
        buttonSave : "OK",
        onOpen: function() {
          // Need to delay some amount of time for UI to be ready
          setTimeout(function() {
            $("#timeJumpOptionSelector .mobileSelect-control.selected")[0].scrollIntoView();
          }, 20);
        }
      });
      $timeJumpOptions.on("change", function(e) {
        seekTo($("#timeJumpOptionSelector .mobileSelect-control.selected").data("value"));
      })
    };

    var handleSeekControls = function() {
      $(document).on("touchstart", function() {
        if (seekTooltipState == "shown") {
          if ($leftSeekControl.data('ui-tooltip')) {
            $leftSeekControl.tooltip("disable").tooltip("close");
          } else if ($rightSeekControl.data('ui-tooltip')) {
            $rightSeekControl.tooltip("disable").tooltip("close");
          }
          seekTooltipState = "disabled";
        }
      });

      var jumpToTooltipStr = "You can also press and hold to jump to a specific hour.";

      $leftSeekControl.on("click", function() {
        seekControlAction("left");
        if (seekTooltipState == "none") {
          $(this).tooltip({
            items: $(this),
            position: { my: 'center bottom', at: 'center top-6', collision: "custom" },
            tooltipClass: "bottom",
            content: jumpToTooltipStr
          });
          $(this).tooltip("open");
          seekTooltipState = "shown";
        }
      }).on("mousedown", function() {
        seekHoldTimeout = setTimeout(function() {
          seekHoldTimeout = null;
          $("#timeJumpControl .btn-mobileSelect-gen").trigger("click");
        }, 500)
      }).on("mouseup", function() {
        clearTimeout(seekHoldTimeout)
      }).on("mouseout", function(e) {
        if (seekTooltipState == "shown") {
          var $relatedTarget = $(e.relatedTarget);
          if ($relatedTarget.parent()[0] == this || $relatedTarget[0] == this) return;
          // Disable jquery tooltip. If we use the .tooltip("disable") call, this actually deletes the title attribute.
          $(this).tooltip({ items: [] });
          seekTooltipState = "disabled";
        }
      });

      $rightSeekControl.on("click", function() {
        seekControlAction("right");
        if (seekTooltipState == "none") {
          $(this).tooltip({
            items: $(this),
            position: { my: 'center bottom', at: 'center-80 top-6', collision: "custom" },
            tooltipClass: "bottom-right",
            content: jumpToTooltipStr
          });
          $(this).tooltip("open");
          seekTooltipState = "shown";
        }
      }).on("mousedown", function() {
        seekHoldTimeout = setTimeout(function() {
          seekHoldTimeout = null;
          $("#timeJumpControl .btn-mobileSelect-gen").trigger("click");
        }, 500)
      }).on("mouseup", function() {
        clearTimeout(seekHoldTimeout)
      }).on("mouseout", function(e) {
        if (seekTooltipState == "shown") {
          var $relatedTarget = $(e.relatedTarget);
          if ($relatedTarget.parent()[0] == this || $relatedTarget[0] == this) return;
          // Disable jquery tooltip. If we use the .tooltip("disable") call, this actually deletes the title attribute.
          $(this).tooltip({ items: [] });
          seekTooltipState = "disabled";
        }
      });
    };


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // Public methods
    //

    var stopAnimate = function() {
      clearInterval(animateInterval)
      isAnimating = false;
      setPlaybackButtonState('pause');
    };
    this.stopAnimate = stopAnimate;


    var refocusTimeline = function() {
      if ($selectedTimelineTick) {
        updateTimelineSlider(null, $selectedTimelineTick, false, true);
      }
    };
    this.refocusTimeline = refocusTimeline;


    var seekControlAction = function(direction) {
      if (direction == "left") {
        var $previousTimeTick = $selectedTimelineTick.prev("#" + viewerDivId + " .materialTimelineTick");
        if ($previousTimeTick.length == 0) {
          // We hit the start of the timeline, wrap to the end.
          var $disabledTimes = $selectedTimelineTick.parent().children(".disabled");
          if ($disabledTimes.length > 0) {
            $previousTimeTick = $disabledTimes.first().prev();
          } else {
            $previousTimeTick = $selectedTimelineTick.parent().children("#" + viewerDivId + " .materialTimelineTick").last();
          }
        }
        updateTimelineSlider(null, $previousTimeTick, false);
      } else if (direction == "right") {
        var $nextTimelineTick = $selectedTimelineTick.next("#" + viewerDivId + " .materialTimelineTick");
        if ($nextTimelineTick.length == 0 || $nextTimelineTick.hasClass("disabled")) {
          // We hit the end of the timeline wrap to the start.
          $nextTimelineTick = $selectedTimelineTick.parent().children("#" + viewerDivId + " .materialTimelineTick").first();
        }
        updateTimelineSlider(null, $nextTimelineTick, false);
      }
    };
    this.seekControlAction = seekControlAction;


    var setPlaybackButtonState = function(type) {
      if (type == "pause") {
        $customPlay.button({
          icons: {
            primary: "ui-icon-custom-play"
          },
          text: false
        }).attr({
          "title": "Play"
        }).data("state", "paused");
        isTimelinePaused = true;
      } else if (type == "play") {
        $customPlay.button({
          icons: {
            primary: "ui-icon-custom-pause"
          },
          text: false
        }).attr({
          "title": "Pause"
        }).data("state", "playing");
        isTimelinePaused = false;
      }
    };
    this.setPlaybackButtonState = setPlaybackButtonState;


    var getCaptureTimes = function() {
      return captureTimes;
    };
    this.getCaptureTimes = getCaptureTimes;


    var seekTo = function(frameNum, skipDraw) {
      frameNum |= 0;
      var $newTimelineTick = $timelineTicks.eq(frameNum);
      $timelineTicks.removeClass("materialTimelineTickSelected");
      if ($newTimelineTick.hasClass("disabled")) {
        $newTimelineTick = $selectedTimelineTick.parent().children(".disabled").first().prev();
      }
      $newTimelineTick.addClass("materialTimelineTickSelected");
      updateTimelineSlider(null, $newTimelineTick, true, null, null, skipDraw);
    };
    this.seekTo = seekTo;


    var getNumFrames = function() {
      return numFrames;
    };
    this.getNumFrames = getNumFrames;


    var getPlaybackTimeInMs = function() {
      return playbackTimeInMs;
    };
    this.getPlaybackTimeInMs = getPlaybackTimeInMs;


    var getFrameNumberFromPlaybackTime = function(playbackTimeInMs) {
      var startofDayInMs = moment.tz(timeline.selectedDayInMs, selected_city_tmz).valueOf();
      var timeDiffInMin = (playbackTimeInMs - startofDayInMs) / 60000;
      var newFrameNum = timeDiffInMin/ incrementAmtInMin;
      return newFrameNum;
    }
    this.getFrameNumberFromPlaybackTime = getFrameNumberFromPlaybackTime;


    var setCurrentFrameNumber = function(newFrameNumber) {
      currentFrameNumber = newFrameNumber;
    }
    this.setCurrentFrameNumber = setCurrentFrameNumber;


    var getCurrentFrameNumber = function() {
      if (currentFrameNumber >= 0) {
        return currentFrameNumber;
      } else {
        //var date = moment().tz(selected_city_tmz)
        var roundedDate = roundDate(playbackTimeInMs, moment.duration(15, "minutes"), "floor");
        return captureTimes.indexOf(roundedDate.format('h:mm A'));
      }
    };
    this.getCurrentFrameNumber = getCurrentFrameNumber;


    var getCurrentHumanReadableTime = function() {
      var date = moment(playbackTimeInMs).tz(selected_city_tmz);
      return date.format('h:mm A') + " " + date.zoneAbbr();
    }
    this.getCurrentHumanReadableTime = getCurrentHumanReadableTime;


    var setPlaybackTimeInMs = function(newPlaybackTimeInMs, skipBrowserChangeState) {
      playbackTimeInMs = newPlaybackTimeInMs;
      if (!skipBrowserChangeState) {
        changeBrowserUrlState();
      }
    };
    this.setPlaybackTimeInMs = setPlaybackTimeInMs;


    var isActive = function() {
      return isTimelineActive;
    };
    this.isActive = isActive;


    var setActiveState = function(state) {
      isTimelineActive = state;
      changeBrowserUrlState();
    };
    this.setActiveState = setActiveState;


    var getIncrementAmt = function() {
      return incrementAmtInMin;
    };
    this.getIncrementAmt = getIncrementAmt;


    var isPaused = function() {
      return isTimelinePaused;
    };
    this.isPaused = isPaused;


    var togglePlayPause = function() {
      $customPlay.trigger("click");
    };
    this.togglePlayPause = togglePlayPause;


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // Constructor code
    //

    createTimelineSlider();
    createTimeJump();
    handleSeekControls();
    initPlayPause();
    $('#controls').on(Util.getTransitionEndEventType(), function() {
      isPlaybackTimelineToggling = false;
    });

  };
})();
