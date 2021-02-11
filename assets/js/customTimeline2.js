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

    // Objects
    //var UTIL = org.gigapan.Util;


    // Parameters
    var captureTimes;
    var numFrames;
    var playbackTimeInMs = 0;

    // DOM elements
    var viewerDivId = "playback-timeline-container"
    var $timeline = $("#" + viewerDivId + " .materialTimeline");
    var $speedControls = $("#" + viewerDivId + " #speedControlOptions");
    var $rightSeekControl = $("#" + viewerDivId + " .rightSeekControl");
    var $leftSeekControl = $("#" + viewerDivId + " .leftSeekControl");
    var $materialNowViewingContainer = $("#" + viewerDivId + " .materialNowViewingContainer");
    var $materialNowViewingContent = $("#" + viewerDivId + " .materialNowViewingContent");
    var $materialNowViewingText = $("#" + viewerDivId + " .materialNowViewingText");
    var $materialNowViewingClose = $("#" + viewerDivId + " .materialNowViewingContent .close");
    var $timelineTicks;
    var $selectedTimelineTick;
    var $shareButton = $("#" + viewerDivId + " .share");
    var $timelineDisabledContainer = $("#" + viewerDivId + " .materialTimelineDisabled");
    var $waypointDrawerContainerToggle = $("#" + viewerDivId + " .waypointDrawerContainerToggle");
    var timelineGroupHTML = "";
    var timelineGroupSeparator = "<span class='materialTimelineDivider'>&#8226;</span>";
    var leftTimelineGroupWidth;
    var timelineTickWidth;
    var lastSelectedGroup;
    var startDownX;
    var $customPlay;

    var animateIntervalInMs = 1500;


    // Flags
    var addedTimelineSliderListener = false;
    var lastFrameWasGroupEnd = false;
    var isAnimating = false;
    var animateInterval = null;


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
      // TODO
      captureTimes = [];
      for (var i = 0; i < 24; i++) {
        var TimeStamp24Hour = pad(i) + ":00";
        var TimeStamp12Hour = convertFrom24To12Format(TimeStamp24Hour)
        captureTimes.push(TimeStamp12Hour);
      }
      numFrames = captureTimes.length;

      for (var i = 0; i < captureTimes.length; i++) {
        currentTimelineHTML += "<span class='materialTimelineTick' data-frame='" + i + "'>" + captureTimes[i] + "</span>";
      }
      timelineGroupHTML = currentTimelineHTML;
      var $leftGroup = $("<div class='leftGroup'>" + timelineGroupHTML + timelineGroupSeparator + "</div>");
      var $rightGroup =  $("<div class='rightGroup'>" + timelineGroupHTML + timelineGroupSeparator + "</div>");
      $timeline.append($leftGroup, $rightGroup);

      $timeline.on("mousedown", function(e) {
        if (typeof(e.pageX) === "undefined") {
          startDownX = e.clientX;
        } else {
          startDownX = e.pageX;
        }
      });

      $timeline.on("mouseup", function(e) {
        e.preventDefault();
        e.stopPropagation();
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
        updateTimelineSlider(null, $(this), false);
      });

      $timelineTicks = $("#" + viewerDivId + " .materialTimelineTick");

      leftTimelineGroupWidth = $leftGroup.outerWidth(true);
      lastSelectedGroup = $rightGroup;

      if (!addedTimelineSliderListener) {
        addedTimelineSliderListener = true;
      }

      var startTimeElm = $("#" + viewerDivId + " .rightGroup").find(".materialTimelineTick:first");
      timelineTickWidth = startTimeElm.outerWidth(true);

      updateTimelineSlider(0, startTimeElm);

      $(window).on("resize", refocusTimeline);

      // TODO
      //if (UTIL.isIE()) {
      //  $timeline.addClass("isIE");
      //}
    };

    var getPlaybackTimeInMs = function() {
      return playbackTimeInMs;
    }
    this.getPlaybackTimeInMs = getPlaybackTimeInMs;

    var updateTimelineSlider = function(frameNum, timeTick, fromSync) {
      if (timeline) {
        var newPlaybackTimeInMs = new Date(timeline.selectedDayInMs).setHours($(timeTick).data("frame"));
        if (newPlaybackTimeInMs != playbackTimeInMs) {
          playbackTimeInMs = newPlaybackTimeInMs;
          getTraxInfoByPlaybackTime();
        }
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
          frameNum = parseInt($selectedTimelineTick.attr("data-frame"));
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
            $timeline.append($newRightGroup);
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

    var createSpeedToggle = function() {
      $speedControls.selectmenu({
        position: {
          at: "left bottom",
          collision: 'flip',
        }, change: function(e, ui) {
          // TODO
          console.log("change playback speed");
          //timelapse.setPlaybackRate(ui.item.value);
        }
      }).val("0.5").selectmenu("refresh");

      // TODO
      //if (UTIL.isIE()) {
      //  $("#" + viewerDivId + " .speedControl").addClass("isIE");
      //}
    };

    var handleSeekControls = function() {
      $leftSeekControl.on("click", function() {
        seekControlAction("left");
      });

      $rightSeekControl.on("click", function() {
        seekControlAction("right");
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
      updateTimelineSlider(null, $selectedTimelineTick, false);
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
      } else if (type == "play") {
        $customPlay.button({
          icons: {
            primary: "ui-icon-custom-pause"
          },
          text: false
        }).attr({
          "title": "Pause"
        }).data("state", "playing");
      }
    };
    this.setPlaybackButtonState = setPlaybackButtonState;


    var getCaptureTimes = function() {
      return captureTimes;
    };
    this.getCaptureTimes = getCaptureTimes;

    var seekTo = function(frameNum) {
      var $newTimelineTick = $timelineTicks.eq(frameNum);
      $timelineTicks.removeClass("materialTimelineTickSelected");
      $newTimelineTick.addClass("materialTimelineTickSelected");
      updateTimelineSlider(null, $newTimelineTick, true);
    };
    this.seekTo = seekTo;

    ////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // Constructor code
    //

    $("#" + viewerDivId).addClass("materialUI");

    createTimelineSlider();

    createSpeedToggle();

    handleSeekControls();

    initPlayPause();


  };
})();
//end of (function() {
