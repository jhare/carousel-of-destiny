(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
require("./src/core/angular-mobile.js");
require("./src/core/browserTrigger.js");
require("./src/features/auto-slide/auto-slide-directive.js");
require("./src/features/carousel/carousel-directive.js");
require("./src/features/controls/controls-directive.js");
require("./src/features/indicators/indicators-directive.js");
require("./src/features/slice-filter/slice-filter-directive.js");
require("./src/features/shifty/shifty-directive.js");

},{"./src/core/angular-mobile.js":2,"./src/core/browserTrigger.js":3,"./src/features/auto-slide/auto-slide-directive.js":4,"./src/features/carousel/carousel-directive.js":5,"./src/features/controls/controls-directive.js":6,"./src/features/indicators/indicators-directive.js":7,"./src/features/shifty/shifty-directive.js":8,"./src/features/slice-filter/slice-filter-directive.js":9}],2:[function(require,module,exports){
/**
 * @license AngularJS v1.1.5-3814986
 * (c) 2010-2012 Google, Inc. http://angularjs.org
 * License: MIT
 */
(function(window, angular, undefined) {
'use strict';

/**
 * @ngdoc overview
 * @name ngMobile
 * @description
 * Touch events and other mobile helpers.
 * Based on jQuery Mobile touch event handling (jquerymobile.com)
 */

// define ngMobile module
var ngMobile = angular.module('ngMobile', []);

/**
 * A service for abstracting swipe behavior. Deliberately internal; it is only intended for use in
 * ngSwipeLeft/Right and ngCarousel.
 *
 * Determining whether the user is swiping or scrolling, and handling both mouse and touch events,
 * make writing swipe code challenging. This service allows setting callbacks on the start,
 * movement and completion of a swipe gesture, without worrying about the complications.
 *
 */

ngMobile.factory('$swipe', [function() {
  // The total distance in any direction before we make the call on swipe vs. scroll.
  var MOVE_BUFFER_RADIUS = 10;

  // Absolute total movement, used to control swipe vs. scroll.
  var totalX, totalY;
  // Coordinates of the start position.
  var startCoords;
  // Last event's position.
  var lastPos;
  // Whether a swipe is active.
  var active = false;

  function getCoordinates(event) {
    var touches = event.touches && event.touches.length ? event.touches : [event];
    var e = (event.changedTouches && event.changedTouches[0]) ||
        (event.originalEvent && event.originalEvent.changedTouches &&
            event.originalEvent.changedTouches[0]) ||
        touches[0].originalEvent || touches[0];

    return {
      x: e.clientX,
      y: e.clientY
    };
  }

  return {
    bind: function(element, events) {
      element.bind('touchstart mousedown', function(event) {
        startCoords = getCoordinates(event);
        active = true;
        totalX = 0;
        totalY = 0;
        lastPos = startCoords;
        events['start'] && events['start'](startCoords);
      });

      element.bind('touchcancel', function(event) {
        active = false;
        events['cancel'] && events['cancel']();
      });

      element.bind('touchmove mousemove', function(event) {
        if (!active) return;

        // Android will send a touchcancel if it thinks we're starting to scroll.
        // So when the total distance (+ or - or both) exceeds 10px in either direction,
        // we either:
        // - On totalX > totalY, we send preventDefault() and treat this as a swipe.
        // - On totalY > totalX, we let the browser handle it as a scroll.

        if (!startCoords) return;
        var coords = getCoordinates(event);

        totalX += Math.abs(coords.x - lastPos.x);
        totalY += Math.abs(coords.y - lastPos.y);

        lastPos = coords;

        if (totalX < MOVE_BUFFER_RADIUS && totalY < MOVE_BUFFER_RADIUS) {
          return;
        }

        // One of totalX or totalY has exceeded the buffer, so decide on swipe vs. scroll.
        if (totalY > totalX) {
          // Allow native scrolling to take over.
          active = false;
          return;
        } else {
          // Prevent the browser from scrolling.
          event.preventDefault();

          events['move'] && events['move'](coords);
        }
      });

      element.bind('touchend mouseup', function(event) {
        if (!active) return;
        active = false;
        events['end'] && events['end'](getCoordinates(event));
      });
    }
  };
}]);

/**
 * @ngdoc directive
 * @name ngMobile.directive:ngTap
 *
 * @description
 * Specify custom behavior when element is tapped on a touchscreen device.
 * A tap is a brief, down-and-up touch without much motion.
 *
 * @element ANY
 * @param {expression} ngClick {@link guide/expression Expression} to evaluate
 * upon tap. (Event object is available as `$event`)
 *
 * @example
    <doc:example>
      <doc:source>
        <button ng-tap="count = count + 1" ng-init="count=0">
          Increment
        </button>
        count: {{ count }}
      </doc:source>
    </doc:example>
 */

ngMobile.config(['$provide', function($provide) {
  $provide.decorator('ngClickDirective', ['$delegate', function($delegate) {
    // drop the default ngClick directive
    $delegate.shift();
    return $delegate;
  }]);
}]);

ngMobile.directive('ngClick', ['$parse', '$timeout', '$rootElement',
    function($parse, $timeout, $rootElement) {
  var TAP_DURATION = 750; // Shorter than 750ms is a tap, longer is a taphold or drag.
  var MOVE_TOLERANCE = 12; // 12px seems to work in most mobile browsers.
  var PREVENT_DURATION = 2500; // 2.5 seconds maximum from preventGhostClick call to click
  var CLICKBUSTER_THRESHOLD = 25; // 25 pixels in any dimension is the limit for busting clicks.
  var lastPreventedTime;
  var touchCoordinates;


  // TAP EVENTS AND GHOST CLICKS
  //
  // Why tap events?
  // Mobile browsers detect a tap, then wait a moment (usually ~300ms) to see if you're
  // double-tapping, and then fire a click event.
  //
  // This delay sucks and makes mobile apps feel unresponsive.
  // So we detect touchstart, touchmove, touchcancel and touchend ourselves and determine when
  // the user has tapped on something.
  //
  // What happens when the browser then generates a click event?
  // The browser, of course, also detects the tap and fires a click after a delay. This results in
  // tapping/clicking twice. So we do "clickbusting" to prevent it.
  //
  // How does it work?
  // We attach global touchstart and click handlers, that run during the capture (early) phase.
  // So the sequence for a tap is:
  // - global touchstart: Sets an "allowable region" at the point touched.
  // - element's touchstart: Starts a touch
  // (- touchmove or touchcancel ends the touch, no click follows)
  // - element's touchend: Determines if the tap is valid (didn't move too far away, didn't hold
  //   too long) and fires the user's tap handler. The touchend also calls preventGhostClick().
  // - preventGhostClick() removes the allowable region the global touchstart created.
  // - The browser generates a click event.
  // - The global click handler catches the click, and checks whether it was in an allowable region.
  //     - If preventGhostClick was called, the region will have been removed, the click is busted.
  //     - If the region is still there, the click proceeds normally. Therefore clicks on links and
  //       other elements without ngTap on them work normally.
  //
  // This is an ugly, terrible hack!
  // Yeah, tell me about it. The alternatives are using the slow click events, or making our users
  // deal with the ghost clicks, so I consider this the least of evils. Fortunately Angular
  // encapsulates this ugly logic away from the user.
  //
  // Why not just put click handlers on the element?
  // We do that too, just to be sure. The problem is that the tap event might have caused the DOM
  // to change, so that the click fires in the same position but something else is there now. So
  // the handlers are global and care only about coordinates and not elements.

  // Checks if the coordinates are close enough to be within the region.
  function hit(x1, y1, x2, y2) {
    return Math.abs(x1 - x2) < CLICKBUSTER_THRESHOLD && Math.abs(y1 - y2) < CLICKBUSTER_THRESHOLD;
  }

  // Checks a list of allowable regions against a click location.
  // Returns true if the click should be allowed.
  // Splices out the allowable region from the list after it has been used.
  function checkAllowableRegions(touchCoordinates, x, y) {
    for (var i = 0; i < touchCoordinates.length; i += 2) {
      if (hit(touchCoordinates[i], touchCoordinates[i+1], x, y)) {
        touchCoordinates.splice(i, i + 2);
        return true; // allowable region
      }
    }
    return false; // No allowable region; bust it.
  }

  // Global click handler that prevents the click if it's in a bustable zone and preventGhostClick
  // was called recently.
  function onClick(event) {
    if (Date.now() - lastPreventedTime > PREVENT_DURATION) {
      return; // Too old.
    }

    var touches = event.touches && event.touches.length ? event.touches : [event];
    var x = touches[0].clientX;
    var y = touches[0].clientY;
    // Work around desktop Webkit quirk where clicking a label will fire two clicks (on the label
    // and on the input element). Depending on the exact browser, this second click we don't want
    // to bust has either (0,0) or negative coordinates.
    if (x < 1 && y < 1) {
      return; // offscreen
    }

    // Look for an allowable region containing this click.
    // If we find one, that means it was created by touchstart and not removed by
    // preventGhostClick, so we don't bust it.
    if (checkAllowableRegions(touchCoordinates, x, y)) {
      return;
    }

    // If we didn't find an allowable region, bust the click.
    event.stopPropagation();
    event.preventDefault();
  }


  // Global touchstart handler that creates an allowable region for a click event.
  // This allowable region can be removed by preventGhostClick if we want to bust it.
  function onTouchStart(event) {
    var touches = event.touches && event.touches.length ? event.touches : [event];
    var x = touches[0].clientX;
    var y = touches[0].clientY;
    touchCoordinates.push(x, y);

    $timeout(function() {
      // Remove the allowable region.
      for (var i = 0; i < touchCoordinates.length; i += 2) {
        if (touchCoordinates[i] == x && touchCoordinates[i+1] == y) {
          touchCoordinates.splice(i, i + 2);
          return;
        }
      }
    }, PREVENT_DURATION, false);
  }

  // On the first call, attaches some event handlers. Then whenever it gets called, it creates a
  // zone around the touchstart where clicks will get busted.
  function preventGhostClick(x, y) {
    if (!touchCoordinates) {
      $rootElement[0].addEventListener('click', onClick, true);
      $rootElement[0].addEventListener('touchstart', onTouchStart, true);
      touchCoordinates = [];
    }

    lastPreventedTime = Date.now();

    checkAllowableRegions(touchCoordinates, x, y);
  }

  // Actual linking function.
  return function(scope, element, attr) {
    var clickHandler = $parse(attr.ngClick),
        tapping = false,
        tapElement,  // Used to blur the element after a tap.
        startTime,   // Used to check if the tap was held too long.
        touchStartX,
        touchStartY;

    function resetState() {
      tapping = false;
    }

    element.bind('touchstart', function(event) {
      tapping = true;
      tapElement = event.target ? event.target : event.srcElement; // IE uses srcElement.
      // Hack for Safari, which can target text nodes instead of containers.
      if(tapElement.nodeType == 3) {
        tapElement = tapElement.parentNode;
      }

      startTime = Date.now();

      var touches = event.touches && event.touches.length ? event.touches : [event];
      var e = touches[0].originalEvent || touches[0];
      touchStartX = e.clientX;
      touchStartY = e.clientY;
    });

    element.bind('touchmove', function(event) {
      resetState();
    });

    element.bind('touchcancel', function(event) {
      resetState();
    });

    element.bind('touchend', function(event) {
      var diff = Date.now() - startTime;

      var touches = (event.changedTouches && event.changedTouches.length) ? event.changedTouches :
          ((event.touches && event.touches.length) ? event.touches : [event]);
      var e = touches[0].originalEvent || touches[0];
      var x = e.clientX;
      var y = e.clientY;
      var dist = Math.sqrt( Math.pow(x - touchStartX, 2) + Math.pow(y - touchStartY, 2) );

      if (tapping && diff < TAP_DURATION && dist < MOVE_TOLERANCE) {
        // Call preventGhostClick so the clickbuster will catch the corresponding click.
        preventGhostClick(x, y);

        // Blur the focused element (the button, probably) before firing the callback.
        // This doesn't work perfectly on Android Chrome, but seems to work elsewhere.
        // I couldn't get anything to work reliably on Android Chrome.
        if (tapElement) {
          tapElement.blur();
        }

        scope.$apply(function() {
          // TODO(braden): This is sending the touchend, not a tap or click. Is that kosher?
          clickHandler(scope, {$event: event});
        });
      }
      tapping = false;
    });

    // Hack for iOS Safari's benefit. It goes searching for onclick handlers and is liable to click
    // something else nearby.
    element.onclick = function(event) { };

    // Fallback click handler.
    // Busted clicks don't get this far, and adding this handler allows ng-tap to be used on
    // desktop as well, to allow more portable sites.
    element.bind('click', function(event) {
      scope.$apply(function() {
        clickHandler(scope, {$event: event});
      });
    });
  };
}]);

/**
 * @ngdoc directive
 * @name ngMobile.directive:ngSwipeLeft
 *
 * @description
 * Specify custom behavior when an element is swiped to the left on a touchscreen device.
 * A leftward swipe is a quick, right-to-left slide of the finger.
 * Though ngSwipeLeft is designed for touch-based devices, it will work with a mouse click and drag too.
 *
 * @element ANY
 * @param {expression} ngSwipeLeft {@link guide/expression Expression} to evaluate
 * upon left swipe. (Event object is available as `$event`)
 *
 * @example
    <doc:example>
      <doc:source>
        <div ng-show="!showActions" ng-swipe-left="showActions = true">
          Some list content, like an email in the inbox
        </div>
        <div ng-show="showActions" ng-swipe-right="showActions = false">
          <button ng-click="reply()">Reply</button>
          <button ng-click="delete()">Delete</button>
        </div>
      </doc:source>
    </doc:example>
 */

/**
 * @ngdoc directive
 * @name ngMobile.directive:ngSwipeRight
 *
 * @description
 * Specify custom behavior when an element is swiped to the right on a touchscreen device.
 * A rightward swipe is a quick, left-to-right slide of the finger.
 * Though ngSwipeRight is designed for touch-based devices, it will work with a mouse click and drag too.
 *
 * @element ANY
 * @param {expression} ngSwipeRight {@link guide/expression Expression} to evaluate
 * upon right swipe. (Event object is available as `$event`)
 *
 * @example
    <doc:example>
      <doc:source>
        <div ng-show="!showActions" ng-swipe-left="showActions = true">
          Some list content, like an email in the inbox
        </div>
        <div ng-show="showActions" ng-swipe-right="showActions = false">
          <button ng-click="reply()">Reply</button>
          <button ng-click="delete()">Delete</button>
        </div>
      </doc:source>
    </doc:example>
 */

function makeSwipeDirective(directiveName, direction) {
  ngMobile.directive(directiveName, ['$parse', '$swipe', function($parse, $swipe) {
    // The maximum vertical delta for a swipe should be less than 75px.
    var MAX_VERTICAL_DISTANCE = 75;
    // Vertical distance should not be more than a fraction of the horizontal distance.
    var MAX_VERTICAL_RATIO = 0.3;
    // At least a 30px lateral motion is necessary for a swipe.
    var MIN_HORIZONTAL_DISTANCE = 30;

    return function(scope, element, attr) {
      var swipeHandler = $parse(attr[directiveName]);

      var startCoords, valid;

      function validSwipe(coords) {
        // Check that it's within the coordinates.
        // Absolute vertical distance must be within tolerances.
        // Horizontal distance, we take the current X - the starting X.
        // This is negative for leftward swipes and positive for rightward swipes.
        // After multiplying by the direction (-1 for left, +1 for right), legal swipes
        // (ie. same direction as the directive wants) will have a positive delta and
        // illegal ones a negative delta.
        // Therefore this delta must be positive, and larger than the minimum.
        if (!startCoords) return false;
        var deltaY = Math.abs(coords.y - startCoords.y);
        var deltaX = (coords.x - startCoords.x) * direction;
        return valid && // Short circuit for already-invalidated swipes.
            deltaY < MAX_VERTICAL_DISTANCE &&
            deltaX > 0 &&
            deltaX > MIN_HORIZONTAL_DISTANCE &&
            deltaY / deltaX < MAX_VERTICAL_RATIO;
      }

      $swipe.bind(element, {
        'start': function(coords) {
          startCoords = coords;
          valid = true;
        },
        'cancel': function() {
          valid = false;
        },
        'end': function(coords) {
          if (validSwipe(coords)) {
            scope.$apply(function() {
              swipeHandler(scope);
            });
          }
        }
      });
    };
  }]);
}

// Left is negative X-coordinate, right is positive.
makeSwipeDirective('ngSwipeLeft', -1);
makeSwipeDirective('ngSwipeRight', 1);



})(window, window.angular);

},{}],3:[function(require,module,exports){
'use strict';

(function() {
  var msie = parseInt((/msie (\d+)/.exec(navigator.userAgent.toLowerCase()) || [])[1], 10);

  function indexOf(array, obj) {
    if (array.indexOf) return array.indexOf(obj);

    for ( var i = 0; i < array.length; i++) {
      if (obj === array[i]) return i;
    }
    return -1;
  }



  /**
   * Triggers a browser event. Attempts to choose the right event if one is
   * not specified.
   *
   * @param {Object} element Either a wrapped jQuery/jqLite node or a DOMElement
   * @param {string} eventType Optional event type.
   * @param {Array.<string>=} keys Optional list of pressed keys
   *        (valid values: 'alt', 'meta', 'shift', 'ctrl')
   * @param {number} x Optional x-coordinate for mouse/touch events.
   * @param {number} y Optional y-coordinate for mouse/touch events.
   */
  window.browserTrigger = function browserTrigger(element, eventType, keys, x, y) {
    if (element && !element.nodeName) element = element[0];
    if (!element) return;

    var inputType = (element.type) ? element.type.toLowerCase() : null,
        nodeName = element.nodeName.toLowerCase();

    if (!eventType) {
      eventType = {
        'text':            'change',
        'textarea':        'change',
        'hidden':          'change',
        'password':        'change',
        'button':          'click',
        'submit':          'click',
        'reset':           'click',
        'image':           'click',
        'checkbox':        'click',
        'radio':           'click',
        'select-one':      'change',
        'select-multiple': 'change',
        '_default_':       'click'
      }[inputType || '_default_'];
    }

    if (nodeName == 'option') {
      element.parentNode.value = element.value;
      element = element.parentNode;
      eventType = 'change';
    }

    keys = keys || [];
    function pressed(key) {
      return indexOf(keys, key) !== -1;
    }

    if (msie < 9) {
      if (inputType == 'radio' || inputType == 'checkbox') {
          element.checked = !element.checked;
      }

      // WTF!!! Error: Unspecified error.
      // Don't know why, but some elements when detached seem to be in inconsistent state and
      // calling .fireEvent() on them will result in very unhelpful error (Error: Unspecified error)
      // forcing the browser to compute the element position (by reading its CSS)
      // puts the element in consistent state.
      element.style.posLeft;

      // TODO(vojta): create event objects with pressed keys to get it working on IE<9
      var ret = element.fireEvent('on' + eventType);
      if (inputType == 'submit') {
        while(element) {
          if (element.nodeName.toLowerCase() == 'form') {
            element.fireEvent('onsubmit');
            break;
          }
          element = element.parentNode;
        }
      }
      return ret;
    } else {
      var evnt = document.createEvent('MouseEvents'),
          originalPreventDefault = evnt.preventDefault,
          appWindow = element.ownerDocument.defaultView,
          fakeProcessDefault = true,
          finalProcessDefault,
          angular = appWindow.angular || {};

      // igor: temporary fix for https://bugzilla.mozilla.org/show_bug.cgi?id=684208
      angular['ff-684208-preventDefault'] = false;
      evnt.preventDefault = function() {
        fakeProcessDefault = false;
        return originalPreventDefault.apply(evnt, arguments);
      };

      x = x || 0;
      y = y || 0;
      evnt.initMouseEvent(eventType, true, true, window, 0, x, y, x, y, pressed('ctrl'), pressed('alt'),
          pressed('shift'), pressed('meta'), 0, element);

      element.dispatchEvent(evnt);
      finalProcessDefault = !(angular['ff-684208-preventDefault'] || !fakeProcessDefault);

      delete angular['ff-684208-preventDefault'];

      return finalProcessDefault;
    }
  }
}());

},{}],4:[function(require,module,exports){
'use strict';

var carouselAutoSlide = angular.module('angular-carousel')
.directive('rnCarouselAutoSlide', ['$interval', function($interval) {
  return {
    restrict: 'A',
    link: function (scope, element, attrs) {
        var stopAutoPlay = function() {
            if (scope.autoSlider) {
                $interval.cancel(scope.autoSlider);
                scope.autoSlider = null;
            }
        };
        var restartTimer = function() {
            scope.autoSlide();
        };

        scope.$watch('carouselIndex', restartTimer);

        if (attrs.hasOwnProperty('rnCarouselPauseOnHover') && attrs.rnCarouselPauseOnHover !== 'false'){
            element.on('mouseenter', stopAutoPlay);
            element.on('mouseleave', restartTimer);
        }

        scope.$on('$destroy', function(){
            stopAutoPlay();
            element.off('mouseenter', stopAutoPlay);
            element.off('mouseleave', restartTimer);
        });
    }
  };
}]);

module.exports = carouselAutoSlide;

},{}],5:[function(require,module,exports){
'use strict';

var AngularCarousel = angular.module('angular-carousel')
.service('DeviceCapabilities', function() {
    // TODO: merge in a single function

    // detect supported CSS property
    function detectTransformProperty() {
        var transformProperty = 'transform',
            safariPropertyHack = 'webkitTransform';
        if (typeof document.body.style[transformProperty] !== 'undefined') {

            ['webkit', 'moz', 'o', 'ms'].every(function (prefix) {
                var e = '-' + prefix + '-transform';
                if (typeof document.body.style[e] !== 'undefined') {
                    transformProperty = e;
                    return false;
                }
                return true;
            });
        } else if (typeof document.body.style[safariPropertyHack] !== 'undefined') {
            transformProperty = '-webkit-transform';
        } else {
            transformProperty = undefined;
        }
        return transformProperty;
    }

    //Detect support of translate3d
    function detect3dSupport() {
        var el = document.createElement('p'),
            has3d,
            transforms = {
                'webkitTransform': '-webkit-transform',
                'msTransform': '-ms-transform',
                'transform': 'transform'
            };
        // Add it to the body to get the computed style
        document.body.insertBefore(el, null);
        for (var t in transforms) {
            if (el.style[t] !== undefined) {
                el.style[t] = 'translate3d(1px,1px,1px)';
                has3d = window.getComputedStyle(el).getPropertyValue(transforms[t]);
            }
        }
        document.body.removeChild(el);
        return (has3d !== undefined && has3d.length > 0 && has3d !== "none");
    }

    return {
        has3d: detect3dSupport(),
        transformProperty: detectTransformProperty()
    };

})

.service('computeCarouselSlideStyle', function(DeviceCapabilities) {
    // compute transition transform properties for a given slide and global offset
    return function(slideIndex, offset, transitionType) {
        var style = {
                display: 'inline-block'
            },
            opacity,
            absoluteLeft = (slideIndex * 100) + offset,
            slideTransformValue = DeviceCapabilities.has3d ? 'translate3d(' + absoluteLeft + '%, 0, 0)' : 'translate3d(' + absoluteLeft + '%, 0)',
            distance = ((100 - Math.abs(absoluteLeft)) / 100);

        if (!DeviceCapabilities.transformProperty) {
            // fallback to default slide if transformProperty is not available
            style['margin-left'] = absoluteLeft + '%';
        } else {
            if (transitionType == 'fadeAndSlide') {
                style[DeviceCapabilities.transformProperty] = slideTransformValue;
                opacity = 0;
                if (Math.abs(absoluteLeft) < 100) {
                    opacity = 0.3 + distance * 0.7;
                }
                style.opacity = opacity;
            } else if (transitionType == 'hexagon') {
                var transformFrom = 100,
                    degrees = 0,
                    maxDegrees = 60 * (distance - 1);

                transformFrom = offset < (slideIndex * -100) ? 100 : 0;
                degrees = offset < (slideIndex * -100) ? maxDegrees : -maxDegrees;
                style[DeviceCapabilities.transformProperty] = slideTransformValue + ' ' + 'rotateY(' + degrees + 'deg)';
                style[DeviceCapabilities.transformProperty + '-origin'] = transformFrom + '% 50%';
            } else if (transitionType == 'zoom') {
                style[DeviceCapabilities.transformProperty] = slideTransformValue;
                var scale = 1;
                if (Math.abs(absoluteLeft) < 100) {
                    scale = 1 + ((1 - distance) * 2);
                }
                style[DeviceCapabilities.transformProperty] += ' scale(' + scale + ')';
                style[DeviceCapabilities.transformProperty + '-origin'] = '50% 50%';
                opacity = 0;
                if (Math.abs(absoluteLeft) < 100) {
                    opacity = 0.3 + distance * 0.7;
                }
                style.opacity = opacity;
            } else {
                style[DeviceCapabilities.transformProperty] = slideTransformValue;
            }
        }
        return style;
    };
})

.service('createStyleString', function() {
    return function(object) {
        var styles = [];
        angular.forEach(object, function(value, key) {
            styles.push(key + ':' + value);
        });
        return styles.join(';');
    };
})

.directive('rnCarousel', ['$swipe', '$window', '$document', '$parse', '$compile', '$timeout', '$interval', 'computeCarouselSlideStyle', 'createStyleString', 'Tweenable',
    function($swipe, $window, $document, $parse, $compile, $timeout, $interval, computeCarouselSlideStyle, createStyleString, Tweenable) {
        // internal ids to allow multiple instances
        var carouselId = 0,
            // in absolute pixels, at which distance the slide stick to the edge on release
            rubberTreshold = 3;

        var requestAnimationFrame = $window.requestAnimationFrame || $window.webkitRequestAnimationFrame || $window.mozRequestAnimationFrame;

        function getItemIndex(collection, target, defaultIndex) {
            var result = defaultIndex;
            collection.every(function(item, index) {
                if (angular.equals(item, target)) {
                    result = index;
                    return false;
                }
                return true;
            });
            return result;
        }

        return {
            restrict: 'A',
            scope: true,
            compile: function(tElement, tAttributes) {
                // use the compile phase to customize the DOM
                var firstChild = tElement[0].querySelector('li'),
                    firstChildAttributes = (firstChild) ? firstChild.attributes : [],
                    isRepeatBased = false,
                    isBuffered = false,
                    repeatItem,
                    repeatCollection;

                // try to find an ngRepeat expression
                // at this point, the attributes are not yet normalized so we need to try various syntax
                ['ng-repeat', 'data-ng-repeat', 'ng:repeat', 'x-ng-repeat'].every(function(attr) {
                    var repeatAttribute = firstChildAttributes[attr];
                    if (angular.isDefined(repeatAttribute)) {
                        // ngRepeat regexp extracted from angular 1.2.7 src
                        var exprMatch = repeatAttribute.value.match(/^\s*([\s\S]+?)\s+in\s+([\s\S]+?)(?:\s+track\s+by\s+([\s\S]+?))?\s*$/),
                            trackProperty = exprMatch[3];

                        repeatItem = exprMatch[1];
                        repeatCollection = exprMatch[2];

                        if (repeatItem) {
                            if (angular.isDefined(tAttributes['rnCarouselBuffered'])) {
                                // update the current ngRepeat expression and add a slice operator if buffered
                                isBuffered = true;
                                repeatAttribute.value = repeatItem + ' in ' + repeatCollection + '|carouselSlice:carouselBufferIndex:carouselBufferSize';
                                if (trackProperty) {
                                    repeatAttribute.value += ' track by ' + trackProperty;
                                }
                            }
                            isRepeatBased = true;
                            return false;
                        }
                    }
                    return true;
                });

                return function(scope, iElement, iAttributes, containerCtrl) {

                    carouselId++;

                    var defaultOptions = {
                        transitionType: iAttributes.rnCarouselTransition || 'slide',
                        transitionEasing: iAttributes.rnCarouselEasing || 'easeTo',
                        transitionDuration: parseInt(iAttributes.rnCarouselDuration, 10) || 300,
                        isSequential: true,
                        autoSlideDuration: 3,
                        bufferSize: 5,
                        /* in container % how much we need to drag to trigger the slide change */
                        moveTreshold: 0.1
                    };

                    // TODO
                    var options = angular.extend({}, defaultOptions);

                    var pressed,
                        startX,
                        isIndexBound = false,
                        offset = 0,
                        destination,
                        swipeMoved = false,
                        //animOnIndexChange = true,
                        currentSlides = [],
                        elWidth = null,
                        elX = null,
                        animateTransitions = true,
                        intialState = true,
                        animating = false,
                        mouseUpBound = false,
                        locked = false;

                    $swipe.bind(iElement, {
                        start: swipeStart,
                        move: swipeMove,
                        end: swipeEnd,
                        cancel: function(event) {
                            swipeEnd({}, event);
                        }
                    });

                    function getSlidesDOM() {
                        return iElement[0].querySelectorAll('ul[rn-carousel] > li');
                    }

                    function documentMouseUpEvent(event) {
                        // in case we click outside the carousel, trigger a fake swipeEnd
                        swipeMoved = true;
                        swipeEnd({
                            x: event.clientX,
                            y: event.clientY
                        }, event);
                    }

                    function updateSlidesPosition(offset) {
                        // manually apply transformation to carousel childrens
                        // todo : optim : apply only to visible items
                        var x = scope.carouselBufferIndex * 100 + offset;
                        angular.forEach(getSlidesDOM(), function(child, index) {
                            child.style.cssText = createStyleString(computeCarouselSlideStyle(index, x, options.transitionType));
                        });
                    }

                    scope.nextSlide = function(slideOptions) {
                        var index = scope.carouselIndex + 1;
                        if (index > currentSlides.length - 1) {
                            index = 0;
                        }
                        if (!locked) {
                            goToSlide(index, slideOptions);
                        }
                    };

                    scope.prevSlide = function(slideOptions) {
                        var index = scope.carouselIndex - 1;
                        if (index < 0) {
                            index = currentSlides.length - 1;
                        }
                        goToSlide(index, slideOptions);
                    };

                    function goToSlide(index, slideOptions) {
                        //console.log('goToSlide', arguments);
                        // move a to the given slide index
                        if (index === undefined) {
                            index = scope.carouselIndex;
                        }

                        slideOptions = slideOptions || {};
                        if (slideOptions.animate === false || options.transitionType === 'none') {
                            locked = false;
                            offset = index * -100;
                            scope.carouselIndex = index;
                            updateBufferIndex();
                            return;
                        }

                        locked = true;
                        var tweenable = new Tweenable();
                        tweenable.tween({
                            from: {
                                'x': offset
                            },
                            to: {
                                'x': index * -100
                            },
                            duration: options.transitionDuration,
                            easing: options.transitionEasing,
                            step: function(state) {
                                updateSlidesPosition(state.x);
                            },
                            finish: function() {
                                scope.$apply(function() {
                                    scope.carouselIndex = index;
                                    offset = index * -100;
                                    updateBufferIndex();
                                    $timeout(function () {
                                      locked = false;
                                    }, 0, false);
                                });
                            }
                        });
                    }

                    function getContainerWidth() {
                        var rect = iElement[0].getBoundingClientRect();
                        return rect.width ? rect.width : rect.right - rect.left;
                    }

                    function updateContainerWidth() {
                        elWidth = getContainerWidth();
                    }

                    function bindMouseUpEvent() {
                        if (!mouseUpBound) {
                          mouseUpBound = true;
                          $document.bind('mouseup', documentMouseUpEvent);
                        }
                    }

                    function unbindMouseUpEvent() {
                        if (mouseUpBound) {
                          mouseUpBound = false;
                          $document.unbind('mouseup', documentMouseUpEvent);
                        }
                    }

                    function swipeStart(coords, event) {
                        // console.log('swipeStart', coords, event);
                        if (locked || currentSlides.length <= 1) {
                            return;
                        }
                        updateContainerWidth();
                        elX = iElement[0].querySelector('li').getBoundingClientRect().left;
                        pressed = true;
                        startX = coords.x;
                        return false;
                    }

                    function swipeMove(coords, event) {
                        //console.log('swipeMove', coords, event);
                        var x, delta;
                        bindMouseUpEvent();
                        if (pressed) {
                            x = coords.x;
                            delta = startX - x;
                            if (delta > 2 || delta < -2) {
                                swipeMoved = true;
                                var moveOffset = offset + (-delta * 100 / elWidth);
                                updateSlidesPosition(moveOffset);
                            }
                        }
                        return false;
                    }

                    var init = true;
                    scope.carouselIndex = 0;

                    if (!isRepeatBased) {
                        // fake array when no ng-repeat
                        currentSlides = [];
                        angular.forEach(getSlidesDOM(), function(node, index) {
                            currentSlides.push({id: index});
                        });
                    }

                    if (iAttributes.rnCarouselControls!==undefined) {
                        // dont use a directive for this
                        var nextSlideIndexCompareValue = isRepeatBased ? repeatCollection.replace('::', '') + '.length - 1' : currentSlides.length - 1;
                        var tpl = '<div class="rn-carousel-controls">\n' +
                            '  <span class="rn-carousel-control rn-carousel-control-prev" ng-click="prevSlide()" ng-if="carouselIndex > 0"></span>\n' +
                            '  <span class="rn-carousel-control rn-carousel-control-next" ng-click="nextSlide()" ng-if="carouselIndex < ' + nextSlideIndexCompareValue + '"></span>\n' +
                            '</div>';
                        iElement.append($compile(angular.element(tpl))(scope));
                    }

                    if (iAttributes.rnCarouselAutoSlide!==undefined) {
                        var duration = parseInt(iAttributes.rnCarouselAutoSlide, 10) || options.autoSlideDuration;
                        scope.autoSlide = function() {
                            if (scope.autoSlider) {
                                $interval.cancel(scope.autoSlider);
                                scope.autoSlider = null;
                            }
                            scope.autoSlider = $interval(function() {
                                if (!locked && !pressed) {
                                    scope.nextSlide();
                                }
                            }, duration * 1000);
                        };
                    }

                    if (iAttributes.rnCarouselIndex) {
                        var updateParentIndex = function(value) {
                            indexModel.assign(scope.$parent, value);
                        };
                        var indexModel = $parse(iAttributes.rnCarouselIndex);
                        if (angular.isFunction(indexModel.assign)) {
                            /* check if this property is assignable then watch it */
                            scope.$watch('carouselIndex', function(newValue) {
                                updateParentIndex(newValue);
                            });
                            scope.$parent.$watch(indexModel, function(newValue, oldValue) {

                                if (newValue !== undefined && newValue !== null) {
                                    if (currentSlides && currentSlides.length > 0 && newValue >= currentSlides.length) {
                                        newValue = currentSlides.length - 1;
                                        updateParentIndex(newValue);
                                    } else if (currentSlides && newValue < 0) {
                                        newValue = 0;
                                        updateParentIndex(newValue);
                                    }
                                    if (!locked) {
                                        goToSlide(newValue, {
                                            animate: !init
                                        });
                                    }
                                    init = false;
                                }
                            });
                            isIndexBound = true;
                        } else if (!isNaN(iAttributes.rnCarouselIndex)) {
                            /* if user just set an initial number, set it */
                            goToSlide(parseInt(iAttributes.rnCarouselIndex, 10), {
                                animate: false
                            });
                        }
                    } else {
                        goToSlide(0, {
                            animate: !init
                        });
                        init = false;
                    }

                    if (iAttributes.rnCarouselLocked) {
                        scope.$watch(iAttributes.rnCarouselLocked, function(newValue, oldValue) {
                            // only bind swipe when it's not switched off
                            if(newValue === true) {
                                locked = true;
                            } else {
                                locked = false;
                            }
                        });
                    }

                    if (isRepeatBased) {
                        // use rn-carousel-deep-watch to fight the Angular $watchCollection weakness : https://github.com/angular/angular.js/issues/2621
                        // optional because it have some performance impacts (deep watch)
                        var deepWatch = (iAttributes.rnCarouselDeepWatch!==undefined);

                        scope[deepWatch?'$watch':'$watchCollection'](repeatCollection, function(newValue, oldValue) {
                            //console.log('repeatCollection', currentSlides);
                            currentSlides = newValue;
                            // if deepWatch ON ,manually compare objects to guess the new position
                            if (deepWatch && angular.isArray(newValue)) {
                                var activeElement = oldValue[scope.carouselIndex];
                                var newIndex = getItemIndex(newValue, activeElement, scope.carouselIndex);
                                goToSlide(newIndex, {animate: false});
                            } else {
                                goToSlide(scope.carouselIndex, {animate: false});
                            }
                        }, true);
                    }

                    function swipeEnd(coords, event, forceAnimation) {
                        //  console.log('swipeEnd', 'scope.carouselIndex', scope.carouselIndex);
                        // Prevent clicks on buttons inside slider to trigger "swipeEnd" event on touchend/mouseup
                        if (event && !swipeMoved) {
                            return;
                        }
                        unbindMouseUpEvent();
                        pressed = false;
                        swipeMoved = false;
                        destination = startX - coords.x;
                        if (destination===0) {
                            return;
                        }
                        if (locked) {
                            return;
                        }
                        offset += (-destination * 100 / elWidth);
                        if (options.isSequential) {
                            var minMove = options.moveTreshold * elWidth,
                                absMove = -destination,
                                slidesMove = -Math[absMove >= 0 ? 'ceil' : 'floor'](absMove / elWidth),
                                shouldMove = Math.abs(absMove) > minMove;

                            if (currentSlides && (slidesMove + scope.carouselIndex) >= currentSlides.length) {
                                slidesMove = currentSlides.length - 1 - scope.carouselIndex;
                            }
                            if ((slidesMove + scope.carouselIndex) < 0) {
                                slidesMove = -scope.carouselIndex;
                            }
                            var moveOffset = shouldMove ? slidesMove : 0;

                            destination = (scope.carouselIndex + moveOffset);

                            goToSlide(destination);
                        } else {
                            scope.$apply(function() {
                                scope.carouselIndex = parseInt(-offset / 100, 10);
                                updateBufferIndex();
                            });

                        }

                    }

                    scope.$on('$destroy', function() {
                        unbindMouseUpEvent();
                    });

                    scope.carouselBufferIndex = 0;
                    scope.carouselBufferSize = options.bufferSize;

                    function updateBufferIndex() {
                        // update and cap te buffer index
                        var bufferIndex = 0;
                        var bufferEdgeSize = (scope.carouselBufferSize - 1) / 2;
                        if (isBuffered) {
                            if (scope.carouselIndex <= bufferEdgeSize) {
                                // first buffer part
                                bufferIndex = 0;
                            } else if (currentSlides && currentSlides.length < scope.carouselBufferSize) {
                                // smaller than buffer
                                bufferIndex = 0;
                            } else if (currentSlides && scope.carouselIndex > currentSlides.length - scope.carouselBufferSize) {
                                // last buffer part
                                bufferIndex = currentSlides.length - scope.carouselBufferSize;
                            } else {
                                // compute buffer start
                                bufferIndex = scope.carouselIndex - bufferEdgeSize;
                            }

                            scope.carouselBufferIndex = bufferIndex;
                            $timeout(function() {
                                updateSlidesPosition(offset);
                            }, 0, false);
                        } else {
                            $timeout(function() {
                                updateSlidesPosition(offset);
                            }, 0, false);
                        }
                    }

                    function onOrientationChange() {
                        updateContainerWidth();
                        goToSlide();
                    }

                    // handle orientation change
                    var winEl = angular.element($window);
                    winEl.bind('orientationchange', onOrientationChange);
                    winEl.bind('resize', onOrientationChange);

                    scope.$on('$destroy', function() {
                        unbindMouseUpEvent();
                        winEl.unbind('orientationchange', onOrientationChange);
                        winEl.unbind('resize', onOrientationChange);
                    });
                };
            }
        };
    }
]);

module.exports = AngularCarousel;

},{}],6:[function(require,module,exports){

},{}],7:[function(require,module,exports){
'use strict';
var CarouselIndicators = angular.module('angular-carousel')

.directive('rnCarouselIndicators', ['$parse', function($parse) {
  return {
    restrict: 'A',
    scope: {
      slides: '=',
      index: '=rnCarouselIndex'
    },
    templateUrl: 'carousel-indicators.html',
    link: function(scope, iElement, iAttributes) {
      var indexModel = $parse(iAttributes.rnCarouselIndex);
      scope.goToSlide = function(index) {
        indexModel.assign(scope.$parent.$parent, index);
      };
    }
  };
}]);

angular.module('angular-carousel').run(['$templateCache', function($templateCache) {
  // TODO: Christ, fix this
  $templateCache.put('carousel-indicators.html',
      '<div class="rn-carousel-indicator">\n' +
        '<span ng-repeat="slide in slides" ng-class="{active: $index==index}" ng-click="goToSlide($index)">●</span>' +
      '</div>'
  );
}]);

module.exports = CarouselIndicators;

},{}],8:[function(require,module,exports){
'use strict';

var Shifty = angular.module('angular-carousel.shifty', [])

.factory('Tweenable', function() {

    /*! shifty - v1.3.4 - 2014-10-29 - http://jeremyckahn.github.io/shifty */
  ;(function (root) {

  /*!
   * Shifty Core
   * By Jeremy Kahn - jeremyckahn@gmail.com
   */

  var Tweenable = (function () {

    // Aliases that get defined later in this function
    var formula;

    // CONSTANTS
    var DEFAULT_SCHEDULE_FUNCTION;
    var DEFAULT_EASING = 'linear';
    var DEFAULT_DURATION = 500;
    var UPDATE_TIME = 1000 / 60;

    var _now = Date.now ? Date.now : function () {return +new Date();};

    var now = typeof SHIFTY_DEBUG_NOW !== 'undefined' ? SHIFTY_DEBUG_NOW : _now;

    if (typeof window !== 'undefined') {
      // requestAnimationFrame() shim by Paul Irish (modified for Shifty)
      // http://paulirish.com/2011/requestanimationframe-for-smart-animating/
      DEFAULT_SCHEDULE_FUNCTION = window.requestAnimationFrame
         || window.webkitRequestAnimationFrame
         || window.oRequestAnimationFrame
         || window.msRequestAnimationFrame
         || (window.mozCancelRequestAnimationFrame
         && window.mozRequestAnimationFrame)
         || setTimeout;
    } else {
      DEFAULT_SCHEDULE_FUNCTION = setTimeout;
    }

    function noop () {
      // NOOP!
    }

    /*!
     * Handy shortcut for doing a for-in loop. This is not a "normal" each
     * function, it is optimized for Shifty.  The iterator function only receives
     * the property name, not the value.
     * @param {Object} obj
     * @param {Function(string)} fn
     */
    function each (obj, fn) {
      var key;
      for (key in obj) {
        if (Object.hasOwnProperty.call(obj, key)) {
          fn(key);
        }
      }
    }

    /*!
     * Perform a shallow copy of Object properties.
     * @param {Object} targetObject The object to copy into
     * @param {Object} srcObject The object to copy from
     * @return {Object} A reference to the augmented `targetObj` Object
     */
    function shallowCopy (targetObj, srcObj) {
      each(srcObj, function (prop) {
        targetObj[prop] = srcObj[prop];
      });

      return targetObj;
    }

    /*!
     * Copies each property from src onto target, but only if the property to
     * copy to target is undefined.
     * @param {Object} target Missing properties in this Object are filled in
     * @param {Object} src
     */
    function defaults (target, src) {
      each(src, function (prop) {
        if (typeof target[prop] === 'undefined') {
          target[prop] = src[prop];
        }
      });
    }

    /*!
     * Calculates the interpolated tween values of an Object for a given
     * timestamp.
     * @param {Number} forPosition The position to compute the state for.
     * @param {Object} currentState Current state properties.
     * @param {Object} originalState: The original state properties the Object is
     * tweening from.
     * @param {Object} targetState: The destination state properties the Object
     * is tweening to.
     * @param {number} duration: The length of the tween in milliseconds.
     * @param {number} timestamp: The UNIX epoch time at which the tween began.
     * @param {Object} easing: This Object's keys must correspond to the keys in
     * targetState.
     */
    function tweenProps (forPosition, currentState, originalState, targetState,
      duration, timestamp, easing) {
      var normalizedPosition = (forPosition - timestamp) / duration;

      var prop;
      for (prop in currentState) {
        if (currentState.hasOwnProperty(prop)) {
          currentState[prop] = tweenProp(originalState[prop],
            targetState[prop], formula[easing[prop]], normalizedPosition);
        }
      }

      return currentState;
    }

    /*!
     * Tweens a single property.
     * @param {number} start The value that the tween started from.
     * @param {number} end The value that the tween should end at.
     * @param {Function} easingFunc The easing curve to apply to the tween.
     * @param {number} position The normalized position (between 0.0 and 1.0) to
     * calculate the midpoint of 'start' and 'end' against.
     * @return {number} The tweened value.
     */
    function tweenProp (start, end, easingFunc, position) {
      return start + (end - start) * easingFunc(position);
    }

    /*!
     * Applies a filter to Tweenable instance.
     * @param {Tweenable} tweenable The `Tweenable` instance to call the filter
     * upon.
     * @param {String} filterName The name of the filter to apply.
     */
    function applyFilter (tweenable, filterName) {
      var filters = Tweenable.prototype.filter;
      var args = tweenable._filterArgs;

      each(filters, function (name) {
        if (typeof filters[name][filterName] !== 'undefined') {
          filters[name][filterName].apply(tweenable, args);
        }
      });
    }

    var timeoutHandler_endTime;
    var timeoutHandler_currentTime;
    var timeoutHandler_isEnded;
    var timeoutHandler_offset;
    /*!
     * Handles the update logic for one step of a tween.
     * @param {Tweenable} tweenable
     * @param {number} timestamp
     * @param {number} duration
     * @param {Object} currentState
     * @param {Object} originalState
     * @param {Object} targetState
     * @param {Object} easing
     * @param {Function(Object, *, number)} step
     * @param {Function(Function,number)}} schedule
     */
    function timeoutHandler (tweenable, timestamp, duration, currentState,
      originalState, targetState, easing, step, schedule) {
      timeoutHandler_endTime = timestamp + duration;
      timeoutHandler_currentTime = Math.min(now(), timeoutHandler_endTime);
      timeoutHandler_isEnded =
        timeoutHandler_currentTime >= timeoutHandler_endTime;

      timeoutHandler_offset = duration - (
          timeoutHandler_endTime - timeoutHandler_currentTime);

      if (tweenable.isPlaying() && !timeoutHandler_isEnded) {
        tweenable._scheduleId = schedule(tweenable._timeoutHandler, UPDATE_TIME);

        applyFilter(tweenable, 'beforeTween');
        tweenProps(timeoutHandler_currentTime, currentState, originalState,
          targetState, duration, timestamp, easing);
        applyFilter(tweenable, 'afterTween');

        step(currentState, tweenable._attachment, timeoutHandler_offset);
      } else if (timeoutHandler_isEnded) {
        step(targetState, tweenable._attachment, timeoutHandler_offset);
        tweenable.stop(true);
      }
    }


    /*!
     * Creates a usable easing Object from either a string or another easing
     * Object.  If `easing` is an Object, then this function clones it and fills
     * in the missing properties with "linear".
     * @param {Object} fromTweenParams
     * @param {Object|string} easing
     */
    function composeEasingObject (fromTweenParams, easing) {
      var composedEasing = {};

      if (typeof easing === 'string') {
        each(fromTweenParams, function (prop) {
          composedEasing[prop] = easing;
        });
      } else {
        each(fromTweenParams, function (prop) {
          if (!composedEasing[prop]) {
            composedEasing[prop] = easing[prop] || DEFAULT_EASING;
          }
        });
      }

      return composedEasing;
    }

    /**
     * Tweenable constructor.
     * @param {Object=} opt_initialState The values that the initial tween should start at if a "from" object is not provided to Tweenable#tween.
     * @param {Object=} opt_config See Tweenable.prototype.setConfig()
     * @constructor
     */
    function Tweenable (opt_initialState, opt_config) {
      this._currentState = opt_initialState || {};
      this._configured = false;
      this._scheduleFunction = DEFAULT_SCHEDULE_FUNCTION;

      // To prevent unnecessary calls to setConfig do not set default configuration here.
      // Only set default configuration immediately before tweening if none has been set.
      if (typeof opt_config !== 'undefined') {
        this.setConfig(opt_config);
      }
    }

    /**
     * Configure and start a tween.
     * @param {Object=} opt_config See Tweenable.prototype.setConfig()
     * @return {Tweenable}
     */
    Tweenable.prototype.tween = function (opt_config) {
      if (this._isTweening) {
        return this;
      }

      // Only set default config if no configuration has been set previously and none is provided now.
      if (opt_config !== undefined || !this._configured) {
        this.setConfig(opt_config);
      }

      this._timestamp = now();
      this._start(this.get(), this._attachment);
      return this.resume();
    };

    /**
     * Sets the tween configuration. `config` may have the following options:
     *
     * - __from__ (_Object=_): Starting position.  If omitted, the current state is used.
     * - __to__ (_Object=_): Ending position.
     * - __duration__ (_number=_): How many milliseconds to animate for.
     * - __start__ (_Function(Object)_): Function to execute when the tween begins.  Receives the state of the tween as the first parameter. Attachment is the second parameter.
     * - __step__ (_Function(Object, *, number)_): Function to execute on every tick.  Receives the state of the tween as the first parameter. Attachment is the second parameter, and the time elapsed since the start of the tween is the third parameter. This function is not called on the final step of the animation, but `finish` is.
     * - __finish__ (_Function(Object, *)_): Function to execute upon tween completion.  Receives the state of the tween as the first parameter. Attachment is the second parameter.
     * - __easing__ (_Object|string=_): Easing curve name(s) to use for the tween.
     * - __attachment__ (_Object|string|any=_): Value that is attached to this instance and passed on to the step/start/finish methods.
     * @param {Object} config
     * @return {Tweenable}
     */
    Tweenable.prototype.setConfig = function (config) {
      config = config || {};
      this._configured = true;

      // Attach something to this Tweenable instance (e.g.: a DOM element, an object, a string, etc.);
      this._attachment = config.attachment;

      // Init the internal state
      this._pausedAtTime = null;
      this._scheduleId = null;
      this._start = config.start || noop;
      this._step = config.step || noop;
      this._finish = config.finish || noop;
      this._duration = config.duration || DEFAULT_DURATION;
      this._currentState = config.from || this.get();
      this._originalState = this.get();
      this._targetState = config.to || this.get();

      // Aliases used below
      var currentState = this._currentState;
      var targetState = this._targetState;

      // Ensure that there is always something to tween to.
      defaults(targetState, currentState);

      this._easing = composeEasingObject(
        currentState, config.easing || DEFAULT_EASING);

      this._filterArgs =
        [currentState, this._originalState, targetState, this._easing];

      applyFilter(this, 'tweenCreated');
      return this;
    };

    /**
     * Gets the current state.
     * @return {Object}
     */
    Tweenable.prototype.get = function () {
      return shallowCopy({}, this._currentState);
    };

    /**
     * Sets the current state.
     * @param {Object} state
     */
    Tweenable.prototype.set = function (state) {
      this._currentState = state;
    };

    /**
     * Pauses a tween.  Paused tweens can be resumed from the point at which they were paused.  This is different than [`stop()`](#stop), as that method causes a tween to start over when it is resumed.
     * @return {Tweenable}
     */
    Tweenable.prototype.pause = function () {
      this._pausedAtTime = now();
      this._isPaused = true;
      return this;
    };

    /**
     * Resumes a paused tween.
     * @return {Tweenable}
     */
    Tweenable.prototype.resume = function () {
      if (this._isPaused) {
        this._timestamp += now() - this._pausedAtTime;
      }

      this._isPaused = false;
      this._isTweening = true;

      var self = this;
      this._timeoutHandler = function () {
        timeoutHandler(self, self._timestamp, self._duration, self._currentState,
          self._originalState, self._targetState, self._easing, self._step,
          self._scheduleFunction);
      };

      this._timeoutHandler();

      return this;
    };

    /**
     * Move the state of the animation to a specific point in the tween's timeline.
     * If the animation is not running, this will cause the `step` handlers to be
     * called.
     * @param {millisecond} millisecond The millisecond of the animation to seek to.
     * @return {Tweenable}
     */
    Tweenable.prototype.seek = function (millisecond) {
      this._timestamp = now() - millisecond;

      if (!this.isPlaying()) {
        this._isTweening = true;
        this._isPaused = false;

        // If the animation is not running, call timeoutHandler to make sure that
        // any step handlers are run.
        timeoutHandler(this, this._timestamp, this._duration, this._currentState,
          this._originalState, this._targetState, this._easing, this._step,
          this._scheduleFunction);

        this._timeoutHandler();
        this.pause();
      }

      return this;
    };

    /**
     * Stops and cancels a tween.
     * @param {boolean=} gotoEnd If false or omitted, the tween just stops at its current state, and the "finish" handler is not invoked.  If true, the tweened object's values are instantly set to the target values, and "finish" is invoked.
     * @return {Tweenable}
     */
    Tweenable.prototype.stop = function (gotoEnd) {
      this._isTweening = false;
      this._isPaused = false;
      this._timeoutHandler = noop;

      (root.cancelAnimationFrame            ||
        root.webkitCancelAnimationFrame     ||
        root.oCancelAnimationFrame          ||
        root.msCancelAnimationFrame         ||
        root.mozCancelRequestAnimationFrame ||
        root.clearTimeout)(this._scheduleId);

      if (gotoEnd) {
        shallowCopy(this._currentState, this._targetState);
        applyFilter(this, 'afterTweenEnd');
        this._finish.call(this, this._currentState, this._attachment);
      }

      return this;
    };

    /**
     * Returns whether or not a tween is running.
     * @return {boolean}
     */
    Tweenable.prototype.isPlaying = function () {
      return this._isTweening && !this._isPaused;
    };

    /**
     * Sets a custom schedule function.
     *
     * If a custom function is not set the default one is used [`requestAnimationFrame`](https://developer.mozilla.org/en-US/docs/Web/API/window.requestAnimationFrame) if available, otherwise [`setTimeout`](https://developer.mozilla.org/en-US/docs/Web/API/Window.setTimeout)).
     *
     * @param {Function(Function,number)} scheduleFunction The function to be called to schedule the next frame to be rendered
     */
    Tweenable.prototype.setScheduleFunction = function (scheduleFunction) {
      this._scheduleFunction = scheduleFunction;
    };

    /**
     * `delete`s all "own" properties.  Call this when the `Tweenable` instance is no longer needed to free memory.
     */
    Tweenable.prototype.dispose = function () {
      var prop;
      for (prop in this) {
        if (this.hasOwnProperty(prop)) {
          delete this[prop];
        }
      }
    };

    /*!
     * Filters are used for transforming the properties of a tween at various
     * points in a Tweenable's life cycle.  See the README for more info on this.
     */
    Tweenable.prototype.filter = {};

    /*!
     * This object contains all of the tweens available to Shifty.  It is extendible - simply attach properties to the Tweenable.prototype.formula Object following the same format at linear.
     *
     * `pos` should be a normalized `number` (between 0 and 1).
     */
    Tweenable.prototype.formula = {
      linear: function (pos) {
        return pos;
      }
    };

    formula = Tweenable.prototype.formula;

    shallowCopy(Tweenable, {
      'now': now
      ,'each': each
      ,'tweenProps': tweenProps
      ,'tweenProp': tweenProp
      ,'applyFilter': applyFilter
      ,'shallowCopy': shallowCopy
      ,'defaults': defaults
      ,'composeEasingObject': composeEasingObject
    });

    root.Tweenable = Tweenable;
    return Tweenable;

  } ());

  /*!
   * All equations are adapted from Thomas Fuchs' [Scripty2](https://github.com/madrobby/scripty2/blob/master/src/effects/transitions/penner.js).
   *
   * Based on Easing Equations (c) 2003 [Robert Penner](http://www.robertpenner.com/), all rights reserved. This work is [subject to terms](http://www.robertpenner.com/easing_terms_of_use.html).
   */

  /*!
   *  TERMS OF USE - EASING EQUATIONS
   *  Open source under the BSD License.
   *  Easing Equations (c) 2003 Robert Penner, all rights reserved.
   */

  ;(function () {

    Tweenable.shallowCopy(Tweenable.prototype.formula, {
      easeInQuad: function (pos) {
        return Math.pow(pos, 2);
      },

      easeOutQuad: function (pos) {
        return -(Math.pow((pos - 1), 2) - 1);
      },

      easeInOutQuad: function (pos) {
        if ((pos /= 0.5) < 1) {return 0.5 * Math.pow(pos,2);}
        return -0.5 * ((pos -= 2) * pos - 2);
      },

      easeInCubic: function (pos) {
        return Math.pow(pos, 3);
      },

      easeOutCubic: function (pos) {
        return (Math.pow((pos - 1), 3) + 1);
      },

      easeInOutCubic: function (pos) {
        if ((pos /= 0.5) < 1) {return 0.5 * Math.pow(pos,3);}
        return 0.5 * (Math.pow((pos - 2),3) + 2);
      },

      easeInQuart: function (pos) {
        return Math.pow(pos, 4);
      },

      easeOutQuart: function (pos) {
        return -(Math.pow((pos - 1), 4) - 1);
      },

      easeInOutQuart: function (pos) {
        if ((pos /= 0.5) < 1) {return 0.5 * Math.pow(pos,4);}
        return -0.5 * ((pos -= 2) * Math.pow(pos,3) - 2);
      },

      easeInQuint: function (pos) {
        return Math.pow(pos, 5);
      },

      easeOutQuint: function (pos) {
        return (Math.pow((pos - 1), 5) + 1);
      },

      easeInOutQuint: function (pos) {
        if ((pos /= 0.5) < 1) {return 0.5 * Math.pow(pos,5);}
        return 0.5 * (Math.pow((pos - 2),5) + 2);
      },

      easeInSine: function (pos) {
        return -Math.cos(pos * (Math.PI / 2)) + 1;
      },

      easeOutSine: function (pos) {
        return Math.sin(pos * (Math.PI / 2));
      },

      easeInOutSine: function (pos) {
        return (-0.5 * (Math.cos(Math.PI * pos) - 1));
      },

      easeInExpo: function (pos) {
        return (pos === 0) ? 0 : Math.pow(2, 10 * (pos - 1));
      },

      easeOutExpo: function (pos) {
        return (pos === 1) ? 1 : -Math.pow(2, -10 * pos) + 1;
      },

      easeInOutExpo: function (pos) {
        if (pos === 0) {return 0;}
        if (pos === 1) {return 1;}
        if ((pos /= 0.5) < 1) {return 0.5 * Math.pow(2,10 * (pos - 1));}
        return 0.5 * (-Math.pow(2, -10 * --pos) + 2);
      },

      easeInCirc: function (pos) {
        return -(Math.sqrt(1 - (pos * pos)) - 1);
      },

      easeOutCirc: function (pos) {
        return Math.sqrt(1 - Math.pow((pos - 1), 2));
      },

      easeInOutCirc: function (pos) {
        if ((pos /= 0.5) < 1) {return -0.5 * (Math.sqrt(1 - pos * pos) - 1);}
        return 0.5 * (Math.sqrt(1 - (pos -= 2) * pos) + 1);
      },

      easeOutBounce: function (pos) {
        if ((pos) < (1 / 2.75)) {
          return (7.5625 * pos * pos);
        } else if (pos < (2 / 2.75)) {
          return (7.5625 * (pos -= (1.5 / 2.75)) * pos + 0.75);
        } else if (pos < (2.5 / 2.75)) {
          return (7.5625 * (pos -= (2.25 / 2.75)) * pos + 0.9375);
        } else {
          return (7.5625 * (pos -= (2.625 / 2.75)) * pos + 0.984375);
        }
      },

      easeInBack: function (pos) {
        var s = 1.70158;
        return (pos) * pos * ((s + 1) * pos - s);
      },

      easeOutBack: function (pos) {
        var s = 1.70158;
        return (pos = pos - 1) * pos * ((s + 1) * pos + s) + 1;
      },

      easeInOutBack: function (pos) {
        var s = 1.70158;
        if ((pos /= 0.5) < 1) {return 0.5 * (pos * pos * (((s *= (1.525)) + 1) * pos - s));}
        return 0.5 * ((pos -= 2) * pos * (((s *= (1.525)) + 1) * pos + s) + 2);
      },

      elastic: function (pos) {
        return -1 * Math.pow(4,-8 * pos) * Math.sin((pos * 6 - 1) * (2 * Math.PI) / 2) + 1;
      },

      swingFromTo: function (pos) {
        var s = 1.70158;
        return ((pos /= 0.5) < 1) ? 0.5 * (pos * pos * (((s *= (1.525)) + 1) * pos - s)) :
            0.5 * ((pos -= 2) * pos * (((s *= (1.525)) + 1) * pos + s) + 2);
      },

      swingFrom: function (pos) {
        var s = 1.70158;
        return pos * pos * ((s + 1) * pos - s);
      },

      swingTo: function (pos) {
        var s = 1.70158;
        return (pos -= 1) * pos * ((s + 1) * pos + s) + 1;
      },

      bounce: function (pos) {
        if (pos < (1 / 2.75)) {
          return (7.5625 * pos * pos);
        } else if (pos < (2 / 2.75)) {
          return (7.5625 * (pos -= (1.5 / 2.75)) * pos + 0.75);
        } else if (pos < (2.5 / 2.75)) {
          return (7.5625 * (pos -= (2.25 / 2.75)) * pos + 0.9375);
        } else {
          return (7.5625 * (pos -= (2.625 / 2.75)) * pos + 0.984375);
        }
      },

      bouncePast: function (pos) {
        if (pos < (1 / 2.75)) {
          return (7.5625 * pos * pos);
        } else if (pos < (2 / 2.75)) {
          return 2 - (7.5625 * (pos -= (1.5 / 2.75)) * pos + 0.75);
        } else if (pos < (2.5 / 2.75)) {
          return 2 - (7.5625 * (pos -= (2.25 / 2.75)) * pos + 0.9375);
        } else {
          return 2 - (7.5625 * (pos -= (2.625 / 2.75)) * pos + 0.984375);
        }
      },

      easeFromTo: function (pos) {
        if ((pos /= 0.5) < 1) {return 0.5 * Math.pow(pos,4);}
        return -0.5 * ((pos -= 2) * Math.pow(pos,3) - 2);
      },

      easeFrom: function (pos) {
        return Math.pow(pos,4);
      },

      easeTo: function (pos) {
        return Math.pow(pos,0.25);
      }
    });

  }());

  /*!
   * The Bezier magic in this file is adapted/copied almost wholesale from
   * [Scripty2](https://github.com/madrobby/scripty2/blob/master/src/effects/transitions/cubic-bezier.js),
   * which was adapted from Apple code (which probably came from
   * [here](http://opensource.apple.com/source/WebCore/WebCore-955.66/platform/graphics/UnitBezier.h)).
   * Special thanks to Apple and Thomas Fuchs for much of this code.
   */

  /*!
   *  Copyright (c) 2006 Apple Computer, Inc. All rights reserved.
   *
   *  Redistribution and use in source and binary forms, with or without
   *  modification, are permitted provided that the following conditions are met:
   *
   *  1. Redistributions of source code must retain the above copyright notice,
   *  this list of conditions and the following disclaimer.
   *
   *  2. Redistributions in binary form must reproduce the above copyright notice,
   *  this list of conditions and the following disclaimer in the documentation
   *  and/or other materials provided with the distribution.
   *
   *  3. Neither the name of the copyright holder(s) nor the names of any
   *  contributors may be used to endorse or promote products derived from
   *  this software without specific prior written permission.
   *
   *  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
   *  "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO,
   *  THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
   *  ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE
   *  FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
   *  (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
   *  LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
   *  ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
   *  (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
   *  SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
   */
  ;(function () {
    // port of webkit cubic bezier handling by http://www.netzgesta.de/dev/
    function cubicBezierAtTime(t,p1x,p1y,p2x,p2y,duration) {
      var ax = 0,bx = 0,cx = 0,ay = 0,by = 0,cy = 0;
      function sampleCurveX(t) {return ((ax * t + bx) * t + cx) * t;}
      function sampleCurveY(t) {return ((ay * t + by) * t + cy) * t;}
      function sampleCurveDerivativeX(t) {return (3.0 * ax * t + 2.0 * bx) * t + cx;}
      function solveEpsilon(duration) {return 1.0 / (200.0 * duration);}
      function solve(x,epsilon) {return sampleCurveY(solveCurveX(x,epsilon));}
      function fabs(n) {if (n >= 0) {return n;}else {return 0 - n;}}
      function solveCurveX(x,epsilon) {
        var t0,t1,t2,x2,d2,i;
        for (t2 = x, i = 0; i < 8; i++) {x2 = sampleCurveX(t2) - x; if (fabs(x2) < epsilon) {return t2;} d2 = sampleCurveDerivativeX(t2); if (fabs(d2) < 1e-6) {break;} t2 = t2 - x2 / d2;}
        t0 = 0.0; t1 = 1.0; t2 = x; if (t2 < t0) {return t0;} if (t2 > t1) {return t1;}
        while (t0 < t1) {x2 = sampleCurveX(t2); if (fabs(x2 - x) < epsilon) {return t2;} if (x > x2) {t0 = t2;}else {t1 = t2;} t2 = (t1 - t0) * 0.5 + t0;}
        return t2; // Failure.
      }
      cx = 3.0 * p1x; bx = 3.0 * (p2x - p1x) - cx; ax = 1.0 - cx - bx; cy = 3.0 * p1y; by = 3.0 * (p2y - p1y) - cy; ay = 1.0 - cy - by;
      return solve(t, solveEpsilon(duration));
    }
    /*!
     *  getCubicBezierTransition(x1, y1, x2, y2) -> Function
     *
     *  Generates a transition easing function that is compatible
     *  with WebKit's CSS transitions `-webkit-transition-timing-function`
     *  CSS property.
     *
     *  The W3C has more information about
     *  <a href="http://www.w3.org/TR/css3-transitions/#transition-timing-function_tag">
     *  CSS3 transition timing functions</a>.
     *
     *  @param {number} x1
     *  @param {number} y1
     *  @param {number} x2
     *  @param {number} y2
     *  @return {function}
     */
    function getCubicBezierTransition (x1, y1, x2, y2) {
      return function (pos) {
        return cubicBezierAtTime(pos,x1,y1,x2,y2,1);
      };
    }
    // End ported code

    /**
     * Creates a Bezier easing function and attaches it to `Tweenable.prototype.formula`.  This function gives you total control over the easing curve.  Matthew Lein's [Ceaser](http://matthewlein.com/ceaser/) is a useful tool for visualizing the curves you can make with this function.
     *
     * @param {string} name The name of the easing curve.  Overwrites the old easing function on Tweenable.prototype.formula if it exists.
     * @param {number} x1
     * @param {number} y1
     * @param {number} x2
     * @param {number} y2
     * @return {function} The easing function that was attached to Tweenable.prototype.formula.
     */
    Tweenable.setBezierFunction = function (name, x1, y1, x2, y2) {
      var cubicBezierTransition = getCubicBezierTransition(x1, y1, x2, y2);
      cubicBezierTransition.x1 = x1;
      cubicBezierTransition.y1 = y1;
      cubicBezierTransition.x2 = x2;
      cubicBezierTransition.y2 = y2;

      return Tweenable.prototype.formula[name] = cubicBezierTransition;
    };


    /**
     * `delete`s an easing function from `Tweenable.prototype.formula`.  Be careful with this method, as it `delete`s whatever easing formula matches `name` (which means you can delete default Shifty easing functions).
     *
     * @param {string} name The name of the easing function to delete.
     * @return {function}
     */
    Tweenable.unsetBezierFunction = function (name) {
      delete Tweenable.prototype.formula[name];
    };

  })();

  ;(function () {

    function getInterpolatedValues (
      from, current, targetState, position, easing) {
      return Tweenable.tweenProps(
        position, current, from, targetState, 1, 0, easing);
    }

    // Fake a Tweenable and patch some internals.  This approach allows us to
    // skip uneccessary processing and object recreation, cutting down on garbage
    // collection pauses.
    var mockTweenable = new Tweenable();
    mockTweenable._filterArgs = [];

    /**
     * Compute the midpoint of two Objects.  This method effectively calculates a specific frame of animation that [Tweenable#tween](shifty.core.js.html#tween) does many times over the course of a tween.
     *
     * Example:
     *
     *     var interpolatedValues = Tweenable.interpolate({
     *       width: '100px',
     *       opacity: 0,
     *       color: '#fff'
     *     }, {
     *       width: '200px',
     *       opacity: 1,
     *       color: '#000'
     *     }, 0.5);
     *
     *     console.log(interpolatedValues);
     *     // {opacity: 0.5, width: "150px", color: "rgb(127,127,127)"}
     *
     * @param {Object} from The starting values to tween from.
     * @param {Object} targetState The ending values to tween to.
     * @param {number} position The normalized position value (between 0.0 and 1.0) to interpolate the values between `from` and `to` for.  `from` represents 0 and `to` represents `1`.
     * @param {string|Object} easing The easing curve(s) to calculate the midpoint against.  You can reference any easing function attached to `Tweenable.prototype.formula`.  If omitted, this defaults to "linear".
     * @return {Object}
     */
    Tweenable.interpolate = function (from, targetState, position, easing) {
      var current = Tweenable.shallowCopy({}, from);
      var easingObject = Tweenable.composeEasingObject(
        from, easing || 'linear');

      mockTweenable.set({});

      // Alias and reuse the _filterArgs array instead of recreating it.
      var filterArgs = mockTweenable._filterArgs;
      filterArgs.length = 0;
      filterArgs[0] = current;
      filterArgs[1] = from;
      filterArgs[2] = targetState;
      filterArgs[3] = easingObject;

      // Any defined value transformation must be applied
      Tweenable.applyFilter(mockTweenable, 'tweenCreated');
      Tweenable.applyFilter(mockTweenable, 'beforeTween');

      var interpolatedValues = getInterpolatedValues(
        from, current, targetState, position, easingObject);

      // Transform values back into their original format
      Tweenable.applyFilter(mockTweenable, 'afterTween');

      return interpolatedValues;
    };

  }());

  /**
   * Adds string interpolation support to Shifty.
   *
   * The Token extension allows Shifty to tween numbers inside of strings.  Among
   * other things, this allows you to animate CSS properties.  For example, you
   * can do this:
   *
   *     var tweenable = new Tweenable();
   *     tweenable.tween({
   *       from: { transform: 'translateX(45px)'},
   *       to: { transform: 'translateX(90xp)'}
   *     });
   *
   * ` `
   * `translateX(45)` will be tweened to `translateX(90)`.  To demonstrate:
   *
   *     var tweenable = new Tweenable();
   *     tweenable.tween({
   *       from: { transform: 'translateX(45px)'},
   *       to: { transform: 'translateX(90px)'},
   *       step: function (state) {
   *         console.log(state.transform);
   *       }
   *     });
   *
   * ` `
   * The above snippet will log something like this in the console:
   *
   *     translateX(60.3px)
   *     ...
   *     translateX(76.05px)
   *     ...
   *     translateX(90px)
   *
   * ` `
   * Another use for this is animating colors:
   *
   *     var tweenable = new Tweenable();
   *     tweenable.tween({
   *       from: { color: 'rgb(0,255,0)'},
   *       to: { color: 'rgb(255,0,255)'},
   *       step: function (state) {
   *         console.log(state.color);
   *       }
   *     });
   *
   * ` `
   * The above snippet will log something like this:
   *
   *     rgb(84,170,84)
   *     ...
   *     rgb(170,84,170)
   *     ...
   *     rgb(255,0,255)
   *
   * ` `
   * This extension also supports hexadecimal colors, in both long (`#ff00ff`)
   * and short (`#f0f`) forms.  Be aware that hexadecimal input values will be
   * converted into the equivalent RGB output values.  This is done to optimize
   * for performance.
   *
   *     var tweenable = new Tweenable();
   *     tweenable.tween({
   *       from: { color: '#0f0'},
   *       to: { color: '#f0f'},
   *       step: function (state) {
   *         console.log(state.color);
   *       }
   *     });
   *
   * ` `
   * This snippet will generate the same output as the one before it because
   * equivalent values were supplied (just in hexadecimal form rather than RGB):
   *
   *     rgb(84,170,84)
   *     ...
   *     rgb(170,84,170)
   *     ...
   *     rgb(255,0,255)
   *
   * ` `
   * ` `
   * ## Easing support
   *
   * Easing works somewhat differently in the Token extension.  This is because
   * some CSS properties have multiple values in them, and you might need to
   * tween each value along its own easing curve.  A basic example:
   *
   *     var tweenable = new Tweenable();
   *     tweenable.tween({
   *       from: { transform: 'translateX(0px) translateY(0px)'},
   *       to: { transform:   'translateX(100px) translateY(100px)'},
   *       easing: { transform: 'easeInQuad' },
   *       step: function (state) {
   *         console.log(state.transform);
   *       }
   *     });
   *
   * ` `
   * The above snippet create values like this:
   *
   *     translateX(11.560000000000002px) translateY(11.560000000000002px)
   *     ...
   *     translateX(46.24000000000001px) translateY(46.24000000000001px)
   *     ...
   *     translateX(100px) translateY(100px)
   *
   * ` `
   * In this case, the values for `translateX` and `translateY` are always the
   * same for each step of the tween, because they have the same start and end
   * points and both use the same easing curve.  We can also tween `translateX`
   * and `translateY` along independent curves:
   *
   *     var tweenable = new Tweenable();
   *     tweenable.tween({
   *       from: { transform: 'translateX(0px) translateY(0px)'},
   *       to: { transform:   'translateX(100px) translateY(100px)'},
   *       easing: { transform: 'easeInQuad bounce' },
   *       step: function (state) {
   *         console.log(state.transform);
   *       }
   *     });
   *
   * ` `
   * The above snippet create values like this:
   *
   *     translateX(10.89px) translateY(82.355625px)
   *     ...
   *     translateX(44.89000000000001px) translateY(86.73062500000002px)
   *     ...
   *     translateX(100px) translateY(100px)
   *
   * ` `
   * `translateX` and `translateY` are not in sync anymore, because `easeInQuad`
   * was specified for `translateX` and `bounce` for `translateY`.  Mixing and
   * matching easing curves can make for some interesting motion in your
   * animations.
   *
   * The order of the space-separated easing curves correspond the token values
   * they apply to.  If there are more token values than easing curves listed,
   * the last easing curve listed is used.
   */
  function token () {
    // Functionality for this extension runs implicitly if it is loaded.
  } /*!*/

  // token function is defined above only so that dox-foundation sees it as
  // documentation and renders it.  It is never used, and is optimized away at
  // build time.

  ;(function (Tweenable) {

    /*!
     * @typedef {{
     *   formatString: string
     *   chunkNames: Array.<string>
     * }}
     */
    var formatManifest;

    // CONSTANTS

    var R_NUMBER_COMPONENT = /(\d|\-|\.)/;
    var R_FORMAT_CHUNKS = /([^\-0-9\.]+)/g;
    var R_UNFORMATTED_VALUES = /[0-9.\-]+/g;
    var R_RGB = new RegExp(
      'rgb\\(' + R_UNFORMATTED_VALUES.source +
      (/,\s*/.source) + R_UNFORMATTED_VALUES.source +
      (/,\s*/.source) + R_UNFORMATTED_VALUES.source + '\\)', 'g');
    var R_RGB_PREFIX = /^.*\(/;
    var R_HEX = /#([0-9]|[a-f]){3,6}/gi;
    var VALUE_PLACEHOLDER = 'VAL';

    // HELPERS

    var getFormatChunksFrom_accumulator = [];
    /*!
     * @param {Array.number} rawValues
     * @param {string} prefix
     *
     * @return {Array.<string>}
     */
    function getFormatChunksFrom (rawValues, prefix) {
      getFormatChunksFrom_accumulator.length = 0;

      var rawValuesLength = rawValues.length;
      var i;

      for (i = 0; i < rawValuesLength; i++) {
        getFormatChunksFrom_accumulator.push('_' + prefix + '_' + i);
      }

      return getFormatChunksFrom_accumulator;
    }

    /*!
     * @param {string} formattedString
     *
     * @return {string}
     */
    function getFormatStringFrom (formattedString) {
      var chunks = formattedString.match(R_FORMAT_CHUNKS);

      if (!chunks) {
        // chunks will be null if there were no tokens to parse in
        // formattedString (for example, if formattedString is '2').  Coerce
        // chunks to be useful here.
        chunks = ['', ''];

        // If there is only one chunk, assume that the string is a number
        // followed by a token...
        // NOTE: This may be an unwise assumption.
      } else if (chunks.length === 1 ||
          // ...or if the string starts with a number component (".", "-", or a
          // digit)...
          formattedString[0].match(R_NUMBER_COMPONENT)) {
        // ...prepend an empty string here to make sure that the formatted number
        // is properly replaced by VALUE_PLACEHOLDER
        chunks.unshift('');
      }

      return chunks.join(VALUE_PLACEHOLDER);
    }

    /*!
     * Convert all hex color values within a string to an rgb string.
     *
     * @param {Object} stateObject
     *
     * @return {Object} The modified obj
     */
    function sanitizeObjectForHexProps (stateObject) {
      Tweenable.each(stateObject, function (prop) {
        var currentProp = stateObject[prop];

        if (typeof currentProp === 'string' && currentProp.match(R_HEX)) {
          stateObject[prop] = sanitizeHexChunksToRGB(currentProp);
        }
      });
    }

    /*!
     * @param {string} str
     *
     * @return {string}
     */
    function  sanitizeHexChunksToRGB (str) {
      return filterStringChunks(R_HEX, str, convertHexToRGB);
    }

    /*!
     * @param {string} hexString
     *
     * @return {string}
     */
    function convertHexToRGB (hexString) {
      var rgbArr = hexToRGBArray(hexString);
      return 'rgb(' + rgbArr[0] + ',' + rgbArr[1] + ',' + rgbArr[2] + ')';
    }

    var hexToRGBArray_returnArray = [];
    /*!
     * Convert a hexadecimal string to an array with three items, one each for
     * the red, blue, and green decimal values.
     *
     * @param {string} hex A hexadecimal string.
     *
     * @returns {Array.<number>} The converted Array of RGB values if `hex` is a
     * valid string, or an Array of three 0's.
     */
    function hexToRGBArray (hex) {

      hex = hex.replace(/#/, '');

      // If the string is a shorthand three digit hex notation, normalize it to
      // the standard six digit notation
      if (hex.length === 3) {
        hex = hex.split('');
        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
      }

      hexToRGBArray_returnArray[0] = hexToDec(hex.substr(0, 2));
      hexToRGBArray_returnArray[1] = hexToDec(hex.substr(2, 2));
      hexToRGBArray_returnArray[2] = hexToDec(hex.substr(4, 2));

      return hexToRGBArray_returnArray;
    }

    /*!
     * Convert a base-16 number to base-10.
     *
     * @param {Number|String} hex The value to convert
     *
     * @returns {Number} The base-10 equivalent of `hex`.
     */
    function hexToDec (hex) {
      return parseInt(hex, 16);
    }

    /*!
     * Runs a filter operation on all chunks of a string that match a RegExp
     *
     * @param {RegExp} pattern
     * @param {string} unfilteredString
     * @param {function(string)} filter
     *
     * @return {string}
     */
    function filterStringChunks (pattern, unfilteredString, filter) {
      var pattenMatches = unfilteredString.match(pattern);
      var filteredString = unfilteredString.replace(pattern, VALUE_PLACEHOLDER);

      if (pattenMatches) {
        var pattenMatchesLength = pattenMatches.length;
        var currentChunk;

        for (var i = 0; i < pattenMatchesLength; i++) {
          currentChunk = pattenMatches.shift();
          filteredString = filteredString.replace(
            VALUE_PLACEHOLDER, filter(currentChunk));
        }
      }

      return filteredString;
    }

    /*!
     * Check for floating point values within rgb strings and rounds them.
     *
     * @param {string} formattedString
     *
     * @return {string}
     */
    function sanitizeRGBChunks (formattedString) {
      return filterStringChunks(R_RGB, formattedString, sanitizeRGBChunk);
    }

    /*!
     * @param {string} rgbChunk
     *
     * @return {string}
     */
    function sanitizeRGBChunk (rgbChunk) {
      var numbers = rgbChunk.match(R_UNFORMATTED_VALUES);
      var numbersLength = numbers.length;
      var sanitizedString = rgbChunk.match(R_RGB_PREFIX)[0];

      for (var i = 0; i < numbersLength; i++) {
        sanitizedString += parseInt(numbers[i], 10) + ',';
      }

      sanitizedString = sanitizedString.slice(0, -1) + ')';

      return sanitizedString;
    }

    /*!
     * @param {Object} stateObject
     *
     * @return {Object} An Object of formatManifests that correspond to
     * the string properties of stateObject
     */
    function getFormatManifests (stateObject) {
      var manifestAccumulator = {};

      Tweenable.each(stateObject, function (prop) {
        var currentProp = stateObject[prop];

        if (typeof currentProp === 'string') {
          var rawValues = getValuesFrom(currentProp);

          manifestAccumulator[prop] = {
            'formatString': getFormatStringFrom(currentProp)
            ,'chunkNames': getFormatChunksFrom(rawValues, prop)
          };
        }
      });

      return manifestAccumulator;
    }

    /*!
     * @param {Object} stateObject
     * @param {Object} formatManifests
     */
    function expandFormattedProperties (stateObject, formatManifests) {
      Tweenable.each(formatManifests, function (prop) {
        var currentProp = stateObject[prop];
        var rawValues = getValuesFrom(currentProp);
        var rawValuesLength = rawValues.length;

        for (var i = 0; i < rawValuesLength; i++) {
          stateObject[formatManifests[prop].chunkNames[i]] = +rawValues[i];
        }

        delete stateObject[prop];
      });
    }

    /*!
     * @param {Object} stateObject
     * @param {Object} formatManifests
     */
    function collapseFormattedProperties (stateObject, formatManifests) {
      Tweenable.each(formatManifests, function (prop) {
        var currentProp = stateObject[prop];
        var formatChunks = extractPropertyChunks(
          stateObject, formatManifests[prop].chunkNames);
        var valuesList = getValuesList(
          formatChunks, formatManifests[prop].chunkNames);
        currentProp = getFormattedValues(
          formatManifests[prop].formatString, valuesList);
        stateObject[prop] = sanitizeRGBChunks(currentProp);
      });
    }

    /*!
     * @param {Object} stateObject
     * @param {Array.<string>} chunkNames
     *
     * @return {Object} The extracted value chunks.
     */
    function extractPropertyChunks (stateObject, chunkNames) {
      var extractedValues = {};
      var currentChunkName, chunkNamesLength = chunkNames.length;

      for (var i = 0; i < chunkNamesLength; i++) {
        currentChunkName = chunkNames[i];
        extractedValues[currentChunkName] = stateObject[currentChunkName];
        delete stateObject[currentChunkName];
      }

      return extractedValues;
    }

    var getValuesList_accumulator = [];
    /*!
     * @param {Object} stateObject
     * @param {Array.<string>} chunkNames
     *
     * @return {Array.<number>}
     */
    function getValuesList (stateObject, chunkNames) {
      getValuesList_accumulator.length = 0;
      var chunkNamesLength = chunkNames.length;

      for (var i = 0; i < chunkNamesLength; i++) {
        getValuesList_accumulator.push(stateObject[chunkNames[i]]);
      }

      return getValuesList_accumulator;
    }

    /*!
     * @param {string} formatString
     * @param {Array.<number>} rawValues
     *
     * @return {string}
     */
    function getFormattedValues (formatString, rawValues) {
      var formattedValueString = formatString;
      var rawValuesLength = rawValues.length;

      for (var i = 0; i < rawValuesLength; i++) {
        formattedValueString = formattedValueString.replace(
          VALUE_PLACEHOLDER, +rawValues[i].toFixed(4));
      }

      return formattedValueString;
    }

    /*!
     * Note: It's the duty of the caller to convert the Array elements of the
     * return value into numbers.  This is a performance optimization.
     *
     * @param {string} formattedString
     *
     * @return {Array.<string>|null}
     */
    function getValuesFrom (formattedString) {
      return formattedString.match(R_UNFORMATTED_VALUES);
    }

    /*!
     * @param {Object} easingObject
     * @param {Object} tokenData
     */
    function expandEasingObject (easingObject, tokenData) {
      Tweenable.each(tokenData, function (prop) {
        var currentProp = tokenData[prop];
        var chunkNames = currentProp.chunkNames;
        var chunkLength = chunkNames.length;
        var easingChunks = easingObject[prop].split(' ');
        var lastEasingChunk = easingChunks[easingChunks.length - 1];

        for (var i = 0; i < chunkLength; i++) {
          easingObject[chunkNames[i]] = easingChunks[i] || lastEasingChunk;
        }

        delete easingObject[prop];
      });
    }

    /*!
     * @param {Object} easingObject
     * @param {Object} tokenData
     */
    function collapseEasingObject (easingObject, tokenData) {
      Tweenable.each(tokenData, function (prop) {
        var currentProp = tokenData[prop];
        var chunkNames = currentProp.chunkNames;
        var chunkLength = chunkNames.length;
        var composedEasingString = '';

        for (var i = 0; i < chunkLength; i++) {
          composedEasingString += ' ' + easingObject[chunkNames[i]];
          delete easingObject[chunkNames[i]];
        }

        easingObject[prop] = composedEasingString.substr(1);
      });
    }

    Tweenable.prototype.filter.token = {
      'tweenCreated': function (currentState, fromState, toState, easingObject) {
        sanitizeObjectForHexProps(currentState);
        sanitizeObjectForHexProps(fromState);
        sanitizeObjectForHexProps(toState);
        this._tokenData = getFormatManifests(currentState);
      },

      'beforeTween': function (currentState, fromState, toState, easingObject) {
        expandEasingObject(easingObject, this._tokenData);
        expandFormattedProperties(currentState, this._tokenData);
        expandFormattedProperties(fromState, this._tokenData);
        expandFormattedProperties(toState, this._tokenData);
      },

      'afterTween': function (currentState, fromState, toState, easingObject) {
        collapseFormattedProperties(currentState, this._tokenData);
        collapseFormattedProperties(fromState, this._tokenData);
        collapseFormattedProperties(toState, this._tokenData);
        collapseEasingObject(easingObject, this._tokenData);
      }
    };

  } (Tweenable));

  }(window));

  return window.Tweenable;
});

module.exports = Shifty;

},{}],9:[function(require,module,exports){
'use strict';

var CarouselSlice = angular.module('angular-carousel')
.filter('carouselSlice', function() {
    return function(collection, start, size) {
        if (angular.isArray(collection)) {
            return collection.slice(start, start + size);
        } else if (angular.isObject(collection)) {
            // dont try to slice collections :)
            return collection;
        }
    };
});

module.exports = CarouselSlice;

},{}]},{},[1])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJfc3RyZWFtXzAuanMiLCJzcmMvY29yZS9hbmd1bGFyLW1vYmlsZS5qcyIsInNyYy9jb3JlL2Jyb3dzZXJUcmlnZ2VyLmpzIiwic3JjL2ZlYXR1cmVzL2F1dG8tc2xpZGUvYXV0by1zbGlkZS1kaXJlY3RpdmUuanMiLCJzcmMvZmVhdHVyZXMvY2Fyb3VzZWwvY2Fyb3VzZWwtZGlyZWN0aXZlLmpzIiwic3JjL2ZlYXR1cmVzL2NvbnRyb2xzL2NvbnRyb2xzLWRpcmVjdGl2ZS5qcyIsInNyYy9mZWF0dXJlcy9pbmRpY2F0b3JzL2luZGljYXRvcnMtZGlyZWN0aXZlLmpzIiwic3JjL2ZlYXR1cmVzL3NoaWZ0eS9zaGlmdHktZGlyZWN0aXZlLmpzIiwic3JjL2ZlYXR1cmVzL3NsaWNlLWZpbHRlci9zbGljZS1maWx0ZXItZGlyZWN0aXZlLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0ZEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2akJBOztBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMzNDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJyZXF1aXJlKFwiLi9zcmMvY29yZS9hbmd1bGFyLW1vYmlsZS5qc1wiKTtcbnJlcXVpcmUoXCIuL3NyYy9jb3JlL2Jyb3dzZXJUcmlnZ2VyLmpzXCIpO1xucmVxdWlyZShcIi4vc3JjL2ZlYXR1cmVzL2F1dG8tc2xpZGUvYXV0by1zbGlkZS1kaXJlY3RpdmUuanNcIik7XG5yZXF1aXJlKFwiLi9zcmMvZmVhdHVyZXMvY2Fyb3VzZWwvY2Fyb3VzZWwtZGlyZWN0aXZlLmpzXCIpO1xucmVxdWlyZShcIi4vc3JjL2ZlYXR1cmVzL2NvbnRyb2xzL2NvbnRyb2xzLWRpcmVjdGl2ZS5qc1wiKTtcbnJlcXVpcmUoXCIuL3NyYy9mZWF0dXJlcy9pbmRpY2F0b3JzL2luZGljYXRvcnMtZGlyZWN0aXZlLmpzXCIpO1xucmVxdWlyZShcIi4vc3JjL2ZlYXR1cmVzL3NsaWNlLWZpbHRlci9zbGljZS1maWx0ZXItZGlyZWN0aXZlLmpzXCIpO1xucmVxdWlyZShcIi4vc3JjL2ZlYXR1cmVzL3NoaWZ0eS9zaGlmdHktZGlyZWN0aXZlLmpzXCIpO1xuIiwiLyoqXG4gKiBAbGljZW5zZSBBbmd1bGFySlMgdjEuMS41LTM4MTQ5ODZcbiAqIChjKSAyMDEwLTIwMTIgR29vZ2xlLCBJbmMuIGh0dHA6Ly9hbmd1bGFyanMub3JnXG4gKiBMaWNlbnNlOiBNSVRcbiAqL1xuKGZ1bmN0aW9uKHdpbmRvdywgYW5ndWxhciwgdW5kZWZpbmVkKSB7XG4ndXNlIHN0cmljdCc7XG5cbi8qKlxuICogQG5nZG9jIG92ZXJ2aWV3XG4gKiBAbmFtZSBuZ01vYmlsZVxuICogQGRlc2NyaXB0aW9uXG4gKiBUb3VjaCBldmVudHMgYW5kIG90aGVyIG1vYmlsZSBoZWxwZXJzLlxuICogQmFzZWQgb24galF1ZXJ5IE1vYmlsZSB0b3VjaCBldmVudCBoYW5kbGluZyAoanF1ZXJ5bW9iaWxlLmNvbSlcbiAqL1xuXG4vLyBkZWZpbmUgbmdNb2JpbGUgbW9kdWxlXG52YXIgbmdNb2JpbGUgPSBhbmd1bGFyLm1vZHVsZSgnbmdNb2JpbGUnLCBbXSk7XG5cbi8qKlxuICogQSBzZXJ2aWNlIGZvciBhYnN0cmFjdGluZyBzd2lwZSBiZWhhdmlvci4gRGVsaWJlcmF0ZWx5IGludGVybmFsOyBpdCBpcyBvbmx5IGludGVuZGVkIGZvciB1c2UgaW5cbiAqIG5nU3dpcGVMZWZ0L1JpZ2h0IGFuZCBuZ0Nhcm91c2VsLlxuICpcbiAqIERldGVybWluaW5nIHdoZXRoZXIgdGhlIHVzZXIgaXMgc3dpcGluZyBvciBzY3JvbGxpbmcsIGFuZCBoYW5kbGluZyBib3RoIG1vdXNlIGFuZCB0b3VjaCBldmVudHMsXG4gKiBtYWtlIHdyaXRpbmcgc3dpcGUgY29kZSBjaGFsbGVuZ2luZy4gVGhpcyBzZXJ2aWNlIGFsbG93cyBzZXR0aW5nIGNhbGxiYWNrcyBvbiB0aGUgc3RhcnQsXG4gKiBtb3ZlbWVudCBhbmQgY29tcGxldGlvbiBvZiBhIHN3aXBlIGdlc3R1cmUsIHdpdGhvdXQgd29ycnlpbmcgYWJvdXQgdGhlIGNvbXBsaWNhdGlvbnMuXG4gKlxuICovXG5cbm5nTW9iaWxlLmZhY3RvcnkoJyRzd2lwZScsIFtmdW5jdGlvbigpIHtcbiAgLy8gVGhlIHRvdGFsIGRpc3RhbmNlIGluIGFueSBkaXJlY3Rpb24gYmVmb3JlIHdlIG1ha2UgdGhlIGNhbGwgb24gc3dpcGUgdnMuIHNjcm9sbC5cbiAgdmFyIE1PVkVfQlVGRkVSX1JBRElVUyA9IDEwO1xuXG4gIC8vIEFic29sdXRlIHRvdGFsIG1vdmVtZW50LCB1c2VkIHRvIGNvbnRyb2wgc3dpcGUgdnMuIHNjcm9sbC5cbiAgdmFyIHRvdGFsWCwgdG90YWxZO1xuICAvLyBDb29yZGluYXRlcyBvZiB0aGUgc3RhcnQgcG9zaXRpb24uXG4gIHZhciBzdGFydENvb3JkcztcbiAgLy8gTGFzdCBldmVudCdzIHBvc2l0aW9uLlxuICB2YXIgbGFzdFBvcztcbiAgLy8gV2hldGhlciBhIHN3aXBlIGlzIGFjdGl2ZS5cbiAgdmFyIGFjdGl2ZSA9IGZhbHNlO1xuXG4gIGZ1bmN0aW9uIGdldENvb3JkaW5hdGVzKGV2ZW50KSB7XG4gICAgdmFyIHRvdWNoZXMgPSBldmVudC50b3VjaGVzICYmIGV2ZW50LnRvdWNoZXMubGVuZ3RoID8gZXZlbnQudG91Y2hlcyA6IFtldmVudF07XG4gICAgdmFyIGUgPSAoZXZlbnQuY2hhbmdlZFRvdWNoZXMgJiYgZXZlbnQuY2hhbmdlZFRvdWNoZXNbMF0pIHx8XG4gICAgICAgIChldmVudC5vcmlnaW5hbEV2ZW50ICYmIGV2ZW50Lm9yaWdpbmFsRXZlbnQuY2hhbmdlZFRvdWNoZXMgJiZcbiAgICAgICAgICAgIGV2ZW50Lm9yaWdpbmFsRXZlbnQuY2hhbmdlZFRvdWNoZXNbMF0pIHx8XG4gICAgICAgIHRvdWNoZXNbMF0ub3JpZ2luYWxFdmVudCB8fCB0b3VjaGVzWzBdO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHg6IGUuY2xpZW50WCxcbiAgICAgIHk6IGUuY2xpZW50WVxuICAgIH07XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGJpbmQ6IGZ1bmN0aW9uKGVsZW1lbnQsIGV2ZW50cykge1xuICAgICAgZWxlbWVudC5iaW5kKCd0b3VjaHN0YXJ0IG1vdXNlZG93bicsIGZ1bmN0aW9uKGV2ZW50KSB7XG4gICAgICAgIHN0YXJ0Q29vcmRzID0gZ2V0Q29vcmRpbmF0ZXMoZXZlbnQpO1xuICAgICAgICBhY3RpdmUgPSB0cnVlO1xuICAgICAgICB0b3RhbFggPSAwO1xuICAgICAgICB0b3RhbFkgPSAwO1xuICAgICAgICBsYXN0UG9zID0gc3RhcnRDb29yZHM7XG4gICAgICAgIGV2ZW50c1snc3RhcnQnXSAmJiBldmVudHNbJ3N0YXJ0J10oc3RhcnRDb29yZHMpO1xuICAgICAgfSk7XG5cbiAgICAgIGVsZW1lbnQuYmluZCgndG91Y2hjYW5jZWwnLCBmdW5jdGlvbihldmVudCkge1xuICAgICAgICBhY3RpdmUgPSBmYWxzZTtcbiAgICAgICAgZXZlbnRzWydjYW5jZWwnXSAmJiBldmVudHNbJ2NhbmNlbCddKCk7XG4gICAgICB9KTtcblxuICAgICAgZWxlbWVudC5iaW5kKCd0b3VjaG1vdmUgbW91c2Vtb3ZlJywgZnVuY3Rpb24oZXZlbnQpIHtcbiAgICAgICAgaWYgKCFhY3RpdmUpIHJldHVybjtcblxuICAgICAgICAvLyBBbmRyb2lkIHdpbGwgc2VuZCBhIHRvdWNoY2FuY2VsIGlmIGl0IHRoaW5rcyB3ZSdyZSBzdGFydGluZyB0byBzY3JvbGwuXG4gICAgICAgIC8vIFNvIHdoZW4gdGhlIHRvdGFsIGRpc3RhbmNlICgrIG9yIC0gb3IgYm90aCkgZXhjZWVkcyAxMHB4IGluIGVpdGhlciBkaXJlY3Rpb24sXG4gICAgICAgIC8vIHdlIGVpdGhlcjpcbiAgICAgICAgLy8gLSBPbiB0b3RhbFggPiB0b3RhbFksIHdlIHNlbmQgcHJldmVudERlZmF1bHQoKSBhbmQgdHJlYXQgdGhpcyBhcyBhIHN3aXBlLlxuICAgICAgICAvLyAtIE9uIHRvdGFsWSA+IHRvdGFsWCwgd2UgbGV0IHRoZSBicm93c2VyIGhhbmRsZSBpdCBhcyBhIHNjcm9sbC5cblxuICAgICAgICBpZiAoIXN0YXJ0Q29vcmRzKSByZXR1cm47XG4gICAgICAgIHZhciBjb29yZHMgPSBnZXRDb29yZGluYXRlcyhldmVudCk7XG5cbiAgICAgICAgdG90YWxYICs9IE1hdGguYWJzKGNvb3Jkcy54IC0gbGFzdFBvcy54KTtcbiAgICAgICAgdG90YWxZICs9IE1hdGguYWJzKGNvb3Jkcy55IC0gbGFzdFBvcy55KTtcblxuICAgICAgICBsYXN0UG9zID0gY29vcmRzO1xuXG4gICAgICAgIGlmICh0b3RhbFggPCBNT1ZFX0JVRkZFUl9SQURJVVMgJiYgdG90YWxZIDwgTU9WRV9CVUZGRVJfUkFESVVTKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gT25lIG9mIHRvdGFsWCBvciB0b3RhbFkgaGFzIGV4Y2VlZGVkIHRoZSBidWZmZXIsIHNvIGRlY2lkZSBvbiBzd2lwZSB2cy4gc2Nyb2xsLlxuICAgICAgICBpZiAodG90YWxZID4gdG90YWxYKSB7XG4gICAgICAgICAgLy8gQWxsb3cgbmF0aXZlIHNjcm9sbGluZyB0byB0YWtlIG92ZXIuXG4gICAgICAgICAgYWN0aXZlID0gZmFsc2U7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIFByZXZlbnQgdGhlIGJyb3dzZXIgZnJvbSBzY3JvbGxpbmcuXG4gICAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcblxuICAgICAgICAgIGV2ZW50c1snbW92ZSddICYmIGV2ZW50c1snbW92ZSddKGNvb3Jkcyk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICBlbGVtZW50LmJpbmQoJ3RvdWNoZW5kIG1vdXNldXAnLCBmdW5jdGlvbihldmVudCkge1xuICAgICAgICBpZiAoIWFjdGl2ZSkgcmV0dXJuO1xuICAgICAgICBhY3RpdmUgPSBmYWxzZTtcbiAgICAgICAgZXZlbnRzWydlbmQnXSAmJiBldmVudHNbJ2VuZCddKGdldENvb3JkaW5hdGVzKGV2ZW50KSk7XG4gICAgICB9KTtcbiAgICB9XG4gIH07XG59XSk7XG5cbi8qKlxuICogQG5nZG9jIGRpcmVjdGl2ZVxuICogQG5hbWUgbmdNb2JpbGUuZGlyZWN0aXZlOm5nVGFwXG4gKlxuICogQGRlc2NyaXB0aW9uXG4gKiBTcGVjaWZ5IGN1c3RvbSBiZWhhdmlvciB3aGVuIGVsZW1lbnQgaXMgdGFwcGVkIG9uIGEgdG91Y2hzY3JlZW4gZGV2aWNlLlxuICogQSB0YXAgaXMgYSBicmllZiwgZG93bi1hbmQtdXAgdG91Y2ggd2l0aG91dCBtdWNoIG1vdGlvbi5cbiAqXG4gKiBAZWxlbWVudCBBTllcbiAqIEBwYXJhbSB7ZXhwcmVzc2lvbn0gbmdDbGljayB7QGxpbmsgZ3VpZGUvZXhwcmVzc2lvbiBFeHByZXNzaW9ufSB0byBldmFsdWF0ZVxuICogdXBvbiB0YXAuIChFdmVudCBvYmplY3QgaXMgYXZhaWxhYmxlIGFzIGAkZXZlbnRgKVxuICpcbiAqIEBleGFtcGxlXG4gICAgPGRvYzpleGFtcGxlPlxuICAgICAgPGRvYzpzb3VyY2U+XG4gICAgICAgIDxidXR0b24gbmctdGFwPVwiY291bnQgPSBjb3VudCArIDFcIiBuZy1pbml0PVwiY291bnQ9MFwiPlxuICAgICAgICAgIEluY3JlbWVudFxuICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgY291bnQ6IHt7IGNvdW50IH19XG4gICAgICA8L2RvYzpzb3VyY2U+XG4gICAgPC9kb2M6ZXhhbXBsZT5cbiAqL1xuXG5uZ01vYmlsZS5jb25maWcoWyckcHJvdmlkZScsIGZ1bmN0aW9uKCRwcm92aWRlKSB7XG4gICRwcm92aWRlLmRlY29yYXRvcignbmdDbGlja0RpcmVjdGl2ZScsIFsnJGRlbGVnYXRlJywgZnVuY3Rpb24oJGRlbGVnYXRlKSB7XG4gICAgLy8gZHJvcCB0aGUgZGVmYXVsdCBuZ0NsaWNrIGRpcmVjdGl2ZVxuICAgICRkZWxlZ2F0ZS5zaGlmdCgpO1xuICAgIHJldHVybiAkZGVsZWdhdGU7XG4gIH1dKTtcbn1dKTtcblxubmdNb2JpbGUuZGlyZWN0aXZlKCduZ0NsaWNrJywgWyckcGFyc2UnLCAnJHRpbWVvdXQnLCAnJHJvb3RFbGVtZW50JyxcbiAgICBmdW5jdGlvbigkcGFyc2UsICR0aW1lb3V0LCAkcm9vdEVsZW1lbnQpIHtcbiAgdmFyIFRBUF9EVVJBVElPTiA9IDc1MDsgLy8gU2hvcnRlciB0aGFuIDc1MG1zIGlzIGEgdGFwLCBsb25nZXIgaXMgYSB0YXBob2xkIG9yIGRyYWcuXG4gIHZhciBNT1ZFX1RPTEVSQU5DRSA9IDEyOyAvLyAxMnB4IHNlZW1zIHRvIHdvcmsgaW4gbW9zdCBtb2JpbGUgYnJvd3NlcnMuXG4gIHZhciBQUkVWRU5UX0RVUkFUSU9OID0gMjUwMDsgLy8gMi41IHNlY29uZHMgbWF4aW11bSBmcm9tIHByZXZlbnRHaG9zdENsaWNrIGNhbGwgdG8gY2xpY2tcbiAgdmFyIENMSUNLQlVTVEVSX1RIUkVTSE9MRCA9IDI1OyAvLyAyNSBwaXhlbHMgaW4gYW55IGRpbWVuc2lvbiBpcyB0aGUgbGltaXQgZm9yIGJ1c3RpbmcgY2xpY2tzLlxuICB2YXIgbGFzdFByZXZlbnRlZFRpbWU7XG4gIHZhciB0b3VjaENvb3JkaW5hdGVzO1xuXG5cbiAgLy8gVEFQIEVWRU5UUyBBTkQgR0hPU1QgQ0xJQ0tTXG4gIC8vXG4gIC8vIFdoeSB0YXAgZXZlbnRzP1xuICAvLyBNb2JpbGUgYnJvd3NlcnMgZGV0ZWN0IGEgdGFwLCB0aGVuIHdhaXQgYSBtb21lbnQgKHVzdWFsbHkgfjMwMG1zKSB0byBzZWUgaWYgeW91J3JlXG4gIC8vIGRvdWJsZS10YXBwaW5nLCBhbmQgdGhlbiBmaXJlIGEgY2xpY2sgZXZlbnQuXG4gIC8vXG4gIC8vIFRoaXMgZGVsYXkgc3Vja3MgYW5kIG1ha2VzIG1vYmlsZSBhcHBzIGZlZWwgdW5yZXNwb25zaXZlLlxuICAvLyBTbyB3ZSBkZXRlY3QgdG91Y2hzdGFydCwgdG91Y2htb3ZlLCB0b3VjaGNhbmNlbCBhbmQgdG91Y2hlbmQgb3Vyc2VsdmVzIGFuZCBkZXRlcm1pbmUgd2hlblxuICAvLyB0aGUgdXNlciBoYXMgdGFwcGVkIG9uIHNvbWV0aGluZy5cbiAgLy9cbiAgLy8gV2hhdCBoYXBwZW5zIHdoZW4gdGhlIGJyb3dzZXIgdGhlbiBnZW5lcmF0ZXMgYSBjbGljayBldmVudD9cbiAgLy8gVGhlIGJyb3dzZXIsIG9mIGNvdXJzZSwgYWxzbyBkZXRlY3RzIHRoZSB0YXAgYW5kIGZpcmVzIGEgY2xpY2sgYWZ0ZXIgYSBkZWxheS4gVGhpcyByZXN1bHRzIGluXG4gIC8vIHRhcHBpbmcvY2xpY2tpbmcgdHdpY2UuIFNvIHdlIGRvIFwiY2xpY2tidXN0aW5nXCIgdG8gcHJldmVudCBpdC5cbiAgLy9cbiAgLy8gSG93IGRvZXMgaXQgd29yaz9cbiAgLy8gV2UgYXR0YWNoIGdsb2JhbCB0b3VjaHN0YXJ0IGFuZCBjbGljayBoYW5kbGVycywgdGhhdCBydW4gZHVyaW5nIHRoZSBjYXB0dXJlIChlYXJseSkgcGhhc2UuXG4gIC8vIFNvIHRoZSBzZXF1ZW5jZSBmb3IgYSB0YXAgaXM6XG4gIC8vIC0gZ2xvYmFsIHRvdWNoc3RhcnQ6IFNldHMgYW4gXCJhbGxvd2FibGUgcmVnaW9uXCIgYXQgdGhlIHBvaW50IHRvdWNoZWQuXG4gIC8vIC0gZWxlbWVudCdzIHRvdWNoc3RhcnQ6IFN0YXJ0cyBhIHRvdWNoXG4gIC8vICgtIHRvdWNobW92ZSBvciB0b3VjaGNhbmNlbCBlbmRzIHRoZSB0b3VjaCwgbm8gY2xpY2sgZm9sbG93cylcbiAgLy8gLSBlbGVtZW50J3MgdG91Y2hlbmQ6IERldGVybWluZXMgaWYgdGhlIHRhcCBpcyB2YWxpZCAoZGlkbid0IG1vdmUgdG9vIGZhciBhd2F5LCBkaWRuJ3QgaG9sZFxuICAvLyAgIHRvbyBsb25nKSBhbmQgZmlyZXMgdGhlIHVzZXIncyB0YXAgaGFuZGxlci4gVGhlIHRvdWNoZW5kIGFsc28gY2FsbHMgcHJldmVudEdob3N0Q2xpY2soKS5cbiAgLy8gLSBwcmV2ZW50R2hvc3RDbGljaygpIHJlbW92ZXMgdGhlIGFsbG93YWJsZSByZWdpb24gdGhlIGdsb2JhbCB0b3VjaHN0YXJ0IGNyZWF0ZWQuXG4gIC8vIC0gVGhlIGJyb3dzZXIgZ2VuZXJhdGVzIGEgY2xpY2sgZXZlbnQuXG4gIC8vIC0gVGhlIGdsb2JhbCBjbGljayBoYW5kbGVyIGNhdGNoZXMgdGhlIGNsaWNrLCBhbmQgY2hlY2tzIHdoZXRoZXIgaXQgd2FzIGluIGFuIGFsbG93YWJsZSByZWdpb24uXG4gIC8vICAgICAtIElmIHByZXZlbnRHaG9zdENsaWNrIHdhcyBjYWxsZWQsIHRoZSByZWdpb24gd2lsbCBoYXZlIGJlZW4gcmVtb3ZlZCwgdGhlIGNsaWNrIGlzIGJ1c3RlZC5cbiAgLy8gICAgIC0gSWYgdGhlIHJlZ2lvbiBpcyBzdGlsbCB0aGVyZSwgdGhlIGNsaWNrIHByb2NlZWRzIG5vcm1hbGx5LiBUaGVyZWZvcmUgY2xpY2tzIG9uIGxpbmtzIGFuZFxuICAvLyAgICAgICBvdGhlciBlbGVtZW50cyB3aXRob3V0IG5nVGFwIG9uIHRoZW0gd29yayBub3JtYWxseS5cbiAgLy9cbiAgLy8gVGhpcyBpcyBhbiB1Z2x5LCB0ZXJyaWJsZSBoYWNrIVxuICAvLyBZZWFoLCB0ZWxsIG1lIGFib3V0IGl0LiBUaGUgYWx0ZXJuYXRpdmVzIGFyZSB1c2luZyB0aGUgc2xvdyBjbGljayBldmVudHMsIG9yIG1ha2luZyBvdXIgdXNlcnNcbiAgLy8gZGVhbCB3aXRoIHRoZSBnaG9zdCBjbGlja3MsIHNvIEkgY29uc2lkZXIgdGhpcyB0aGUgbGVhc3Qgb2YgZXZpbHMuIEZvcnR1bmF0ZWx5IEFuZ3VsYXJcbiAgLy8gZW5jYXBzdWxhdGVzIHRoaXMgdWdseSBsb2dpYyBhd2F5IGZyb20gdGhlIHVzZXIuXG4gIC8vXG4gIC8vIFdoeSBub3QganVzdCBwdXQgY2xpY2sgaGFuZGxlcnMgb24gdGhlIGVsZW1lbnQ/XG4gIC8vIFdlIGRvIHRoYXQgdG9vLCBqdXN0IHRvIGJlIHN1cmUuIFRoZSBwcm9ibGVtIGlzIHRoYXQgdGhlIHRhcCBldmVudCBtaWdodCBoYXZlIGNhdXNlZCB0aGUgRE9NXG4gIC8vIHRvIGNoYW5nZSwgc28gdGhhdCB0aGUgY2xpY2sgZmlyZXMgaW4gdGhlIHNhbWUgcG9zaXRpb24gYnV0IHNvbWV0aGluZyBlbHNlIGlzIHRoZXJlIG5vdy4gU29cbiAgLy8gdGhlIGhhbmRsZXJzIGFyZSBnbG9iYWwgYW5kIGNhcmUgb25seSBhYm91dCBjb29yZGluYXRlcyBhbmQgbm90IGVsZW1lbnRzLlxuXG4gIC8vIENoZWNrcyBpZiB0aGUgY29vcmRpbmF0ZXMgYXJlIGNsb3NlIGVub3VnaCB0byBiZSB3aXRoaW4gdGhlIHJlZ2lvbi5cbiAgZnVuY3Rpb24gaGl0KHgxLCB5MSwgeDIsIHkyKSB7XG4gICAgcmV0dXJuIE1hdGguYWJzKHgxIC0geDIpIDwgQ0xJQ0tCVVNURVJfVEhSRVNIT0xEICYmIE1hdGguYWJzKHkxIC0geTIpIDwgQ0xJQ0tCVVNURVJfVEhSRVNIT0xEO1xuICB9XG5cbiAgLy8gQ2hlY2tzIGEgbGlzdCBvZiBhbGxvd2FibGUgcmVnaW9ucyBhZ2FpbnN0IGEgY2xpY2sgbG9jYXRpb24uXG4gIC8vIFJldHVybnMgdHJ1ZSBpZiB0aGUgY2xpY2sgc2hvdWxkIGJlIGFsbG93ZWQuXG4gIC8vIFNwbGljZXMgb3V0IHRoZSBhbGxvd2FibGUgcmVnaW9uIGZyb20gdGhlIGxpc3QgYWZ0ZXIgaXQgaGFzIGJlZW4gdXNlZC5cbiAgZnVuY3Rpb24gY2hlY2tBbGxvd2FibGVSZWdpb25zKHRvdWNoQ29vcmRpbmF0ZXMsIHgsIHkpIHtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRvdWNoQ29vcmRpbmF0ZXMubGVuZ3RoOyBpICs9IDIpIHtcbiAgICAgIGlmIChoaXQodG91Y2hDb29yZGluYXRlc1tpXSwgdG91Y2hDb29yZGluYXRlc1tpKzFdLCB4LCB5KSkge1xuICAgICAgICB0b3VjaENvb3JkaW5hdGVzLnNwbGljZShpLCBpICsgMik7XG4gICAgICAgIHJldHVybiB0cnVlOyAvLyBhbGxvd2FibGUgcmVnaW9uXG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTsgLy8gTm8gYWxsb3dhYmxlIHJlZ2lvbjsgYnVzdCBpdC5cbiAgfVxuXG4gIC8vIEdsb2JhbCBjbGljayBoYW5kbGVyIHRoYXQgcHJldmVudHMgdGhlIGNsaWNrIGlmIGl0J3MgaW4gYSBidXN0YWJsZSB6b25lIGFuZCBwcmV2ZW50R2hvc3RDbGlja1xuICAvLyB3YXMgY2FsbGVkIHJlY2VudGx5LlxuICBmdW5jdGlvbiBvbkNsaWNrKGV2ZW50KSB7XG4gICAgaWYgKERhdGUubm93KCkgLSBsYXN0UHJldmVudGVkVGltZSA+IFBSRVZFTlRfRFVSQVRJT04pIHtcbiAgICAgIHJldHVybjsgLy8gVG9vIG9sZC5cbiAgICB9XG5cbiAgICB2YXIgdG91Y2hlcyA9IGV2ZW50LnRvdWNoZXMgJiYgZXZlbnQudG91Y2hlcy5sZW5ndGggPyBldmVudC50b3VjaGVzIDogW2V2ZW50XTtcbiAgICB2YXIgeCA9IHRvdWNoZXNbMF0uY2xpZW50WDtcbiAgICB2YXIgeSA9IHRvdWNoZXNbMF0uY2xpZW50WTtcbiAgICAvLyBXb3JrIGFyb3VuZCBkZXNrdG9wIFdlYmtpdCBxdWlyayB3aGVyZSBjbGlja2luZyBhIGxhYmVsIHdpbGwgZmlyZSB0d28gY2xpY2tzIChvbiB0aGUgbGFiZWxcbiAgICAvLyBhbmQgb24gdGhlIGlucHV0IGVsZW1lbnQpLiBEZXBlbmRpbmcgb24gdGhlIGV4YWN0IGJyb3dzZXIsIHRoaXMgc2Vjb25kIGNsaWNrIHdlIGRvbid0IHdhbnRcbiAgICAvLyB0byBidXN0IGhhcyBlaXRoZXIgKDAsMCkgb3IgbmVnYXRpdmUgY29vcmRpbmF0ZXMuXG4gICAgaWYgKHggPCAxICYmIHkgPCAxKSB7XG4gICAgICByZXR1cm47IC8vIG9mZnNjcmVlblxuICAgIH1cblxuICAgIC8vIExvb2sgZm9yIGFuIGFsbG93YWJsZSByZWdpb24gY29udGFpbmluZyB0aGlzIGNsaWNrLlxuICAgIC8vIElmIHdlIGZpbmQgb25lLCB0aGF0IG1lYW5zIGl0IHdhcyBjcmVhdGVkIGJ5IHRvdWNoc3RhcnQgYW5kIG5vdCByZW1vdmVkIGJ5XG4gICAgLy8gcHJldmVudEdob3N0Q2xpY2ssIHNvIHdlIGRvbid0IGJ1c3QgaXQuXG4gICAgaWYgKGNoZWNrQWxsb3dhYmxlUmVnaW9ucyh0b3VjaENvb3JkaW5hdGVzLCB4LCB5KSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIElmIHdlIGRpZG4ndCBmaW5kIGFuIGFsbG93YWJsZSByZWdpb24sIGJ1c3QgdGhlIGNsaWNrLlxuICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gIH1cblxuXG4gIC8vIEdsb2JhbCB0b3VjaHN0YXJ0IGhhbmRsZXIgdGhhdCBjcmVhdGVzIGFuIGFsbG93YWJsZSByZWdpb24gZm9yIGEgY2xpY2sgZXZlbnQuXG4gIC8vIFRoaXMgYWxsb3dhYmxlIHJlZ2lvbiBjYW4gYmUgcmVtb3ZlZCBieSBwcmV2ZW50R2hvc3RDbGljayBpZiB3ZSB3YW50IHRvIGJ1c3QgaXQuXG4gIGZ1bmN0aW9uIG9uVG91Y2hTdGFydChldmVudCkge1xuICAgIHZhciB0b3VjaGVzID0gZXZlbnQudG91Y2hlcyAmJiBldmVudC50b3VjaGVzLmxlbmd0aCA/IGV2ZW50LnRvdWNoZXMgOiBbZXZlbnRdO1xuICAgIHZhciB4ID0gdG91Y2hlc1swXS5jbGllbnRYO1xuICAgIHZhciB5ID0gdG91Y2hlc1swXS5jbGllbnRZO1xuICAgIHRvdWNoQ29vcmRpbmF0ZXMucHVzaCh4LCB5KTtcblxuICAgICR0aW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgLy8gUmVtb3ZlIHRoZSBhbGxvd2FibGUgcmVnaW9uLlxuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0b3VjaENvb3JkaW5hdGVzLmxlbmd0aDsgaSArPSAyKSB7XG4gICAgICAgIGlmICh0b3VjaENvb3JkaW5hdGVzW2ldID09IHggJiYgdG91Y2hDb29yZGluYXRlc1tpKzFdID09IHkpIHtcbiAgICAgICAgICB0b3VjaENvb3JkaW5hdGVzLnNwbGljZShpLCBpICsgMik7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSwgUFJFVkVOVF9EVVJBVElPTiwgZmFsc2UpO1xuICB9XG5cbiAgLy8gT24gdGhlIGZpcnN0IGNhbGwsIGF0dGFjaGVzIHNvbWUgZXZlbnQgaGFuZGxlcnMuIFRoZW4gd2hlbmV2ZXIgaXQgZ2V0cyBjYWxsZWQsIGl0IGNyZWF0ZXMgYVxuICAvLyB6b25lIGFyb3VuZCB0aGUgdG91Y2hzdGFydCB3aGVyZSBjbGlja3Mgd2lsbCBnZXQgYnVzdGVkLlxuICBmdW5jdGlvbiBwcmV2ZW50R2hvc3RDbGljayh4LCB5KSB7XG4gICAgaWYgKCF0b3VjaENvb3JkaW5hdGVzKSB7XG4gICAgICAkcm9vdEVsZW1lbnRbMF0uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBvbkNsaWNrLCB0cnVlKTtcbiAgICAgICRyb290RWxlbWVudFswXS5hZGRFdmVudExpc3RlbmVyKCd0b3VjaHN0YXJ0Jywgb25Ub3VjaFN0YXJ0LCB0cnVlKTtcbiAgICAgIHRvdWNoQ29vcmRpbmF0ZXMgPSBbXTtcbiAgICB9XG5cbiAgICBsYXN0UHJldmVudGVkVGltZSA9IERhdGUubm93KCk7XG5cbiAgICBjaGVja0FsbG93YWJsZVJlZ2lvbnModG91Y2hDb29yZGluYXRlcywgeCwgeSk7XG4gIH1cblxuICAvLyBBY3R1YWwgbGlua2luZyBmdW5jdGlvbi5cbiAgcmV0dXJuIGZ1bmN0aW9uKHNjb3BlLCBlbGVtZW50LCBhdHRyKSB7XG4gICAgdmFyIGNsaWNrSGFuZGxlciA9ICRwYXJzZShhdHRyLm5nQ2xpY2spLFxuICAgICAgICB0YXBwaW5nID0gZmFsc2UsXG4gICAgICAgIHRhcEVsZW1lbnQsICAvLyBVc2VkIHRvIGJsdXIgdGhlIGVsZW1lbnQgYWZ0ZXIgYSB0YXAuXG4gICAgICAgIHN0YXJ0VGltZSwgICAvLyBVc2VkIHRvIGNoZWNrIGlmIHRoZSB0YXAgd2FzIGhlbGQgdG9vIGxvbmcuXG4gICAgICAgIHRvdWNoU3RhcnRYLFxuICAgICAgICB0b3VjaFN0YXJ0WTtcblxuICAgIGZ1bmN0aW9uIHJlc2V0U3RhdGUoKSB7XG4gICAgICB0YXBwaW5nID0gZmFsc2U7XG4gICAgfVxuXG4gICAgZWxlbWVudC5iaW5kKCd0b3VjaHN0YXJ0JywgZnVuY3Rpb24oZXZlbnQpIHtcbiAgICAgIHRhcHBpbmcgPSB0cnVlO1xuICAgICAgdGFwRWxlbWVudCA9IGV2ZW50LnRhcmdldCA/IGV2ZW50LnRhcmdldCA6IGV2ZW50LnNyY0VsZW1lbnQ7IC8vIElFIHVzZXMgc3JjRWxlbWVudC5cbiAgICAgIC8vIEhhY2sgZm9yIFNhZmFyaSwgd2hpY2ggY2FuIHRhcmdldCB0ZXh0IG5vZGVzIGluc3RlYWQgb2YgY29udGFpbmVycy5cbiAgICAgIGlmKHRhcEVsZW1lbnQubm9kZVR5cGUgPT0gMykge1xuICAgICAgICB0YXBFbGVtZW50ID0gdGFwRWxlbWVudC5wYXJlbnROb2RlO1xuICAgICAgfVxuXG4gICAgICBzdGFydFRpbWUgPSBEYXRlLm5vdygpO1xuXG4gICAgICB2YXIgdG91Y2hlcyA9IGV2ZW50LnRvdWNoZXMgJiYgZXZlbnQudG91Y2hlcy5sZW5ndGggPyBldmVudC50b3VjaGVzIDogW2V2ZW50XTtcbiAgICAgIHZhciBlID0gdG91Y2hlc1swXS5vcmlnaW5hbEV2ZW50IHx8IHRvdWNoZXNbMF07XG4gICAgICB0b3VjaFN0YXJ0WCA9IGUuY2xpZW50WDtcbiAgICAgIHRvdWNoU3RhcnRZID0gZS5jbGllbnRZO1xuICAgIH0pO1xuXG4gICAgZWxlbWVudC5iaW5kKCd0b3VjaG1vdmUnLCBmdW5jdGlvbihldmVudCkge1xuICAgICAgcmVzZXRTdGF0ZSgpO1xuICAgIH0pO1xuXG4gICAgZWxlbWVudC5iaW5kKCd0b3VjaGNhbmNlbCcsIGZ1bmN0aW9uKGV2ZW50KSB7XG4gICAgICByZXNldFN0YXRlKCk7XG4gICAgfSk7XG5cbiAgICBlbGVtZW50LmJpbmQoJ3RvdWNoZW5kJywgZnVuY3Rpb24oZXZlbnQpIHtcbiAgICAgIHZhciBkaWZmID0gRGF0ZS5ub3coKSAtIHN0YXJ0VGltZTtcblxuICAgICAgdmFyIHRvdWNoZXMgPSAoZXZlbnQuY2hhbmdlZFRvdWNoZXMgJiYgZXZlbnQuY2hhbmdlZFRvdWNoZXMubGVuZ3RoKSA/IGV2ZW50LmNoYW5nZWRUb3VjaGVzIDpcbiAgICAgICAgICAoKGV2ZW50LnRvdWNoZXMgJiYgZXZlbnQudG91Y2hlcy5sZW5ndGgpID8gZXZlbnQudG91Y2hlcyA6IFtldmVudF0pO1xuICAgICAgdmFyIGUgPSB0b3VjaGVzWzBdLm9yaWdpbmFsRXZlbnQgfHwgdG91Y2hlc1swXTtcbiAgICAgIHZhciB4ID0gZS5jbGllbnRYO1xuICAgICAgdmFyIHkgPSBlLmNsaWVudFk7XG4gICAgICB2YXIgZGlzdCA9IE1hdGguc3FydCggTWF0aC5wb3coeCAtIHRvdWNoU3RhcnRYLCAyKSArIE1hdGgucG93KHkgLSB0b3VjaFN0YXJ0WSwgMikgKTtcblxuICAgICAgaWYgKHRhcHBpbmcgJiYgZGlmZiA8IFRBUF9EVVJBVElPTiAmJiBkaXN0IDwgTU9WRV9UT0xFUkFOQ0UpIHtcbiAgICAgICAgLy8gQ2FsbCBwcmV2ZW50R2hvc3RDbGljayBzbyB0aGUgY2xpY2tidXN0ZXIgd2lsbCBjYXRjaCB0aGUgY29ycmVzcG9uZGluZyBjbGljay5cbiAgICAgICAgcHJldmVudEdob3N0Q2xpY2soeCwgeSk7XG5cbiAgICAgICAgLy8gQmx1ciB0aGUgZm9jdXNlZCBlbGVtZW50ICh0aGUgYnV0dG9uLCBwcm9iYWJseSkgYmVmb3JlIGZpcmluZyB0aGUgY2FsbGJhY2suXG4gICAgICAgIC8vIFRoaXMgZG9lc24ndCB3b3JrIHBlcmZlY3RseSBvbiBBbmRyb2lkIENocm9tZSwgYnV0IHNlZW1zIHRvIHdvcmsgZWxzZXdoZXJlLlxuICAgICAgICAvLyBJIGNvdWxkbid0IGdldCBhbnl0aGluZyB0byB3b3JrIHJlbGlhYmx5IG9uIEFuZHJvaWQgQ2hyb21lLlxuICAgICAgICBpZiAodGFwRWxlbWVudCkge1xuICAgICAgICAgIHRhcEVsZW1lbnQuYmx1cigpO1xuICAgICAgICB9XG5cbiAgICAgICAgc2NvcGUuJGFwcGx5KGZ1bmN0aW9uKCkge1xuICAgICAgICAgIC8vIFRPRE8oYnJhZGVuKTogVGhpcyBpcyBzZW5kaW5nIHRoZSB0b3VjaGVuZCwgbm90IGEgdGFwIG9yIGNsaWNrLiBJcyB0aGF0IGtvc2hlcj9cbiAgICAgICAgICBjbGlja0hhbmRsZXIoc2NvcGUsIHskZXZlbnQ6IGV2ZW50fSk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICAgdGFwcGluZyA9IGZhbHNlO1xuICAgIH0pO1xuXG4gICAgLy8gSGFjayBmb3IgaU9TIFNhZmFyaSdzIGJlbmVmaXQuIEl0IGdvZXMgc2VhcmNoaW5nIGZvciBvbmNsaWNrIGhhbmRsZXJzIGFuZCBpcyBsaWFibGUgdG8gY2xpY2tcbiAgICAvLyBzb21ldGhpbmcgZWxzZSBuZWFyYnkuXG4gICAgZWxlbWVudC5vbmNsaWNrID0gZnVuY3Rpb24oZXZlbnQpIHsgfTtcblxuICAgIC8vIEZhbGxiYWNrIGNsaWNrIGhhbmRsZXIuXG4gICAgLy8gQnVzdGVkIGNsaWNrcyBkb24ndCBnZXQgdGhpcyBmYXIsIGFuZCBhZGRpbmcgdGhpcyBoYW5kbGVyIGFsbG93cyBuZy10YXAgdG8gYmUgdXNlZCBvblxuICAgIC8vIGRlc2t0b3AgYXMgd2VsbCwgdG8gYWxsb3cgbW9yZSBwb3J0YWJsZSBzaXRlcy5cbiAgICBlbGVtZW50LmJpbmQoJ2NsaWNrJywgZnVuY3Rpb24oZXZlbnQpIHtcbiAgICAgIHNjb3BlLiRhcHBseShmdW5jdGlvbigpIHtcbiAgICAgICAgY2xpY2tIYW5kbGVyKHNjb3BlLCB7JGV2ZW50OiBldmVudH0pO1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH07XG59XSk7XG5cbi8qKlxuICogQG5nZG9jIGRpcmVjdGl2ZVxuICogQG5hbWUgbmdNb2JpbGUuZGlyZWN0aXZlOm5nU3dpcGVMZWZ0XG4gKlxuICogQGRlc2NyaXB0aW9uXG4gKiBTcGVjaWZ5IGN1c3RvbSBiZWhhdmlvciB3aGVuIGFuIGVsZW1lbnQgaXMgc3dpcGVkIHRvIHRoZSBsZWZ0IG9uIGEgdG91Y2hzY3JlZW4gZGV2aWNlLlxuICogQSBsZWZ0d2FyZCBzd2lwZSBpcyBhIHF1aWNrLCByaWdodC10by1sZWZ0IHNsaWRlIG9mIHRoZSBmaW5nZXIuXG4gKiBUaG91Z2ggbmdTd2lwZUxlZnQgaXMgZGVzaWduZWQgZm9yIHRvdWNoLWJhc2VkIGRldmljZXMsIGl0IHdpbGwgd29yayB3aXRoIGEgbW91c2UgY2xpY2sgYW5kIGRyYWcgdG9vLlxuICpcbiAqIEBlbGVtZW50IEFOWVxuICogQHBhcmFtIHtleHByZXNzaW9ufSBuZ1N3aXBlTGVmdCB7QGxpbmsgZ3VpZGUvZXhwcmVzc2lvbiBFeHByZXNzaW9ufSB0byBldmFsdWF0ZVxuICogdXBvbiBsZWZ0IHN3aXBlLiAoRXZlbnQgb2JqZWN0IGlzIGF2YWlsYWJsZSBhcyBgJGV2ZW50YClcbiAqXG4gKiBAZXhhbXBsZVxuICAgIDxkb2M6ZXhhbXBsZT5cbiAgICAgIDxkb2M6c291cmNlPlxuICAgICAgICA8ZGl2IG5nLXNob3c9XCIhc2hvd0FjdGlvbnNcIiBuZy1zd2lwZS1sZWZ0PVwic2hvd0FjdGlvbnMgPSB0cnVlXCI+XG4gICAgICAgICAgU29tZSBsaXN0IGNvbnRlbnQsIGxpa2UgYW4gZW1haWwgaW4gdGhlIGluYm94XG4gICAgICAgIDwvZGl2PlxuICAgICAgICA8ZGl2IG5nLXNob3c9XCJzaG93QWN0aW9uc1wiIG5nLXN3aXBlLXJpZ2h0PVwic2hvd0FjdGlvbnMgPSBmYWxzZVwiPlxuICAgICAgICAgIDxidXR0b24gbmctY2xpY2s9XCJyZXBseSgpXCI+UmVwbHk8L2J1dHRvbj5cbiAgICAgICAgICA8YnV0dG9uIG5nLWNsaWNrPVwiZGVsZXRlKClcIj5EZWxldGU8L2J1dHRvbj5cbiAgICAgICAgPC9kaXY+XG4gICAgICA8L2RvYzpzb3VyY2U+XG4gICAgPC9kb2M6ZXhhbXBsZT5cbiAqL1xuXG4vKipcbiAqIEBuZ2RvYyBkaXJlY3RpdmVcbiAqIEBuYW1lIG5nTW9iaWxlLmRpcmVjdGl2ZTpuZ1N3aXBlUmlnaHRcbiAqXG4gKiBAZGVzY3JpcHRpb25cbiAqIFNwZWNpZnkgY3VzdG9tIGJlaGF2aW9yIHdoZW4gYW4gZWxlbWVudCBpcyBzd2lwZWQgdG8gdGhlIHJpZ2h0IG9uIGEgdG91Y2hzY3JlZW4gZGV2aWNlLlxuICogQSByaWdodHdhcmQgc3dpcGUgaXMgYSBxdWljaywgbGVmdC10by1yaWdodCBzbGlkZSBvZiB0aGUgZmluZ2VyLlxuICogVGhvdWdoIG5nU3dpcGVSaWdodCBpcyBkZXNpZ25lZCBmb3IgdG91Y2gtYmFzZWQgZGV2aWNlcywgaXQgd2lsbCB3b3JrIHdpdGggYSBtb3VzZSBjbGljayBhbmQgZHJhZyB0b28uXG4gKlxuICogQGVsZW1lbnQgQU5ZXG4gKiBAcGFyYW0ge2V4cHJlc3Npb259IG5nU3dpcGVSaWdodCB7QGxpbmsgZ3VpZGUvZXhwcmVzc2lvbiBFeHByZXNzaW9ufSB0byBldmFsdWF0ZVxuICogdXBvbiByaWdodCBzd2lwZS4gKEV2ZW50IG9iamVjdCBpcyBhdmFpbGFibGUgYXMgYCRldmVudGApXG4gKlxuICogQGV4YW1wbGVcbiAgICA8ZG9jOmV4YW1wbGU+XG4gICAgICA8ZG9jOnNvdXJjZT5cbiAgICAgICAgPGRpdiBuZy1zaG93PVwiIXNob3dBY3Rpb25zXCIgbmctc3dpcGUtbGVmdD1cInNob3dBY3Rpb25zID0gdHJ1ZVwiPlxuICAgICAgICAgIFNvbWUgbGlzdCBjb250ZW50LCBsaWtlIGFuIGVtYWlsIGluIHRoZSBpbmJveFxuICAgICAgICA8L2Rpdj5cbiAgICAgICAgPGRpdiBuZy1zaG93PVwic2hvd0FjdGlvbnNcIiBuZy1zd2lwZS1yaWdodD1cInNob3dBY3Rpb25zID0gZmFsc2VcIj5cbiAgICAgICAgICA8YnV0dG9uIG5nLWNsaWNrPVwicmVwbHkoKVwiPlJlcGx5PC9idXR0b24+XG4gICAgICAgICAgPGJ1dHRvbiBuZy1jbGljaz1cImRlbGV0ZSgpXCI+RGVsZXRlPC9idXR0b24+XG4gICAgICAgIDwvZGl2PlxuICAgICAgPC9kb2M6c291cmNlPlxuICAgIDwvZG9jOmV4YW1wbGU+XG4gKi9cblxuZnVuY3Rpb24gbWFrZVN3aXBlRGlyZWN0aXZlKGRpcmVjdGl2ZU5hbWUsIGRpcmVjdGlvbikge1xuICBuZ01vYmlsZS5kaXJlY3RpdmUoZGlyZWN0aXZlTmFtZSwgWyckcGFyc2UnLCAnJHN3aXBlJywgZnVuY3Rpb24oJHBhcnNlLCAkc3dpcGUpIHtcbiAgICAvLyBUaGUgbWF4aW11bSB2ZXJ0aWNhbCBkZWx0YSBmb3IgYSBzd2lwZSBzaG91bGQgYmUgbGVzcyB0aGFuIDc1cHguXG4gICAgdmFyIE1BWF9WRVJUSUNBTF9ESVNUQU5DRSA9IDc1O1xuICAgIC8vIFZlcnRpY2FsIGRpc3RhbmNlIHNob3VsZCBub3QgYmUgbW9yZSB0aGFuIGEgZnJhY3Rpb24gb2YgdGhlIGhvcml6b250YWwgZGlzdGFuY2UuXG4gICAgdmFyIE1BWF9WRVJUSUNBTF9SQVRJTyA9IDAuMztcbiAgICAvLyBBdCBsZWFzdCBhIDMwcHggbGF0ZXJhbCBtb3Rpb24gaXMgbmVjZXNzYXJ5IGZvciBhIHN3aXBlLlxuICAgIHZhciBNSU5fSE9SSVpPTlRBTF9ESVNUQU5DRSA9IDMwO1xuXG4gICAgcmV0dXJuIGZ1bmN0aW9uKHNjb3BlLCBlbGVtZW50LCBhdHRyKSB7XG4gICAgICB2YXIgc3dpcGVIYW5kbGVyID0gJHBhcnNlKGF0dHJbZGlyZWN0aXZlTmFtZV0pO1xuXG4gICAgICB2YXIgc3RhcnRDb29yZHMsIHZhbGlkO1xuXG4gICAgICBmdW5jdGlvbiB2YWxpZFN3aXBlKGNvb3Jkcykge1xuICAgICAgICAvLyBDaGVjayB0aGF0IGl0J3Mgd2l0aGluIHRoZSBjb29yZGluYXRlcy5cbiAgICAgICAgLy8gQWJzb2x1dGUgdmVydGljYWwgZGlzdGFuY2UgbXVzdCBiZSB3aXRoaW4gdG9sZXJhbmNlcy5cbiAgICAgICAgLy8gSG9yaXpvbnRhbCBkaXN0YW5jZSwgd2UgdGFrZSB0aGUgY3VycmVudCBYIC0gdGhlIHN0YXJ0aW5nIFguXG4gICAgICAgIC8vIFRoaXMgaXMgbmVnYXRpdmUgZm9yIGxlZnR3YXJkIHN3aXBlcyBhbmQgcG9zaXRpdmUgZm9yIHJpZ2h0d2FyZCBzd2lwZXMuXG4gICAgICAgIC8vIEFmdGVyIG11bHRpcGx5aW5nIGJ5IHRoZSBkaXJlY3Rpb24gKC0xIGZvciBsZWZ0LCArMSBmb3IgcmlnaHQpLCBsZWdhbCBzd2lwZXNcbiAgICAgICAgLy8gKGllLiBzYW1lIGRpcmVjdGlvbiBhcyB0aGUgZGlyZWN0aXZlIHdhbnRzKSB3aWxsIGhhdmUgYSBwb3NpdGl2ZSBkZWx0YSBhbmRcbiAgICAgICAgLy8gaWxsZWdhbCBvbmVzIGEgbmVnYXRpdmUgZGVsdGEuXG4gICAgICAgIC8vIFRoZXJlZm9yZSB0aGlzIGRlbHRhIG11c3QgYmUgcG9zaXRpdmUsIGFuZCBsYXJnZXIgdGhhbiB0aGUgbWluaW11bS5cbiAgICAgICAgaWYgKCFzdGFydENvb3JkcykgcmV0dXJuIGZhbHNlO1xuICAgICAgICB2YXIgZGVsdGFZID0gTWF0aC5hYnMoY29vcmRzLnkgLSBzdGFydENvb3Jkcy55KTtcbiAgICAgICAgdmFyIGRlbHRhWCA9IChjb29yZHMueCAtIHN0YXJ0Q29vcmRzLngpICogZGlyZWN0aW9uO1xuICAgICAgICByZXR1cm4gdmFsaWQgJiYgLy8gU2hvcnQgY2lyY3VpdCBmb3IgYWxyZWFkeS1pbnZhbGlkYXRlZCBzd2lwZXMuXG4gICAgICAgICAgICBkZWx0YVkgPCBNQVhfVkVSVElDQUxfRElTVEFOQ0UgJiZcbiAgICAgICAgICAgIGRlbHRhWCA+IDAgJiZcbiAgICAgICAgICAgIGRlbHRhWCA+IE1JTl9IT1JJWk9OVEFMX0RJU1RBTkNFICYmXG4gICAgICAgICAgICBkZWx0YVkgLyBkZWx0YVggPCBNQVhfVkVSVElDQUxfUkFUSU87XG4gICAgICB9XG5cbiAgICAgICRzd2lwZS5iaW5kKGVsZW1lbnQsIHtcbiAgICAgICAgJ3N0YXJ0JzogZnVuY3Rpb24oY29vcmRzKSB7XG4gICAgICAgICAgc3RhcnRDb29yZHMgPSBjb29yZHM7XG4gICAgICAgICAgdmFsaWQgPSB0cnVlO1xuICAgICAgICB9LFxuICAgICAgICAnY2FuY2VsJzogZnVuY3Rpb24oKSB7XG4gICAgICAgICAgdmFsaWQgPSBmYWxzZTtcbiAgICAgICAgfSxcbiAgICAgICAgJ2VuZCc6IGZ1bmN0aW9uKGNvb3Jkcykge1xuICAgICAgICAgIGlmICh2YWxpZFN3aXBlKGNvb3JkcykpIHtcbiAgICAgICAgICAgIHNjb3BlLiRhcHBseShmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgc3dpcGVIYW5kbGVyKHNjb3BlKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfTtcbiAgfV0pO1xufVxuXG4vLyBMZWZ0IGlzIG5lZ2F0aXZlIFgtY29vcmRpbmF0ZSwgcmlnaHQgaXMgcG9zaXRpdmUuXG5tYWtlU3dpcGVEaXJlY3RpdmUoJ25nU3dpcGVMZWZ0JywgLTEpO1xubWFrZVN3aXBlRGlyZWN0aXZlKCduZ1N3aXBlUmlnaHQnLCAxKTtcblxuXG5cbn0pKHdpbmRvdywgd2luZG93LmFuZ3VsYXIpO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG4oZnVuY3Rpb24oKSB7XG4gIHZhciBtc2llID0gcGFyc2VJbnQoKC9tc2llIChcXGQrKS8uZXhlYyhuYXZpZ2F0b3IudXNlckFnZW50LnRvTG93ZXJDYXNlKCkpIHx8IFtdKVsxXSwgMTApO1xuXG4gIGZ1bmN0aW9uIGluZGV4T2YoYXJyYXksIG9iaikge1xuICAgIGlmIChhcnJheS5pbmRleE9mKSByZXR1cm4gYXJyYXkuaW5kZXhPZihvYmopO1xuXG4gICAgZm9yICggdmFyIGkgPSAwOyBpIDwgYXJyYXkubGVuZ3RoOyBpKyspIHtcbiAgICAgIGlmIChvYmogPT09IGFycmF5W2ldKSByZXR1cm4gaTtcbiAgICB9XG4gICAgcmV0dXJuIC0xO1xuICB9XG5cblxuXG4gIC8qKlxuICAgKiBUcmlnZ2VycyBhIGJyb3dzZXIgZXZlbnQuIEF0dGVtcHRzIHRvIGNob29zZSB0aGUgcmlnaHQgZXZlbnQgaWYgb25lIGlzXG4gICAqIG5vdCBzcGVjaWZpZWQuXG4gICAqXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBlbGVtZW50IEVpdGhlciBhIHdyYXBwZWQgalF1ZXJ5L2pxTGl0ZSBub2RlIG9yIGEgRE9NRWxlbWVudFxuICAgKiBAcGFyYW0ge3N0cmluZ30gZXZlbnRUeXBlIE9wdGlvbmFsIGV2ZW50IHR5cGUuXG4gICAqIEBwYXJhbSB7QXJyYXkuPHN0cmluZz49fSBrZXlzIE9wdGlvbmFsIGxpc3Qgb2YgcHJlc3NlZCBrZXlzXG4gICAqICAgICAgICAodmFsaWQgdmFsdWVzOiAnYWx0JywgJ21ldGEnLCAnc2hpZnQnLCAnY3RybCcpXG4gICAqIEBwYXJhbSB7bnVtYmVyfSB4IE9wdGlvbmFsIHgtY29vcmRpbmF0ZSBmb3IgbW91c2UvdG91Y2ggZXZlbnRzLlxuICAgKiBAcGFyYW0ge251bWJlcn0geSBPcHRpb25hbCB5LWNvb3JkaW5hdGUgZm9yIG1vdXNlL3RvdWNoIGV2ZW50cy5cbiAgICovXG4gIHdpbmRvdy5icm93c2VyVHJpZ2dlciA9IGZ1bmN0aW9uIGJyb3dzZXJUcmlnZ2VyKGVsZW1lbnQsIGV2ZW50VHlwZSwga2V5cywgeCwgeSkge1xuICAgIGlmIChlbGVtZW50ICYmICFlbGVtZW50Lm5vZGVOYW1lKSBlbGVtZW50ID0gZWxlbWVudFswXTtcbiAgICBpZiAoIWVsZW1lbnQpIHJldHVybjtcblxuICAgIHZhciBpbnB1dFR5cGUgPSAoZWxlbWVudC50eXBlKSA/IGVsZW1lbnQudHlwZS50b0xvd2VyQ2FzZSgpIDogbnVsbCxcbiAgICAgICAgbm9kZU5hbWUgPSBlbGVtZW50Lm5vZGVOYW1lLnRvTG93ZXJDYXNlKCk7XG5cbiAgICBpZiAoIWV2ZW50VHlwZSkge1xuICAgICAgZXZlbnRUeXBlID0ge1xuICAgICAgICAndGV4dCc6ICAgICAgICAgICAgJ2NoYW5nZScsXG4gICAgICAgICd0ZXh0YXJlYSc6ICAgICAgICAnY2hhbmdlJyxcbiAgICAgICAgJ2hpZGRlbic6ICAgICAgICAgICdjaGFuZ2UnLFxuICAgICAgICAncGFzc3dvcmQnOiAgICAgICAgJ2NoYW5nZScsXG4gICAgICAgICdidXR0b24nOiAgICAgICAgICAnY2xpY2snLFxuICAgICAgICAnc3VibWl0JzogICAgICAgICAgJ2NsaWNrJyxcbiAgICAgICAgJ3Jlc2V0JzogICAgICAgICAgICdjbGljaycsXG4gICAgICAgICdpbWFnZSc6ICAgICAgICAgICAnY2xpY2snLFxuICAgICAgICAnY2hlY2tib3gnOiAgICAgICAgJ2NsaWNrJyxcbiAgICAgICAgJ3JhZGlvJzogICAgICAgICAgICdjbGljaycsXG4gICAgICAgICdzZWxlY3Qtb25lJzogICAgICAnY2hhbmdlJyxcbiAgICAgICAgJ3NlbGVjdC1tdWx0aXBsZSc6ICdjaGFuZ2UnLFxuICAgICAgICAnX2RlZmF1bHRfJzogICAgICAgJ2NsaWNrJ1xuICAgICAgfVtpbnB1dFR5cGUgfHwgJ19kZWZhdWx0XyddO1xuICAgIH1cblxuICAgIGlmIChub2RlTmFtZSA9PSAnb3B0aW9uJykge1xuICAgICAgZWxlbWVudC5wYXJlbnROb2RlLnZhbHVlID0gZWxlbWVudC52YWx1ZTtcbiAgICAgIGVsZW1lbnQgPSBlbGVtZW50LnBhcmVudE5vZGU7XG4gICAgICBldmVudFR5cGUgPSAnY2hhbmdlJztcbiAgICB9XG5cbiAgICBrZXlzID0ga2V5cyB8fCBbXTtcbiAgICBmdW5jdGlvbiBwcmVzc2VkKGtleSkge1xuICAgICAgcmV0dXJuIGluZGV4T2Yoa2V5cywga2V5KSAhPT0gLTE7XG4gICAgfVxuXG4gICAgaWYgKG1zaWUgPCA5KSB7XG4gICAgICBpZiAoaW5wdXRUeXBlID09ICdyYWRpbycgfHwgaW5wdXRUeXBlID09ICdjaGVja2JveCcpIHtcbiAgICAgICAgICBlbGVtZW50LmNoZWNrZWQgPSAhZWxlbWVudC5jaGVja2VkO1xuICAgICAgfVxuXG4gICAgICAvLyBXVEYhISEgRXJyb3I6IFVuc3BlY2lmaWVkIGVycm9yLlxuICAgICAgLy8gRG9uJ3Qga25vdyB3aHksIGJ1dCBzb21lIGVsZW1lbnRzIHdoZW4gZGV0YWNoZWQgc2VlbSB0byBiZSBpbiBpbmNvbnNpc3RlbnQgc3RhdGUgYW5kXG4gICAgICAvLyBjYWxsaW5nIC5maXJlRXZlbnQoKSBvbiB0aGVtIHdpbGwgcmVzdWx0IGluIHZlcnkgdW5oZWxwZnVsIGVycm9yIChFcnJvcjogVW5zcGVjaWZpZWQgZXJyb3IpXG4gICAgICAvLyBmb3JjaW5nIHRoZSBicm93c2VyIHRvIGNvbXB1dGUgdGhlIGVsZW1lbnQgcG9zaXRpb24gKGJ5IHJlYWRpbmcgaXRzIENTUylcbiAgICAgIC8vIHB1dHMgdGhlIGVsZW1lbnQgaW4gY29uc2lzdGVudCBzdGF0ZS5cbiAgICAgIGVsZW1lbnQuc3R5bGUucG9zTGVmdDtcblxuICAgICAgLy8gVE9ETyh2b2p0YSk6IGNyZWF0ZSBldmVudCBvYmplY3RzIHdpdGggcHJlc3NlZCBrZXlzIHRvIGdldCBpdCB3b3JraW5nIG9uIElFPDlcbiAgICAgIHZhciByZXQgPSBlbGVtZW50LmZpcmVFdmVudCgnb24nICsgZXZlbnRUeXBlKTtcbiAgICAgIGlmIChpbnB1dFR5cGUgPT0gJ3N1Ym1pdCcpIHtcbiAgICAgICAgd2hpbGUoZWxlbWVudCkge1xuICAgICAgICAgIGlmIChlbGVtZW50Lm5vZGVOYW1lLnRvTG93ZXJDYXNlKCkgPT0gJ2Zvcm0nKSB7XG4gICAgICAgICAgICBlbGVtZW50LmZpcmVFdmVudCgnb25zdWJtaXQnKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIH1cbiAgICAgICAgICBlbGVtZW50ID0gZWxlbWVudC5wYXJlbnROb2RlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gcmV0O1xuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgZXZudCA9IGRvY3VtZW50LmNyZWF0ZUV2ZW50KCdNb3VzZUV2ZW50cycpLFxuICAgICAgICAgIG9yaWdpbmFsUHJldmVudERlZmF1bHQgPSBldm50LnByZXZlbnREZWZhdWx0LFxuICAgICAgICAgIGFwcFdpbmRvdyA9IGVsZW1lbnQub3duZXJEb2N1bWVudC5kZWZhdWx0VmlldyxcbiAgICAgICAgICBmYWtlUHJvY2Vzc0RlZmF1bHQgPSB0cnVlLFxuICAgICAgICAgIGZpbmFsUHJvY2Vzc0RlZmF1bHQsXG4gICAgICAgICAgYW5ndWxhciA9IGFwcFdpbmRvdy5hbmd1bGFyIHx8IHt9O1xuXG4gICAgICAvLyBpZ29yOiB0ZW1wb3JhcnkgZml4IGZvciBodHRwczovL2J1Z3ppbGxhLm1vemlsbGEub3JnL3Nob3dfYnVnLmNnaT9pZD02ODQyMDhcbiAgICAgIGFuZ3VsYXJbJ2ZmLTY4NDIwOC1wcmV2ZW50RGVmYXVsdCddID0gZmFsc2U7XG4gICAgICBldm50LnByZXZlbnREZWZhdWx0ID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIGZha2VQcm9jZXNzRGVmYXVsdCA9IGZhbHNlO1xuICAgICAgICByZXR1cm4gb3JpZ2luYWxQcmV2ZW50RGVmYXVsdC5hcHBseShldm50LCBhcmd1bWVudHMpO1xuICAgICAgfTtcblxuICAgICAgeCA9IHggfHwgMDtcbiAgICAgIHkgPSB5IHx8IDA7XG4gICAgICBldm50LmluaXRNb3VzZUV2ZW50KGV2ZW50VHlwZSwgdHJ1ZSwgdHJ1ZSwgd2luZG93LCAwLCB4LCB5LCB4LCB5LCBwcmVzc2VkKCdjdHJsJyksIHByZXNzZWQoJ2FsdCcpLFxuICAgICAgICAgIHByZXNzZWQoJ3NoaWZ0JyksIHByZXNzZWQoJ21ldGEnKSwgMCwgZWxlbWVudCk7XG5cbiAgICAgIGVsZW1lbnQuZGlzcGF0Y2hFdmVudChldm50KTtcbiAgICAgIGZpbmFsUHJvY2Vzc0RlZmF1bHQgPSAhKGFuZ3VsYXJbJ2ZmLTY4NDIwOC1wcmV2ZW50RGVmYXVsdCddIHx8ICFmYWtlUHJvY2Vzc0RlZmF1bHQpO1xuXG4gICAgICBkZWxldGUgYW5ndWxhclsnZmYtNjg0MjA4LXByZXZlbnREZWZhdWx0J107XG5cbiAgICAgIHJldHVybiBmaW5hbFByb2Nlc3NEZWZhdWx0O1xuICAgIH1cbiAgfVxufSgpKTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGNhcm91c2VsQXV0b1NsaWRlID0gYW5ndWxhci5tb2R1bGUoJ2FuZ3VsYXItY2Fyb3VzZWwnKVxuLmRpcmVjdGl2ZSgncm5DYXJvdXNlbEF1dG9TbGlkZScsIFsnJGludGVydmFsJywgZnVuY3Rpb24oJGludGVydmFsKSB7XG4gIHJldHVybiB7XG4gICAgcmVzdHJpY3Q6ICdBJyxcbiAgICBsaW5rOiBmdW5jdGlvbiAoc2NvcGUsIGVsZW1lbnQsIGF0dHJzKSB7XG4gICAgICAgIHZhciBzdG9wQXV0b1BsYXkgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGlmIChzY29wZS5hdXRvU2xpZGVyKSB7XG4gICAgICAgICAgICAgICAgJGludGVydmFsLmNhbmNlbChzY29wZS5hdXRvU2xpZGVyKTtcbiAgICAgICAgICAgICAgICBzY29wZS5hdXRvU2xpZGVyID0gbnVsbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgdmFyIHJlc3RhcnRUaW1lciA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgc2NvcGUuYXV0b1NsaWRlKCk7XG4gICAgICAgIH07XG5cbiAgICAgICAgc2NvcGUuJHdhdGNoKCdjYXJvdXNlbEluZGV4JywgcmVzdGFydFRpbWVyKTtcblxuICAgICAgICBpZiAoYXR0cnMuaGFzT3duUHJvcGVydHkoJ3JuQ2Fyb3VzZWxQYXVzZU9uSG92ZXInKSAmJiBhdHRycy5ybkNhcm91c2VsUGF1c2VPbkhvdmVyICE9PSAnZmFsc2UnKXtcbiAgICAgICAgICAgIGVsZW1lbnQub24oJ21vdXNlZW50ZXInLCBzdG9wQXV0b1BsYXkpO1xuICAgICAgICAgICAgZWxlbWVudC5vbignbW91c2VsZWF2ZScsIHJlc3RhcnRUaW1lcik7XG4gICAgICAgIH1cblxuICAgICAgICBzY29wZS4kb24oJyRkZXN0cm95JywgZnVuY3Rpb24oKXtcbiAgICAgICAgICAgIHN0b3BBdXRvUGxheSgpO1xuICAgICAgICAgICAgZWxlbWVudC5vZmYoJ21vdXNlZW50ZXInLCBzdG9wQXV0b1BsYXkpO1xuICAgICAgICAgICAgZWxlbWVudC5vZmYoJ21vdXNlbGVhdmUnLCByZXN0YXJ0VGltZXIpO1xuICAgICAgICB9KTtcbiAgICB9XG4gIH07XG59XSk7XG5cbm1vZHVsZS5leHBvcnRzID0gY2Fyb3VzZWxBdXRvU2xpZGU7XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBBbmd1bGFyQ2Fyb3VzZWwgPSBhbmd1bGFyLm1vZHVsZSgnYW5ndWxhci1jYXJvdXNlbCcpXG4uc2VydmljZSgnRGV2aWNlQ2FwYWJpbGl0aWVzJywgZnVuY3Rpb24oKSB7XG4gICAgLy8gVE9ETzogbWVyZ2UgaW4gYSBzaW5nbGUgZnVuY3Rpb25cblxuICAgIC8vIGRldGVjdCBzdXBwb3J0ZWQgQ1NTIHByb3BlcnR5XG4gICAgZnVuY3Rpb24gZGV0ZWN0VHJhbnNmb3JtUHJvcGVydHkoKSB7XG4gICAgICAgIHZhciB0cmFuc2Zvcm1Qcm9wZXJ0eSA9ICd0cmFuc2Zvcm0nLFxuICAgICAgICAgICAgc2FmYXJpUHJvcGVydHlIYWNrID0gJ3dlYmtpdFRyYW5zZm9ybSc7XG4gICAgICAgIGlmICh0eXBlb2YgZG9jdW1lbnQuYm9keS5zdHlsZVt0cmFuc2Zvcm1Qcm9wZXJ0eV0gIT09ICd1bmRlZmluZWQnKSB7XG5cbiAgICAgICAgICAgIFsnd2Via2l0JywgJ21veicsICdvJywgJ21zJ10uZXZlcnkoZnVuY3Rpb24gKHByZWZpeCkge1xuICAgICAgICAgICAgICAgIHZhciBlID0gJy0nICsgcHJlZml4ICsgJy10cmFuc2Zvcm0nO1xuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgZG9jdW1lbnQuYm9keS5zdHlsZVtlXSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgICAgICAgICAgdHJhbnNmb3JtUHJvcGVydHkgPSBlO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGRvY3VtZW50LmJvZHkuc3R5bGVbc2FmYXJpUHJvcGVydHlIYWNrXSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgIHRyYW5zZm9ybVByb3BlcnR5ID0gJy13ZWJraXQtdHJhbnNmb3JtJztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRyYW5zZm9ybVByb3BlcnR5ID0gdW5kZWZpbmVkO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0cmFuc2Zvcm1Qcm9wZXJ0eTtcbiAgICB9XG5cbiAgICAvL0RldGVjdCBzdXBwb3J0IG9mIHRyYW5zbGF0ZTNkXG4gICAgZnVuY3Rpb24gZGV0ZWN0M2RTdXBwb3J0KCkge1xuICAgICAgICB2YXIgZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdwJyksXG4gICAgICAgICAgICBoYXMzZCxcbiAgICAgICAgICAgIHRyYW5zZm9ybXMgPSB7XG4gICAgICAgICAgICAgICAgJ3dlYmtpdFRyYW5zZm9ybSc6ICctd2Via2l0LXRyYW5zZm9ybScsXG4gICAgICAgICAgICAgICAgJ21zVHJhbnNmb3JtJzogJy1tcy10cmFuc2Zvcm0nLFxuICAgICAgICAgICAgICAgICd0cmFuc2Zvcm0nOiAndHJhbnNmb3JtJ1xuICAgICAgICAgICAgfTtcbiAgICAgICAgLy8gQWRkIGl0IHRvIHRoZSBib2R5IHRvIGdldCB0aGUgY29tcHV0ZWQgc3R5bGVcbiAgICAgICAgZG9jdW1lbnQuYm9keS5pbnNlcnRCZWZvcmUoZWwsIG51bGwpO1xuICAgICAgICBmb3IgKHZhciB0IGluIHRyYW5zZm9ybXMpIHtcbiAgICAgICAgICAgIGlmIChlbC5zdHlsZVt0XSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgZWwuc3R5bGVbdF0gPSAndHJhbnNsYXRlM2QoMXB4LDFweCwxcHgpJztcbiAgICAgICAgICAgICAgICBoYXMzZCA9IHdpbmRvdy5nZXRDb21wdXRlZFN0eWxlKGVsKS5nZXRQcm9wZXJ0eVZhbHVlKHRyYW5zZm9ybXNbdF0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGRvY3VtZW50LmJvZHkucmVtb3ZlQ2hpbGQoZWwpO1xuICAgICAgICByZXR1cm4gKGhhczNkICE9PSB1bmRlZmluZWQgJiYgaGFzM2QubGVuZ3RoID4gMCAmJiBoYXMzZCAhPT0gXCJub25lXCIpO1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICAgIGhhczNkOiBkZXRlY3QzZFN1cHBvcnQoKSxcbiAgICAgICAgdHJhbnNmb3JtUHJvcGVydHk6IGRldGVjdFRyYW5zZm9ybVByb3BlcnR5KClcbiAgICB9O1xuXG59KVxuXG4uc2VydmljZSgnY29tcHV0ZUNhcm91c2VsU2xpZGVTdHlsZScsIGZ1bmN0aW9uKERldmljZUNhcGFiaWxpdGllcykge1xuICAgIC8vIGNvbXB1dGUgdHJhbnNpdGlvbiB0cmFuc2Zvcm0gcHJvcGVydGllcyBmb3IgYSBnaXZlbiBzbGlkZSBhbmQgZ2xvYmFsIG9mZnNldFxuICAgIHJldHVybiBmdW5jdGlvbihzbGlkZUluZGV4LCBvZmZzZXQsIHRyYW5zaXRpb25UeXBlKSB7XG4gICAgICAgIHZhciBzdHlsZSA9IHtcbiAgICAgICAgICAgICAgICBkaXNwbGF5OiAnaW5saW5lLWJsb2NrJ1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIG9wYWNpdHksXG4gICAgICAgICAgICBhYnNvbHV0ZUxlZnQgPSAoc2xpZGVJbmRleCAqIDEwMCkgKyBvZmZzZXQsXG4gICAgICAgICAgICBzbGlkZVRyYW5zZm9ybVZhbHVlID0gRGV2aWNlQ2FwYWJpbGl0aWVzLmhhczNkID8gJ3RyYW5zbGF0ZTNkKCcgKyBhYnNvbHV0ZUxlZnQgKyAnJSwgMCwgMCknIDogJ3RyYW5zbGF0ZTNkKCcgKyBhYnNvbHV0ZUxlZnQgKyAnJSwgMCknLFxuICAgICAgICAgICAgZGlzdGFuY2UgPSAoKDEwMCAtIE1hdGguYWJzKGFic29sdXRlTGVmdCkpIC8gMTAwKTtcblxuICAgICAgICBpZiAoIURldmljZUNhcGFiaWxpdGllcy50cmFuc2Zvcm1Qcm9wZXJ0eSkge1xuICAgICAgICAgICAgLy8gZmFsbGJhY2sgdG8gZGVmYXVsdCBzbGlkZSBpZiB0cmFuc2Zvcm1Qcm9wZXJ0eSBpcyBub3QgYXZhaWxhYmxlXG4gICAgICAgICAgICBzdHlsZVsnbWFyZ2luLWxlZnQnXSA9IGFic29sdXRlTGVmdCArICclJztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGlmICh0cmFuc2l0aW9uVHlwZSA9PSAnZmFkZUFuZFNsaWRlJykge1xuICAgICAgICAgICAgICAgIHN0eWxlW0RldmljZUNhcGFiaWxpdGllcy50cmFuc2Zvcm1Qcm9wZXJ0eV0gPSBzbGlkZVRyYW5zZm9ybVZhbHVlO1xuICAgICAgICAgICAgICAgIG9wYWNpdHkgPSAwO1xuICAgICAgICAgICAgICAgIGlmIChNYXRoLmFicyhhYnNvbHV0ZUxlZnQpIDwgMTAwKSB7XG4gICAgICAgICAgICAgICAgICAgIG9wYWNpdHkgPSAwLjMgKyBkaXN0YW5jZSAqIDAuNztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgc3R5bGUub3BhY2l0eSA9IG9wYWNpdHk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRyYW5zaXRpb25UeXBlID09ICdoZXhhZ29uJykge1xuICAgICAgICAgICAgICAgIHZhciB0cmFuc2Zvcm1Gcm9tID0gMTAwLFxuICAgICAgICAgICAgICAgICAgICBkZWdyZWVzID0gMCxcbiAgICAgICAgICAgICAgICAgICAgbWF4RGVncmVlcyA9IDYwICogKGRpc3RhbmNlIC0gMSk7XG5cbiAgICAgICAgICAgICAgICB0cmFuc2Zvcm1Gcm9tID0gb2Zmc2V0IDwgKHNsaWRlSW5kZXggKiAtMTAwKSA/IDEwMCA6IDA7XG4gICAgICAgICAgICAgICAgZGVncmVlcyA9IG9mZnNldCA8IChzbGlkZUluZGV4ICogLTEwMCkgPyBtYXhEZWdyZWVzIDogLW1heERlZ3JlZXM7XG4gICAgICAgICAgICAgICAgc3R5bGVbRGV2aWNlQ2FwYWJpbGl0aWVzLnRyYW5zZm9ybVByb3BlcnR5XSA9IHNsaWRlVHJhbnNmb3JtVmFsdWUgKyAnICcgKyAncm90YXRlWSgnICsgZGVncmVlcyArICdkZWcpJztcbiAgICAgICAgICAgICAgICBzdHlsZVtEZXZpY2VDYXBhYmlsaXRpZXMudHJhbnNmb3JtUHJvcGVydHkgKyAnLW9yaWdpbiddID0gdHJhbnNmb3JtRnJvbSArICclIDUwJSc7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRyYW5zaXRpb25UeXBlID09ICd6b29tJykge1xuICAgICAgICAgICAgICAgIHN0eWxlW0RldmljZUNhcGFiaWxpdGllcy50cmFuc2Zvcm1Qcm9wZXJ0eV0gPSBzbGlkZVRyYW5zZm9ybVZhbHVlO1xuICAgICAgICAgICAgICAgIHZhciBzY2FsZSA9IDE7XG4gICAgICAgICAgICAgICAgaWYgKE1hdGguYWJzKGFic29sdXRlTGVmdCkgPCAxMDApIHtcbiAgICAgICAgICAgICAgICAgICAgc2NhbGUgPSAxICsgKCgxIC0gZGlzdGFuY2UpICogMik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHN0eWxlW0RldmljZUNhcGFiaWxpdGllcy50cmFuc2Zvcm1Qcm9wZXJ0eV0gKz0gJyBzY2FsZSgnICsgc2NhbGUgKyAnKSc7XG4gICAgICAgICAgICAgICAgc3R5bGVbRGV2aWNlQ2FwYWJpbGl0aWVzLnRyYW5zZm9ybVByb3BlcnR5ICsgJy1vcmlnaW4nXSA9ICc1MCUgNTAlJztcbiAgICAgICAgICAgICAgICBvcGFjaXR5ID0gMDtcbiAgICAgICAgICAgICAgICBpZiAoTWF0aC5hYnMoYWJzb2x1dGVMZWZ0KSA8IDEwMCkge1xuICAgICAgICAgICAgICAgICAgICBvcGFjaXR5ID0gMC4zICsgZGlzdGFuY2UgKiAwLjc7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHN0eWxlLm9wYWNpdHkgPSBvcGFjaXR5O1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBzdHlsZVtEZXZpY2VDYXBhYmlsaXRpZXMudHJhbnNmb3JtUHJvcGVydHldID0gc2xpZGVUcmFuc2Zvcm1WYWx1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gc3R5bGU7XG4gICAgfTtcbn0pXG5cbi5zZXJ2aWNlKCdjcmVhdGVTdHlsZVN0cmluZycsIGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiBmdW5jdGlvbihvYmplY3QpIHtcbiAgICAgICAgdmFyIHN0eWxlcyA9IFtdO1xuICAgICAgICBhbmd1bGFyLmZvckVhY2gob2JqZWN0LCBmdW5jdGlvbih2YWx1ZSwga2V5KSB7XG4gICAgICAgICAgICBzdHlsZXMucHVzaChrZXkgKyAnOicgKyB2YWx1ZSk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gc3R5bGVzLmpvaW4oJzsnKTtcbiAgICB9O1xufSlcblxuLmRpcmVjdGl2ZSgncm5DYXJvdXNlbCcsIFsnJHN3aXBlJywgJyR3aW5kb3cnLCAnJGRvY3VtZW50JywgJyRwYXJzZScsICckY29tcGlsZScsICckdGltZW91dCcsICckaW50ZXJ2YWwnLCAnY29tcHV0ZUNhcm91c2VsU2xpZGVTdHlsZScsICdjcmVhdGVTdHlsZVN0cmluZycsICdUd2VlbmFibGUnLFxuICAgIGZ1bmN0aW9uKCRzd2lwZSwgJHdpbmRvdywgJGRvY3VtZW50LCAkcGFyc2UsICRjb21waWxlLCAkdGltZW91dCwgJGludGVydmFsLCBjb21wdXRlQ2Fyb3VzZWxTbGlkZVN0eWxlLCBjcmVhdGVTdHlsZVN0cmluZywgVHdlZW5hYmxlKSB7XG4gICAgICAgIC8vIGludGVybmFsIGlkcyB0byBhbGxvdyBtdWx0aXBsZSBpbnN0YW5jZXNcbiAgICAgICAgdmFyIGNhcm91c2VsSWQgPSAwLFxuICAgICAgICAgICAgLy8gaW4gYWJzb2x1dGUgcGl4ZWxzLCBhdCB3aGljaCBkaXN0YW5jZSB0aGUgc2xpZGUgc3RpY2sgdG8gdGhlIGVkZ2Ugb24gcmVsZWFzZVxuICAgICAgICAgICAgcnViYmVyVHJlc2hvbGQgPSAzO1xuXG4gICAgICAgIHZhciByZXF1ZXN0QW5pbWF0aW9uRnJhbWUgPSAkd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSB8fCAkd2luZG93LndlYmtpdFJlcXVlc3RBbmltYXRpb25GcmFtZSB8fCAkd2luZG93Lm1velJlcXVlc3RBbmltYXRpb25GcmFtZTtcblxuICAgICAgICBmdW5jdGlvbiBnZXRJdGVtSW5kZXgoY29sbGVjdGlvbiwgdGFyZ2V0LCBkZWZhdWx0SW5kZXgpIHtcbiAgICAgICAgICAgIHZhciByZXN1bHQgPSBkZWZhdWx0SW5kZXg7XG4gICAgICAgICAgICBjb2xsZWN0aW9uLmV2ZXJ5KGZ1bmN0aW9uKGl0ZW0sIGluZGV4KSB7XG4gICAgICAgICAgICAgICAgaWYgKGFuZ3VsYXIuZXF1YWxzKGl0ZW0sIHRhcmdldCkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0ID0gaW5kZXg7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgcmVzdHJpY3Q6ICdBJyxcbiAgICAgICAgICAgIHNjb3BlOiB0cnVlLFxuICAgICAgICAgICAgY29tcGlsZTogZnVuY3Rpb24odEVsZW1lbnQsIHRBdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICAgICAgLy8gdXNlIHRoZSBjb21waWxlIHBoYXNlIHRvIGN1c3RvbWl6ZSB0aGUgRE9NXG4gICAgICAgICAgICAgICAgdmFyIGZpcnN0Q2hpbGQgPSB0RWxlbWVudFswXS5xdWVyeVNlbGVjdG9yKCdsaScpLFxuICAgICAgICAgICAgICAgICAgICBmaXJzdENoaWxkQXR0cmlidXRlcyA9IChmaXJzdENoaWxkKSA/IGZpcnN0Q2hpbGQuYXR0cmlidXRlcyA6IFtdLFxuICAgICAgICAgICAgICAgICAgICBpc1JlcGVhdEJhc2VkID0gZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgIGlzQnVmZmVyZWQgPSBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgcmVwZWF0SXRlbSxcbiAgICAgICAgICAgICAgICAgICAgcmVwZWF0Q29sbGVjdGlvbjtcblxuICAgICAgICAgICAgICAgIC8vIHRyeSB0byBmaW5kIGFuIG5nUmVwZWF0IGV4cHJlc3Npb25cbiAgICAgICAgICAgICAgICAvLyBhdCB0aGlzIHBvaW50LCB0aGUgYXR0cmlidXRlcyBhcmUgbm90IHlldCBub3JtYWxpemVkIHNvIHdlIG5lZWQgdG8gdHJ5IHZhcmlvdXMgc3ludGF4XG4gICAgICAgICAgICAgICAgWyduZy1yZXBlYXQnLCAnZGF0YS1uZy1yZXBlYXQnLCAnbmc6cmVwZWF0JywgJ3gtbmctcmVwZWF0J10uZXZlcnkoZnVuY3Rpb24oYXR0cikge1xuICAgICAgICAgICAgICAgICAgICB2YXIgcmVwZWF0QXR0cmlidXRlID0gZmlyc3RDaGlsZEF0dHJpYnV0ZXNbYXR0cl07XG4gICAgICAgICAgICAgICAgICAgIGlmIChhbmd1bGFyLmlzRGVmaW5lZChyZXBlYXRBdHRyaWJ1dGUpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBuZ1JlcGVhdCByZWdleHAgZXh0cmFjdGVkIGZyb20gYW5ndWxhciAxLjIuNyBzcmNcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBleHByTWF0Y2ggPSByZXBlYXRBdHRyaWJ1dGUudmFsdWUubWF0Y2goL15cXHMqKFtcXHNcXFNdKz8pXFxzK2luXFxzKyhbXFxzXFxTXSs/KSg/Olxccyt0cmFja1xccytieVxccysoW1xcc1xcU10rPykpP1xccyokLyksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHJhY2tQcm9wZXJ0eSA9IGV4cHJNYXRjaFszXTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgcmVwZWF0SXRlbSA9IGV4cHJNYXRjaFsxXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlcGVhdENvbGxlY3Rpb24gPSBleHByTWF0Y2hbMl07XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChyZXBlYXRJdGVtKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGFuZ3VsYXIuaXNEZWZpbmVkKHRBdHRyaWJ1dGVzWydybkNhcm91c2VsQnVmZmVyZWQnXSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gdXBkYXRlIHRoZSBjdXJyZW50IG5nUmVwZWF0IGV4cHJlc3Npb24gYW5kIGFkZCBhIHNsaWNlIG9wZXJhdG9yIGlmIGJ1ZmZlcmVkXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlzQnVmZmVyZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXBlYXRBdHRyaWJ1dGUudmFsdWUgPSByZXBlYXRJdGVtICsgJyBpbiAnICsgcmVwZWF0Q29sbGVjdGlvbiArICd8Y2Fyb3VzZWxTbGljZTpjYXJvdXNlbEJ1ZmZlckluZGV4OmNhcm91c2VsQnVmZmVyU2l6ZSc7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0cmFja1Byb3BlcnR5KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXBlYXRBdHRyaWJ1dGUudmFsdWUgKz0gJyB0cmFjayBieSAnICsgdHJhY2tQcm9wZXJ0eTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpc1JlcGVhdEJhc2VkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gZnVuY3Rpb24oc2NvcGUsIGlFbGVtZW50LCBpQXR0cmlidXRlcywgY29udGFpbmVyQ3RybCkge1xuXG4gICAgICAgICAgICAgICAgICAgIGNhcm91c2VsSWQrKztcblxuICAgICAgICAgICAgICAgICAgICB2YXIgZGVmYXVsdE9wdGlvbnMgPSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0cmFuc2l0aW9uVHlwZTogaUF0dHJpYnV0ZXMucm5DYXJvdXNlbFRyYW5zaXRpb24gfHwgJ3NsaWRlJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyYW5zaXRpb25FYXNpbmc6IGlBdHRyaWJ1dGVzLnJuQ2Fyb3VzZWxFYXNpbmcgfHwgJ2Vhc2VUbycsXG4gICAgICAgICAgICAgICAgICAgICAgICB0cmFuc2l0aW9uRHVyYXRpb246IHBhcnNlSW50KGlBdHRyaWJ1dGVzLnJuQ2Fyb3VzZWxEdXJhdGlvbiwgMTApIHx8IDMwMCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGlzU2VxdWVudGlhbDogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGF1dG9TbGlkZUR1cmF0aW9uOiAzLFxuICAgICAgICAgICAgICAgICAgICAgICAgYnVmZmVyU2l6ZTogNSxcbiAgICAgICAgICAgICAgICAgICAgICAgIC8qIGluIGNvbnRhaW5lciAlIGhvdyBtdWNoIHdlIG5lZWQgdG8gZHJhZyB0byB0cmlnZ2VyIHRoZSBzbGlkZSBjaGFuZ2UgKi9cbiAgICAgICAgICAgICAgICAgICAgICAgIG1vdmVUcmVzaG9sZDogMC4xXG4gICAgICAgICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gVE9ET1xuICAgICAgICAgICAgICAgICAgICB2YXIgb3B0aW9ucyA9IGFuZ3VsYXIuZXh0ZW5kKHt9LCBkZWZhdWx0T3B0aW9ucyk7XG5cbiAgICAgICAgICAgICAgICAgICAgdmFyIHByZXNzZWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBzdGFydFgsXG4gICAgICAgICAgICAgICAgICAgICAgICBpc0luZGV4Qm91bmQgPSBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG9mZnNldCA9IDAsXG4gICAgICAgICAgICAgICAgICAgICAgICBkZXN0aW5hdGlvbixcbiAgICAgICAgICAgICAgICAgICAgICAgIHN3aXBlTW92ZWQgPSBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vYW5pbU9uSW5kZXhDaGFuZ2UgPSB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgY3VycmVudFNsaWRlcyA9IFtdLFxuICAgICAgICAgICAgICAgICAgICAgICAgZWxXaWR0aCA9IG51bGwsXG4gICAgICAgICAgICAgICAgICAgICAgICBlbFggPSBudWxsLFxuICAgICAgICAgICAgICAgICAgICAgICAgYW5pbWF0ZVRyYW5zaXRpb25zID0gdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGludGlhbFN0YXRlID0gdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGFuaW1hdGluZyA9IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgbW91c2VVcEJvdW5kID0gZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgICAgICBsb2NrZWQgPSBmYWxzZTtcblxuICAgICAgICAgICAgICAgICAgICAkc3dpcGUuYmluZChpRWxlbWVudCwge1xuICAgICAgICAgICAgICAgICAgICAgICAgc3RhcnQ6IHN3aXBlU3RhcnQsXG4gICAgICAgICAgICAgICAgICAgICAgICBtb3ZlOiBzd2lwZU1vdmUsXG4gICAgICAgICAgICAgICAgICAgICAgICBlbmQ6IHN3aXBlRW5kLFxuICAgICAgICAgICAgICAgICAgICAgICAgY2FuY2VsOiBmdW5jdGlvbihldmVudCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN3aXBlRW5kKHt9LCBldmVudCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uIGdldFNsaWRlc0RPTSgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBpRWxlbWVudFswXS5xdWVyeVNlbGVjdG9yQWxsKCd1bFtybi1jYXJvdXNlbF0gPiBsaScpO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgZnVuY3Rpb24gZG9jdW1lbnRNb3VzZVVwRXZlbnQoZXZlbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGluIGNhc2Ugd2UgY2xpY2sgb3V0c2lkZSB0aGUgY2Fyb3VzZWwsIHRyaWdnZXIgYSBmYWtlIHN3aXBlRW5kXG4gICAgICAgICAgICAgICAgICAgICAgICBzd2lwZU1vdmVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN3aXBlRW5kKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB4OiBldmVudC5jbGllbnRYLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHk6IGV2ZW50LmNsaWVudFlcbiAgICAgICAgICAgICAgICAgICAgICAgIH0sIGV2ZW50KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uIHVwZGF0ZVNsaWRlc1Bvc2l0aW9uKG9mZnNldCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gbWFudWFsbHkgYXBwbHkgdHJhbnNmb3JtYXRpb24gdG8gY2Fyb3VzZWwgY2hpbGRyZW5zXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyB0b2RvIDogb3B0aW0gOiBhcHBseSBvbmx5IHRvIHZpc2libGUgaXRlbXNcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciB4ID0gc2NvcGUuY2Fyb3VzZWxCdWZmZXJJbmRleCAqIDEwMCArIG9mZnNldDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFuZ3VsYXIuZm9yRWFjaChnZXRTbGlkZXNET00oKSwgZnVuY3Rpb24oY2hpbGQsIGluZGV4KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2hpbGQuc3R5bGUuY3NzVGV4dCA9IGNyZWF0ZVN0eWxlU3RyaW5nKGNvbXB1dGVDYXJvdXNlbFNsaWRlU3R5bGUoaW5kZXgsIHgsIG9wdGlvbnMudHJhbnNpdGlvblR5cGUpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgc2NvcGUubmV4dFNsaWRlID0gZnVuY3Rpb24oc2xpZGVPcHRpb25zKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgaW5kZXggPSBzY29wZS5jYXJvdXNlbEluZGV4ICsgMTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpbmRleCA+IGN1cnJlbnRTbGlkZXMubGVuZ3RoIC0gMSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGluZGV4ID0gMDtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghbG9ja2VkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZ29Ub1NsaWRlKGluZGV4LCBzbGlkZU9wdGlvbnMpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgICAgICAgIHNjb3BlLnByZXZTbGlkZSA9IGZ1bmN0aW9uKHNsaWRlT3B0aW9ucykge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGluZGV4ID0gc2NvcGUuY2Fyb3VzZWxJbmRleCAtIDE7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoaW5kZXggPCAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaW5kZXggPSBjdXJyZW50U2xpZGVzLmxlbmd0aCAtIDE7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBnb1RvU2xpZGUoaW5kZXgsIHNsaWRlT3B0aW9ucyk7XG4gICAgICAgICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgICAgICAgZnVuY3Rpb24gZ29Ub1NsaWRlKGluZGV4LCBzbGlkZU9wdGlvbnMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vY29uc29sZS5sb2coJ2dvVG9TbGlkZScsIGFyZ3VtZW50cyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBtb3ZlIGEgdG8gdGhlIGdpdmVuIHNsaWRlIGluZGV4XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoaW5kZXggPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGluZGV4ID0gc2NvcGUuY2Fyb3VzZWxJbmRleDtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgc2xpZGVPcHRpb25zID0gc2xpZGVPcHRpb25zIHx8IHt9O1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHNsaWRlT3B0aW9ucy5hbmltYXRlID09PSBmYWxzZSB8fCBvcHRpb25zLnRyYW5zaXRpb25UeXBlID09PSAnbm9uZScpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsb2NrZWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBvZmZzZXQgPSBpbmRleCAqIC0xMDA7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2NvcGUuY2Fyb3VzZWxJbmRleCA9IGluZGV4O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHVwZGF0ZUJ1ZmZlckluZGV4KCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICBsb2NrZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHR3ZWVuYWJsZSA9IG5ldyBUd2VlbmFibGUoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHR3ZWVuYWJsZS50d2Vlbih7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZnJvbToge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAneCc6IG9mZnNldFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdG86IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJ3gnOiBpbmRleCAqIC0xMDBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGR1cmF0aW9uOiBvcHRpb25zLnRyYW5zaXRpb25EdXJhdGlvbixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlYXNpbmc6IG9wdGlvbnMudHJhbnNpdGlvbkVhc2luZyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGVwOiBmdW5jdGlvbihzdGF0ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB1cGRhdGVTbGlkZXNQb3NpdGlvbihzdGF0ZS54KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZpbmlzaDogZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNjb3BlLiRhcHBseShmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNjb3BlLmNhcm91c2VsSW5kZXggPSBpbmRleDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9mZnNldCA9IGluZGV4ICogLTEwMDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHVwZGF0ZUJ1ZmZlckluZGV4KCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAkdGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxvY2tlZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSwgMCwgZmFsc2UpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uIGdldENvbnRhaW5lcldpZHRoKCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHJlY3QgPSBpRWxlbWVudFswXS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiByZWN0LndpZHRoID8gcmVjdC53aWR0aCA6IHJlY3QucmlnaHQgLSByZWN0LmxlZnQ7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBmdW5jdGlvbiB1cGRhdGVDb250YWluZXJXaWR0aCgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsV2lkdGggPSBnZXRDb250YWluZXJXaWR0aCgpO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgZnVuY3Rpb24gYmluZE1vdXNlVXBFdmVudCgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghbW91c2VVcEJvdW5kKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgIG1vdXNlVXBCb3VuZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICRkb2N1bWVudC5iaW5kKCdtb3VzZXVwJywgZG9jdW1lbnRNb3VzZVVwRXZlbnQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgZnVuY3Rpb24gdW5iaW5kTW91c2VVcEV2ZW50KCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG1vdXNlVXBCb3VuZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICBtb3VzZVVwQm91bmQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgJGRvY3VtZW50LnVuYmluZCgnbW91c2V1cCcsIGRvY3VtZW50TW91c2VVcEV2ZW50KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uIHN3aXBlU3RhcnQoY29vcmRzLCBldmVudCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gY29uc29sZS5sb2coJ3N3aXBlU3RhcnQnLCBjb29yZHMsIGV2ZW50KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChsb2NrZWQgfHwgY3VycmVudFNsaWRlcy5sZW5ndGggPD0gMSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIHVwZGF0ZUNvbnRhaW5lcldpZHRoKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBlbFggPSBpRWxlbWVudFswXS5xdWVyeVNlbGVjdG9yKCdsaScpLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpLmxlZnQ7XG4gICAgICAgICAgICAgICAgICAgICAgICBwcmVzc2VkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0YXJ0WCA9IGNvb3Jkcy54O1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgZnVuY3Rpb24gc3dpcGVNb3ZlKGNvb3JkcywgZXZlbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vY29uc29sZS5sb2coJ3N3aXBlTW92ZScsIGNvb3JkcywgZXZlbnQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHgsIGRlbHRhO1xuICAgICAgICAgICAgICAgICAgICAgICAgYmluZE1vdXNlVXBFdmVudCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHByZXNzZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB4ID0gY29vcmRzLng7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVsdGEgPSBzdGFydFggLSB4O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChkZWx0YSA+IDIgfHwgZGVsdGEgPCAtMikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzd2lwZU1vdmVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFyIG1vdmVPZmZzZXQgPSBvZmZzZXQgKyAoLWRlbHRhICogMTAwIC8gZWxXaWR0aCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHVwZGF0ZVNsaWRlc1Bvc2l0aW9uKG1vdmVPZmZzZXQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIHZhciBpbml0ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgc2NvcGUuY2Fyb3VzZWxJbmRleCA9IDA7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKCFpc1JlcGVhdEJhc2VkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBmYWtlIGFycmF5IHdoZW4gbm8gbmctcmVwZWF0XG4gICAgICAgICAgICAgICAgICAgICAgICBjdXJyZW50U2xpZGVzID0gW107XG4gICAgICAgICAgICAgICAgICAgICAgICBhbmd1bGFyLmZvckVhY2goZ2V0U2xpZGVzRE9NKCksIGZ1bmN0aW9uKG5vZGUsIGluZGV4KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY3VycmVudFNsaWRlcy5wdXNoKHtpZDogaW5kZXh9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGlBdHRyaWJ1dGVzLnJuQ2Fyb3VzZWxDb250cm9scyE9PXVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gZG9udCB1c2UgYSBkaXJlY3RpdmUgZm9yIHRoaXNcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBuZXh0U2xpZGVJbmRleENvbXBhcmVWYWx1ZSA9IGlzUmVwZWF0QmFzZWQgPyByZXBlYXRDb2xsZWN0aW9uLnJlcGxhY2UoJzo6JywgJycpICsgJy5sZW5ndGggLSAxJyA6IGN1cnJlbnRTbGlkZXMubGVuZ3RoIC0gMTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciB0cGwgPSAnPGRpdiBjbGFzcz1cInJuLWNhcm91c2VsLWNvbnRyb2xzXCI+XFxuJyArXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgJyAgPHNwYW4gY2xhc3M9XCJybi1jYXJvdXNlbC1jb250cm9sIHJuLWNhcm91c2VsLWNvbnRyb2wtcHJldlwiIG5nLWNsaWNrPVwicHJldlNsaWRlKClcIiBuZy1pZj1cImNhcm91c2VsSW5kZXggPiAwXCI+PC9zcGFuPlxcbicgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICcgIDxzcGFuIGNsYXNzPVwicm4tY2Fyb3VzZWwtY29udHJvbCBybi1jYXJvdXNlbC1jb250cm9sLW5leHRcIiBuZy1jbGljaz1cIm5leHRTbGlkZSgpXCIgbmctaWY9XCJjYXJvdXNlbEluZGV4IDwgJyArIG5leHRTbGlkZUluZGV4Q29tcGFyZVZhbHVlICsgJ1wiPjwvc3Bhbj5cXG4nICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAnPC9kaXY+JztcbiAgICAgICAgICAgICAgICAgICAgICAgIGlFbGVtZW50LmFwcGVuZCgkY29tcGlsZShhbmd1bGFyLmVsZW1lbnQodHBsKSkoc2NvcGUpKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGlmIChpQXR0cmlidXRlcy5ybkNhcm91c2VsQXV0b1NsaWRlIT09dW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgZHVyYXRpb24gPSBwYXJzZUludChpQXR0cmlidXRlcy5ybkNhcm91c2VsQXV0b1NsaWRlLCAxMCkgfHwgb3B0aW9ucy5hdXRvU2xpZGVEdXJhdGlvbjtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNjb3BlLmF1dG9TbGlkZSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChzY29wZS5hdXRvU2xpZGVyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICRpbnRlcnZhbC5jYW5jZWwoc2NvcGUuYXV0b1NsaWRlcik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNjb3BlLmF1dG9TbGlkZXIgPSBudWxsO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzY29wZS5hdXRvU2xpZGVyID0gJGludGVydmFsKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIWxvY2tlZCAmJiAhcHJlc3NlZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2NvcGUubmV4dFNsaWRlKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9LCBkdXJhdGlvbiAqIDEwMDApO1xuICAgICAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGlmIChpQXR0cmlidXRlcy5ybkNhcm91c2VsSW5kZXgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciB1cGRhdGVQYXJlbnRJbmRleCA9IGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaW5kZXhNb2RlbC5hc3NpZ24oc2NvcGUuJHBhcmVudCwgdmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBpbmRleE1vZGVsID0gJHBhcnNlKGlBdHRyaWJ1dGVzLnJuQ2Fyb3VzZWxJbmRleCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoYW5ndWxhci5pc0Z1bmN0aW9uKGluZGV4TW9kZWwuYXNzaWduKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8qIGNoZWNrIGlmIHRoaXMgcHJvcGVydHkgaXMgYXNzaWduYWJsZSB0aGVuIHdhdGNoIGl0ICovXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2NvcGUuJHdhdGNoKCdjYXJvdXNlbEluZGV4JywgZnVuY3Rpb24obmV3VmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdXBkYXRlUGFyZW50SW5kZXgobmV3VmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNjb3BlLiRwYXJlbnQuJHdhdGNoKGluZGV4TW9kZWwsIGZ1bmN0aW9uKG5ld1ZhbHVlLCBvbGRWYWx1ZSkge1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChuZXdWYWx1ZSAhPT0gdW5kZWZpbmVkICYmIG5ld1ZhbHVlICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoY3VycmVudFNsaWRlcyAmJiBjdXJyZW50U2xpZGVzLmxlbmd0aCA+IDAgJiYgbmV3VmFsdWUgPj0gY3VycmVudFNsaWRlcy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBuZXdWYWx1ZSA9IGN1cnJlbnRTbGlkZXMubGVuZ3RoIC0gMTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB1cGRhdGVQYXJlbnRJbmRleChuZXdWYWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGN1cnJlbnRTbGlkZXMgJiYgbmV3VmFsdWUgPCAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbmV3VmFsdWUgPSAwO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHVwZGF0ZVBhcmVudEluZGV4KG5ld1ZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghbG9ja2VkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZ29Ub1NsaWRlKG5ld1ZhbHVlLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFuaW1hdGU6ICFpbml0XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpbml0ID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpc0luZGV4Qm91bmQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmICghaXNOYU4oaUF0dHJpYnV0ZXMucm5DYXJvdXNlbEluZGV4KSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8qIGlmIHVzZXIganVzdCBzZXQgYW4gaW5pdGlhbCBudW1iZXIsIHNldCBpdCAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGdvVG9TbGlkZShwYXJzZUludChpQXR0cmlidXRlcy5ybkNhcm91c2VsSW5kZXgsIDEwKSwge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhbmltYXRlOiBmYWxzZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgZ29Ub1NsaWRlKDAsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBhbmltYXRlOiAhaW5pdFxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpbml0ID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBpZiAoaUF0dHJpYnV0ZXMucm5DYXJvdXNlbExvY2tlZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2NvcGUuJHdhdGNoKGlBdHRyaWJ1dGVzLnJuQ2Fyb3VzZWxMb2NrZWQsIGZ1bmN0aW9uKG5ld1ZhbHVlLCBvbGRWYWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIG9ubHkgYmluZCBzd2lwZSB3aGVuIGl0J3Mgbm90IHN3aXRjaGVkIG9mZlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmKG5ld1ZhbHVlID09PSB0cnVlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxvY2tlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbG9ja2VkID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBpZiAoaXNSZXBlYXRCYXNlZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gdXNlIHJuLWNhcm91c2VsLWRlZXAtd2F0Y2ggdG8gZmlnaHQgdGhlIEFuZ3VsYXIgJHdhdGNoQ29sbGVjdGlvbiB3ZWFrbmVzcyA6IGh0dHBzOi8vZ2l0aHViLmNvbS9hbmd1bGFyL2FuZ3VsYXIuanMvaXNzdWVzLzI2MjFcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIG9wdGlvbmFsIGJlY2F1c2UgaXQgaGF2ZSBzb21lIHBlcmZvcm1hbmNlIGltcGFjdHMgKGRlZXAgd2F0Y2gpXG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgZGVlcFdhdGNoID0gKGlBdHRyaWJ1dGVzLnJuQ2Fyb3VzZWxEZWVwV2F0Y2ghPT11bmRlZmluZWQpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBzY29wZVtkZWVwV2F0Y2g/JyR3YXRjaCc6JyR3YXRjaENvbGxlY3Rpb24nXShyZXBlYXRDb2xsZWN0aW9uLCBmdW5jdGlvbihuZXdWYWx1ZSwgb2xkVmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvL2NvbnNvbGUubG9nKCdyZXBlYXRDb2xsZWN0aW9uJywgY3VycmVudFNsaWRlcyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY3VycmVudFNsaWRlcyA9IG5ld1ZhbHVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGlmIGRlZXBXYXRjaCBPTiAsbWFudWFsbHkgY29tcGFyZSBvYmplY3RzIHRvIGd1ZXNzIHRoZSBuZXcgcG9zaXRpb25cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoZGVlcFdhdGNoICYmIGFuZ3VsYXIuaXNBcnJheShuZXdWYWx1ZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGFjdGl2ZUVsZW1lbnQgPSBvbGRWYWx1ZVtzY29wZS5jYXJvdXNlbEluZGV4XTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFyIG5ld0luZGV4ID0gZ2V0SXRlbUluZGV4KG5ld1ZhbHVlLCBhY3RpdmVFbGVtZW50LCBzY29wZS5jYXJvdXNlbEluZGV4KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZ29Ub1NsaWRlKG5ld0luZGV4LCB7YW5pbWF0ZTogZmFsc2V9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBnb1RvU2xpZGUoc2NvcGUuY2Fyb3VzZWxJbmRleCwge2FuaW1hdGU6IGZhbHNlfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfSwgdHJ1ZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBmdW5jdGlvbiBzd2lwZUVuZChjb29yZHMsIGV2ZW50LCBmb3JjZUFuaW1hdGlvbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gIGNvbnNvbGUubG9nKCdzd2lwZUVuZCcsICdzY29wZS5jYXJvdXNlbEluZGV4Jywgc2NvcGUuY2Fyb3VzZWxJbmRleCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBQcmV2ZW50IGNsaWNrcyBvbiBidXR0b25zIGluc2lkZSBzbGlkZXIgdG8gdHJpZ2dlciBcInN3aXBlRW5kXCIgZXZlbnQgb24gdG91Y2hlbmQvbW91c2V1cFxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGV2ZW50ICYmICFzd2lwZU1vdmVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgdW5iaW5kTW91c2VVcEV2ZW50KCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBwcmVzc2VkID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgICAgICBzd2lwZU1vdmVkID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZXN0aW5hdGlvbiA9IHN0YXJ0WCAtIGNvb3Jkcy54O1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGRlc3RpbmF0aW9uPT09MCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChsb2NrZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBvZmZzZXQgKz0gKC1kZXN0aW5hdGlvbiAqIDEwMCAvIGVsV2lkdGgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG9wdGlvbnMuaXNTZXF1ZW50aWFsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFyIG1pbk1vdmUgPSBvcHRpb25zLm1vdmVUcmVzaG9sZCAqIGVsV2lkdGgsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFic01vdmUgPSAtZGVzdGluYXRpb24sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNsaWRlc01vdmUgPSAtTWF0aFthYnNNb3ZlID49IDAgPyAnY2VpbCcgOiAnZmxvb3InXShhYnNNb3ZlIC8gZWxXaWR0aCksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNob3VsZE1vdmUgPSBNYXRoLmFicyhhYnNNb3ZlKSA+IG1pbk1vdmU7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoY3VycmVudFNsaWRlcyAmJiAoc2xpZGVzTW92ZSArIHNjb3BlLmNhcm91c2VsSW5kZXgpID49IGN1cnJlbnRTbGlkZXMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNsaWRlc01vdmUgPSBjdXJyZW50U2xpZGVzLmxlbmd0aCAtIDEgLSBzY29wZS5jYXJvdXNlbEluZGV4O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoKHNsaWRlc01vdmUgKyBzY29wZS5jYXJvdXNlbEluZGV4KSA8IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2xpZGVzTW92ZSA9IC1zY29wZS5jYXJvdXNlbEluZGV4O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YXIgbW92ZU9mZnNldCA9IHNob3VsZE1vdmUgPyBzbGlkZXNNb3ZlIDogMDtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlc3RpbmF0aW9uID0gKHNjb3BlLmNhcm91c2VsSW5kZXggKyBtb3ZlT2Zmc2V0KTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGdvVG9TbGlkZShkZXN0aW5hdGlvbik7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNjb3BlLiRhcHBseShmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2NvcGUuY2Fyb3VzZWxJbmRleCA9IHBhcnNlSW50KC1vZmZzZXQgLyAxMDAsIDEwKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdXBkYXRlQnVmZmVySW5kZXgoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBzY29wZS4kb24oJyRkZXN0cm95JywgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB1bmJpbmRNb3VzZVVwRXZlbnQoKTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAgICAgc2NvcGUuY2Fyb3VzZWxCdWZmZXJJbmRleCA9IDA7XG4gICAgICAgICAgICAgICAgICAgIHNjb3BlLmNhcm91c2VsQnVmZmVyU2l6ZSA9IG9wdGlvbnMuYnVmZmVyU2l6ZTtcblxuICAgICAgICAgICAgICAgICAgICBmdW5jdGlvbiB1cGRhdGVCdWZmZXJJbmRleCgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHVwZGF0ZSBhbmQgY2FwIHRlIGJ1ZmZlciBpbmRleFxuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGJ1ZmZlckluZGV4ID0gMDtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBidWZmZXJFZGdlU2l6ZSA9IChzY29wZS5jYXJvdXNlbEJ1ZmZlclNpemUgLSAxKSAvIDI7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoaXNCdWZmZXJlZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChzY29wZS5jYXJvdXNlbEluZGV4IDw9IGJ1ZmZlckVkZ2VTaXplKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGZpcnN0IGJ1ZmZlciBwYXJ0XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJ1ZmZlckluZGV4ID0gMDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGN1cnJlbnRTbGlkZXMgJiYgY3VycmVudFNsaWRlcy5sZW5ndGggPCBzY29wZS5jYXJvdXNlbEJ1ZmZlclNpemUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gc21hbGxlciB0aGFuIGJ1ZmZlclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBidWZmZXJJbmRleCA9IDA7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChjdXJyZW50U2xpZGVzICYmIHNjb3BlLmNhcm91c2VsSW5kZXggPiBjdXJyZW50U2xpZGVzLmxlbmd0aCAtIHNjb3BlLmNhcm91c2VsQnVmZmVyU2l6ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBsYXN0IGJ1ZmZlciBwYXJ0XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJ1ZmZlckluZGV4ID0gY3VycmVudFNsaWRlcy5sZW5ndGggLSBzY29wZS5jYXJvdXNlbEJ1ZmZlclNpemU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gY29tcHV0ZSBidWZmZXIgc3RhcnRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYnVmZmVySW5kZXggPSBzY29wZS5jYXJvdXNlbEluZGV4IC0gYnVmZmVyRWRnZVNpemU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2NvcGUuY2Fyb3VzZWxCdWZmZXJJbmRleCA9IGJ1ZmZlckluZGV4O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICR0aW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB1cGRhdGVTbGlkZXNQb3NpdGlvbihvZmZzZXQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0sIDAsIGZhbHNlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgJHRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHVwZGF0ZVNsaWRlc1Bvc2l0aW9uKG9mZnNldCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSwgMCwgZmFsc2UpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgZnVuY3Rpb24gb25PcmllbnRhdGlvbkNoYW5nZSgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHVwZGF0ZUNvbnRhaW5lcldpZHRoKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBnb1RvU2xpZGUoKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIGhhbmRsZSBvcmllbnRhdGlvbiBjaGFuZ2VcbiAgICAgICAgICAgICAgICAgICAgdmFyIHdpbkVsID0gYW5ndWxhci5lbGVtZW50KCR3aW5kb3cpO1xuICAgICAgICAgICAgICAgICAgICB3aW5FbC5iaW5kKCdvcmllbnRhdGlvbmNoYW5nZScsIG9uT3JpZW50YXRpb25DaGFuZ2UpO1xuICAgICAgICAgICAgICAgICAgICB3aW5FbC5iaW5kKCdyZXNpemUnLCBvbk9yaWVudGF0aW9uQ2hhbmdlKTtcblxuICAgICAgICAgICAgICAgICAgICBzY29wZS4kb24oJyRkZXN0cm95JywgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB1bmJpbmRNb3VzZVVwRXZlbnQoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdpbkVsLnVuYmluZCgnb3JpZW50YXRpb25jaGFuZ2UnLCBvbk9yaWVudGF0aW9uQ2hhbmdlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdpbkVsLnVuYmluZCgncmVzaXplJywgb25PcmllbnRhdGlvbkNoYW5nZSk7XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgfVxuXSk7XG5cbm1vZHVsZS5leHBvcnRzID0gQW5ndWxhckNhcm91c2VsO1xuIixudWxsLCIndXNlIHN0cmljdCc7XG52YXIgQ2Fyb3VzZWxJbmRpY2F0b3JzID0gYW5ndWxhci5tb2R1bGUoJ2FuZ3VsYXItY2Fyb3VzZWwnKVxuXG4uZGlyZWN0aXZlKCdybkNhcm91c2VsSW5kaWNhdG9ycycsIFsnJHBhcnNlJywgZnVuY3Rpb24oJHBhcnNlKSB7XG4gIHJldHVybiB7XG4gICAgcmVzdHJpY3Q6ICdBJyxcbiAgICBzY29wZToge1xuICAgICAgc2xpZGVzOiAnPScsXG4gICAgICBpbmRleDogJz1ybkNhcm91c2VsSW5kZXgnXG4gICAgfSxcbiAgICB0ZW1wbGF0ZVVybDogJ2Nhcm91c2VsLWluZGljYXRvcnMuaHRtbCcsXG4gICAgbGluazogZnVuY3Rpb24oc2NvcGUsIGlFbGVtZW50LCBpQXR0cmlidXRlcykge1xuICAgICAgdmFyIGluZGV4TW9kZWwgPSAkcGFyc2UoaUF0dHJpYnV0ZXMucm5DYXJvdXNlbEluZGV4KTtcbiAgICAgIHNjb3BlLmdvVG9TbGlkZSA9IGZ1bmN0aW9uKGluZGV4KSB7XG4gICAgICAgIGluZGV4TW9kZWwuYXNzaWduKHNjb3BlLiRwYXJlbnQuJHBhcmVudCwgaW5kZXgpO1xuICAgICAgfTtcbiAgICB9XG4gIH07XG59XSk7XG5cbmFuZ3VsYXIubW9kdWxlKCdhbmd1bGFyLWNhcm91c2VsJykucnVuKFsnJHRlbXBsYXRlQ2FjaGUnLCBmdW5jdGlvbigkdGVtcGxhdGVDYWNoZSkge1xuICAvLyBUT0RPOiBDaHJpc3QsIGZpeCB0aGlzXG4gICR0ZW1wbGF0ZUNhY2hlLnB1dCgnY2Fyb3VzZWwtaW5kaWNhdG9ycy5odG1sJyxcbiAgICAgICc8ZGl2IGNsYXNzPVwicm4tY2Fyb3VzZWwtaW5kaWNhdG9yXCI+XFxuJyArXG4gICAgICAgICc8c3BhbiBuZy1yZXBlYXQ9XCJzbGlkZSBpbiBzbGlkZXNcIiBuZy1jbGFzcz1cInthY3RpdmU6ICRpbmRleD09aW5kZXh9XCIgbmctY2xpY2s9XCJnb1RvU2xpZGUoJGluZGV4KVwiPuKXjzwvc3Bhbj4nICtcbiAgICAgICc8L2Rpdj4nXG4gICk7XG59XSk7XG5cbm1vZHVsZS5leHBvcnRzID0gQ2Fyb3VzZWxJbmRpY2F0b3JzO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgU2hpZnR5ID0gYW5ndWxhci5tb2R1bGUoJ2FuZ3VsYXItY2Fyb3VzZWwuc2hpZnR5JywgW10pXG5cbi5mYWN0b3J5KCdUd2VlbmFibGUnLCBmdW5jdGlvbigpIHtcblxuICAgIC8qISBzaGlmdHkgLSB2MS4zLjQgLSAyMDE0LTEwLTI5IC0gaHR0cDovL2plcmVteWNrYWhuLmdpdGh1Yi5pby9zaGlmdHkgKi9cbiAgOyhmdW5jdGlvbiAocm9vdCkge1xuXG4gIC8qIVxuICAgKiBTaGlmdHkgQ29yZVxuICAgKiBCeSBKZXJlbXkgS2FobiAtIGplcmVteWNrYWhuQGdtYWlsLmNvbVxuICAgKi9cblxuICB2YXIgVHdlZW5hYmxlID0gKGZ1bmN0aW9uICgpIHtcblxuICAgIC8vIEFsaWFzZXMgdGhhdCBnZXQgZGVmaW5lZCBsYXRlciBpbiB0aGlzIGZ1bmN0aW9uXG4gICAgdmFyIGZvcm11bGE7XG5cbiAgICAvLyBDT05TVEFOVFNcbiAgICB2YXIgREVGQVVMVF9TQ0hFRFVMRV9GVU5DVElPTjtcbiAgICB2YXIgREVGQVVMVF9FQVNJTkcgPSAnbGluZWFyJztcbiAgICB2YXIgREVGQVVMVF9EVVJBVElPTiA9IDUwMDtcbiAgICB2YXIgVVBEQVRFX1RJTUUgPSAxMDAwIC8gNjA7XG5cbiAgICB2YXIgX25vdyA9IERhdGUubm93ID8gRGF0ZS5ub3cgOiBmdW5jdGlvbiAoKSB7cmV0dXJuICtuZXcgRGF0ZSgpO307XG5cbiAgICB2YXIgbm93ID0gdHlwZW9mIFNISUZUWV9ERUJVR19OT1cgIT09ICd1bmRlZmluZWQnID8gU0hJRlRZX0RFQlVHX05PVyA6IF9ub3c7XG5cbiAgICBpZiAodHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIC8vIHJlcXVlc3RBbmltYXRpb25GcmFtZSgpIHNoaW0gYnkgUGF1bCBJcmlzaCAobW9kaWZpZWQgZm9yIFNoaWZ0eSlcbiAgICAgIC8vIGh0dHA6Ly9wYXVsaXJpc2guY29tLzIwMTEvcmVxdWVzdGFuaW1hdGlvbmZyYW1lLWZvci1zbWFydC1hbmltYXRpbmcvXG4gICAgICBERUZBVUxUX1NDSEVEVUxFX0ZVTkNUSU9OID0gd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZVxuICAgICAgICAgfHwgd2luZG93LndlYmtpdFJlcXVlc3RBbmltYXRpb25GcmFtZVxuICAgICAgICAgfHwgd2luZG93Lm9SZXF1ZXN0QW5pbWF0aW9uRnJhbWVcbiAgICAgICAgIHx8IHdpbmRvdy5tc1JlcXVlc3RBbmltYXRpb25GcmFtZVxuICAgICAgICAgfHwgKHdpbmRvdy5tb3pDYW5jZWxSZXF1ZXN0QW5pbWF0aW9uRnJhbWVcbiAgICAgICAgICYmIHdpbmRvdy5tb3pSZXF1ZXN0QW5pbWF0aW9uRnJhbWUpXG4gICAgICAgICB8fCBzZXRUaW1lb3V0O1xuICAgIH0gZWxzZSB7XG4gICAgICBERUZBVUxUX1NDSEVEVUxFX0ZVTkNUSU9OID0gc2V0VGltZW91dDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBub29wICgpIHtcbiAgICAgIC8vIE5PT1AhXG4gICAgfVxuXG4gICAgLyohXG4gICAgICogSGFuZHkgc2hvcnRjdXQgZm9yIGRvaW5nIGEgZm9yLWluIGxvb3AuIFRoaXMgaXMgbm90IGEgXCJub3JtYWxcIiBlYWNoXG4gICAgICogZnVuY3Rpb24sIGl0IGlzIG9wdGltaXplZCBmb3IgU2hpZnR5LiAgVGhlIGl0ZXJhdG9yIGZ1bmN0aW9uIG9ubHkgcmVjZWl2ZXNcbiAgICAgKiB0aGUgcHJvcGVydHkgbmFtZSwgbm90IHRoZSB2YWx1ZS5cbiAgICAgKiBAcGFyYW0ge09iamVjdH0gb2JqXG4gICAgICogQHBhcmFtIHtGdW5jdGlvbihzdHJpbmcpfSBmblxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGVhY2ggKG9iaiwgZm4pIHtcbiAgICAgIHZhciBrZXk7XG4gICAgICBmb3IgKGtleSBpbiBvYmopIHtcbiAgICAgICAgaWYgKE9iamVjdC5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwga2V5KSkge1xuICAgICAgICAgIGZuKGtleSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICAvKiFcbiAgICAgKiBQZXJmb3JtIGEgc2hhbGxvdyBjb3B5IG9mIE9iamVjdCBwcm9wZXJ0aWVzLlxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSB0YXJnZXRPYmplY3QgVGhlIG9iamVjdCB0byBjb3B5IGludG9cbiAgICAgKiBAcGFyYW0ge09iamVjdH0gc3JjT2JqZWN0IFRoZSBvYmplY3QgdG8gY29weSBmcm9tXG4gICAgICogQHJldHVybiB7T2JqZWN0fSBBIHJlZmVyZW5jZSB0byB0aGUgYXVnbWVudGVkIGB0YXJnZXRPYmpgIE9iamVjdFxuICAgICAqL1xuICAgIGZ1bmN0aW9uIHNoYWxsb3dDb3B5ICh0YXJnZXRPYmosIHNyY09iaikge1xuICAgICAgZWFjaChzcmNPYmosIGZ1bmN0aW9uIChwcm9wKSB7XG4gICAgICAgIHRhcmdldE9ialtwcm9wXSA9IHNyY09ialtwcm9wXTtcbiAgICAgIH0pO1xuXG4gICAgICByZXR1cm4gdGFyZ2V0T2JqO1xuICAgIH1cblxuICAgIC8qIVxuICAgICAqIENvcGllcyBlYWNoIHByb3BlcnR5IGZyb20gc3JjIG9udG8gdGFyZ2V0LCBidXQgb25seSBpZiB0aGUgcHJvcGVydHkgdG9cbiAgICAgKiBjb3B5IHRvIHRhcmdldCBpcyB1bmRlZmluZWQuXG4gICAgICogQHBhcmFtIHtPYmplY3R9IHRhcmdldCBNaXNzaW5nIHByb3BlcnRpZXMgaW4gdGhpcyBPYmplY3QgYXJlIGZpbGxlZCBpblxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBzcmNcbiAgICAgKi9cbiAgICBmdW5jdGlvbiBkZWZhdWx0cyAodGFyZ2V0LCBzcmMpIHtcbiAgICAgIGVhY2goc3JjLCBmdW5jdGlvbiAocHJvcCkge1xuICAgICAgICBpZiAodHlwZW9mIHRhcmdldFtwcm9wXSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICB0YXJnZXRbcHJvcF0gPSBzcmNbcHJvcF07XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8qIVxuICAgICAqIENhbGN1bGF0ZXMgdGhlIGludGVycG9sYXRlZCB0d2VlbiB2YWx1ZXMgb2YgYW4gT2JqZWN0IGZvciBhIGdpdmVuXG4gICAgICogdGltZXN0YW1wLlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBmb3JQb3NpdGlvbiBUaGUgcG9zaXRpb24gdG8gY29tcHV0ZSB0aGUgc3RhdGUgZm9yLlxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBjdXJyZW50U3RhdGUgQ3VycmVudCBzdGF0ZSBwcm9wZXJ0aWVzLlxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBvcmlnaW5hbFN0YXRlOiBUaGUgb3JpZ2luYWwgc3RhdGUgcHJvcGVydGllcyB0aGUgT2JqZWN0IGlzXG4gICAgICogdHdlZW5pbmcgZnJvbS5cbiAgICAgKiBAcGFyYW0ge09iamVjdH0gdGFyZ2V0U3RhdGU6IFRoZSBkZXN0aW5hdGlvbiBzdGF0ZSBwcm9wZXJ0aWVzIHRoZSBPYmplY3RcbiAgICAgKiBpcyB0d2VlbmluZyB0by5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gZHVyYXRpb246IFRoZSBsZW5ndGggb2YgdGhlIHR3ZWVuIGluIG1pbGxpc2Vjb25kcy5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gdGltZXN0YW1wOiBUaGUgVU5JWCBlcG9jaCB0aW1lIGF0IHdoaWNoIHRoZSB0d2VlbiBiZWdhbi5cbiAgICAgKiBAcGFyYW0ge09iamVjdH0gZWFzaW5nOiBUaGlzIE9iamVjdCdzIGtleXMgbXVzdCBjb3JyZXNwb25kIHRvIHRoZSBrZXlzIGluXG4gICAgICogdGFyZ2V0U3RhdGUuXG4gICAgICovXG4gICAgZnVuY3Rpb24gdHdlZW5Qcm9wcyAoZm9yUG9zaXRpb24sIGN1cnJlbnRTdGF0ZSwgb3JpZ2luYWxTdGF0ZSwgdGFyZ2V0U3RhdGUsXG4gICAgICBkdXJhdGlvbiwgdGltZXN0YW1wLCBlYXNpbmcpIHtcbiAgICAgIHZhciBub3JtYWxpemVkUG9zaXRpb24gPSAoZm9yUG9zaXRpb24gLSB0aW1lc3RhbXApIC8gZHVyYXRpb247XG5cbiAgICAgIHZhciBwcm9wO1xuICAgICAgZm9yIChwcm9wIGluIGN1cnJlbnRTdGF0ZSkge1xuICAgICAgICBpZiAoY3VycmVudFN0YXRlLmhhc093blByb3BlcnR5KHByb3ApKSB7XG4gICAgICAgICAgY3VycmVudFN0YXRlW3Byb3BdID0gdHdlZW5Qcm9wKG9yaWdpbmFsU3RhdGVbcHJvcF0sXG4gICAgICAgICAgICB0YXJnZXRTdGF0ZVtwcm9wXSwgZm9ybXVsYVtlYXNpbmdbcHJvcF1dLCBub3JtYWxpemVkUG9zaXRpb24pO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBjdXJyZW50U3RhdGU7XG4gICAgfVxuXG4gICAgLyohXG4gICAgICogVHdlZW5zIGEgc2luZ2xlIHByb3BlcnR5LlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBzdGFydCBUaGUgdmFsdWUgdGhhdCB0aGUgdHdlZW4gc3RhcnRlZCBmcm9tLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBlbmQgVGhlIHZhbHVlIHRoYXQgdGhlIHR3ZWVuIHNob3VsZCBlbmQgYXQuXG4gICAgICogQHBhcmFtIHtGdW5jdGlvbn0gZWFzaW5nRnVuYyBUaGUgZWFzaW5nIGN1cnZlIHRvIGFwcGx5IHRvIHRoZSB0d2Vlbi5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gcG9zaXRpb24gVGhlIG5vcm1hbGl6ZWQgcG9zaXRpb24gKGJldHdlZW4gMC4wIGFuZCAxLjApIHRvXG4gICAgICogY2FsY3VsYXRlIHRoZSBtaWRwb2ludCBvZiAnc3RhcnQnIGFuZCAnZW5kJyBhZ2FpbnN0LlxuICAgICAqIEByZXR1cm4ge251bWJlcn0gVGhlIHR3ZWVuZWQgdmFsdWUuXG4gICAgICovXG4gICAgZnVuY3Rpb24gdHdlZW5Qcm9wIChzdGFydCwgZW5kLCBlYXNpbmdGdW5jLCBwb3NpdGlvbikge1xuICAgICAgcmV0dXJuIHN0YXJ0ICsgKGVuZCAtIHN0YXJ0KSAqIGVhc2luZ0Z1bmMocG9zaXRpb24pO1xuICAgIH1cblxuICAgIC8qIVxuICAgICAqIEFwcGxpZXMgYSBmaWx0ZXIgdG8gVHdlZW5hYmxlIGluc3RhbmNlLlxuICAgICAqIEBwYXJhbSB7VHdlZW5hYmxlfSB0d2VlbmFibGUgVGhlIGBUd2VlbmFibGVgIGluc3RhbmNlIHRvIGNhbGwgdGhlIGZpbHRlclxuICAgICAqIHVwb24uXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IGZpbHRlck5hbWUgVGhlIG5hbWUgb2YgdGhlIGZpbHRlciB0byBhcHBseS5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBhcHBseUZpbHRlciAodHdlZW5hYmxlLCBmaWx0ZXJOYW1lKSB7XG4gICAgICB2YXIgZmlsdGVycyA9IFR3ZWVuYWJsZS5wcm90b3R5cGUuZmlsdGVyO1xuICAgICAgdmFyIGFyZ3MgPSB0d2VlbmFibGUuX2ZpbHRlckFyZ3M7XG5cbiAgICAgIGVhY2goZmlsdGVycywgZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgICAgaWYgKHR5cGVvZiBmaWx0ZXJzW25hbWVdW2ZpbHRlck5hbWVdICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgIGZpbHRlcnNbbmFtZV1bZmlsdGVyTmFtZV0uYXBwbHkodHdlZW5hYmxlLCBhcmdzKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgdmFyIHRpbWVvdXRIYW5kbGVyX2VuZFRpbWU7XG4gICAgdmFyIHRpbWVvdXRIYW5kbGVyX2N1cnJlbnRUaW1lO1xuICAgIHZhciB0aW1lb3V0SGFuZGxlcl9pc0VuZGVkO1xuICAgIHZhciB0aW1lb3V0SGFuZGxlcl9vZmZzZXQ7XG4gICAgLyohXG4gICAgICogSGFuZGxlcyB0aGUgdXBkYXRlIGxvZ2ljIGZvciBvbmUgc3RlcCBvZiBhIHR3ZWVuLlxuICAgICAqIEBwYXJhbSB7VHdlZW5hYmxlfSB0d2VlbmFibGVcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gdGltZXN0YW1wXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGR1cmF0aW9uXG4gICAgICogQHBhcmFtIHtPYmplY3R9IGN1cnJlbnRTdGF0ZVxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBvcmlnaW5hbFN0YXRlXG4gICAgICogQHBhcmFtIHtPYmplY3R9IHRhcmdldFN0YXRlXG4gICAgICogQHBhcmFtIHtPYmplY3R9IGVhc2luZ1xuICAgICAqIEBwYXJhbSB7RnVuY3Rpb24oT2JqZWN0LCAqLCBudW1iZXIpfSBzdGVwXG4gICAgICogQHBhcmFtIHtGdW5jdGlvbihGdW5jdGlvbixudW1iZXIpfX0gc2NoZWR1bGVcbiAgICAgKi9cbiAgICBmdW5jdGlvbiB0aW1lb3V0SGFuZGxlciAodHdlZW5hYmxlLCB0aW1lc3RhbXAsIGR1cmF0aW9uLCBjdXJyZW50U3RhdGUsXG4gICAgICBvcmlnaW5hbFN0YXRlLCB0YXJnZXRTdGF0ZSwgZWFzaW5nLCBzdGVwLCBzY2hlZHVsZSkge1xuICAgICAgdGltZW91dEhhbmRsZXJfZW5kVGltZSA9IHRpbWVzdGFtcCArIGR1cmF0aW9uO1xuICAgICAgdGltZW91dEhhbmRsZXJfY3VycmVudFRpbWUgPSBNYXRoLm1pbihub3coKSwgdGltZW91dEhhbmRsZXJfZW5kVGltZSk7XG4gICAgICB0aW1lb3V0SGFuZGxlcl9pc0VuZGVkID1cbiAgICAgICAgdGltZW91dEhhbmRsZXJfY3VycmVudFRpbWUgPj0gdGltZW91dEhhbmRsZXJfZW5kVGltZTtcblxuICAgICAgdGltZW91dEhhbmRsZXJfb2Zmc2V0ID0gZHVyYXRpb24gLSAoXG4gICAgICAgICAgdGltZW91dEhhbmRsZXJfZW5kVGltZSAtIHRpbWVvdXRIYW5kbGVyX2N1cnJlbnRUaW1lKTtcblxuICAgICAgaWYgKHR3ZWVuYWJsZS5pc1BsYXlpbmcoKSAmJiAhdGltZW91dEhhbmRsZXJfaXNFbmRlZCkge1xuICAgICAgICB0d2VlbmFibGUuX3NjaGVkdWxlSWQgPSBzY2hlZHVsZSh0d2VlbmFibGUuX3RpbWVvdXRIYW5kbGVyLCBVUERBVEVfVElNRSk7XG5cbiAgICAgICAgYXBwbHlGaWx0ZXIodHdlZW5hYmxlLCAnYmVmb3JlVHdlZW4nKTtcbiAgICAgICAgdHdlZW5Qcm9wcyh0aW1lb3V0SGFuZGxlcl9jdXJyZW50VGltZSwgY3VycmVudFN0YXRlLCBvcmlnaW5hbFN0YXRlLFxuICAgICAgICAgIHRhcmdldFN0YXRlLCBkdXJhdGlvbiwgdGltZXN0YW1wLCBlYXNpbmcpO1xuICAgICAgICBhcHBseUZpbHRlcih0d2VlbmFibGUsICdhZnRlclR3ZWVuJyk7XG5cbiAgICAgICAgc3RlcChjdXJyZW50U3RhdGUsIHR3ZWVuYWJsZS5fYXR0YWNobWVudCwgdGltZW91dEhhbmRsZXJfb2Zmc2V0KTtcbiAgICAgIH0gZWxzZSBpZiAodGltZW91dEhhbmRsZXJfaXNFbmRlZCkge1xuICAgICAgICBzdGVwKHRhcmdldFN0YXRlLCB0d2VlbmFibGUuX2F0dGFjaG1lbnQsIHRpbWVvdXRIYW5kbGVyX29mZnNldCk7XG4gICAgICAgIHR3ZWVuYWJsZS5zdG9wKHRydWUpO1xuICAgICAgfVxuICAgIH1cblxuXG4gICAgLyohXG4gICAgICogQ3JlYXRlcyBhIHVzYWJsZSBlYXNpbmcgT2JqZWN0IGZyb20gZWl0aGVyIGEgc3RyaW5nIG9yIGFub3RoZXIgZWFzaW5nXG4gICAgICogT2JqZWN0LiAgSWYgYGVhc2luZ2AgaXMgYW4gT2JqZWN0LCB0aGVuIHRoaXMgZnVuY3Rpb24gY2xvbmVzIGl0IGFuZCBmaWxsc1xuICAgICAqIGluIHRoZSBtaXNzaW5nIHByb3BlcnRpZXMgd2l0aCBcImxpbmVhclwiLlxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBmcm9tVHdlZW5QYXJhbXNcbiAgICAgKiBAcGFyYW0ge09iamVjdHxzdHJpbmd9IGVhc2luZ1xuICAgICAqL1xuICAgIGZ1bmN0aW9uIGNvbXBvc2VFYXNpbmdPYmplY3QgKGZyb21Ud2VlblBhcmFtcywgZWFzaW5nKSB7XG4gICAgICB2YXIgY29tcG9zZWRFYXNpbmcgPSB7fTtcblxuICAgICAgaWYgKHR5cGVvZiBlYXNpbmcgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGVhY2goZnJvbVR3ZWVuUGFyYW1zLCBmdW5jdGlvbiAocHJvcCkge1xuICAgICAgICAgIGNvbXBvc2VkRWFzaW5nW3Byb3BdID0gZWFzaW5nO1xuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGVhY2goZnJvbVR3ZWVuUGFyYW1zLCBmdW5jdGlvbiAocHJvcCkge1xuICAgICAgICAgIGlmICghY29tcG9zZWRFYXNpbmdbcHJvcF0pIHtcbiAgICAgICAgICAgIGNvbXBvc2VkRWFzaW5nW3Byb3BdID0gZWFzaW5nW3Byb3BdIHx8IERFRkFVTFRfRUFTSU5HO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBjb21wb3NlZEVhc2luZztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUd2VlbmFibGUgY29uc3RydWN0b3IuXG4gICAgICogQHBhcmFtIHtPYmplY3Q9fSBvcHRfaW5pdGlhbFN0YXRlIFRoZSB2YWx1ZXMgdGhhdCB0aGUgaW5pdGlhbCB0d2VlbiBzaG91bGQgc3RhcnQgYXQgaWYgYSBcImZyb21cIiBvYmplY3QgaXMgbm90IHByb3ZpZGVkIHRvIFR3ZWVuYWJsZSN0d2Vlbi5cbiAgICAgKiBAcGFyYW0ge09iamVjdD19IG9wdF9jb25maWcgU2VlIFR3ZWVuYWJsZS5wcm90b3R5cGUuc2V0Q29uZmlnKClcbiAgICAgKiBAY29uc3RydWN0b3JcbiAgICAgKi9cbiAgICBmdW5jdGlvbiBUd2VlbmFibGUgKG9wdF9pbml0aWFsU3RhdGUsIG9wdF9jb25maWcpIHtcbiAgICAgIHRoaXMuX2N1cnJlbnRTdGF0ZSA9IG9wdF9pbml0aWFsU3RhdGUgfHwge307XG4gICAgICB0aGlzLl9jb25maWd1cmVkID0gZmFsc2U7XG4gICAgICB0aGlzLl9zY2hlZHVsZUZ1bmN0aW9uID0gREVGQVVMVF9TQ0hFRFVMRV9GVU5DVElPTjtcblxuICAgICAgLy8gVG8gcHJldmVudCB1bm5lY2Vzc2FyeSBjYWxscyB0byBzZXRDb25maWcgZG8gbm90IHNldCBkZWZhdWx0IGNvbmZpZ3VyYXRpb24gaGVyZS5cbiAgICAgIC8vIE9ubHkgc2V0IGRlZmF1bHQgY29uZmlndXJhdGlvbiBpbW1lZGlhdGVseSBiZWZvcmUgdHdlZW5pbmcgaWYgbm9uZSBoYXMgYmVlbiBzZXQuXG4gICAgICBpZiAodHlwZW9mIG9wdF9jb25maWcgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIHRoaXMuc2V0Q29uZmlnKG9wdF9jb25maWcpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENvbmZpZ3VyZSBhbmQgc3RhcnQgYSB0d2Vlbi5cbiAgICAgKiBAcGFyYW0ge09iamVjdD19IG9wdF9jb25maWcgU2VlIFR3ZWVuYWJsZS5wcm90b3R5cGUuc2V0Q29uZmlnKClcbiAgICAgKiBAcmV0dXJuIHtUd2VlbmFibGV9XG4gICAgICovXG4gICAgVHdlZW5hYmxlLnByb3RvdHlwZS50d2VlbiA9IGZ1bmN0aW9uIChvcHRfY29uZmlnKSB7XG4gICAgICBpZiAodGhpcy5faXNUd2VlbmluZykge1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgIH1cblxuICAgICAgLy8gT25seSBzZXQgZGVmYXVsdCBjb25maWcgaWYgbm8gY29uZmlndXJhdGlvbiBoYXMgYmVlbiBzZXQgcHJldmlvdXNseSBhbmQgbm9uZSBpcyBwcm92aWRlZCBub3cuXG4gICAgICBpZiAob3B0X2NvbmZpZyAhPT0gdW5kZWZpbmVkIHx8ICF0aGlzLl9jb25maWd1cmVkKSB7XG4gICAgICAgIHRoaXMuc2V0Q29uZmlnKG9wdF9jb25maWcpO1xuICAgICAgfVxuXG4gICAgICB0aGlzLl90aW1lc3RhbXAgPSBub3coKTtcbiAgICAgIHRoaXMuX3N0YXJ0KHRoaXMuZ2V0KCksIHRoaXMuX2F0dGFjaG1lbnQpO1xuICAgICAgcmV0dXJuIHRoaXMucmVzdW1lKCk7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIHR3ZWVuIGNvbmZpZ3VyYXRpb24uIGBjb25maWdgIG1heSBoYXZlIHRoZSBmb2xsb3dpbmcgb3B0aW9uczpcbiAgICAgKlxuICAgICAqIC0gX19mcm9tX18gKF9PYmplY3Q9Xyk6IFN0YXJ0aW5nIHBvc2l0aW9uLiAgSWYgb21pdHRlZCwgdGhlIGN1cnJlbnQgc3RhdGUgaXMgdXNlZC5cbiAgICAgKiAtIF9fdG9fXyAoX09iamVjdD1fKTogRW5kaW5nIHBvc2l0aW9uLlxuICAgICAqIC0gX19kdXJhdGlvbl9fIChfbnVtYmVyPV8pOiBIb3cgbWFueSBtaWxsaXNlY29uZHMgdG8gYW5pbWF0ZSBmb3IuXG4gICAgICogLSBfX3N0YXJ0X18gKF9GdW5jdGlvbihPYmplY3QpXyk6IEZ1bmN0aW9uIHRvIGV4ZWN1dGUgd2hlbiB0aGUgdHdlZW4gYmVnaW5zLiAgUmVjZWl2ZXMgdGhlIHN0YXRlIG9mIHRoZSB0d2VlbiBhcyB0aGUgZmlyc3QgcGFyYW1ldGVyLiBBdHRhY2htZW50IGlzIHRoZSBzZWNvbmQgcGFyYW1ldGVyLlxuICAgICAqIC0gX19zdGVwX18gKF9GdW5jdGlvbihPYmplY3QsICosIG51bWJlcilfKTogRnVuY3Rpb24gdG8gZXhlY3V0ZSBvbiBldmVyeSB0aWNrLiAgUmVjZWl2ZXMgdGhlIHN0YXRlIG9mIHRoZSB0d2VlbiBhcyB0aGUgZmlyc3QgcGFyYW1ldGVyLiBBdHRhY2htZW50IGlzIHRoZSBzZWNvbmQgcGFyYW1ldGVyLCBhbmQgdGhlIHRpbWUgZWxhcHNlZCBzaW5jZSB0aGUgc3RhcnQgb2YgdGhlIHR3ZWVuIGlzIHRoZSB0aGlyZCBwYXJhbWV0ZXIuIFRoaXMgZnVuY3Rpb24gaXMgbm90IGNhbGxlZCBvbiB0aGUgZmluYWwgc3RlcCBvZiB0aGUgYW5pbWF0aW9uLCBidXQgYGZpbmlzaGAgaXMuXG4gICAgICogLSBfX2ZpbmlzaF9fIChfRnVuY3Rpb24oT2JqZWN0LCAqKV8pOiBGdW5jdGlvbiB0byBleGVjdXRlIHVwb24gdHdlZW4gY29tcGxldGlvbi4gIFJlY2VpdmVzIHRoZSBzdGF0ZSBvZiB0aGUgdHdlZW4gYXMgdGhlIGZpcnN0IHBhcmFtZXRlci4gQXR0YWNobWVudCBpcyB0aGUgc2Vjb25kIHBhcmFtZXRlci5cbiAgICAgKiAtIF9fZWFzaW5nX18gKF9PYmplY3R8c3RyaW5nPV8pOiBFYXNpbmcgY3VydmUgbmFtZShzKSB0byB1c2UgZm9yIHRoZSB0d2Vlbi5cbiAgICAgKiAtIF9fYXR0YWNobWVudF9fIChfT2JqZWN0fHN0cmluZ3xhbnk9Xyk6IFZhbHVlIHRoYXQgaXMgYXR0YWNoZWQgdG8gdGhpcyBpbnN0YW5jZSBhbmQgcGFzc2VkIG9uIHRvIHRoZSBzdGVwL3N0YXJ0L2ZpbmlzaCBtZXRob2RzLlxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBjb25maWdcbiAgICAgKiBAcmV0dXJuIHtUd2VlbmFibGV9XG4gICAgICovXG4gICAgVHdlZW5hYmxlLnByb3RvdHlwZS5zZXRDb25maWcgPSBmdW5jdGlvbiAoY29uZmlnKSB7XG4gICAgICBjb25maWcgPSBjb25maWcgfHwge307XG4gICAgICB0aGlzLl9jb25maWd1cmVkID0gdHJ1ZTtcblxuICAgICAgLy8gQXR0YWNoIHNvbWV0aGluZyB0byB0aGlzIFR3ZWVuYWJsZSBpbnN0YW5jZSAoZS5nLjogYSBET00gZWxlbWVudCwgYW4gb2JqZWN0LCBhIHN0cmluZywgZXRjLik7XG4gICAgICB0aGlzLl9hdHRhY2htZW50ID0gY29uZmlnLmF0dGFjaG1lbnQ7XG5cbiAgICAgIC8vIEluaXQgdGhlIGludGVybmFsIHN0YXRlXG4gICAgICB0aGlzLl9wYXVzZWRBdFRpbWUgPSBudWxsO1xuICAgICAgdGhpcy5fc2NoZWR1bGVJZCA9IG51bGw7XG4gICAgICB0aGlzLl9zdGFydCA9IGNvbmZpZy5zdGFydCB8fCBub29wO1xuICAgICAgdGhpcy5fc3RlcCA9IGNvbmZpZy5zdGVwIHx8IG5vb3A7XG4gICAgICB0aGlzLl9maW5pc2ggPSBjb25maWcuZmluaXNoIHx8IG5vb3A7XG4gICAgICB0aGlzLl9kdXJhdGlvbiA9IGNvbmZpZy5kdXJhdGlvbiB8fCBERUZBVUxUX0RVUkFUSU9OO1xuICAgICAgdGhpcy5fY3VycmVudFN0YXRlID0gY29uZmlnLmZyb20gfHwgdGhpcy5nZXQoKTtcbiAgICAgIHRoaXMuX29yaWdpbmFsU3RhdGUgPSB0aGlzLmdldCgpO1xuICAgICAgdGhpcy5fdGFyZ2V0U3RhdGUgPSBjb25maWcudG8gfHwgdGhpcy5nZXQoKTtcblxuICAgICAgLy8gQWxpYXNlcyB1c2VkIGJlbG93XG4gICAgICB2YXIgY3VycmVudFN0YXRlID0gdGhpcy5fY3VycmVudFN0YXRlO1xuICAgICAgdmFyIHRhcmdldFN0YXRlID0gdGhpcy5fdGFyZ2V0U3RhdGU7XG5cbiAgICAgIC8vIEVuc3VyZSB0aGF0IHRoZXJlIGlzIGFsd2F5cyBzb21ldGhpbmcgdG8gdHdlZW4gdG8uXG4gICAgICBkZWZhdWx0cyh0YXJnZXRTdGF0ZSwgY3VycmVudFN0YXRlKTtcblxuICAgICAgdGhpcy5fZWFzaW5nID0gY29tcG9zZUVhc2luZ09iamVjdChcbiAgICAgICAgY3VycmVudFN0YXRlLCBjb25maWcuZWFzaW5nIHx8IERFRkFVTFRfRUFTSU5HKTtcblxuICAgICAgdGhpcy5fZmlsdGVyQXJncyA9XG4gICAgICAgIFtjdXJyZW50U3RhdGUsIHRoaXMuX29yaWdpbmFsU3RhdGUsIHRhcmdldFN0YXRlLCB0aGlzLl9lYXNpbmddO1xuXG4gICAgICBhcHBseUZpbHRlcih0aGlzLCAndHdlZW5DcmVhdGVkJyk7XG4gICAgICByZXR1cm4gdGhpcztcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogR2V0cyB0aGUgY3VycmVudCBzdGF0ZS5cbiAgICAgKiBAcmV0dXJuIHtPYmplY3R9XG4gICAgICovXG4gICAgVHdlZW5hYmxlLnByb3RvdHlwZS5nZXQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4gc2hhbGxvd0NvcHkoe30sIHRoaXMuX2N1cnJlbnRTdGF0ZSk7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIGN1cnJlbnQgc3RhdGUuXG4gICAgICogQHBhcmFtIHtPYmplY3R9IHN0YXRlXG4gICAgICovXG4gICAgVHdlZW5hYmxlLnByb3RvdHlwZS5zZXQgPSBmdW5jdGlvbiAoc3RhdGUpIHtcbiAgICAgIHRoaXMuX2N1cnJlbnRTdGF0ZSA9IHN0YXRlO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBQYXVzZXMgYSB0d2Vlbi4gIFBhdXNlZCB0d2VlbnMgY2FuIGJlIHJlc3VtZWQgZnJvbSB0aGUgcG9pbnQgYXQgd2hpY2ggdGhleSB3ZXJlIHBhdXNlZC4gIFRoaXMgaXMgZGlmZmVyZW50IHRoYW4gW2BzdG9wKClgXSgjc3RvcCksIGFzIHRoYXQgbWV0aG9kIGNhdXNlcyBhIHR3ZWVuIHRvIHN0YXJ0IG92ZXIgd2hlbiBpdCBpcyByZXN1bWVkLlxuICAgICAqIEByZXR1cm4ge1R3ZWVuYWJsZX1cbiAgICAgKi9cbiAgICBUd2VlbmFibGUucHJvdG90eXBlLnBhdXNlID0gZnVuY3Rpb24gKCkge1xuICAgICAgdGhpcy5fcGF1c2VkQXRUaW1lID0gbm93KCk7XG4gICAgICB0aGlzLl9pc1BhdXNlZCA9IHRydWU7XG4gICAgICByZXR1cm4gdGhpcztcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogUmVzdW1lcyBhIHBhdXNlZCB0d2Vlbi5cbiAgICAgKiBAcmV0dXJuIHtUd2VlbmFibGV9XG4gICAgICovXG4gICAgVHdlZW5hYmxlLnByb3RvdHlwZS5yZXN1bWUgPSBmdW5jdGlvbiAoKSB7XG4gICAgICBpZiAodGhpcy5faXNQYXVzZWQpIHtcbiAgICAgICAgdGhpcy5fdGltZXN0YW1wICs9IG5vdygpIC0gdGhpcy5fcGF1c2VkQXRUaW1lO1xuICAgICAgfVxuXG4gICAgICB0aGlzLl9pc1BhdXNlZCA9IGZhbHNlO1xuICAgICAgdGhpcy5faXNUd2VlbmluZyA9IHRydWU7XG5cbiAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgIHRoaXMuX3RpbWVvdXRIYW5kbGVyID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB0aW1lb3V0SGFuZGxlcihzZWxmLCBzZWxmLl90aW1lc3RhbXAsIHNlbGYuX2R1cmF0aW9uLCBzZWxmLl9jdXJyZW50U3RhdGUsXG4gICAgICAgICAgc2VsZi5fb3JpZ2luYWxTdGF0ZSwgc2VsZi5fdGFyZ2V0U3RhdGUsIHNlbGYuX2Vhc2luZywgc2VsZi5fc3RlcCxcbiAgICAgICAgICBzZWxmLl9zY2hlZHVsZUZ1bmN0aW9uKTtcbiAgICAgIH07XG5cbiAgICAgIHRoaXMuX3RpbWVvdXRIYW5kbGVyKCk7XG5cbiAgICAgIHJldHVybiB0aGlzO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBNb3ZlIHRoZSBzdGF0ZSBvZiB0aGUgYW5pbWF0aW9uIHRvIGEgc3BlY2lmaWMgcG9pbnQgaW4gdGhlIHR3ZWVuJ3MgdGltZWxpbmUuXG4gICAgICogSWYgdGhlIGFuaW1hdGlvbiBpcyBub3QgcnVubmluZywgdGhpcyB3aWxsIGNhdXNlIHRoZSBgc3RlcGAgaGFuZGxlcnMgdG8gYmVcbiAgICAgKiBjYWxsZWQuXG4gICAgICogQHBhcmFtIHttaWxsaXNlY29uZH0gbWlsbGlzZWNvbmQgVGhlIG1pbGxpc2Vjb25kIG9mIHRoZSBhbmltYXRpb24gdG8gc2VlayB0by5cbiAgICAgKiBAcmV0dXJuIHtUd2VlbmFibGV9XG4gICAgICovXG4gICAgVHdlZW5hYmxlLnByb3RvdHlwZS5zZWVrID0gZnVuY3Rpb24gKG1pbGxpc2Vjb25kKSB7XG4gICAgICB0aGlzLl90aW1lc3RhbXAgPSBub3coKSAtIG1pbGxpc2Vjb25kO1xuXG4gICAgICBpZiAoIXRoaXMuaXNQbGF5aW5nKCkpIHtcbiAgICAgICAgdGhpcy5faXNUd2VlbmluZyA9IHRydWU7XG4gICAgICAgIHRoaXMuX2lzUGF1c2VkID0gZmFsc2U7XG5cbiAgICAgICAgLy8gSWYgdGhlIGFuaW1hdGlvbiBpcyBub3QgcnVubmluZywgY2FsbCB0aW1lb3V0SGFuZGxlciB0byBtYWtlIHN1cmUgdGhhdFxuICAgICAgICAvLyBhbnkgc3RlcCBoYW5kbGVycyBhcmUgcnVuLlxuICAgICAgICB0aW1lb3V0SGFuZGxlcih0aGlzLCB0aGlzLl90aW1lc3RhbXAsIHRoaXMuX2R1cmF0aW9uLCB0aGlzLl9jdXJyZW50U3RhdGUsXG4gICAgICAgICAgdGhpcy5fb3JpZ2luYWxTdGF0ZSwgdGhpcy5fdGFyZ2V0U3RhdGUsIHRoaXMuX2Vhc2luZywgdGhpcy5fc3RlcCxcbiAgICAgICAgICB0aGlzLl9zY2hlZHVsZUZ1bmN0aW9uKTtcblxuICAgICAgICB0aGlzLl90aW1lb3V0SGFuZGxlcigpO1xuICAgICAgICB0aGlzLnBhdXNlKCk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB0aGlzO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBTdG9wcyBhbmQgY2FuY2VscyBhIHR3ZWVuLlxuICAgICAqIEBwYXJhbSB7Ym9vbGVhbj19IGdvdG9FbmQgSWYgZmFsc2Ugb3Igb21pdHRlZCwgdGhlIHR3ZWVuIGp1c3Qgc3RvcHMgYXQgaXRzIGN1cnJlbnQgc3RhdGUsIGFuZCB0aGUgXCJmaW5pc2hcIiBoYW5kbGVyIGlzIG5vdCBpbnZva2VkLiAgSWYgdHJ1ZSwgdGhlIHR3ZWVuZWQgb2JqZWN0J3MgdmFsdWVzIGFyZSBpbnN0YW50bHkgc2V0IHRvIHRoZSB0YXJnZXQgdmFsdWVzLCBhbmQgXCJmaW5pc2hcIiBpcyBpbnZva2VkLlxuICAgICAqIEByZXR1cm4ge1R3ZWVuYWJsZX1cbiAgICAgKi9cbiAgICBUd2VlbmFibGUucHJvdG90eXBlLnN0b3AgPSBmdW5jdGlvbiAoZ290b0VuZCkge1xuICAgICAgdGhpcy5faXNUd2VlbmluZyA9IGZhbHNlO1xuICAgICAgdGhpcy5faXNQYXVzZWQgPSBmYWxzZTtcbiAgICAgIHRoaXMuX3RpbWVvdXRIYW5kbGVyID0gbm9vcDtcblxuICAgICAgKHJvb3QuY2FuY2VsQW5pbWF0aW9uRnJhbWUgICAgICAgICAgICB8fFxuICAgICAgICByb290LndlYmtpdENhbmNlbEFuaW1hdGlvbkZyYW1lICAgICB8fFxuICAgICAgICByb290Lm9DYW5jZWxBbmltYXRpb25GcmFtZSAgICAgICAgICB8fFxuICAgICAgICByb290Lm1zQ2FuY2VsQW5pbWF0aW9uRnJhbWUgICAgICAgICB8fFxuICAgICAgICByb290Lm1vekNhbmNlbFJlcXVlc3RBbmltYXRpb25GcmFtZSB8fFxuICAgICAgICByb290LmNsZWFyVGltZW91dCkodGhpcy5fc2NoZWR1bGVJZCk7XG5cbiAgICAgIGlmIChnb3RvRW5kKSB7XG4gICAgICAgIHNoYWxsb3dDb3B5KHRoaXMuX2N1cnJlbnRTdGF0ZSwgdGhpcy5fdGFyZ2V0U3RhdGUpO1xuICAgICAgICBhcHBseUZpbHRlcih0aGlzLCAnYWZ0ZXJUd2VlbkVuZCcpO1xuICAgICAgICB0aGlzLl9maW5pc2guY2FsbCh0aGlzLCB0aGlzLl9jdXJyZW50U3RhdGUsIHRoaXMuX2F0dGFjaG1lbnQpO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gdGhpcztcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB3aGV0aGVyIG9yIG5vdCBhIHR3ZWVuIGlzIHJ1bm5pbmcuXG4gICAgICogQHJldHVybiB7Ym9vbGVhbn1cbiAgICAgKi9cbiAgICBUd2VlbmFibGUucHJvdG90eXBlLmlzUGxheWluZyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiB0aGlzLl9pc1R3ZWVuaW5nICYmICF0aGlzLl9pc1BhdXNlZDtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogU2V0cyBhIGN1c3RvbSBzY2hlZHVsZSBmdW5jdGlvbi5cbiAgICAgKlxuICAgICAqIElmIGEgY3VzdG9tIGZ1bmN0aW9uIGlzIG5vdCBzZXQgdGhlIGRlZmF1bHQgb25lIGlzIHVzZWQgW2ByZXF1ZXN0QW5pbWF0aW9uRnJhbWVgXShodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9BUEkvd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSkgaWYgYXZhaWxhYmxlLCBvdGhlcndpc2UgW2BzZXRUaW1lb3V0YF0oaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvQVBJL1dpbmRvdy5zZXRUaW1lb3V0KSkuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9uKEZ1bmN0aW9uLG51bWJlcil9IHNjaGVkdWxlRnVuY3Rpb24gVGhlIGZ1bmN0aW9uIHRvIGJlIGNhbGxlZCB0byBzY2hlZHVsZSB0aGUgbmV4dCBmcmFtZSB0byBiZSByZW5kZXJlZFxuICAgICAqL1xuICAgIFR3ZWVuYWJsZS5wcm90b3R5cGUuc2V0U2NoZWR1bGVGdW5jdGlvbiA9IGZ1bmN0aW9uIChzY2hlZHVsZUZ1bmN0aW9uKSB7XG4gICAgICB0aGlzLl9zY2hlZHVsZUZ1bmN0aW9uID0gc2NoZWR1bGVGdW5jdGlvbjtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogYGRlbGV0ZWBzIGFsbCBcIm93blwiIHByb3BlcnRpZXMuICBDYWxsIHRoaXMgd2hlbiB0aGUgYFR3ZWVuYWJsZWAgaW5zdGFuY2UgaXMgbm8gbG9uZ2VyIG5lZWRlZCB0byBmcmVlIG1lbW9yeS5cbiAgICAgKi9cbiAgICBUd2VlbmFibGUucHJvdG90eXBlLmRpc3Bvc2UgPSBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgcHJvcDtcbiAgICAgIGZvciAocHJvcCBpbiB0aGlzKSB7XG4gICAgICAgIGlmICh0aGlzLmhhc093blByb3BlcnR5KHByb3ApKSB7XG4gICAgICAgICAgZGVsZXRlIHRoaXNbcHJvcF07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9O1xuXG4gICAgLyohXG4gICAgICogRmlsdGVycyBhcmUgdXNlZCBmb3IgdHJhbnNmb3JtaW5nIHRoZSBwcm9wZXJ0aWVzIG9mIGEgdHdlZW4gYXQgdmFyaW91c1xuICAgICAqIHBvaW50cyBpbiBhIFR3ZWVuYWJsZSdzIGxpZmUgY3ljbGUuICBTZWUgdGhlIFJFQURNRSBmb3IgbW9yZSBpbmZvIG9uIHRoaXMuXG4gICAgICovXG4gICAgVHdlZW5hYmxlLnByb3RvdHlwZS5maWx0ZXIgPSB7fTtcblxuICAgIC8qIVxuICAgICAqIFRoaXMgb2JqZWN0IGNvbnRhaW5zIGFsbCBvZiB0aGUgdHdlZW5zIGF2YWlsYWJsZSB0byBTaGlmdHkuICBJdCBpcyBleHRlbmRpYmxlIC0gc2ltcGx5IGF0dGFjaCBwcm9wZXJ0aWVzIHRvIHRoZSBUd2VlbmFibGUucHJvdG90eXBlLmZvcm11bGEgT2JqZWN0IGZvbGxvd2luZyB0aGUgc2FtZSBmb3JtYXQgYXQgbGluZWFyLlxuICAgICAqXG4gICAgICogYHBvc2Agc2hvdWxkIGJlIGEgbm9ybWFsaXplZCBgbnVtYmVyYCAoYmV0d2VlbiAwIGFuZCAxKS5cbiAgICAgKi9cbiAgICBUd2VlbmFibGUucHJvdG90eXBlLmZvcm11bGEgPSB7XG4gICAgICBsaW5lYXI6IGZ1bmN0aW9uIChwb3MpIHtcbiAgICAgICAgcmV0dXJuIHBvcztcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgZm9ybXVsYSA9IFR3ZWVuYWJsZS5wcm90b3R5cGUuZm9ybXVsYTtcblxuICAgIHNoYWxsb3dDb3B5KFR3ZWVuYWJsZSwge1xuICAgICAgJ25vdyc6IG5vd1xuICAgICAgLCdlYWNoJzogZWFjaFxuICAgICAgLCd0d2VlblByb3BzJzogdHdlZW5Qcm9wc1xuICAgICAgLCd0d2VlblByb3AnOiB0d2VlblByb3BcbiAgICAgICwnYXBwbHlGaWx0ZXInOiBhcHBseUZpbHRlclxuICAgICAgLCdzaGFsbG93Q29weSc6IHNoYWxsb3dDb3B5XG4gICAgICAsJ2RlZmF1bHRzJzogZGVmYXVsdHNcbiAgICAgICwnY29tcG9zZUVhc2luZ09iamVjdCc6IGNvbXBvc2VFYXNpbmdPYmplY3RcbiAgICB9KTtcblxuICAgIHJvb3QuVHdlZW5hYmxlID0gVHdlZW5hYmxlO1xuICAgIHJldHVybiBUd2VlbmFibGU7XG5cbiAgfSAoKSk7XG5cbiAgLyohXG4gICAqIEFsbCBlcXVhdGlvbnMgYXJlIGFkYXB0ZWQgZnJvbSBUaG9tYXMgRnVjaHMnIFtTY3JpcHR5Ml0oaHR0cHM6Ly9naXRodWIuY29tL21hZHJvYmJ5L3NjcmlwdHkyL2Jsb2IvbWFzdGVyL3NyYy9lZmZlY3RzL3RyYW5zaXRpb25zL3Blbm5lci5qcykuXG4gICAqXG4gICAqIEJhc2VkIG9uIEVhc2luZyBFcXVhdGlvbnMgKGMpIDIwMDMgW1JvYmVydCBQZW5uZXJdKGh0dHA6Ly93d3cucm9iZXJ0cGVubmVyLmNvbS8pLCBhbGwgcmlnaHRzIHJlc2VydmVkLiBUaGlzIHdvcmsgaXMgW3N1YmplY3QgdG8gdGVybXNdKGh0dHA6Ly93d3cucm9iZXJ0cGVubmVyLmNvbS9lYXNpbmdfdGVybXNfb2ZfdXNlLmh0bWwpLlxuICAgKi9cblxuICAvKiFcbiAgICogIFRFUk1TIE9GIFVTRSAtIEVBU0lORyBFUVVBVElPTlNcbiAgICogIE9wZW4gc291cmNlIHVuZGVyIHRoZSBCU0QgTGljZW5zZS5cbiAgICogIEVhc2luZyBFcXVhdGlvbnMgKGMpIDIwMDMgUm9iZXJ0IFBlbm5lciwgYWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAgICovXG5cbiAgOyhmdW5jdGlvbiAoKSB7XG5cbiAgICBUd2VlbmFibGUuc2hhbGxvd0NvcHkoVHdlZW5hYmxlLnByb3RvdHlwZS5mb3JtdWxhLCB7XG4gICAgICBlYXNlSW5RdWFkOiBmdW5jdGlvbiAocG9zKSB7XG4gICAgICAgIHJldHVybiBNYXRoLnBvdyhwb3MsIDIpO1xuICAgICAgfSxcblxuICAgICAgZWFzZU91dFF1YWQ6IGZ1bmN0aW9uIChwb3MpIHtcbiAgICAgICAgcmV0dXJuIC0oTWF0aC5wb3coKHBvcyAtIDEpLCAyKSAtIDEpO1xuICAgICAgfSxcblxuICAgICAgZWFzZUluT3V0UXVhZDogZnVuY3Rpb24gKHBvcykge1xuICAgICAgICBpZiAoKHBvcyAvPSAwLjUpIDwgMSkge3JldHVybiAwLjUgKiBNYXRoLnBvdyhwb3MsMik7fVxuICAgICAgICByZXR1cm4gLTAuNSAqICgocG9zIC09IDIpICogcG9zIC0gMik7XG4gICAgICB9LFxuXG4gICAgICBlYXNlSW5DdWJpYzogZnVuY3Rpb24gKHBvcykge1xuICAgICAgICByZXR1cm4gTWF0aC5wb3cocG9zLCAzKTtcbiAgICAgIH0sXG5cbiAgICAgIGVhc2VPdXRDdWJpYzogZnVuY3Rpb24gKHBvcykge1xuICAgICAgICByZXR1cm4gKE1hdGgucG93KChwb3MgLSAxKSwgMykgKyAxKTtcbiAgICAgIH0sXG5cbiAgICAgIGVhc2VJbk91dEN1YmljOiBmdW5jdGlvbiAocG9zKSB7XG4gICAgICAgIGlmICgocG9zIC89IDAuNSkgPCAxKSB7cmV0dXJuIDAuNSAqIE1hdGgucG93KHBvcywzKTt9XG4gICAgICAgIHJldHVybiAwLjUgKiAoTWF0aC5wb3coKHBvcyAtIDIpLDMpICsgMik7XG4gICAgICB9LFxuXG4gICAgICBlYXNlSW5RdWFydDogZnVuY3Rpb24gKHBvcykge1xuICAgICAgICByZXR1cm4gTWF0aC5wb3cocG9zLCA0KTtcbiAgICAgIH0sXG5cbiAgICAgIGVhc2VPdXRRdWFydDogZnVuY3Rpb24gKHBvcykge1xuICAgICAgICByZXR1cm4gLShNYXRoLnBvdygocG9zIC0gMSksIDQpIC0gMSk7XG4gICAgICB9LFxuXG4gICAgICBlYXNlSW5PdXRRdWFydDogZnVuY3Rpb24gKHBvcykge1xuICAgICAgICBpZiAoKHBvcyAvPSAwLjUpIDwgMSkge3JldHVybiAwLjUgKiBNYXRoLnBvdyhwb3MsNCk7fVxuICAgICAgICByZXR1cm4gLTAuNSAqICgocG9zIC09IDIpICogTWF0aC5wb3cocG9zLDMpIC0gMik7XG4gICAgICB9LFxuXG4gICAgICBlYXNlSW5RdWludDogZnVuY3Rpb24gKHBvcykge1xuICAgICAgICByZXR1cm4gTWF0aC5wb3cocG9zLCA1KTtcbiAgICAgIH0sXG5cbiAgICAgIGVhc2VPdXRRdWludDogZnVuY3Rpb24gKHBvcykge1xuICAgICAgICByZXR1cm4gKE1hdGgucG93KChwb3MgLSAxKSwgNSkgKyAxKTtcbiAgICAgIH0sXG5cbiAgICAgIGVhc2VJbk91dFF1aW50OiBmdW5jdGlvbiAocG9zKSB7XG4gICAgICAgIGlmICgocG9zIC89IDAuNSkgPCAxKSB7cmV0dXJuIDAuNSAqIE1hdGgucG93KHBvcyw1KTt9XG4gICAgICAgIHJldHVybiAwLjUgKiAoTWF0aC5wb3coKHBvcyAtIDIpLDUpICsgMik7XG4gICAgICB9LFxuXG4gICAgICBlYXNlSW5TaW5lOiBmdW5jdGlvbiAocG9zKSB7XG4gICAgICAgIHJldHVybiAtTWF0aC5jb3MocG9zICogKE1hdGguUEkgLyAyKSkgKyAxO1xuICAgICAgfSxcblxuICAgICAgZWFzZU91dFNpbmU6IGZ1bmN0aW9uIChwb3MpIHtcbiAgICAgICAgcmV0dXJuIE1hdGguc2luKHBvcyAqIChNYXRoLlBJIC8gMikpO1xuICAgICAgfSxcblxuICAgICAgZWFzZUluT3V0U2luZTogZnVuY3Rpb24gKHBvcykge1xuICAgICAgICByZXR1cm4gKC0wLjUgKiAoTWF0aC5jb3MoTWF0aC5QSSAqIHBvcykgLSAxKSk7XG4gICAgICB9LFxuXG4gICAgICBlYXNlSW5FeHBvOiBmdW5jdGlvbiAocG9zKSB7XG4gICAgICAgIHJldHVybiAocG9zID09PSAwKSA/IDAgOiBNYXRoLnBvdygyLCAxMCAqIChwb3MgLSAxKSk7XG4gICAgICB9LFxuXG4gICAgICBlYXNlT3V0RXhwbzogZnVuY3Rpb24gKHBvcykge1xuICAgICAgICByZXR1cm4gKHBvcyA9PT0gMSkgPyAxIDogLU1hdGgucG93KDIsIC0xMCAqIHBvcykgKyAxO1xuICAgICAgfSxcblxuICAgICAgZWFzZUluT3V0RXhwbzogZnVuY3Rpb24gKHBvcykge1xuICAgICAgICBpZiAocG9zID09PSAwKSB7cmV0dXJuIDA7fVxuICAgICAgICBpZiAocG9zID09PSAxKSB7cmV0dXJuIDE7fVxuICAgICAgICBpZiAoKHBvcyAvPSAwLjUpIDwgMSkge3JldHVybiAwLjUgKiBNYXRoLnBvdygyLDEwICogKHBvcyAtIDEpKTt9XG4gICAgICAgIHJldHVybiAwLjUgKiAoLU1hdGgucG93KDIsIC0xMCAqIC0tcG9zKSArIDIpO1xuICAgICAgfSxcblxuICAgICAgZWFzZUluQ2lyYzogZnVuY3Rpb24gKHBvcykge1xuICAgICAgICByZXR1cm4gLShNYXRoLnNxcnQoMSAtIChwb3MgKiBwb3MpKSAtIDEpO1xuICAgICAgfSxcblxuICAgICAgZWFzZU91dENpcmM6IGZ1bmN0aW9uIChwb3MpIHtcbiAgICAgICAgcmV0dXJuIE1hdGguc3FydCgxIC0gTWF0aC5wb3coKHBvcyAtIDEpLCAyKSk7XG4gICAgICB9LFxuXG4gICAgICBlYXNlSW5PdXRDaXJjOiBmdW5jdGlvbiAocG9zKSB7XG4gICAgICAgIGlmICgocG9zIC89IDAuNSkgPCAxKSB7cmV0dXJuIC0wLjUgKiAoTWF0aC5zcXJ0KDEgLSBwb3MgKiBwb3MpIC0gMSk7fVxuICAgICAgICByZXR1cm4gMC41ICogKE1hdGguc3FydCgxIC0gKHBvcyAtPSAyKSAqIHBvcykgKyAxKTtcbiAgICAgIH0sXG5cbiAgICAgIGVhc2VPdXRCb3VuY2U6IGZ1bmN0aW9uIChwb3MpIHtcbiAgICAgICAgaWYgKChwb3MpIDwgKDEgLyAyLjc1KSkge1xuICAgICAgICAgIHJldHVybiAoNy41NjI1ICogcG9zICogcG9zKTtcbiAgICAgICAgfSBlbHNlIGlmIChwb3MgPCAoMiAvIDIuNzUpKSB7XG4gICAgICAgICAgcmV0dXJuICg3LjU2MjUgKiAocG9zIC09ICgxLjUgLyAyLjc1KSkgKiBwb3MgKyAwLjc1KTtcbiAgICAgICAgfSBlbHNlIGlmIChwb3MgPCAoMi41IC8gMi43NSkpIHtcbiAgICAgICAgICByZXR1cm4gKDcuNTYyNSAqIChwb3MgLT0gKDIuMjUgLyAyLjc1KSkgKiBwb3MgKyAwLjkzNzUpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiAoNy41NjI1ICogKHBvcyAtPSAoMi42MjUgLyAyLjc1KSkgKiBwb3MgKyAwLjk4NDM3NSk7XG4gICAgICAgIH1cbiAgICAgIH0sXG5cbiAgICAgIGVhc2VJbkJhY2s6IGZ1bmN0aW9uIChwb3MpIHtcbiAgICAgICAgdmFyIHMgPSAxLjcwMTU4O1xuICAgICAgICByZXR1cm4gKHBvcykgKiBwb3MgKiAoKHMgKyAxKSAqIHBvcyAtIHMpO1xuICAgICAgfSxcblxuICAgICAgZWFzZU91dEJhY2s6IGZ1bmN0aW9uIChwb3MpIHtcbiAgICAgICAgdmFyIHMgPSAxLjcwMTU4O1xuICAgICAgICByZXR1cm4gKHBvcyA9IHBvcyAtIDEpICogcG9zICogKChzICsgMSkgKiBwb3MgKyBzKSArIDE7XG4gICAgICB9LFxuXG4gICAgICBlYXNlSW5PdXRCYWNrOiBmdW5jdGlvbiAocG9zKSB7XG4gICAgICAgIHZhciBzID0gMS43MDE1ODtcbiAgICAgICAgaWYgKChwb3MgLz0gMC41KSA8IDEpIHtyZXR1cm4gMC41ICogKHBvcyAqIHBvcyAqICgoKHMgKj0gKDEuNTI1KSkgKyAxKSAqIHBvcyAtIHMpKTt9XG4gICAgICAgIHJldHVybiAwLjUgKiAoKHBvcyAtPSAyKSAqIHBvcyAqICgoKHMgKj0gKDEuNTI1KSkgKyAxKSAqIHBvcyArIHMpICsgMik7XG4gICAgICB9LFxuXG4gICAgICBlbGFzdGljOiBmdW5jdGlvbiAocG9zKSB7XG4gICAgICAgIHJldHVybiAtMSAqIE1hdGgucG93KDQsLTggKiBwb3MpICogTWF0aC5zaW4oKHBvcyAqIDYgLSAxKSAqICgyICogTWF0aC5QSSkgLyAyKSArIDE7XG4gICAgICB9LFxuXG4gICAgICBzd2luZ0Zyb21UbzogZnVuY3Rpb24gKHBvcykge1xuICAgICAgICB2YXIgcyA9IDEuNzAxNTg7XG4gICAgICAgIHJldHVybiAoKHBvcyAvPSAwLjUpIDwgMSkgPyAwLjUgKiAocG9zICogcG9zICogKCgocyAqPSAoMS41MjUpKSArIDEpICogcG9zIC0gcykpIDpcbiAgICAgICAgICAgIDAuNSAqICgocG9zIC09IDIpICogcG9zICogKCgocyAqPSAoMS41MjUpKSArIDEpICogcG9zICsgcykgKyAyKTtcbiAgICAgIH0sXG5cbiAgICAgIHN3aW5nRnJvbTogZnVuY3Rpb24gKHBvcykge1xuICAgICAgICB2YXIgcyA9IDEuNzAxNTg7XG4gICAgICAgIHJldHVybiBwb3MgKiBwb3MgKiAoKHMgKyAxKSAqIHBvcyAtIHMpO1xuICAgICAgfSxcblxuICAgICAgc3dpbmdUbzogZnVuY3Rpb24gKHBvcykge1xuICAgICAgICB2YXIgcyA9IDEuNzAxNTg7XG4gICAgICAgIHJldHVybiAocG9zIC09IDEpICogcG9zICogKChzICsgMSkgKiBwb3MgKyBzKSArIDE7XG4gICAgICB9LFxuXG4gICAgICBib3VuY2U6IGZ1bmN0aW9uIChwb3MpIHtcbiAgICAgICAgaWYgKHBvcyA8ICgxIC8gMi43NSkpIHtcbiAgICAgICAgICByZXR1cm4gKDcuNTYyNSAqIHBvcyAqIHBvcyk7XG4gICAgICAgIH0gZWxzZSBpZiAocG9zIDwgKDIgLyAyLjc1KSkge1xuICAgICAgICAgIHJldHVybiAoNy41NjI1ICogKHBvcyAtPSAoMS41IC8gMi43NSkpICogcG9zICsgMC43NSk7XG4gICAgICAgIH0gZWxzZSBpZiAocG9zIDwgKDIuNSAvIDIuNzUpKSB7XG4gICAgICAgICAgcmV0dXJuICg3LjU2MjUgKiAocG9zIC09ICgyLjI1IC8gMi43NSkpICogcG9zICsgMC45Mzc1KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gKDcuNTYyNSAqIChwb3MgLT0gKDIuNjI1IC8gMi43NSkpICogcG9zICsgMC45ODQzNzUpO1xuICAgICAgICB9XG4gICAgICB9LFxuXG4gICAgICBib3VuY2VQYXN0OiBmdW5jdGlvbiAocG9zKSB7XG4gICAgICAgIGlmIChwb3MgPCAoMSAvIDIuNzUpKSB7XG4gICAgICAgICAgcmV0dXJuICg3LjU2MjUgKiBwb3MgKiBwb3MpO1xuICAgICAgICB9IGVsc2UgaWYgKHBvcyA8ICgyIC8gMi43NSkpIHtcbiAgICAgICAgICByZXR1cm4gMiAtICg3LjU2MjUgKiAocG9zIC09ICgxLjUgLyAyLjc1KSkgKiBwb3MgKyAwLjc1KTtcbiAgICAgICAgfSBlbHNlIGlmIChwb3MgPCAoMi41IC8gMi43NSkpIHtcbiAgICAgICAgICByZXR1cm4gMiAtICg3LjU2MjUgKiAocG9zIC09ICgyLjI1IC8gMi43NSkpICogcG9zICsgMC45Mzc1KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gMiAtICg3LjU2MjUgKiAocG9zIC09ICgyLjYyNSAvIDIuNzUpKSAqIHBvcyArIDAuOTg0Mzc1KTtcbiAgICAgICAgfVxuICAgICAgfSxcblxuICAgICAgZWFzZUZyb21UbzogZnVuY3Rpb24gKHBvcykge1xuICAgICAgICBpZiAoKHBvcyAvPSAwLjUpIDwgMSkge3JldHVybiAwLjUgKiBNYXRoLnBvdyhwb3MsNCk7fVxuICAgICAgICByZXR1cm4gLTAuNSAqICgocG9zIC09IDIpICogTWF0aC5wb3cocG9zLDMpIC0gMik7XG4gICAgICB9LFxuXG4gICAgICBlYXNlRnJvbTogZnVuY3Rpb24gKHBvcykge1xuICAgICAgICByZXR1cm4gTWF0aC5wb3cocG9zLDQpO1xuICAgICAgfSxcblxuICAgICAgZWFzZVRvOiBmdW5jdGlvbiAocG9zKSB7XG4gICAgICAgIHJldHVybiBNYXRoLnBvdyhwb3MsMC4yNSk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgfSgpKTtcblxuICAvKiFcbiAgICogVGhlIEJlemllciBtYWdpYyBpbiB0aGlzIGZpbGUgaXMgYWRhcHRlZC9jb3BpZWQgYWxtb3N0IHdob2xlc2FsZSBmcm9tXG4gICAqIFtTY3JpcHR5Ml0oaHR0cHM6Ly9naXRodWIuY29tL21hZHJvYmJ5L3NjcmlwdHkyL2Jsb2IvbWFzdGVyL3NyYy9lZmZlY3RzL3RyYW5zaXRpb25zL2N1YmljLWJlemllci5qcyksXG4gICAqIHdoaWNoIHdhcyBhZGFwdGVkIGZyb20gQXBwbGUgY29kZSAod2hpY2ggcHJvYmFibHkgY2FtZSBmcm9tXG4gICAqIFtoZXJlXShodHRwOi8vb3BlbnNvdXJjZS5hcHBsZS5jb20vc291cmNlL1dlYkNvcmUvV2ViQ29yZS05NTUuNjYvcGxhdGZvcm0vZ3JhcGhpY3MvVW5pdEJlemllci5oKSkuXG4gICAqIFNwZWNpYWwgdGhhbmtzIHRvIEFwcGxlIGFuZCBUaG9tYXMgRnVjaHMgZm9yIG11Y2ggb2YgdGhpcyBjb2RlLlxuICAgKi9cblxuICAvKiFcbiAgICogIENvcHlyaWdodCAoYykgMjAwNiBBcHBsZSBDb21wdXRlciwgSW5jLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICAgKlxuICAgKiAgUmVkaXN0cmlidXRpb24gYW5kIHVzZSBpbiBzb3VyY2UgYW5kIGJpbmFyeSBmb3Jtcywgd2l0aCBvciB3aXRob3V0XG4gICAqICBtb2RpZmljYXRpb24sIGFyZSBwZXJtaXR0ZWQgcHJvdmlkZWQgdGhhdCB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnMgYXJlIG1ldDpcbiAgICpcbiAgICogIDEuIFJlZGlzdHJpYnV0aW9ucyBvZiBzb3VyY2UgY29kZSBtdXN0IHJldGFpbiB0aGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSxcbiAgICogIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIuXG4gICAqXG4gICAqICAyLiBSZWRpc3RyaWJ1dGlvbnMgaW4gYmluYXJ5IGZvcm0gbXVzdCByZXByb2R1Y2UgdGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UsXG4gICAqICB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyIGluIHRoZSBkb2N1bWVudGF0aW9uXG4gICAqICBhbmQvb3Igb3RoZXIgbWF0ZXJpYWxzIHByb3ZpZGVkIHdpdGggdGhlIGRpc3RyaWJ1dGlvbi5cbiAgICpcbiAgICogIDMuIE5laXRoZXIgdGhlIG5hbWUgb2YgdGhlIGNvcHlyaWdodCBob2xkZXIocykgbm9yIHRoZSBuYW1lcyBvZiBhbnlcbiAgICogIGNvbnRyaWJ1dG9ycyBtYXkgYmUgdXNlZCB0byBlbmRvcnNlIG9yIHByb21vdGUgcHJvZHVjdHMgZGVyaXZlZCBmcm9tXG4gICAqICB0aGlzIHNvZnR3YXJlIHdpdGhvdXQgc3BlY2lmaWMgcHJpb3Igd3JpdHRlbiBwZXJtaXNzaW9uLlxuICAgKlxuICAgKiAgVEhJUyBTT0ZUV0FSRSBJUyBQUk9WSURFRCBCWSBUSEUgQ09QWVJJR0hUIEhPTERFUlMgQU5EIENPTlRSSUJVVE9SU1xuICAgKiAgXCJBUyBJU1wiIEFORCBBTlkgRVhQUkVTUyBPUiBJTVBMSUVEIFdBUlJBTlRJRVMsIElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLFxuICAgKiAgVEhFIElNUExJRUQgV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFkgQU5EIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFXG4gICAqICBBUkUgRElTQ0xBSU1FRC4gSU4gTk8gRVZFTlQgU0hBTEwgVEhFIENPUFlSSUdIVCBPV05FUiBPUiBDT05UUklCVVRPUlMgQkUgTElBQkxFXG4gICAqICBGT1IgQU5ZIERJUkVDVCwgSU5ESVJFQ1QsIElOQ0lERU5UQUwsIFNQRUNJQUwsIEVYRU1QTEFSWSwgT1IgQ09OU0VRVUVOVElBTCBEQU1BR0VTXG4gICAqICAoSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFBST0NVUkVNRU5UIE9GIFNVQlNUSVRVVEUgR09PRFMgT1IgU0VSVklDRVM7XG4gICAqICBMT1NTIE9GIFVTRSwgREFUQSwgT1IgUFJPRklUUzsgT1IgQlVTSU5FU1MgSU5URVJSVVBUSU9OKSBIT1dFVkVSIENBVVNFRCBBTkQgT05cbiAgICogIEFOWSBUSEVPUlkgT0YgTElBQklMSVRZLCBXSEVUSEVSIElOIENPTlRSQUNULCBTVFJJQ1QgTElBQklMSVRZLCBPUiBUT1JUXG4gICAqICAoSU5DTFVESU5HIE5FR0xJR0VOQ0UgT1IgT1RIRVJXSVNFKSBBUklTSU5HIElOIEFOWSBXQVkgT1VUIE9GIFRIRSBVU0UgT0YgVEhJU1xuICAgKiAgU09GVFdBUkUsIEVWRU4gSUYgQURWSVNFRCBPRiBUSEUgUE9TU0lCSUxJVFkgT0YgU1VDSCBEQU1BR0UuXG4gICAqL1xuICA7KGZ1bmN0aW9uICgpIHtcbiAgICAvLyBwb3J0IG9mIHdlYmtpdCBjdWJpYyBiZXppZXIgaGFuZGxpbmcgYnkgaHR0cDovL3d3dy5uZXR6Z2VzdGEuZGUvZGV2L1xuICAgIGZ1bmN0aW9uIGN1YmljQmV6aWVyQXRUaW1lKHQscDF4LHAxeSxwMngscDJ5LGR1cmF0aW9uKSB7XG4gICAgICB2YXIgYXggPSAwLGJ4ID0gMCxjeCA9IDAsYXkgPSAwLGJ5ID0gMCxjeSA9IDA7XG4gICAgICBmdW5jdGlvbiBzYW1wbGVDdXJ2ZVgodCkge3JldHVybiAoKGF4ICogdCArIGJ4KSAqIHQgKyBjeCkgKiB0O31cbiAgICAgIGZ1bmN0aW9uIHNhbXBsZUN1cnZlWSh0KSB7cmV0dXJuICgoYXkgKiB0ICsgYnkpICogdCArIGN5KSAqIHQ7fVxuICAgICAgZnVuY3Rpb24gc2FtcGxlQ3VydmVEZXJpdmF0aXZlWCh0KSB7cmV0dXJuICgzLjAgKiBheCAqIHQgKyAyLjAgKiBieCkgKiB0ICsgY3g7fVxuICAgICAgZnVuY3Rpb24gc29sdmVFcHNpbG9uKGR1cmF0aW9uKSB7cmV0dXJuIDEuMCAvICgyMDAuMCAqIGR1cmF0aW9uKTt9XG4gICAgICBmdW5jdGlvbiBzb2x2ZSh4LGVwc2lsb24pIHtyZXR1cm4gc2FtcGxlQ3VydmVZKHNvbHZlQ3VydmVYKHgsZXBzaWxvbikpO31cbiAgICAgIGZ1bmN0aW9uIGZhYnMobikge2lmIChuID49IDApIHtyZXR1cm4gbjt9ZWxzZSB7cmV0dXJuIDAgLSBuO319XG4gICAgICBmdW5jdGlvbiBzb2x2ZUN1cnZlWCh4LGVwc2lsb24pIHtcbiAgICAgICAgdmFyIHQwLHQxLHQyLHgyLGQyLGk7XG4gICAgICAgIGZvciAodDIgPSB4LCBpID0gMDsgaSA8IDg7IGkrKykge3gyID0gc2FtcGxlQ3VydmVYKHQyKSAtIHg7IGlmIChmYWJzKHgyKSA8IGVwc2lsb24pIHtyZXR1cm4gdDI7fSBkMiA9IHNhbXBsZUN1cnZlRGVyaXZhdGl2ZVgodDIpOyBpZiAoZmFicyhkMikgPCAxZS02KSB7YnJlYWs7fSB0MiA9IHQyIC0geDIgLyBkMjt9XG4gICAgICAgIHQwID0gMC4wOyB0MSA9IDEuMDsgdDIgPSB4OyBpZiAodDIgPCB0MCkge3JldHVybiB0MDt9IGlmICh0MiA+IHQxKSB7cmV0dXJuIHQxO31cbiAgICAgICAgd2hpbGUgKHQwIDwgdDEpIHt4MiA9IHNhbXBsZUN1cnZlWCh0Mik7IGlmIChmYWJzKHgyIC0geCkgPCBlcHNpbG9uKSB7cmV0dXJuIHQyO30gaWYgKHggPiB4Mikge3QwID0gdDI7fWVsc2Uge3QxID0gdDI7fSB0MiA9ICh0MSAtIHQwKSAqIDAuNSArIHQwO31cbiAgICAgICAgcmV0dXJuIHQyOyAvLyBGYWlsdXJlLlxuICAgICAgfVxuICAgICAgY3ggPSAzLjAgKiBwMXg7IGJ4ID0gMy4wICogKHAyeCAtIHAxeCkgLSBjeDsgYXggPSAxLjAgLSBjeCAtIGJ4OyBjeSA9IDMuMCAqIHAxeTsgYnkgPSAzLjAgKiAocDJ5IC0gcDF5KSAtIGN5OyBheSA9IDEuMCAtIGN5IC0gYnk7XG4gICAgICByZXR1cm4gc29sdmUodCwgc29sdmVFcHNpbG9uKGR1cmF0aW9uKSk7XG4gICAgfVxuICAgIC8qIVxuICAgICAqICBnZXRDdWJpY0JlemllclRyYW5zaXRpb24oeDEsIHkxLCB4MiwgeTIpIC0+IEZ1bmN0aW9uXG4gICAgICpcbiAgICAgKiAgR2VuZXJhdGVzIGEgdHJhbnNpdGlvbiBlYXNpbmcgZnVuY3Rpb24gdGhhdCBpcyBjb21wYXRpYmxlXG4gICAgICogIHdpdGggV2ViS2l0J3MgQ1NTIHRyYW5zaXRpb25zIGAtd2Via2l0LXRyYW5zaXRpb24tdGltaW5nLWZ1bmN0aW9uYFxuICAgICAqICBDU1MgcHJvcGVydHkuXG4gICAgICpcbiAgICAgKiAgVGhlIFczQyBoYXMgbW9yZSBpbmZvcm1hdGlvbiBhYm91dFxuICAgICAqICA8YSBocmVmPVwiaHR0cDovL3d3dy53My5vcmcvVFIvY3NzMy10cmFuc2l0aW9ucy8jdHJhbnNpdGlvbi10aW1pbmctZnVuY3Rpb25fdGFnXCI+XG4gICAgICogIENTUzMgdHJhbnNpdGlvbiB0aW1pbmcgZnVuY3Rpb25zPC9hPi5cbiAgICAgKlxuICAgICAqICBAcGFyYW0ge251bWJlcn0geDFcbiAgICAgKiAgQHBhcmFtIHtudW1iZXJ9IHkxXG4gICAgICogIEBwYXJhbSB7bnVtYmVyfSB4MlxuICAgICAqICBAcGFyYW0ge251bWJlcn0geTJcbiAgICAgKiAgQHJldHVybiB7ZnVuY3Rpb259XG4gICAgICovXG4gICAgZnVuY3Rpb24gZ2V0Q3ViaWNCZXppZXJUcmFuc2l0aW9uICh4MSwgeTEsIHgyLCB5Mikge1xuICAgICAgcmV0dXJuIGZ1bmN0aW9uIChwb3MpIHtcbiAgICAgICAgcmV0dXJuIGN1YmljQmV6aWVyQXRUaW1lKHBvcyx4MSx5MSx4Mix5MiwxKTtcbiAgICAgIH07XG4gICAgfVxuICAgIC8vIEVuZCBwb3J0ZWQgY29kZVxuXG4gICAgLyoqXG4gICAgICogQ3JlYXRlcyBhIEJlemllciBlYXNpbmcgZnVuY3Rpb24gYW5kIGF0dGFjaGVzIGl0IHRvIGBUd2VlbmFibGUucHJvdG90eXBlLmZvcm11bGFgLiAgVGhpcyBmdW5jdGlvbiBnaXZlcyB5b3UgdG90YWwgY29udHJvbCBvdmVyIHRoZSBlYXNpbmcgY3VydmUuICBNYXR0aGV3IExlaW4ncyBbQ2Vhc2VyXShodHRwOi8vbWF0dGhld2xlaW4uY29tL2NlYXNlci8pIGlzIGEgdXNlZnVsIHRvb2wgZm9yIHZpc3VhbGl6aW5nIHRoZSBjdXJ2ZXMgeW91IGNhbiBtYWtlIHdpdGggdGhpcyBmdW5jdGlvbi5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lIFRoZSBuYW1lIG9mIHRoZSBlYXNpbmcgY3VydmUuICBPdmVyd3JpdGVzIHRoZSBvbGQgZWFzaW5nIGZ1bmN0aW9uIG9uIFR3ZWVuYWJsZS5wcm90b3R5cGUuZm9ybXVsYSBpZiBpdCBleGlzdHMuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHgxXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHkxXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHgyXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHkyXG4gICAgICogQHJldHVybiB7ZnVuY3Rpb259IFRoZSBlYXNpbmcgZnVuY3Rpb24gdGhhdCB3YXMgYXR0YWNoZWQgdG8gVHdlZW5hYmxlLnByb3RvdHlwZS5mb3JtdWxhLlxuICAgICAqL1xuICAgIFR3ZWVuYWJsZS5zZXRCZXppZXJGdW5jdGlvbiA9IGZ1bmN0aW9uIChuYW1lLCB4MSwgeTEsIHgyLCB5Mikge1xuICAgICAgdmFyIGN1YmljQmV6aWVyVHJhbnNpdGlvbiA9IGdldEN1YmljQmV6aWVyVHJhbnNpdGlvbih4MSwgeTEsIHgyLCB5Mik7XG4gICAgICBjdWJpY0JlemllclRyYW5zaXRpb24ueDEgPSB4MTtcbiAgICAgIGN1YmljQmV6aWVyVHJhbnNpdGlvbi55MSA9IHkxO1xuICAgICAgY3ViaWNCZXppZXJUcmFuc2l0aW9uLngyID0geDI7XG4gICAgICBjdWJpY0JlemllclRyYW5zaXRpb24ueTIgPSB5MjtcblxuICAgICAgcmV0dXJuIFR3ZWVuYWJsZS5wcm90b3R5cGUuZm9ybXVsYVtuYW1lXSA9IGN1YmljQmV6aWVyVHJhbnNpdGlvbjtcbiAgICB9O1xuXG5cbiAgICAvKipcbiAgICAgKiBgZGVsZXRlYHMgYW4gZWFzaW5nIGZ1bmN0aW9uIGZyb20gYFR3ZWVuYWJsZS5wcm90b3R5cGUuZm9ybXVsYWAuICBCZSBjYXJlZnVsIHdpdGggdGhpcyBtZXRob2QsIGFzIGl0IGBkZWxldGVgcyB3aGF0ZXZlciBlYXNpbmcgZm9ybXVsYSBtYXRjaGVzIGBuYW1lYCAod2hpY2ggbWVhbnMgeW91IGNhbiBkZWxldGUgZGVmYXVsdCBTaGlmdHkgZWFzaW5nIGZ1bmN0aW9ucykuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gbmFtZSBUaGUgbmFtZSBvZiB0aGUgZWFzaW5nIGZ1bmN0aW9uIHRvIGRlbGV0ZS5cbiAgICAgKiBAcmV0dXJuIHtmdW5jdGlvbn1cbiAgICAgKi9cbiAgICBUd2VlbmFibGUudW5zZXRCZXppZXJGdW5jdGlvbiA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICBkZWxldGUgVHdlZW5hYmxlLnByb3RvdHlwZS5mb3JtdWxhW25hbWVdO1xuICAgIH07XG5cbiAgfSkoKTtcblxuICA7KGZ1bmN0aW9uICgpIHtcblxuICAgIGZ1bmN0aW9uIGdldEludGVycG9sYXRlZFZhbHVlcyAoXG4gICAgICBmcm9tLCBjdXJyZW50LCB0YXJnZXRTdGF0ZSwgcG9zaXRpb24sIGVhc2luZykge1xuICAgICAgcmV0dXJuIFR3ZWVuYWJsZS50d2VlblByb3BzKFxuICAgICAgICBwb3NpdGlvbiwgY3VycmVudCwgZnJvbSwgdGFyZ2V0U3RhdGUsIDEsIDAsIGVhc2luZyk7XG4gICAgfVxuXG4gICAgLy8gRmFrZSBhIFR3ZWVuYWJsZSBhbmQgcGF0Y2ggc29tZSBpbnRlcm5hbHMuICBUaGlzIGFwcHJvYWNoIGFsbG93cyB1cyB0b1xuICAgIC8vIHNraXAgdW5lY2Nlc3NhcnkgcHJvY2Vzc2luZyBhbmQgb2JqZWN0IHJlY3JlYXRpb24sIGN1dHRpbmcgZG93biBvbiBnYXJiYWdlXG4gICAgLy8gY29sbGVjdGlvbiBwYXVzZXMuXG4gICAgdmFyIG1vY2tUd2VlbmFibGUgPSBuZXcgVHdlZW5hYmxlKCk7XG4gICAgbW9ja1R3ZWVuYWJsZS5fZmlsdGVyQXJncyA9IFtdO1xuXG4gICAgLyoqXG4gICAgICogQ29tcHV0ZSB0aGUgbWlkcG9pbnQgb2YgdHdvIE9iamVjdHMuICBUaGlzIG1ldGhvZCBlZmZlY3RpdmVseSBjYWxjdWxhdGVzIGEgc3BlY2lmaWMgZnJhbWUgb2YgYW5pbWF0aW9uIHRoYXQgW1R3ZWVuYWJsZSN0d2Vlbl0oc2hpZnR5LmNvcmUuanMuaHRtbCN0d2VlbikgZG9lcyBtYW55IHRpbWVzIG92ZXIgdGhlIGNvdXJzZSBvZiBhIHR3ZWVuLlxuICAgICAqXG4gICAgICogRXhhbXBsZTpcbiAgICAgKlxuICAgICAqICAgICB2YXIgaW50ZXJwb2xhdGVkVmFsdWVzID0gVHdlZW5hYmxlLmludGVycG9sYXRlKHtcbiAgICAgKiAgICAgICB3aWR0aDogJzEwMHB4JyxcbiAgICAgKiAgICAgICBvcGFjaXR5OiAwLFxuICAgICAqICAgICAgIGNvbG9yOiAnI2ZmZidcbiAgICAgKiAgICAgfSwge1xuICAgICAqICAgICAgIHdpZHRoOiAnMjAwcHgnLFxuICAgICAqICAgICAgIG9wYWNpdHk6IDEsXG4gICAgICogICAgICAgY29sb3I6ICcjMDAwJ1xuICAgICAqICAgICB9LCAwLjUpO1xuICAgICAqXG4gICAgICogICAgIGNvbnNvbGUubG9nKGludGVycG9sYXRlZFZhbHVlcyk7XG4gICAgICogICAgIC8vIHtvcGFjaXR5OiAwLjUsIHdpZHRoOiBcIjE1MHB4XCIsIGNvbG9yOiBcInJnYigxMjcsMTI3LDEyNylcIn1cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBmcm9tIFRoZSBzdGFydGluZyB2YWx1ZXMgdG8gdHdlZW4gZnJvbS5cbiAgICAgKiBAcGFyYW0ge09iamVjdH0gdGFyZ2V0U3RhdGUgVGhlIGVuZGluZyB2YWx1ZXMgdG8gdHdlZW4gdG8uXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHBvc2l0aW9uIFRoZSBub3JtYWxpemVkIHBvc2l0aW9uIHZhbHVlIChiZXR3ZWVuIDAuMCBhbmQgMS4wKSB0byBpbnRlcnBvbGF0ZSB0aGUgdmFsdWVzIGJldHdlZW4gYGZyb21gIGFuZCBgdG9gIGZvci4gIGBmcm9tYCByZXByZXNlbnRzIDAgYW5kIGB0b2AgcmVwcmVzZW50cyBgMWAuXG4gICAgICogQHBhcmFtIHtzdHJpbmd8T2JqZWN0fSBlYXNpbmcgVGhlIGVhc2luZyBjdXJ2ZShzKSB0byBjYWxjdWxhdGUgdGhlIG1pZHBvaW50IGFnYWluc3QuICBZb3UgY2FuIHJlZmVyZW5jZSBhbnkgZWFzaW5nIGZ1bmN0aW9uIGF0dGFjaGVkIHRvIGBUd2VlbmFibGUucHJvdG90eXBlLmZvcm11bGFgLiAgSWYgb21pdHRlZCwgdGhpcyBkZWZhdWx0cyB0byBcImxpbmVhclwiLlxuICAgICAqIEByZXR1cm4ge09iamVjdH1cbiAgICAgKi9cbiAgICBUd2VlbmFibGUuaW50ZXJwb2xhdGUgPSBmdW5jdGlvbiAoZnJvbSwgdGFyZ2V0U3RhdGUsIHBvc2l0aW9uLCBlYXNpbmcpIHtcbiAgICAgIHZhciBjdXJyZW50ID0gVHdlZW5hYmxlLnNoYWxsb3dDb3B5KHt9LCBmcm9tKTtcbiAgICAgIHZhciBlYXNpbmdPYmplY3QgPSBUd2VlbmFibGUuY29tcG9zZUVhc2luZ09iamVjdChcbiAgICAgICAgZnJvbSwgZWFzaW5nIHx8ICdsaW5lYXInKTtcblxuICAgICAgbW9ja1R3ZWVuYWJsZS5zZXQoe30pO1xuXG4gICAgICAvLyBBbGlhcyBhbmQgcmV1c2UgdGhlIF9maWx0ZXJBcmdzIGFycmF5IGluc3RlYWQgb2YgcmVjcmVhdGluZyBpdC5cbiAgICAgIHZhciBmaWx0ZXJBcmdzID0gbW9ja1R3ZWVuYWJsZS5fZmlsdGVyQXJncztcbiAgICAgIGZpbHRlckFyZ3MubGVuZ3RoID0gMDtcbiAgICAgIGZpbHRlckFyZ3NbMF0gPSBjdXJyZW50O1xuICAgICAgZmlsdGVyQXJnc1sxXSA9IGZyb207XG4gICAgICBmaWx0ZXJBcmdzWzJdID0gdGFyZ2V0U3RhdGU7XG4gICAgICBmaWx0ZXJBcmdzWzNdID0gZWFzaW5nT2JqZWN0O1xuXG4gICAgICAvLyBBbnkgZGVmaW5lZCB2YWx1ZSB0cmFuc2Zvcm1hdGlvbiBtdXN0IGJlIGFwcGxpZWRcbiAgICAgIFR3ZWVuYWJsZS5hcHBseUZpbHRlcihtb2NrVHdlZW5hYmxlLCAndHdlZW5DcmVhdGVkJyk7XG4gICAgICBUd2VlbmFibGUuYXBwbHlGaWx0ZXIobW9ja1R3ZWVuYWJsZSwgJ2JlZm9yZVR3ZWVuJyk7XG5cbiAgICAgIHZhciBpbnRlcnBvbGF0ZWRWYWx1ZXMgPSBnZXRJbnRlcnBvbGF0ZWRWYWx1ZXMoXG4gICAgICAgIGZyb20sIGN1cnJlbnQsIHRhcmdldFN0YXRlLCBwb3NpdGlvbiwgZWFzaW5nT2JqZWN0KTtcblxuICAgICAgLy8gVHJhbnNmb3JtIHZhbHVlcyBiYWNrIGludG8gdGhlaXIgb3JpZ2luYWwgZm9ybWF0XG4gICAgICBUd2VlbmFibGUuYXBwbHlGaWx0ZXIobW9ja1R3ZWVuYWJsZSwgJ2FmdGVyVHdlZW4nKTtcblxuICAgICAgcmV0dXJuIGludGVycG9sYXRlZFZhbHVlcztcbiAgICB9O1xuXG4gIH0oKSk7XG5cbiAgLyoqXG4gICAqIEFkZHMgc3RyaW5nIGludGVycG9sYXRpb24gc3VwcG9ydCB0byBTaGlmdHkuXG4gICAqXG4gICAqIFRoZSBUb2tlbiBleHRlbnNpb24gYWxsb3dzIFNoaWZ0eSB0byB0d2VlbiBudW1iZXJzIGluc2lkZSBvZiBzdHJpbmdzLiAgQW1vbmdcbiAgICogb3RoZXIgdGhpbmdzLCB0aGlzIGFsbG93cyB5b3UgdG8gYW5pbWF0ZSBDU1MgcHJvcGVydGllcy4gIEZvciBleGFtcGxlLCB5b3VcbiAgICogY2FuIGRvIHRoaXM6XG4gICAqXG4gICAqICAgICB2YXIgdHdlZW5hYmxlID0gbmV3IFR3ZWVuYWJsZSgpO1xuICAgKiAgICAgdHdlZW5hYmxlLnR3ZWVuKHtcbiAgICogICAgICAgZnJvbTogeyB0cmFuc2Zvcm06ICd0cmFuc2xhdGVYKDQ1cHgpJ30sXG4gICAqICAgICAgIHRvOiB7IHRyYW5zZm9ybTogJ3RyYW5zbGF0ZVgoOTB4cCknfVxuICAgKiAgICAgfSk7XG4gICAqXG4gICAqIGAgYFxuICAgKiBgdHJhbnNsYXRlWCg0NSlgIHdpbGwgYmUgdHdlZW5lZCB0byBgdHJhbnNsYXRlWCg5MClgLiAgVG8gZGVtb25zdHJhdGU6XG4gICAqXG4gICAqICAgICB2YXIgdHdlZW5hYmxlID0gbmV3IFR3ZWVuYWJsZSgpO1xuICAgKiAgICAgdHdlZW5hYmxlLnR3ZWVuKHtcbiAgICogICAgICAgZnJvbTogeyB0cmFuc2Zvcm06ICd0cmFuc2xhdGVYKDQ1cHgpJ30sXG4gICAqICAgICAgIHRvOiB7IHRyYW5zZm9ybTogJ3RyYW5zbGF0ZVgoOTBweCknfSxcbiAgICogICAgICAgc3RlcDogZnVuY3Rpb24gKHN0YXRlKSB7XG4gICAqICAgICAgICAgY29uc29sZS5sb2coc3RhdGUudHJhbnNmb3JtKTtcbiAgICogICAgICAgfVxuICAgKiAgICAgfSk7XG4gICAqXG4gICAqIGAgYFxuICAgKiBUaGUgYWJvdmUgc25pcHBldCB3aWxsIGxvZyBzb21ldGhpbmcgbGlrZSB0aGlzIGluIHRoZSBjb25zb2xlOlxuICAgKlxuICAgKiAgICAgdHJhbnNsYXRlWCg2MC4zcHgpXG4gICAqICAgICAuLi5cbiAgICogICAgIHRyYW5zbGF0ZVgoNzYuMDVweClcbiAgICogICAgIC4uLlxuICAgKiAgICAgdHJhbnNsYXRlWCg5MHB4KVxuICAgKlxuICAgKiBgIGBcbiAgICogQW5vdGhlciB1c2UgZm9yIHRoaXMgaXMgYW5pbWF0aW5nIGNvbG9yczpcbiAgICpcbiAgICogICAgIHZhciB0d2VlbmFibGUgPSBuZXcgVHdlZW5hYmxlKCk7XG4gICAqICAgICB0d2VlbmFibGUudHdlZW4oe1xuICAgKiAgICAgICBmcm9tOiB7IGNvbG9yOiAncmdiKDAsMjU1LDApJ30sXG4gICAqICAgICAgIHRvOiB7IGNvbG9yOiAncmdiKDI1NSwwLDI1NSknfSxcbiAgICogICAgICAgc3RlcDogZnVuY3Rpb24gKHN0YXRlKSB7XG4gICAqICAgICAgICAgY29uc29sZS5sb2coc3RhdGUuY29sb3IpO1xuICAgKiAgICAgICB9XG4gICAqICAgICB9KTtcbiAgICpcbiAgICogYCBgXG4gICAqIFRoZSBhYm92ZSBzbmlwcGV0IHdpbGwgbG9nIHNvbWV0aGluZyBsaWtlIHRoaXM6XG4gICAqXG4gICAqICAgICByZ2IoODQsMTcwLDg0KVxuICAgKiAgICAgLi4uXG4gICAqICAgICByZ2IoMTcwLDg0LDE3MClcbiAgICogICAgIC4uLlxuICAgKiAgICAgcmdiKDI1NSwwLDI1NSlcbiAgICpcbiAgICogYCBgXG4gICAqIFRoaXMgZXh0ZW5zaW9uIGFsc28gc3VwcG9ydHMgaGV4YWRlY2ltYWwgY29sb3JzLCBpbiBib3RoIGxvbmcgKGAjZmYwMGZmYClcbiAgICogYW5kIHNob3J0IChgI2YwZmApIGZvcm1zLiAgQmUgYXdhcmUgdGhhdCBoZXhhZGVjaW1hbCBpbnB1dCB2YWx1ZXMgd2lsbCBiZVxuICAgKiBjb252ZXJ0ZWQgaW50byB0aGUgZXF1aXZhbGVudCBSR0Igb3V0cHV0IHZhbHVlcy4gIFRoaXMgaXMgZG9uZSB0byBvcHRpbWl6ZVxuICAgKiBmb3IgcGVyZm9ybWFuY2UuXG4gICAqXG4gICAqICAgICB2YXIgdHdlZW5hYmxlID0gbmV3IFR3ZWVuYWJsZSgpO1xuICAgKiAgICAgdHdlZW5hYmxlLnR3ZWVuKHtcbiAgICogICAgICAgZnJvbTogeyBjb2xvcjogJyMwZjAnfSxcbiAgICogICAgICAgdG86IHsgY29sb3I6ICcjZjBmJ30sXG4gICAqICAgICAgIHN0ZXA6IGZ1bmN0aW9uIChzdGF0ZSkge1xuICAgKiAgICAgICAgIGNvbnNvbGUubG9nKHN0YXRlLmNvbG9yKTtcbiAgICogICAgICAgfVxuICAgKiAgICAgfSk7XG4gICAqXG4gICAqIGAgYFxuICAgKiBUaGlzIHNuaXBwZXQgd2lsbCBnZW5lcmF0ZSB0aGUgc2FtZSBvdXRwdXQgYXMgdGhlIG9uZSBiZWZvcmUgaXQgYmVjYXVzZVxuICAgKiBlcXVpdmFsZW50IHZhbHVlcyB3ZXJlIHN1cHBsaWVkIChqdXN0IGluIGhleGFkZWNpbWFsIGZvcm0gcmF0aGVyIHRoYW4gUkdCKTpcbiAgICpcbiAgICogICAgIHJnYig4NCwxNzAsODQpXG4gICAqICAgICAuLi5cbiAgICogICAgIHJnYigxNzAsODQsMTcwKVxuICAgKiAgICAgLi4uXG4gICAqICAgICByZ2IoMjU1LDAsMjU1KVxuICAgKlxuICAgKiBgIGBcbiAgICogYCBgXG4gICAqICMjIEVhc2luZyBzdXBwb3J0XG4gICAqXG4gICAqIEVhc2luZyB3b3JrcyBzb21ld2hhdCBkaWZmZXJlbnRseSBpbiB0aGUgVG9rZW4gZXh0ZW5zaW9uLiAgVGhpcyBpcyBiZWNhdXNlXG4gICAqIHNvbWUgQ1NTIHByb3BlcnRpZXMgaGF2ZSBtdWx0aXBsZSB2YWx1ZXMgaW4gdGhlbSwgYW5kIHlvdSBtaWdodCBuZWVkIHRvXG4gICAqIHR3ZWVuIGVhY2ggdmFsdWUgYWxvbmcgaXRzIG93biBlYXNpbmcgY3VydmUuICBBIGJhc2ljIGV4YW1wbGU6XG4gICAqXG4gICAqICAgICB2YXIgdHdlZW5hYmxlID0gbmV3IFR3ZWVuYWJsZSgpO1xuICAgKiAgICAgdHdlZW5hYmxlLnR3ZWVuKHtcbiAgICogICAgICAgZnJvbTogeyB0cmFuc2Zvcm06ICd0cmFuc2xhdGVYKDBweCkgdHJhbnNsYXRlWSgwcHgpJ30sXG4gICAqICAgICAgIHRvOiB7IHRyYW5zZm9ybTogICAndHJhbnNsYXRlWCgxMDBweCkgdHJhbnNsYXRlWSgxMDBweCknfSxcbiAgICogICAgICAgZWFzaW5nOiB7IHRyYW5zZm9ybTogJ2Vhc2VJblF1YWQnIH0sXG4gICAqICAgICAgIHN0ZXA6IGZ1bmN0aW9uIChzdGF0ZSkge1xuICAgKiAgICAgICAgIGNvbnNvbGUubG9nKHN0YXRlLnRyYW5zZm9ybSk7XG4gICAqICAgICAgIH1cbiAgICogICAgIH0pO1xuICAgKlxuICAgKiBgIGBcbiAgICogVGhlIGFib3ZlIHNuaXBwZXQgY3JlYXRlIHZhbHVlcyBsaWtlIHRoaXM6XG4gICAqXG4gICAqICAgICB0cmFuc2xhdGVYKDExLjU2MDAwMDAwMDAwMDAwMnB4KSB0cmFuc2xhdGVZKDExLjU2MDAwMDAwMDAwMDAwMnB4KVxuICAgKiAgICAgLi4uXG4gICAqICAgICB0cmFuc2xhdGVYKDQ2LjI0MDAwMDAwMDAwMDAxcHgpIHRyYW5zbGF0ZVkoNDYuMjQwMDAwMDAwMDAwMDFweClcbiAgICogICAgIC4uLlxuICAgKiAgICAgdHJhbnNsYXRlWCgxMDBweCkgdHJhbnNsYXRlWSgxMDBweClcbiAgICpcbiAgICogYCBgXG4gICAqIEluIHRoaXMgY2FzZSwgdGhlIHZhbHVlcyBmb3IgYHRyYW5zbGF0ZVhgIGFuZCBgdHJhbnNsYXRlWWAgYXJlIGFsd2F5cyB0aGVcbiAgICogc2FtZSBmb3IgZWFjaCBzdGVwIG9mIHRoZSB0d2VlbiwgYmVjYXVzZSB0aGV5IGhhdmUgdGhlIHNhbWUgc3RhcnQgYW5kIGVuZFxuICAgKiBwb2ludHMgYW5kIGJvdGggdXNlIHRoZSBzYW1lIGVhc2luZyBjdXJ2ZS4gIFdlIGNhbiBhbHNvIHR3ZWVuIGB0cmFuc2xhdGVYYFxuICAgKiBhbmQgYHRyYW5zbGF0ZVlgIGFsb25nIGluZGVwZW5kZW50IGN1cnZlczpcbiAgICpcbiAgICogICAgIHZhciB0d2VlbmFibGUgPSBuZXcgVHdlZW5hYmxlKCk7XG4gICAqICAgICB0d2VlbmFibGUudHdlZW4oe1xuICAgKiAgICAgICBmcm9tOiB7IHRyYW5zZm9ybTogJ3RyYW5zbGF0ZVgoMHB4KSB0cmFuc2xhdGVZKDBweCknfSxcbiAgICogICAgICAgdG86IHsgdHJhbnNmb3JtOiAgICd0cmFuc2xhdGVYKDEwMHB4KSB0cmFuc2xhdGVZKDEwMHB4KSd9LFxuICAgKiAgICAgICBlYXNpbmc6IHsgdHJhbnNmb3JtOiAnZWFzZUluUXVhZCBib3VuY2UnIH0sXG4gICAqICAgICAgIHN0ZXA6IGZ1bmN0aW9uIChzdGF0ZSkge1xuICAgKiAgICAgICAgIGNvbnNvbGUubG9nKHN0YXRlLnRyYW5zZm9ybSk7XG4gICAqICAgICAgIH1cbiAgICogICAgIH0pO1xuICAgKlxuICAgKiBgIGBcbiAgICogVGhlIGFib3ZlIHNuaXBwZXQgY3JlYXRlIHZhbHVlcyBsaWtlIHRoaXM6XG4gICAqXG4gICAqICAgICB0cmFuc2xhdGVYKDEwLjg5cHgpIHRyYW5zbGF0ZVkoODIuMzU1NjI1cHgpXG4gICAqICAgICAuLi5cbiAgICogICAgIHRyYW5zbGF0ZVgoNDQuODkwMDAwMDAwMDAwMDFweCkgdHJhbnNsYXRlWSg4Ni43MzA2MjUwMDAwMDAwMnB4KVxuICAgKiAgICAgLi4uXG4gICAqICAgICB0cmFuc2xhdGVYKDEwMHB4KSB0cmFuc2xhdGVZKDEwMHB4KVxuICAgKlxuICAgKiBgIGBcbiAgICogYHRyYW5zbGF0ZVhgIGFuZCBgdHJhbnNsYXRlWWAgYXJlIG5vdCBpbiBzeW5jIGFueW1vcmUsIGJlY2F1c2UgYGVhc2VJblF1YWRgXG4gICAqIHdhcyBzcGVjaWZpZWQgZm9yIGB0cmFuc2xhdGVYYCBhbmQgYGJvdW5jZWAgZm9yIGB0cmFuc2xhdGVZYC4gIE1peGluZyBhbmRcbiAgICogbWF0Y2hpbmcgZWFzaW5nIGN1cnZlcyBjYW4gbWFrZSBmb3Igc29tZSBpbnRlcmVzdGluZyBtb3Rpb24gaW4geW91clxuICAgKiBhbmltYXRpb25zLlxuICAgKlxuICAgKiBUaGUgb3JkZXIgb2YgdGhlIHNwYWNlLXNlcGFyYXRlZCBlYXNpbmcgY3VydmVzIGNvcnJlc3BvbmQgdGhlIHRva2VuIHZhbHVlc1xuICAgKiB0aGV5IGFwcGx5IHRvLiAgSWYgdGhlcmUgYXJlIG1vcmUgdG9rZW4gdmFsdWVzIHRoYW4gZWFzaW5nIGN1cnZlcyBsaXN0ZWQsXG4gICAqIHRoZSBsYXN0IGVhc2luZyBjdXJ2ZSBsaXN0ZWQgaXMgdXNlZC5cbiAgICovXG4gIGZ1bmN0aW9uIHRva2VuICgpIHtcbiAgICAvLyBGdW5jdGlvbmFsaXR5IGZvciB0aGlzIGV4dGVuc2lvbiBydW5zIGltcGxpY2l0bHkgaWYgaXQgaXMgbG9hZGVkLlxuICB9IC8qISovXG5cbiAgLy8gdG9rZW4gZnVuY3Rpb24gaXMgZGVmaW5lZCBhYm92ZSBvbmx5IHNvIHRoYXQgZG94LWZvdW5kYXRpb24gc2VlcyBpdCBhc1xuICAvLyBkb2N1bWVudGF0aW9uIGFuZCByZW5kZXJzIGl0LiAgSXQgaXMgbmV2ZXIgdXNlZCwgYW5kIGlzIG9wdGltaXplZCBhd2F5IGF0XG4gIC8vIGJ1aWxkIHRpbWUuXG5cbiAgOyhmdW5jdGlvbiAoVHdlZW5hYmxlKSB7XG5cbiAgICAvKiFcbiAgICAgKiBAdHlwZWRlZiB7e1xuICAgICAqICAgZm9ybWF0U3RyaW5nOiBzdHJpbmdcbiAgICAgKiAgIGNodW5rTmFtZXM6IEFycmF5LjxzdHJpbmc+XG4gICAgICogfX1cbiAgICAgKi9cbiAgICB2YXIgZm9ybWF0TWFuaWZlc3Q7XG5cbiAgICAvLyBDT05TVEFOVFNcblxuICAgIHZhciBSX05VTUJFUl9DT01QT05FTlQgPSAvKFxcZHxcXC18XFwuKS87XG4gICAgdmFyIFJfRk9STUFUX0NIVU5LUyA9IC8oW15cXC0wLTlcXC5dKykvZztcbiAgICB2YXIgUl9VTkZPUk1BVFRFRF9WQUxVRVMgPSAvWzAtOS5cXC1dKy9nO1xuICAgIHZhciBSX1JHQiA9IG5ldyBSZWdFeHAoXG4gICAgICAncmdiXFxcXCgnICsgUl9VTkZPUk1BVFRFRF9WQUxVRVMuc291cmNlICtcbiAgICAgICgvLFxccyovLnNvdXJjZSkgKyBSX1VORk9STUFUVEVEX1ZBTFVFUy5zb3VyY2UgK1xuICAgICAgKC8sXFxzKi8uc291cmNlKSArIFJfVU5GT1JNQVRURURfVkFMVUVTLnNvdXJjZSArICdcXFxcKScsICdnJyk7XG4gICAgdmFyIFJfUkdCX1BSRUZJWCA9IC9eLipcXCgvO1xuICAgIHZhciBSX0hFWCA9IC8jKFswLTldfFthLWZdKXszLDZ9L2dpO1xuICAgIHZhciBWQUxVRV9QTEFDRUhPTERFUiA9ICdWQUwnO1xuXG4gICAgLy8gSEVMUEVSU1xuXG4gICAgdmFyIGdldEZvcm1hdENodW5rc0Zyb21fYWNjdW11bGF0b3IgPSBbXTtcbiAgICAvKiFcbiAgICAgKiBAcGFyYW0ge0FycmF5Lm51bWJlcn0gcmF3VmFsdWVzXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IHByZWZpeFxuICAgICAqXG4gICAgICogQHJldHVybiB7QXJyYXkuPHN0cmluZz59XG4gICAgICovXG4gICAgZnVuY3Rpb24gZ2V0Rm9ybWF0Q2h1bmtzRnJvbSAocmF3VmFsdWVzLCBwcmVmaXgpIHtcbiAgICAgIGdldEZvcm1hdENodW5rc0Zyb21fYWNjdW11bGF0b3IubGVuZ3RoID0gMDtcblxuICAgICAgdmFyIHJhd1ZhbHVlc0xlbmd0aCA9IHJhd1ZhbHVlcy5sZW5ndGg7XG4gICAgICB2YXIgaTtcblxuICAgICAgZm9yIChpID0gMDsgaSA8IHJhd1ZhbHVlc0xlbmd0aDsgaSsrKSB7XG4gICAgICAgIGdldEZvcm1hdENodW5rc0Zyb21fYWNjdW11bGF0b3IucHVzaCgnXycgKyBwcmVmaXggKyAnXycgKyBpKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIGdldEZvcm1hdENodW5rc0Zyb21fYWNjdW11bGF0b3I7XG4gICAgfVxuXG4gICAgLyohXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IGZvcm1hdHRlZFN0cmluZ1xuICAgICAqXG4gICAgICogQHJldHVybiB7c3RyaW5nfVxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGdldEZvcm1hdFN0cmluZ0Zyb20gKGZvcm1hdHRlZFN0cmluZykge1xuICAgICAgdmFyIGNodW5rcyA9IGZvcm1hdHRlZFN0cmluZy5tYXRjaChSX0ZPUk1BVF9DSFVOS1MpO1xuXG4gICAgICBpZiAoIWNodW5rcykge1xuICAgICAgICAvLyBjaHVua3Mgd2lsbCBiZSBudWxsIGlmIHRoZXJlIHdlcmUgbm8gdG9rZW5zIHRvIHBhcnNlIGluXG4gICAgICAgIC8vIGZvcm1hdHRlZFN0cmluZyAoZm9yIGV4YW1wbGUsIGlmIGZvcm1hdHRlZFN0cmluZyBpcyAnMicpLiAgQ29lcmNlXG4gICAgICAgIC8vIGNodW5rcyB0byBiZSB1c2VmdWwgaGVyZS5cbiAgICAgICAgY2h1bmtzID0gWycnLCAnJ107XG5cbiAgICAgICAgLy8gSWYgdGhlcmUgaXMgb25seSBvbmUgY2h1bmssIGFzc3VtZSB0aGF0IHRoZSBzdHJpbmcgaXMgYSBudW1iZXJcbiAgICAgICAgLy8gZm9sbG93ZWQgYnkgYSB0b2tlbi4uLlxuICAgICAgICAvLyBOT1RFOiBUaGlzIG1heSBiZSBhbiB1bndpc2UgYXNzdW1wdGlvbi5cbiAgICAgIH0gZWxzZSBpZiAoY2h1bmtzLmxlbmd0aCA9PT0gMSB8fFxuICAgICAgICAgIC8vIC4uLm9yIGlmIHRoZSBzdHJpbmcgc3RhcnRzIHdpdGggYSBudW1iZXIgY29tcG9uZW50IChcIi5cIiwgXCItXCIsIG9yIGFcbiAgICAgICAgICAvLyBkaWdpdCkuLi5cbiAgICAgICAgICBmb3JtYXR0ZWRTdHJpbmdbMF0ubWF0Y2goUl9OVU1CRVJfQ09NUE9ORU5UKSkge1xuICAgICAgICAvLyAuLi5wcmVwZW5kIGFuIGVtcHR5IHN0cmluZyBoZXJlIHRvIG1ha2Ugc3VyZSB0aGF0IHRoZSBmb3JtYXR0ZWQgbnVtYmVyXG4gICAgICAgIC8vIGlzIHByb3Blcmx5IHJlcGxhY2VkIGJ5IFZBTFVFX1BMQUNFSE9MREVSXG4gICAgICAgIGNodW5rcy51bnNoaWZ0KCcnKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIGNodW5rcy5qb2luKFZBTFVFX1BMQUNFSE9MREVSKTtcbiAgICB9XG5cbiAgICAvKiFcbiAgICAgKiBDb252ZXJ0IGFsbCBoZXggY29sb3IgdmFsdWVzIHdpdGhpbiBhIHN0cmluZyB0byBhbiByZ2Igc3RyaW5nLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtPYmplY3R9IHN0YXRlT2JqZWN0XG4gICAgICpcbiAgICAgKiBAcmV0dXJuIHtPYmplY3R9IFRoZSBtb2RpZmllZCBvYmpcbiAgICAgKi9cbiAgICBmdW5jdGlvbiBzYW5pdGl6ZU9iamVjdEZvckhleFByb3BzIChzdGF0ZU9iamVjdCkge1xuICAgICAgVHdlZW5hYmxlLmVhY2goc3RhdGVPYmplY3QsIGZ1bmN0aW9uIChwcm9wKSB7XG4gICAgICAgIHZhciBjdXJyZW50UHJvcCA9IHN0YXRlT2JqZWN0W3Byb3BdO1xuXG4gICAgICAgIGlmICh0eXBlb2YgY3VycmVudFByb3AgPT09ICdzdHJpbmcnICYmIGN1cnJlbnRQcm9wLm1hdGNoKFJfSEVYKSkge1xuICAgICAgICAgIHN0YXRlT2JqZWN0W3Byb3BdID0gc2FuaXRpemVIZXhDaHVua3NUb1JHQihjdXJyZW50UHJvcCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8qIVxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBzdHJcbiAgICAgKlxuICAgICAqIEByZXR1cm4ge3N0cmluZ31cbiAgICAgKi9cbiAgICBmdW5jdGlvbiAgc2FuaXRpemVIZXhDaHVua3NUb1JHQiAoc3RyKSB7XG4gICAgICByZXR1cm4gZmlsdGVyU3RyaW5nQ2h1bmtzKFJfSEVYLCBzdHIsIGNvbnZlcnRIZXhUb1JHQik7XG4gICAgfVxuXG4gICAgLyohXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IGhleFN0cmluZ1xuICAgICAqXG4gICAgICogQHJldHVybiB7c3RyaW5nfVxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGNvbnZlcnRIZXhUb1JHQiAoaGV4U3RyaW5nKSB7XG4gICAgICB2YXIgcmdiQXJyID0gaGV4VG9SR0JBcnJheShoZXhTdHJpbmcpO1xuICAgICAgcmV0dXJuICdyZ2IoJyArIHJnYkFyclswXSArICcsJyArIHJnYkFyclsxXSArICcsJyArIHJnYkFyclsyXSArICcpJztcbiAgICB9XG5cbiAgICB2YXIgaGV4VG9SR0JBcnJheV9yZXR1cm5BcnJheSA9IFtdO1xuICAgIC8qIVxuICAgICAqIENvbnZlcnQgYSBoZXhhZGVjaW1hbCBzdHJpbmcgdG8gYW4gYXJyYXkgd2l0aCB0aHJlZSBpdGVtcywgb25lIGVhY2ggZm9yXG4gICAgICogdGhlIHJlZCwgYmx1ZSwgYW5kIGdyZWVuIGRlY2ltYWwgdmFsdWVzLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IGhleCBBIGhleGFkZWNpbWFsIHN0cmluZy5cbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtBcnJheS48bnVtYmVyPn0gVGhlIGNvbnZlcnRlZCBBcnJheSBvZiBSR0IgdmFsdWVzIGlmIGBoZXhgIGlzIGFcbiAgICAgKiB2YWxpZCBzdHJpbmcsIG9yIGFuIEFycmF5IG9mIHRocmVlIDAncy5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBoZXhUb1JHQkFycmF5IChoZXgpIHtcblxuICAgICAgaGV4ID0gaGV4LnJlcGxhY2UoLyMvLCAnJyk7XG5cbiAgICAgIC8vIElmIHRoZSBzdHJpbmcgaXMgYSBzaG9ydGhhbmQgdGhyZWUgZGlnaXQgaGV4IG5vdGF0aW9uLCBub3JtYWxpemUgaXQgdG9cbiAgICAgIC8vIHRoZSBzdGFuZGFyZCBzaXggZGlnaXQgbm90YXRpb25cbiAgICAgIGlmIChoZXgubGVuZ3RoID09PSAzKSB7XG4gICAgICAgIGhleCA9IGhleC5zcGxpdCgnJyk7XG4gICAgICAgIGhleCA9IGhleFswXSArIGhleFswXSArIGhleFsxXSArIGhleFsxXSArIGhleFsyXSArIGhleFsyXTtcbiAgICAgIH1cblxuICAgICAgaGV4VG9SR0JBcnJheV9yZXR1cm5BcnJheVswXSA9IGhleFRvRGVjKGhleC5zdWJzdHIoMCwgMikpO1xuICAgICAgaGV4VG9SR0JBcnJheV9yZXR1cm5BcnJheVsxXSA9IGhleFRvRGVjKGhleC5zdWJzdHIoMiwgMikpO1xuICAgICAgaGV4VG9SR0JBcnJheV9yZXR1cm5BcnJheVsyXSA9IGhleFRvRGVjKGhleC5zdWJzdHIoNCwgMikpO1xuXG4gICAgICByZXR1cm4gaGV4VG9SR0JBcnJheV9yZXR1cm5BcnJheTtcbiAgICB9XG5cbiAgICAvKiFcbiAgICAgKiBDb252ZXJ0IGEgYmFzZS0xNiBudW1iZXIgdG8gYmFzZS0xMC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfFN0cmluZ30gaGV4IFRoZSB2YWx1ZSB0byBjb252ZXJ0XG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7TnVtYmVyfSBUaGUgYmFzZS0xMCBlcXVpdmFsZW50IG9mIGBoZXhgLlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGhleFRvRGVjIChoZXgpIHtcbiAgICAgIHJldHVybiBwYXJzZUludChoZXgsIDE2KTtcbiAgICB9XG5cbiAgICAvKiFcbiAgICAgKiBSdW5zIGEgZmlsdGVyIG9wZXJhdGlvbiBvbiBhbGwgY2h1bmtzIG9mIGEgc3RyaW5nIHRoYXQgbWF0Y2ggYSBSZWdFeHBcbiAgICAgKlxuICAgICAqIEBwYXJhbSB7UmVnRXhwfSBwYXR0ZXJuXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IHVuZmlsdGVyZWRTdHJpbmdcbiAgICAgKiBAcGFyYW0ge2Z1bmN0aW9uKHN0cmluZyl9IGZpbHRlclxuICAgICAqXG4gICAgICogQHJldHVybiB7c3RyaW5nfVxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGZpbHRlclN0cmluZ0NodW5rcyAocGF0dGVybiwgdW5maWx0ZXJlZFN0cmluZywgZmlsdGVyKSB7XG4gICAgICB2YXIgcGF0dGVuTWF0Y2hlcyA9IHVuZmlsdGVyZWRTdHJpbmcubWF0Y2gocGF0dGVybik7XG4gICAgICB2YXIgZmlsdGVyZWRTdHJpbmcgPSB1bmZpbHRlcmVkU3RyaW5nLnJlcGxhY2UocGF0dGVybiwgVkFMVUVfUExBQ0VIT0xERVIpO1xuXG4gICAgICBpZiAocGF0dGVuTWF0Y2hlcykge1xuICAgICAgICB2YXIgcGF0dGVuTWF0Y2hlc0xlbmd0aCA9IHBhdHRlbk1hdGNoZXMubGVuZ3RoO1xuICAgICAgICB2YXIgY3VycmVudENodW5rO1xuXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcGF0dGVuTWF0Y2hlc0xlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgY3VycmVudENodW5rID0gcGF0dGVuTWF0Y2hlcy5zaGlmdCgpO1xuICAgICAgICAgIGZpbHRlcmVkU3RyaW5nID0gZmlsdGVyZWRTdHJpbmcucmVwbGFjZShcbiAgICAgICAgICAgIFZBTFVFX1BMQUNFSE9MREVSLCBmaWx0ZXIoY3VycmVudENodW5rKSk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgcmV0dXJuIGZpbHRlcmVkU3RyaW5nO1xuICAgIH1cblxuICAgIC8qIVxuICAgICAqIENoZWNrIGZvciBmbG9hdGluZyBwb2ludCB2YWx1ZXMgd2l0aGluIHJnYiBzdHJpbmdzIGFuZCByb3VuZHMgdGhlbS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBmb3JtYXR0ZWRTdHJpbmdcbiAgICAgKlxuICAgICAqIEByZXR1cm4ge3N0cmluZ31cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBzYW5pdGl6ZVJHQkNodW5rcyAoZm9ybWF0dGVkU3RyaW5nKSB7XG4gICAgICByZXR1cm4gZmlsdGVyU3RyaW5nQ2h1bmtzKFJfUkdCLCBmb3JtYXR0ZWRTdHJpbmcsIHNhbml0aXplUkdCQ2h1bmspO1xuICAgIH1cblxuICAgIC8qIVxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSByZ2JDaHVua1xuICAgICAqXG4gICAgICogQHJldHVybiB7c3RyaW5nfVxuICAgICAqL1xuICAgIGZ1bmN0aW9uIHNhbml0aXplUkdCQ2h1bmsgKHJnYkNodW5rKSB7XG4gICAgICB2YXIgbnVtYmVycyA9IHJnYkNodW5rLm1hdGNoKFJfVU5GT1JNQVRURURfVkFMVUVTKTtcbiAgICAgIHZhciBudW1iZXJzTGVuZ3RoID0gbnVtYmVycy5sZW5ndGg7XG4gICAgICB2YXIgc2FuaXRpemVkU3RyaW5nID0gcmdiQ2h1bmsubWF0Y2goUl9SR0JfUFJFRklYKVswXTtcblxuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBudW1iZXJzTGVuZ3RoOyBpKyspIHtcbiAgICAgICAgc2FuaXRpemVkU3RyaW5nICs9IHBhcnNlSW50KG51bWJlcnNbaV0sIDEwKSArICcsJztcbiAgICAgIH1cblxuICAgICAgc2FuaXRpemVkU3RyaW5nID0gc2FuaXRpemVkU3RyaW5nLnNsaWNlKDAsIC0xKSArICcpJztcblxuICAgICAgcmV0dXJuIHNhbml0aXplZFN0cmluZztcbiAgICB9XG5cbiAgICAvKiFcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gc3RhdGVPYmplY3RcbiAgICAgKlxuICAgICAqIEByZXR1cm4ge09iamVjdH0gQW4gT2JqZWN0IG9mIGZvcm1hdE1hbmlmZXN0cyB0aGF0IGNvcnJlc3BvbmQgdG9cbiAgICAgKiB0aGUgc3RyaW5nIHByb3BlcnRpZXMgb2Ygc3RhdGVPYmplY3RcbiAgICAgKi9cbiAgICBmdW5jdGlvbiBnZXRGb3JtYXRNYW5pZmVzdHMgKHN0YXRlT2JqZWN0KSB7XG4gICAgICB2YXIgbWFuaWZlc3RBY2N1bXVsYXRvciA9IHt9O1xuXG4gICAgICBUd2VlbmFibGUuZWFjaChzdGF0ZU9iamVjdCwgZnVuY3Rpb24gKHByb3ApIHtcbiAgICAgICAgdmFyIGN1cnJlbnRQcm9wID0gc3RhdGVPYmplY3RbcHJvcF07XG5cbiAgICAgICAgaWYgKHR5cGVvZiBjdXJyZW50UHJvcCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICB2YXIgcmF3VmFsdWVzID0gZ2V0VmFsdWVzRnJvbShjdXJyZW50UHJvcCk7XG5cbiAgICAgICAgICBtYW5pZmVzdEFjY3VtdWxhdG9yW3Byb3BdID0ge1xuICAgICAgICAgICAgJ2Zvcm1hdFN0cmluZyc6IGdldEZvcm1hdFN0cmluZ0Zyb20oY3VycmVudFByb3ApXG4gICAgICAgICAgICAsJ2NodW5rTmFtZXMnOiBnZXRGb3JtYXRDaHVua3NGcm9tKHJhd1ZhbHVlcywgcHJvcClcbiAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgcmV0dXJuIG1hbmlmZXN0QWNjdW11bGF0b3I7XG4gICAgfVxuXG4gICAgLyohXG4gICAgICogQHBhcmFtIHtPYmplY3R9IHN0YXRlT2JqZWN0XG4gICAgICogQHBhcmFtIHtPYmplY3R9IGZvcm1hdE1hbmlmZXN0c1xuICAgICAqL1xuICAgIGZ1bmN0aW9uIGV4cGFuZEZvcm1hdHRlZFByb3BlcnRpZXMgKHN0YXRlT2JqZWN0LCBmb3JtYXRNYW5pZmVzdHMpIHtcbiAgICAgIFR3ZWVuYWJsZS5lYWNoKGZvcm1hdE1hbmlmZXN0cywgZnVuY3Rpb24gKHByb3ApIHtcbiAgICAgICAgdmFyIGN1cnJlbnRQcm9wID0gc3RhdGVPYmplY3RbcHJvcF07XG4gICAgICAgIHZhciByYXdWYWx1ZXMgPSBnZXRWYWx1ZXNGcm9tKGN1cnJlbnRQcm9wKTtcbiAgICAgICAgdmFyIHJhd1ZhbHVlc0xlbmd0aCA9IHJhd1ZhbHVlcy5sZW5ndGg7XG5cbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCByYXdWYWx1ZXNMZW5ndGg7IGkrKykge1xuICAgICAgICAgIHN0YXRlT2JqZWN0W2Zvcm1hdE1hbmlmZXN0c1twcm9wXS5jaHVua05hbWVzW2ldXSA9ICtyYXdWYWx1ZXNbaV07XG4gICAgICAgIH1cblxuICAgICAgICBkZWxldGUgc3RhdGVPYmplY3RbcHJvcF07XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvKiFcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gc3RhdGVPYmplY3RcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gZm9ybWF0TWFuaWZlc3RzXG4gICAgICovXG4gICAgZnVuY3Rpb24gY29sbGFwc2VGb3JtYXR0ZWRQcm9wZXJ0aWVzIChzdGF0ZU9iamVjdCwgZm9ybWF0TWFuaWZlc3RzKSB7XG4gICAgICBUd2VlbmFibGUuZWFjaChmb3JtYXRNYW5pZmVzdHMsIGZ1bmN0aW9uIChwcm9wKSB7XG4gICAgICAgIHZhciBjdXJyZW50UHJvcCA9IHN0YXRlT2JqZWN0W3Byb3BdO1xuICAgICAgICB2YXIgZm9ybWF0Q2h1bmtzID0gZXh0cmFjdFByb3BlcnR5Q2h1bmtzKFxuICAgICAgICAgIHN0YXRlT2JqZWN0LCBmb3JtYXRNYW5pZmVzdHNbcHJvcF0uY2h1bmtOYW1lcyk7XG4gICAgICAgIHZhciB2YWx1ZXNMaXN0ID0gZ2V0VmFsdWVzTGlzdChcbiAgICAgICAgICBmb3JtYXRDaHVua3MsIGZvcm1hdE1hbmlmZXN0c1twcm9wXS5jaHVua05hbWVzKTtcbiAgICAgICAgY3VycmVudFByb3AgPSBnZXRGb3JtYXR0ZWRWYWx1ZXMoXG4gICAgICAgICAgZm9ybWF0TWFuaWZlc3RzW3Byb3BdLmZvcm1hdFN0cmluZywgdmFsdWVzTGlzdCk7XG4gICAgICAgIHN0YXRlT2JqZWN0W3Byb3BdID0gc2FuaXRpemVSR0JDaHVua3MoY3VycmVudFByb3ApO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyohXG4gICAgICogQHBhcmFtIHtPYmplY3R9IHN0YXRlT2JqZWN0XG4gICAgICogQHBhcmFtIHtBcnJheS48c3RyaW5nPn0gY2h1bmtOYW1lc1xuICAgICAqXG4gICAgICogQHJldHVybiB7T2JqZWN0fSBUaGUgZXh0cmFjdGVkIHZhbHVlIGNodW5rcy5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBleHRyYWN0UHJvcGVydHlDaHVua3MgKHN0YXRlT2JqZWN0LCBjaHVua05hbWVzKSB7XG4gICAgICB2YXIgZXh0cmFjdGVkVmFsdWVzID0ge307XG4gICAgICB2YXIgY3VycmVudENodW5rTmFtZSwgY2h1bmtOYW1lc0xlbmd0aCA9IGNodW5rTmFtZXMubGVuZ3RoO1xuXG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGNodW5rTmFtZXNMZW5ndGg7IGkrKykge1xuICAgICAgICBjdXJyZW50Q2h1bmtOYW1lID0gY2h1bmtOYW1lc1tpXTtcbiAgICAgICAgZXh0cmFjdGVkVmFsdWVzW2N1cnJlbnRDaHVua05hbWVdID0gc3RhdGVPYmplY3RbY3VycmVudENodW5rTmFtZV07XG4gICAgICAgIGRlbGV0ZSBzdGF0ZU9iamVjdFtjdXJyZW50Q2h1bmtOYW1lXTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIGV4dHJhY3RlZFZhbHVlcztcbiAgICB9XG5cbiAgICB2YXIgZ2V0VmFsdWVzTGlzdF9hY2N1bXVsYXRvciA9IFtdO1xuICAgIC8qIVxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBzdGF0ZU9iamVjdFxuICAgICAqIEBwYXJhbSB7QXJyYXkuPHN0cmluZz59IGNodW5rTmFtZXNcbiAgICAgKlxuICAgICAqIEByZXR1cm4ge0FycmF5LjxudW1iZXI+fVxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGdldFZhbHVlc0xpc3QgKHN0YXRlT2JqZWN0LCBjaHVua05hbWVzKSB7XG4gICAgICBnZXRWYWx1ZXNMaXN0X2FjY3VtdWxhdG9yLmxlbmd0aCA9IDA7XG4gICAgICB2YXIgY2h1bmtOYW1lc0xlbmd0aCA9IGNodW5rTmFtZXMubGVuZ3RoO1xuXG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGNodW5rTmFtZXNMZW5ndGg7IGkrKykge1xuICAgICAgICBnZXRWYWx1ZXNMaXN0X2FjY3VtdWxhdG9yLnB1c2goc3RhdGVPYmplY3RbY2h1bmtOYW1lc1tpXV0pO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gZ2V0VmFsdWVzTGlzdF9hY2N1bXVsYXRvcjtcbiAgICB9XG5cbiAgICAvKiFcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gZm9ybWF0U3RyaW5nXG4gICAgICogQHBhcmFtIHtBcnJheS48bnVtYmVyPn0gcmF3VmFsdWVzXG4gICAgICpcbiAgICAgKiBAcmV0dXJuIHtzdHJpbmd9XG4gICAgICovXG4gICAgZnVuY3Rpb24gZ2V0Rm9ybWF0dGVkVmFsdWVzIChmb3JtYXRTdHJpbmcsIHJhd1ZhbHVlcykge1xuICAgICAgdmFyIGZvcm1hdHRlZFZhbHVlU3RyaW5nID0gZm9ybWF0U3RyaW5nO1xuICAgICAgdmFyIHJhd1ZhbHVlc0xlbmd0aCA9IHJhd1ZhbHVlcy5sZW5ndGg7XG5cbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcmF3VmFsdWVzTGVuZ3RoOyBpKyspIHtcbiAgICAgICAgZm9ybWF0dGVkVmFsdWVTdHJpbmcgPSBmb3JtYXR0ZWRWYWx1ZVN0cmluZy5yZXBsYWNlKFxuICAgICAgICAgIFZBTFVFX1BMQUNFSE9MREVSLCArcmF3VmFsdWVzW2ldLnRvRml4ZWQoNCkpO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gZm9ybWF0dGVkVmFsdWVTdHJpbmc7XG4gICAgfVxuXG4gICAgLyohXG4gICAgICogTm90ZTogSXQncyB0aGUgZHV0eSBvZiB0aGUgY2FsbGVyIHRvIGNvbnZlcnQgdGhlIEFycmF5IGVsZW1lbnRzIG9mIHRoZVxuICAgICAqIHJldHVybiB2YWx1ZSBpbnRvIG51bWJlcnMuICBUaGlzIGlzIGEgcGVyZm9ybWFuY2Ugb3B0aW1pemF0aW9uLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IGZvcm1hdHRlZFN0cmluZ1xuICAgICAqXG4gICAgICogQHJldHVybiB7QXJyYXkuPHN0cmluZz58bnVsbH1cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBnZXRWYWx1ZXNGcm9tIChmb3JtYXR0ZWRTdHJpbmcpIHtcbiAgICAgIHJldHVybiBmb3JtYXR0ZWRTdHJpbmcubWF0Y2goUl9VTkZPUk1BVFRFRF9WQUxVRVMpO1xuICAgIH1cblxuICAgIC8qIVxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBlYXNpbmdPYmplY3RcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gdG9rZW5EYXRhXG4gICAgICovXG4gICAgZnVuY3Rpb24gZXhwYW5kRWFzaW5nT2JqZWN0IChlYXNpbmdPYmplY3QsIHRva2VuRGF0YSkge1xuICAgICAgVHdlZW5hYmxlLmVhY2godG9rZW5EYXRhLCBmdW5jdGlvbiAocHJvcCkge1xuICAgICAgICB2YXIgY3VycmVudFByb3AgPSB0b2tlbkRhdGFbcHJvcF07XG4gICAgICAgIHZhciBjaHVua05hbWVzID0gY3VycmVudFByb3AuY2h1bmtOYW1lcztcbiAgICAgICAgdmFyIGNodW5rTGVuZ3RoID0gY2h1bmtOYW1lcy5sZW5ndGg7XG4gICAgICAgIHZhciBlYXNpbmdDaHVua3MgPSBlYXNpbmdPYmplY3RbcHJvcF0uc3BsaXQoJyAnKTtcbiAgICAgICAgdmFyIGxhc3RFYXNpbmdDaHVuayA9IGVhc2luZ0NodW5rc1tlYXNpbmdDaHVua3MubGVuZ3RoIC0gMV07XG5cbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjaHVua0xlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgZWFzaW5nT2JqZWN0W2NodW5rTmFtZXNbaV1dID0gZWFzaW5nQ2h1bmtzW2ldIHx8IGxhc3RFYXNpbmdDaHVuaztcbiAgICAgICAgfVxuXG4gICAgICAgIGRlbGV0ZSBlYXNpbmdPYmplY3RbcHJvcF07XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvKiFcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gZWFzaW5nT2JqZWN0XG4gICAgICogQHBhcmFtIHtPYmplY3R9IHRva2VuRGF0YVxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGNvbGxhcHNlRWFzaW5nT2JqZWN0IChlYXNpbmdPYmplY3QsIHRva2VuRGF0YSkge1xuICAgICAgVHdlZW5hYmxlLmVhY2godG9rZW5EYXRhLCBmdW5jdGlvbiAocHJvcCkge1xuICAgICAgICB2YXIgY3VycmVudFByb3AgPSB0b2tlbkRhdGFbcHJvcF07XG4gICAgICAgIHZhciBjaHVua05hbWVzID0gY3VycmVudFByb3AuY2h1bmtOYW1lcztcbiAgICAgICAgdmFyIGNodW5rTGVuZ3RoID0gY2h1bmtOYW1lcy5sZW5ndGg7XG4gICAgICAgIHZhciBjb21wb3NlZEVhc2luZ1N0cmluZyA9ICcnO1xuXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY2h1bmtMZW5ndGg7IGkrKykge1xuICAgICAgICAgIGNvbXBvc2VkRWFzaW5nU3RyaW5nICs9ICcgJyArIGVhc2luZ09iamVjdFtjaHVua05hbWVzW2ldXTtcbiAgICAgICAgICBkZWxldGUgZWFzaW5nT2JqZWN0W2NodW5rTmFtZXNbaV1dO1xuICAgICAgICB9XG5cbiAgICAgICAgZWFzaW5nT2JqZWN0W3Byb3BdID0gY29tcG9zZWRFYXNpbmdTdHJpbmcuc3Vic3RyKDEpO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgVHdlZW5hYmxlLnByb3RvdHlwZS5maWx0ZXIudG9rZW4gPSB7XG4gICAgICAndHdlZW5DcmVhdGVkJzogZnVuY3Rpb24gKGN1cnJlbnRTdGF0ZSwgZnJvbVN0YXRlLCB0b1N0YXRlLCBlYXNpbmdPYmplY3QpIHtcbiAgICAgICAgc2FuaXRpemVPYmplY3RGb3JIZXhQcm9wcyhjdXJyZW50U3RhdGUpO1xuICAgICAgICBzYW5pdGl6ZU9iamVjdEZvckhleFByb3BzKGZyb21TdGF0ZSk7XG4gICAgICAgIHNhbml0aXplT2JqZWN0Rm9ySGV4UHJvcHModG9TdGF0ZSk7XG4gICAgICAgIHRoaXMuX3Rva2VuRGF0YSA9IGdldEZvcm1hdE1hbmlmZXN0cyhjdXJyZW50U3RhdGUpO1xuICAgICAgfSxcblxuICAgICAgJ2JlZm9yZVR3ZWVuJzogZnVuY3Rpb24gKGN1cnJlbnRTdGF0ZSwgZnJvbVN0YXRlLCB0b1N0YXRlLCBlYXNpbmdPYmplY3QpIHtcbiAgICAgICAgZXhwYW5kRWFzaW5nT2JqZWN0KGVhc2luZ09iamVjdCwgdGhpcy5fdG9rZW5EYXRhKTtcbiAgICAgICAgZXhwYW5kRm9ybWF0dGVkUHJvcGVydGllcyhjdXJyZW50U3RhdGUsIHRoaXMuX3Rva2VuRGF0YSk7XG4gICAgICAgIGV4cGFuZEZvcm1hdHRlZFByb3BlcnRpZXMoZnJvbVN0YXRlLCB0aGlzLl90b2tlbkRhdGEpO1xuICAgICAgICBleHBhbmRGb3JtYXR0ZWRQcm9wZXJ0aWVzKHRvU3RhdGUsIHRoaXMuX3Rva2VuRGF0YSk7XG4gICAgICB9LFxuXG4gICAgICAnYWZ0ZXJUd2Vlbic6IGZ1bmN0aW9uIChjdXJyZW50U3RhdGUsIGZyb21TdGF0ZSwgdG9TdGF0ZSwgZWFzaW5nT2JqZWN0KSB7XG4gICAgICAgIGNvbGxhcHNlRm9ybWF0dGVkUHJvcGVydGllcyhjdXJyZW50U3RhdGUsIHRoaXMuX3Rva2VuRGF0YSk7XG4gICAgICAgIGNvbGxhcHNlRm9ybWF0dGVkUHJvcGVydGllcyhmcm9tU3RhdGUsIHRoaXMuX3Rva2VuRGF0YSk7XG4gICAgICAgIGNvbGxhcHNlRm9ybWF0dGVkUHJvcGVydGllcyh0b1N0YXRlLCB0aGlzLl90b2tlbkRhdGEpO1xuICAgICAgICBjb2xsYXBzZUVhc2luZ09iamVjdChlYXNpbmdPYmplY3QsIHRoaXMuX3Rva2VuRGF0YSk7XG4gICAgICB9XG4gICAgfTtcblxuICB9IChUd2VlbmFibGUpKTtcblxuICB9KHdpbmRvdykpO1xuXG4gIHJldHVybiB3aW5kb3cuVHdlZW5hYmxlO1xufSk7XG5cbm1vZHVsZS5leHBvcnRzID0gU2hpZnR5O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgQ2Fyb3VzZWxTbGljZSA9IGFuZ3VsYXIubW9kdWxlKCdhbmd1bGFyLWNhcm91c2VsJylcbi5maWx0ZXIoJ2Nhcm91c2VsU2xpY2UnLCBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oY29sbGVjdGlvbiwgc3RhcnQsIHNpemUpIHtcbiAgICAgICAgaWYgKGFuZ3VsYXIuaXNBcnJheShjb2xsZWN0aW9uKSkge1xuICAgICAgICAgICAgcmV0dXJuIGNvbGxlY3Rpb24uc2xpY2Uoc3RhcnQsIHN0YXJ0ICsgc2l6ZSk7XG4gICAgICAgIH0gZWxzZSBpZiAoYW5ndWxhci5pc09iamVjdChjb2xsZWN0aW9uKSkge1xuICAgICAgICAgICAgLy8gZG9udCB0cnkgdG8gc2xpY2UgY29sbGVjdGlvbnMgOilcbiAgICAgICAgICAgIHJldHVybiBjb2xsZWN0aW9uO1xuICAgICAgICB9XG4gICAgfTtcbn0pO1xuXG5tb2R1bGUuZXhwb3J0cyA9IENhcm91c2VsU2xpY2U7XG4iXX0=
