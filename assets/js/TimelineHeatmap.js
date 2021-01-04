/*************************************************************************
 * GitHub: https://github.com/yenchiah/timeline-heatmap
 * Version: v2.4.0
 *************************************************************************/

(function () {
  "use strict";

  ////////////////////////////////////////////////////////////////////////////////////////////////////////////
  //
  // Create the class
  //
  var TimelineHeatmap = function (chart_container_id, settings) {
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // Variables
    //

    // The data can be a 2D or 3D matrix:
    // 1. If the data matrix is 2D, normalize the values based on the entire matrix
    // (columns are variables and rows are observations)
    // (map the entire color column in the matrix to color codes)
    // (map the entire height column in the matrix to height of the blocks)
    // 2. If the data matrix is 3D, normalize the values based on each 2D matrix
    // (for each 2D matrix, map its color column to color codes)
    // (for each 2D matrix, map its height column to height of the blocks)
    // (e.g. sometimes we only wants to normalize values for each month or week)
    var data = settings["data"];

    // The column names takes any user-specified string
    // This is used for creating data attributes on the DOM element
    // e.g. if the column names is ["label", "color", "height"],
    // for each DOM element, there will be data-label, data-color, and data-height attributes
    var column_names = settings["columnNames"];

    // The column index in the data matrix for showing labels under each block
    var data_index_for_labels = safeGet(settings["dataIndexForLabels"], 0);

    // The column index in the data matrix for coding the color of each block
    var data_index_for_colors = safeGet(settings["dataIndexForColors"], 1);

    // The column index in the data matrix for coding the height of each block (optional field)
    var data_index_for_heights = settings["dataIndexForHeights"];

    // The callback event that will be fired when users click on a block
    var click_event_callback = settings["click"];

    // The callback event that will be fired when a block is selected
    var select_event_callback = settings["select"];

    // The bin and range of the color that will be used to render the blocks
    var use_color_quantiles = safeGet(settings["useColorQuantiles"], false);
    var color_bin = safeGet(settings["colorBin"], [1, 2, 2.5, 3, 3.5]);
    var color_range = safeGet(settings["colorRange"], ["#dcdcdc", "#52b947", "#f3ec19", "#f57e20", "#ed1f24", "#991b4f"]);

    // The bin and range of the height that will be used to render the blocks
    var height_bin = safeGet(settings["heightBin"], [10, 20]);
    var height_range = safeGet(settings["heightRange"], ["33%", "66%", "100%"]);

    // Add an arrow on the left of the timeline for appending new data
    // If this setting is a function, when the arrow is clicked, the function will be triggered
    var add_left_arrow = safeGet(settings["addLeftArrow"], false);
    var left_arrow_label = safeGet(settings["leftArrowLabel"], "");

    // Prevent adding events to blocks with color value zero
    var no_event_when_color_value_zero = safeGet(settings["noEventWhenColorValueZero"], false);

    // No color for the selected block
    var no_color_for_selected_block = safeGet(settings["noColorForSelectedBlock"], false);

    // Plot the timeline when this object is created or not
    var plot_data_when_created = safeGet(settings["plotDataWhenCreated"], true);

    // Cache DOM elements
    var $chart_container = $("#" + chart_container_id);
    var $timeline_heatmap_value;
    var $timeline_heatmap_label;
    var $blocks_click_region = [];
    var $arrow_block_container;
    var $arrow_label;

    // Parameters
    var timeline_heatmap_touched = false;
    var timeline_heatmap_touched_position = {};
    var selected_block_class = no_color_for_selected_block ? "selected-block-no-color" : "selected-block";
    var this_obj = this;
    var enable_left_arrow_event = true;

    ////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // Private methods
    //
    function init() {
      var html = "";

      html += "<table class='timeline-heatmap'>";
      html += "  <tr class='timeline-heatmap-value'></tr>";
      html += "  <tr class='timeline-heatmap-label'></tr>";
      html += "</table>";
      $chart_container.append($(html));

      $timeline_heatmap_value = $("#" + chart_container_id + " .timeline-heatmap-value");
      $timeline_heatmap_label = $("#" + chart_container_id + " .timeline-heatmap-label");

      // Plot the timeline
      if (plot_data_when_created) {
        plot(data);
      }
    }

    function setLeftArrow() {
      if (typeof $arrow_block_container === "undefined" && typeof $arrow_label === "undefined") {
        // Add block
        $arrow_block_container = $("<td></td>");
        var $arrow_block = $("<div class='left-arrow'></div>");
        var $arrow_block_click_region = $("<div class='left-arrow-click-region'></div>");
        $arrow_block_container.append($arrow_block);
        $arrow_block_container.append($arrow_block_click_region);
        if (typeof add_left_arrow === "function") {
          $arrow_block_click_region.on("click touchend", function () {
            if (enable_left_arrow_event) {
              add_left_arrow(this_obj);
            }
          });
        }
        // Add label
        $arrow_label = $("<td>" + left_arrow_label + "</td>");
      }

      // Move block
      $timeline_heatmap_value.prepend($arrow_block_container);

      // Move label
      $timeline_heatmap_label.prepend($arrow_label);
    }

    function plot(block_data) {
      block_data = safeGet(block_data, []);
      if (block_data.length != 0) {
        var current_num_blocks = getNumberOfBlocks();
        // Check if data is 2D or 3D
        var is_data_matrix_2d = typeof block_data[0][0] != "object";
        if (is_data_matrix_2d) {
          // The entire 2D data matrix is a batch
          plotOneBatch(block_data, block_data.length + current_num_blocks);
        } else {
          // Each 2D matrix in the 3D data matrix is a batch
          // We want to add index to the blocks reversely
          // The right-most block has index 0
          var previous_index = current_num_blocks;
          for (var i = block_data.length - 1; i >= 0; i--) {
            previous_index += block_data[i].length;
            plotOneBatch(block_data[i], previous_index);
          }
        }
      }

      // Update click regions
      $blocks_click_region = $timeline_heatmap_value.find(".block-click-region");

      // Add the left arrow on the timeline
      if (add_left_arrow) {
        setLeftArrow();
      }
    }

    function plotOneBatch(batch, previous_index) {
      var chart_value_elements = [];
      var chart_label_elements = [];

      // Compute the min and max value of the color values
      if (!use_color_quantiles) {
        // Get all color values
        var color_vals = [];
        for (var i = 0; i < batch.length; i++) {
          color_vals.push(batch[i][data_index_for_colors])
        }
        color_vals = powerTransform(color_vals);
        var max_color_val = Math.max.apply(null, color_vals);
        var min_color_val = Math.min.apply(null, color_vals);
      }

      // Plot blocks
      for (var i = 0; i < batch.length; i++) {
        var pt = batch[i];
        // Add color string
        var color_val = pt[data_index_for_colors];
        var color_str;
        if (use_color_quantiles) {
          var color = valueToQuantile(color_val, color_bin, color_range);
          color_str = "background-color:" + color + ";";
        } else {
          var color = valueToGrayLevel(color_val, max_color_val, min_color_val);
          color_str = "background-color:rgb(" + color + "," + color + "," + color + ");";
        }
        // Add height string
        var height_val = pt[data_index_for_heights];
        var height = valueToQuantile(height_val, height_bin, height_range);
        var height_str = "height:" + height + ";";
        // Add data string
        var data_str = "data-index='" + (previous_index - i - 1) + "' ";
        for (var j = 0; j < column_names.length; j++) {
          data_str += "data-" + column_names[j] + "='" + pt[j] + "' ";
        }
        // Create block
        var style_str = "style='" + color_str + height_str + "' ";
        var $block = $("<div class='block' " + style_str + "></div>");
        var $block_click_region = $("<div class='block-click-region' " + data_str + "></div>");
        var $block_container = $("<td></td>");
        $block_container.append($block);
        $block_container.append($block_click_region);
        if (no_event_when_color_value_zero && color_val == 0) {
          // Do not add events to the block if its color value is zero and the flag is true
          $block_click_region.addClass("cursor-default");
        } else {
          addEvents($block_click_region);
        }
        // Create label
        var $label = $("<td>" + pt[data_index_for_labels] + "</td>");
        // Add to collections
        chart_value_elements.push($block_container);
        chart_label_elements.push($label);
      }
      $timeline_heatmap_value.prepend(chart_value_elements);
      $timeline_heatmap_label.prepend(chart_label_elements);
    }

    function addEvents($block_click_region) {
      $block_click_region.on("click touchend", function (e) {
        if (e.type == "click") timeline_heatmap_touched = true;
        if (timeline_heatmap_touched) {
          var $this = $(this);
          selectBlock($this, false);
          // Callback event
          if (typeof (click_event_callback) === "function") {
            click_event_callback($this, this_obj);
          }
        }
      });

      $block_click_region.on('touchstart', function (e) {
        timeline_heatmap_touched_position = {
          x: e.originalEvent.touches[0].pageX,
          y: e.originalEvent.touches[0].pageY
        };
        timeline_heatmap_touched = true;
      });

      $block_click_region.on('touchmove', function (e) {
        if (Math.abs(timeline_heatmap_touched_position.x - e.originalEvent.touches[0].pageX) >= 2 || Math.abs(timeline_heatmap_touched_position.y - e.originalEvent.touches[0].pageY) >= 2) {
          timeline_heatmap_touched = false;
        }
      });
    }

    function valueToQuantile(value, bin, range) {
      if (value <= bin[0]) {
        return range[0];
      } else if (value > bin[bin.length - 1]) {
        return range[range.length - 1];
      } else {
        for (var i = 0; i < bin.length - 1; i++) {
          if (value > bin[i] && value <= bin[i + 1]) {
            return range[i + 1];
          }
        }
      }
    }

    function valueToGrayLevel(value, max_val, min_val) {
      // Linear mapping from value to gray scale
      return Math.round(255 - value * (255 / (max_val - min_val)));
    }

    function selectBlock($ele, auto_scroll) {
      if ($ele && $ele.length > 0 && !$ele.hasClass(selected_block_class)) {
        clearBlockSelection();
        $ele.addClass(selected_block_class);
        if (auto_scroll) {
          $chart_container.scrollLeft(Math.round($ele.parent().position().left - $chart_container.width() / 5));
        }
        // Callback event
        if (typeof (select_event_callback) === "function") {
          select_event_callback($ele, this_obj);
        }
      }
    }

    function powerTransform(values) {
      // Compute geometric mean
      var values_new = [];
      var product = 1;
      var count = 0;
      var n = values.length;
      for (var i = 0; i < n; i++) {
        var x = values[i];
        if (x > 0) {
          product *= x;
          count += 1;
        }
      }
      var gm = Math.pow(product, 1 / count);

      // Transform data
      for (var i = 0; i < n; i++) {
        var x = values[i];
        if (x > 0) {
          values_new.push(gm * Math.log(x));
        } else {
          values_new.push(0);
        }
      }

      return values_new;
    }

    function removeBlocks() {
      $timeline_heatmap_value.empty();
      $timeline_heatmap_label.empty();
      $blocks_click_region = [];
      $arrow_block_container = undefined;
      $arrow_label = undefined;
    }

    // Safely get the value from a variable, return a default value if undefined
    function safeGet(v, default_val) {
      if (typeof default_val === "undefined") default_val = "";
      return (typeof v === "undefined") ? default_val : v;
    }

    ////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // Privileged methods
    //
    var clearBlockSelection = function () {
      if ($blocks_click_region.hasClass(selected_block_class)) {
        $blocks_click_region.removeClass(selected_block_class);
      }
    };
    this.clearBlockSelection = clearBlockSelection;

    var selectBlockByIndex = function (index) {
      if ($blocks_click_region.length == 0) { // This means that data is not plotted
        plot(data);
      }
      selectBlock($($blocks_click_region.filter("div[data-index=" + index + "]")[0]), true);
    };
    this.selectBlockByIndex = selectBlockByIndex;

    var selectLastBlock = function () {
      selectBlockByIndex(0);
    };
    this.selectLastBlock = selectLastBlock;

    var prependBlocks = function (block_data) {
      plot(block_data);
    };
    this.prependBlocks = prependBlocks;

    var updateBlocks = function (block_data) {
      removeBlocks();
      plot(block_data);
    };
    this.updateBlocks = updateBlocks;

    var getSelectedBlockData = function () {
      var $selected = getSelectedBlock();
      return $selected.data();
    };
    this.getSelectedBlockData = getSelectedBlockData;

    var getSelectedBlock = function () {
      return $chart_container.find("." + selected_block_class);
    };
    this.getSelectedBlock = getSelectedBlock;

    var getNumberOfBlocks = function () {
      return $blocks_click_region.length;
    };
    this.getNumberOfBlocks = getNumberOfBlocks;

    var selectFirstBlock = function () {
      selectBlockByIndex(getNumberOfBlocks() - 1);
    };
    this.selectFirstBlock = selectFirstBlock;

    var getBlockDataByIndex = function (index) {
      if ($blocks_click_region.length == 0) { // This means that data is not plotted
        plot(data);
      }
      return $blocks_click_region.filter("div[data-index=" + index + "]").data();
    };
    this.getBlockDataByIndex = getBlockDataByIndex;

    var getFirstBlockData = function () {
      return getBlockDataByIndex(getNumberOfBlocks() - 1);
    };
    this.getFirstBlockData = getFirstBlockData;

    var getLastBlockData = function () {
      return getBlockDataByIndex(0);
    };
    this.getLastBlockData = getLastBlockData;

    var hideLeftArrow = function () {
      $arrow_block_container.hide();
      $arrow_label.hide();
    };
    this.hideLeftArrow = hideLeftArrow;

    var showLeftArrow = function () {
      $arrow_block_container.show();
      $arrow_label.show();
    };
    this.showLeftArrow = showLeftArrow;

    var setLeftArrowOpacity = function (opacity) {
      $arrow_block_container.find(".left-arrow-click-region").css("opacity", opacity);
      $arrow_label.css("opacity", opacity);
    };
    this.setLeftArrowOpacity = setLeftArrowOpacity;

    var disableLeftArrow = function () {
      enable_left_arrow_event = false;
    };
    this.disableLeftArrow = disableLeftArrow;

    var enableLeftArrow = function () {
      enable_left_arrow_event = true;
    };
    this.enableLeftArrow = enableLeftArrow;

    ////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // Constructor
    //
    init();
  };

  ////////////////////////////////////////////////////////////////////////////////////////////////////////////
  //
  // Register to window
  //
  if (window.edaplotjs) {
    window.edaplotjs.TimelineHeatmap = TimelineHeatmap;
  } else {
    window.edaplotjs = {};
    window.edaplotjs.TimelineHeatmap = TimelineHeatmap;
  }
})();