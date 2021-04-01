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

    // Parameters
    var captureTimes;
    var numFrames;
    var currentFrameNumber;
    var playbackTimeInMs = 0;
    // Change to make more/less coarse playback
    var incrementAmtInMin = 15;
    // Change how fast it animates. Note that better caching will need to be involved if too low of a value is used.
    var animateIntervalInMs = 1000;

    // DOM elements
    var viewerDivId = "playback-timeline-container"
    var $timeline = $("#" + viewerDivId + " .materialTimeline");
    //var $speedControls = $("#" + viewerDivId + " #speedControlOptions");
    var $timeJumpOptions;
    var $rightSeekControl = $("#" + viewerDivId + " .rightSeekControl");
    var $leftSeekControl = $("#" + viewerDivId + " .leftSeekControl");
    //var $materialNowViewingContainer = $("#" + viewerDivId + " .materialNowViewingContainer");
    //var $materialNowViewingContent = $("#" + viewerDivId + " .materialNowViewingContent");
    //var $materialNowViewingText = $("#" + viewerDivId + " .materialNowViewingText");
    //var $materialNowViewingClose = $("#" + viewerDivId + " .materialNowViewingContent .close");
    var $timelineTicks;
    var $selectedTimelineTick;
    //var $shareButton = $("#" + viewerDivId + " .share");
    //var $timelineDisabledContainer = $("#" + viewerDivId + " .materialTimelineDisabled");
    //var $waypointDrawerContainerToggle = $("#" + viewerDivId + " .waypointDrawerContainerToggle");
    var timelineGroupHTML = "";
    var timelineGroupSeparator = "<span class='materialTimelineDivider'>&#8226;</span>";
    var leftTimelineGroupWidth;
    var timelineTickWidth;
    var lastSelectedGroup;
    var startDownX;
    var $customPlay;
    var $anchor;



    // Flags
    var addedTimelineSliderListener = false;
    var lastFrameWasGroupEnd = false;
    var isAnimating = false;
    var animateInterval = null;
    var isTimelineActive = false;
    var isTimelinePaused = true;
    var seekHoldTimeout;
    var didScroll = false;
    var scrollEndTimeout = null;
    var mouseDown = false;
    var seekTooltipState = "none";


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
        currentTimelineHTML += "<span class='materialTimelineTick' data-increment='" + incrementAmtInMin + "' data-frame='" + i + "'>" + captureTimes[i] + "</span>";
        if (hourChange) {
          timeSeekSelectOptionsHTML += `<option value='${i}'>${TimeStamp12Hour}</option>`;
        }
      }
      numFrames = captureTimes.length;
      timelineGroupHTML = currentTimelineHTML;
      var $leftGroup = $("<div class='leftGroup'>" + timelineGroupHTML + timelineGroupSeparator + "</div>");
      var $rightGroup =  $("<div class='rightGroup'>" + timelineGroupHTML + timelineGroupSeparator + "</div>");
      $anchor = $("<div class='anchor'><span class='anchorHighlight'></span><span class='anchorTZ'></span></div>");
      $timeline.append($leftGroup, $rightGroup, $anchor);
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

      $timeline.on("scroll", function(e) {
        didScroll = true;
        window.clearTimeout(scrollEndTimeout);
        // Set a timeout to run after scrolling ends
        scrollEndTimeout = setTimeout(function() {
          if (mouseDown) return;
          $timeline.trigger("mouseup");
        }, 100);
      });

      $timeline.on("mouseup", function(e) {
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
      });

      $timeline.on("click", ".materialTimelineTick", function() {
        updateTimelineSlider(null, $(this), false, false, true);
      });

      $timelineTicks = $("#" + viewerDivId + " .materialTimelineTick");

      leftTimelineGroupWidth = $leftGroup.outerWidth(true);
      lastSelectedGroup = $rightGroup;

      if (!addedTimelineSliderListener) {
        addedTimelineSliderListener = true;
      }

      var startTimeElm = $("#" + viewerDivId + " .rightGroup").find(".materialTimelineTick:first");
      timelineTickWidth = startTimeElm.outerWidth(true);

      //updateTimelineSlider(0, startTimeElm);

      // TODO: Need pollyfill
      new ResizeObserver(refocusTimeline).observe($(".materialTimeline")[0]);

      $(window).on("resize", refocusTimeline);

      // TODO
      //if (UTIL.isIE()) {
      //  $timeline.addClass("isIE");
      //}
    };


    function updateTimelineSlider(frameNum, timeTick, fromSync, fromRefocus, fromTickOnClickEvent) {
      var numMins = $(timeTick).data("frame") * parseInt($(timeTick).data("increment"));
      var newPlaybackTimeInMs = moment.tz(timeline.selectedDayInMs, "America/Denver").add(numMins, 'minutes').valueOf();

      if (newPlaybackTimeInMs == playbackTimeInMs && fromTickOnClickEvent) {
        return;
      }

      if (!fromRefocus) {
        currentFrameNumber = parseInt($(timeTick).data("frame"));
        playbackTimeInMs = newPlaybackTimeInMs;
        handleDraw(playbackTimeInMs);
        $("#playback-timeline-container .anchorTZ").text("(" + moment.tz(playbackTimeInMs, "America/Denver").zoneAbbr() + ")");
      }

      if (!timeTick || timeTick.length == 0) {
        if ((lastFrameWasGroupEnd && frameNum == 0) ||
            (lastSelectedGroup.hasClass("rightGroup") && $selectedTimelineTick.parent().hasClass("leftGroup")) ||
            (lastSelectedGroup.hasClass("leftGroup") && $selectedTimelineTick.parent().hasClass("leftGroup"))) {
          timeTick = $selectedTimelineTick.parent().next().find($('.materialTimelineTick')).first();
          lastFrameWasGroupEnd = false;
        } else {
          timeTick = $selectedTimelineTick.parent().find($('.materialTimelineTick[data-frame="' + frameNum + '"]'));
        }
      }
      if (timeTick.length) {
        $selectedTimelineTick = timeTick;
        if (frameNum == null) {
          frameNum = currentFrameNumber;
        }
        var scrollOptions = {
          time: 100,
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
        window.scrollIntoView($selectedTimelineTick[0], scrollOptions, function() {
          var scrollWidthAmount = $timeline[0].scrollWidth;
          var scrollLeftAmount = $timeline[0].scrollLeft;
          var clientWidthAmount = $timeline[0].clientWidth;
          var scrollDiff = ((scrollWidthAmount - scrollLeftAmount) - clientWidthAmount);
          var threshold = timelineTickWidth;

          if (clientWidthAmount > 0 && scrollLeftAmount <= threshold) {
            var $prevGroup = $selectedTimelineTick.parent().prev();
            if ($prevGroup.length == 0) {
              var doFixScroll = false;
              // Ensure only one tmp group ever exists
              var $existingNewLeftGroup = $("#" + viewerDivId + " .newLeftGroup");
              if ($existingNewLeftGroup.length == 1) {
                var $previousLeftGroup = $existingNewLeftGroup.next();
                $existingNewLeftGroup.removeClass("newLeftGroup");
                $previousLeftGroup.remove();
                doFixScroll = true;
              }
              var $newLeftGroup = $("<div class='leftGroup newLeftGroup'>" + timelineGroupHTML + timelineGroupSeparator + "</div>");
              $timeline.prepend($newLeftGroup);
              $timelineTicks = $("#" + viewerDivId + " .materialTimelineTick");
              scrollOptions.ease = null;
              scrollOptions.time = 0;
              window.scrollIntoView($selectedTimelineTick[0], scrollOptions);
              //$timeline[0].scrollLeft = leftTimelineGroupWidth + scrollLeftAmount;
            }
          } else if (clientWidthAmount > 0 && scrollDiff <= threshold) {
            var doFixScroll = false;
            // Ensure only one tmp group ever exists
            var $existingNewRightGroup = $("#" + viewerDivId + " .newRightGroup");
            if ($existingNewRightGroup.length == 1) {
              var $previousRightGroup = $existingNewRightGroup.prev();
              $existingNewRightGroup.removeClass("newRightGroup");
              $previousRightGroup.remove();
              doFixScroll = true;
            }
            // Add to the right
            var $newRightGroup = $("<div class='rightGroup newRightGroup'>" + timelineGroupHTML + timelineGroupSeparator + "</div>");
            $newRightGroup.insertBefore($anchor);
            //$timeline.append($newRightGroup);
            $timelineTicks = $("#" + viewerDivId + " .materialTimelineTick");
            if (doFixScroll) {
              scrollOptions.ease = null;
              scrollOptions.time = 0;
              window.scrollIntoView($selectedTimelineTick[0], scrollOptions);
              //$timeline[0].scrollLeft = scrollLeftAmount - leftTimelineGroupWidth;
            }
          }
        });
        // TODO
        //if (timelapse.isPaused()) {
        //  timelapse.seekToFrame(frameNum);
        //}
        //$tourTimeText.text($selectedTimelineTick.text());
      }
    };

    var updateTimeJumpMenu = function() {
      // The jump-to menu only shows hours, so we need to snap to the closest hour, rounding down.
      var ignoreSnapTo = (currentFrameNumber / (60 / playbackTimeline.getIncrementAmt())) % 1 == 0;
      var jumpFrame = currentFrameNumber;
      if (!ignoreSnapTo) {
        var m = moment.tz(playbackTimeline.getPlaybackTimeInMs(), "America/Denver");
        jumpFrame = captureTimes.indexOf(m.startOf('hour').format("h:mm A"));
      }
      $timeJumpOptions.val(jumpFrame);
    }
    this.updateTimeJumpMenu = updateTimeJumpMenu;

    var createTimeJump = function() {
      $timeJumpOptions.mobileSelect({
        title : "Choose an hour to jump to:",
        animation : "none",
        buttonSave : "OK",
        onOpen: function() {
          // Need to delay some amount of time for UI to be ready
          setTimeout(function() {
            $(".mobileSelect-control.selected")[0].scrollIntoView();
          }, 10);
        }
      });
      $timeJumpOptions.on("change", function(e) {
        seekTo($(".mobileSelect-control.selected").data("value"));
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
          $(".btn-mobileSelect-gen").trigger("click");
        }, 500)
      }).on("mouseup", function() {
        clearTimeout(seekHoldTimeout)
      }).on("mouseout", function(e) {
        if (seekTooltipState == "shown") {
          var $relatedTarget = $(e.relatedTarget);
          if ($relatedTarget.parent()[0] == this || $relatedTarget[0] == this) return;
          $(this).tooltip("disable");
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
          $(".btn-mobileSelect-gen").trigger("click");
        }, 500)
      }).on("mouseup", function() {
        clearTimeout(seekHoldTimeout)
      }).on("mouseout", function(e) {
        if (seekTooltipState == "shown") {
          var $relatedTarget = $(e.relatedTarget);
          if ($relatedTarget.parent()[0] == this || $relatedTarget[0] == this) return;
          $(this).tooltip("disable");
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
      lastSelectedGroup = $selectedTimelineTick.parent();
      if (direction == "left") {
        var $previousTimeTick = $selectedTimelineTick.prev("#" + viewerDivId + " .materialTimelineTick");
        if ($previousTimeTick.length == 0) {
          // We hit the end of a timeline group, let's look outside of it.
          var $currentTimelineTickParent = $selectedTimelineTick.parent();
          $previousTimeTick = $selectedTimelineTick.parent().prev().children("#" + viewerDivId + " .materialTimelineTick:last");
          if ($currentTimelineTickParent.hasClass("leftGroup")) {
            $currentTimelineTickParent.remove();
            $previousTimeTick.parent().removeClass("newLeftGroup");
          }
        }
        updateTimelineSlider(null, $previousTimeTick, false);
      } else if (direction == "right") {
        var $nextTimelineTick = $selectedTimelineTick.next("#" + viewerDivId + " .materialTimelineTick");
        if ($nextTimelineTick.length == 0) {
          // We hit the end of a timeline group, let's look outside of it
          var $currentTimelineTickParent = $selectedTimelineTick.parent();
          $nextTimelineTick = $selectedTimelineTick.parent().next().children("#" + viewerDivId + " .materialTimelineTick:first");
          if ($currentTimelineTickParent.hasClass("rightGroup")) {
            var scrollLeftAmount = $timeline[0].scrollLeft;
            $currentTimelineTickParent.remove();
            $nextTimelineTick.parent().removeClass("newRightGroup");
            $timeline[0].scrollLeft = scrollLeftAmount - leftTimelineGroupWidth;
          }
        }
        updateTimelineSlider(null, $nextTimelineTick, false);
      }
      //var epochTime = new Date(timeline.selectedDayInMs).setHours(i);
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

    var seekTo = function(frameNum) {
      frameNum |= 0;
      var $newTimelineTick = $timelineTicks.eq(frameNum);
      $timelineTicks.removeClass("materialTimelineTickSelected");
      $newTimelineTick.addClass("materialTimelineTickSelected");
      updateTimelineSlider(null, $newTimelineTick, true);
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

    var getCurrentFrameNumber = function() {
      if (currentFrameNumber >= 0) {
        return currentFrameNumber;
      } else {
        return captureTimes.indexOf("12:00 PM");
      }
    };
    this.getCurrentFrameNumber = getCurrentFrameNumber;

    var setPlaybackTimeInMs = function(newPlaybackTimeInMs) {
      playbackTimeInMs = newPlaybackTimeInMs;
    };
    this.setPlaybackTimeInMs = setPlaybackTimeInMs;

    var isActive = function() {
      return isTimelineActive;
    };
    this.isActive = isActive;

    var setActiveState = function(state) {
      isTimelineActive = state;
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

    //createSpeedToggle();

    createTimeJump();

    handleSeekControls();

    initPlayPause();

    $('#controls').on(Util.getTransitionEndEventType(), function() {
      isPlaybackTimelineToggling = false;
    });

  };
})();
//end of (function() {

