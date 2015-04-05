(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
require("./src/public/core/angular-mobile.js");
require("./src/public/core/browserTrigger.js");
require("./src/public/features/auto-slide/auto-slide-directive.js");
require("./src/public/features/carousel/carousel-directive.js");
require("./src/public/features/controls/controls-directive.js");
require("./src/public/features/indicators/indicators-directive.js");
require("./src/public/features/shifty/shifty-directive.js");
require("./src/public/features/slice-filter/slice-filter-directive.js");

},{"./src/public/core/angular-mobile.js":2,"./src/public/core/browserTrigger.js":3,"./src/public/features/auto-slide/auto-slide-directive.js":4,"./src/public/features/carousel/carousel-directive.js":5,"./src/public/features/controls/controls-directive.js":6,"./src/public/features/indicators/indicators-directive.js":7,"./src/public/features/shifty/shifty-directive.js":8,"./src/public/features/slice-filter/slice-filter-directive.js":9}],2:[function(require,module,exports){
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJfc3RyZWFtXzAuanMiLCJzcmMvcHVibGljL2NvcmUvYW5ndWxhci1tb2JpbGUuanMiLCJzcmMvcHVibGljL2NvcmUvYnJvd3NlclRyaWdnZXIuanMiLCJzcmMvcHVibGljL2ZlYXR1cmVzL2F1dG8tc2xpZGUvYXV0by1zbGlkZS1kaXJlY3RpdmUuanMiLCJzcmMvcHVibGljL2ZlYXR1cmVzL2Nhcm91c2VsL2Nhcm91c2VsLWRpcmVjdGl2ZS5qcyIsInNyYy9wdWJsaWMvZmVhdHVyZXMvY29udHJvbHMvY29udHJvbHMtZGlyZWN0aXZlLmpzIiwic3JjL3B1YmxpYy9mZWF0dXJlcy9pbmRpY2F0b3JzL2luZGljYXRvcnMtZGlyZWN0aXZlLmpzIiwic3JjL3B1YmxpYy9mZWF0dXJlcy9zaGlmdHkvc2hpZnR5LWRpcmVjdGl2ZS5qcyIsInNyYy9wdWJsaWMvZmVhdHVyZXMvc2xpY2UtZmlsdGVyL3NsaWNlLWZpbHRlci1kaXJlY3RpdmUuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RkQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZqQkE7O0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzM0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsInJlcXVpcmUoXCIuL3NyYy9wdWJsaWMvY29yZS9hbmd1bGFyLW1vYmlsZS5qc1wiKTtcbnJlcXVpcmUoXCIuL3NyYy9wdWJsaWMvY29yZS9icm93c2VyVHJpZ2dlci5qc1wiKTtcbnJlcXVpcmUoXCIuL3NyYy9wdWJsaWMvZmVhdHVyZXMvYXV0by1zbGlkZS9hdXRvLXNsaWRlLWRpcmVjdGl2ZS5qc1wiKTtcbnJlcXVpcmUoXCIuL3NyYy9wdWJsaWMvZmVhdHVyZXMvY2Fyb3VzZWwvY2Fyb3VzZWwtZGlyZWN0aXZlLmpzXCIpO1xucmVxdWlyZShcIi4vc3JjL3B1YmxpYy9mZWF0dXJlcy9jb250cm9scy9jb250cm9scy1kaXJlY3RpdmUuanNcIik7XG5yZXF1aXJlKFwiLi9zcmMvcHVibGljL2ZlYXR1cmVzL2luZGljYXRvcnMvaW5kaWNhdG9ycy1kaXJlY3RpdmUuanNcIik7XG5yZXF1aXJlKFwiLi9zcmMvcHVibGljL2ZlYXR1cmVzL3NoaWZ0eS9zaGlmdHktZGlyZWN0aXZlLmpzXCIpO1xucmVxdWlyZShcIi4vc3JjL3B1YmxpYy9mZWF0dXJlcy9zbGljZS1maWx0ZXIvc2xpY2UtZmlsdGVyLWRpcmVjdGl2ZS5qc1wiKTtcbiIsIi8qKlxuICogQGxpY2Vuc2UgQW5ndWxhckpTIHYxLjEuNS0zODE0OTg2XG4gKiAoYykgMjAxMC0yMDEyIEdvb2dsZSwgSW5jLiBodHRwOi8vYW5ndWxhcmpzLm9yZ1xuICogTGljZW5zZTogTUlUXG4gKi9cbihmdW5jdGlvbih3aW5kb3csIGFuZ3VsYXIsIHVuZGVmaW5lZCkge1xuJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqIEBuZ2RvYyBvdmVydmlld1xuICogQG5hbWUgbmdNb2JpbGVcbiAqIEBkZXNjcmlwdGlvblxuICogVG91Y2ggZXZlbnRzIGFuZCBvdGhlciBtb2JpbGUgaGVscGVycy5cbiAqIEJhc2VkIG9uIGpRdWVyeSBNb2JpbGUgdG91Y2ggZXZlbnQgaGFuZGxpbmcgKGpxdWVyeW1vYmlsZS5jb20pXG4gKi9cblxuLy8gZGVmaW5lIG5nTW9iaWxlIG1vZHVsZVxudmFyIG5nTW9iaWxlID0gYW5ndWxhci5tb2R1bGUoJ25nTW9iaWxlJywgW10pO1xuXG4vKipcbiAqIEEgc2VydmljZSBmb3IgYWJzdHJhY3Rpbmcgc3dpcGUgYmVoYXZpb3IuIERlbGliZXJhdGVseSBpbnRlcm5hbDsgaXQgaXMgb25seSBpbnRlbmRlZCBmb3IgdXNlIGluXG4gKiBuZ1N3aXBlTGVmdC9SaWdodCBhbmQgbmdDYXJvdXNlbC5cbiAqXG4gKiBEZXRlcm1pbmluZyB3aGV0aGVyIHRoZSB1c2VyIGlzIHN3aXBpbmcgb3Igc2Nyb2xsaW5nLCBhbmQgaGFuZGxpbmcgYm90aCBtb3VzZSBhbmQgdG91Y2ggZXZlbnRzLFxuICogbWFrZSB3cml0aW5nIHN3aXBlIGNvZGUgY2hhbGxlbmdpbmcuIFRoaXMgc2VydmljZSBhbGxvd3Mgc2V0dGluZyBjYWxsYmFja3Mgb24gdGhlIHN0YXJ0LFxuICogbW92ZW1lbnQgYW5kIGNvbXBsZXRpb24gb2YgYSBzd2lwZSBnZXN0dXJlLCB3aXRob3V0IHdvcnJ5aW5nIGFib3V0IHRoZSBjb21wbGljYXRpb25zLlxuICpcbiAqL1xuXG5uZ01vYmlsZS5mYWN0b3J5KCckc3dpcGUnLCBbZnVuY3Rpb24oKSB7XG4gIC8vIFRoZSB0b3RhbCBkaXN0YW5jZSBpbiBhbnkgZGlyZWN0aW9uIGJlZm9yZSB3ZSBtYWtlIHRoZSBjYWxsIG9uIHN3aXBlIHZzLiBzY3JvbGwuXG4gIHZhciBNT1ZFX0JVRkZFUl9SQURJVVMgPSAxMDtcblxuICAvLyBBYnNvbHV0ZSB0b3RhbCBtb3ZlbWVudCwgdXNlZCB0byBjb250cm9sIHN3aXBlIHZzLiBzY3JvbGwuXG4gIHZhciB0b3RhbFgsIHRvdGFsWTtcbiAgLy8gQ29vcmRpbmF0ZXMgb2YgdGhlIHN0YXJ0IHBvc2l0aW9uLlxuICB2YXIgc3RhcnRDb29yZHM7XG4gIC8vIExhc3QgZXZlbnQncyBwb3NpdGlvbi5cbiAgdmFyIGxhc3RQb3M7XG4gIC8vIFdoZXRoZXIgYSBzd2lwZSBpcyBhY3RpdmUuXG4gIHZhciBhY3RpdmUgPSBmYWxzZTtcblxuICBmdW5jdGlvbiBnZXRDb29yZGluYXRlcyhldmVudCkge1xuICAgIHZhciB0b3VjaGVzID0gZXZlbnQudG91Y2hlcyAmJiBldmVudC50b3VjaGVzLmxlbmd0aCA/IGV2ZW50LnRvdWNoZXMgOiBbZXZlbnRdO1xuICAgIHZhciBlID0gKGV2ZW50LmNoYW5nZWRUb3VjaGVzICYmIGV2ZW50LmNoYW5nZWRUb3VjaGVzWzBdKSB8fFxuICAgICAgICAoZXZlbnQub3JpZ2luYWxFdmVudCAmJiBldmVudC5vcmlnaW5hbEV2ZW50LmNoYW5nZWRUb3VjaGVzICYmXG4gICAgICAgICAgICBldmVudC5vcmlnaW5hbEV2ZW50LmNoYW5nZWRUb3VjaGVzWzBdKSB8fFxuICAgICAgICB0b3VjaGVzWzBdLm9yaWdpbmFsRXZlbnQgfHwgdG91Y2hlc1swXTtcblxuICAgIHJldHVybiB7XG4gICAgICB4OiBlLmNsaWVudFgsXG4gICAgICB5OiBlLmNsaWVudFlcbiAgICB9O1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBiaW5kOiBmdW5jdGlvbihlbGVtZW50LCBldmVudHMpIHtcbiAgICAgIGVsZW1lbnQuYmluZCgndG91Y2hzdGFydCBtb3VzZWRvd24nLCBmdW5jdGlvbihldmVudCkge1xuICAgICAgICBzdGFydENvb3JkcyA9IGdldENvb3JkaW5hdGVzKGV2ZW50KTtcbiAgICAgICAgYWN0aXZlID0gdHJ1ZTtcbiAgICAgICAgdG90YWxYID0gMDtcbiAgICAgICAgdG90YWxZID0gMDtcbiAgICAgICAgbGFzdFBvcyA9IHN0YXJ0Q29vcmRzO1xuICAgICAgICBldmVudHNbJ3N0YXJ0J10gJiYgZXZlbnRzWydzdGFydCddKHN0YXJ0Q29vcmRzKTtcbiAgICAgIH0pO1xuXG4gICAgICBlbGVtZW50LmJpbmQoJ3RvdWNoY2FuY2VsJywgZnVuY3Rpb24oZXZlbnQpIHtcbiAgICAgICAgYWN0aXZlID0gZmFsc2U7XG4gICAgICAgIGV2ZW50c1snY2FuY2VsJ10gJiYgZXZlbnRzWydjYW5jZWwnXSgpO1xuICAgICAgfSk7XG5cbiAgICAgIGVsZW1lbnQuYmluZCgndG91Y2htb3ZlIG1vdXNlbW92ZScsIGZ1bmN0aW9uKGV2ZW50KSB7XG4gICAgICAgIGlmICghYWN0aXZlKSByZXR1cm47XG5cbiAgICAgICAgLy8gQW5kcm9pZCB3aWxsIHNlbmQgYSB0b3VjaGNhbmNlbCBpZiBpdCB0aGlua3Mgd2UncmUgc3RhcnRpbmcgdG8gc2Nyb2xsLlxuICAgICAgICAvLyBTbyB3aGVuIHRoZSB0b3RhbCBkaXN0YW5jZSAoKyBvciAtIG9yIGJvdGgpIGV4Y2VlZHMgMTBweCBpbiBlaXRoZXIgZGlyZWN0aW9uLFxuICAgICAgICAvLyB3ZSBlaXRoZXI6XG4gICAgICAgIC8vIC0gT24gdG90YWxYID4gdG90YWxZLCB3ZSBzZW5kIHByZXZlbnREZWZhdWx0KCkgYW5kIHRyZWF0IHRoaXMgYXMgYSBzd2lwZS5cbiAgICAgICAgLy8gLSBPbiB0b3RhbFkgPiB0b3RhbFgsIHdlIGxldCB0aGUgYnJvd3NlciBoYW5kbGUgaXQgYXMgYSBzY3JvbGwuXG5cbiAgICAgICAgaWYgKCFzdGFydENvb3JkcykgcmV0dXJuO1xuICAgICAgICB2YXIgY29vcmRzID0gZ2V0Q29vcmRpbmF0ZXMoZXZlbnQpO1xuXG4gICAgICAgIHRvdGFsWCArPSBNYXRoLmFicyhjb29yZHMueCAtIGxhc3RQb3MueCk7XG4gICAgICAgIHRvdGFsWSArPSBNYXRoLmFicyhjb29yZHMueSAtIGxhc3RQb3MueSk7XG5cbiAgICAgICAgbGFzdFBvcyA9IGNvb3JkcztcblxuICAgICAgICBpZiAodG90YWxYIDwgTU9WRV9CVUZGRVJfUkFESVVTICYmIHRvdGFsWSA8IE1PVkVfQlVGRkVSX1JBRElVUykge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIE9uZSBvZiB0b3RhbFggb3IgdG90YWxZIGhhcyBleGNlZWRlZCB0aGUgYnVmZmVyLCBzbyBkZWNpZGUgb24gc3dpcGUgdnMuIHNjcm9sbC5cbiAgICAgICAgaWYgKHRvdGFsWSA+IHRvdGFsWCkge1xuICAgICAgICAgIC8vIEFsbG93IG5hdGl2ZSBzY3JvbGxpbmcgdG8gdGFrZSBvdmVyLlxuICAgICAgICAgIGFjdGl2ZSA9IGZhbHNlO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBQcmV2ZW50IHRoZSBicm93c2VyIGZyb20gc2Nyb2xsaW5nLlxuICAgICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cbiAgICAgICAgICBldmVudHNbJ21vdmUnXSAmJiBldmVudHNbJ21vdmUnXShjb29yZHMpO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgZWxlbWVudC5iaW5kKCd0b3VjaGVuZCBtb3VzZXVwJywgZnVuY3Rpb24oZXZlbnQpIHtcbiAgICAgICAgaWYgKCFhY3RpdmUpIHJldHVybjtcbiAgICAgICAgYWN0aXZlID0gZmFsc2U7XG4gICAgICAgIGV2ZW50c1snZW5kJ10gJiYgZXZlbnRzWydlbmQnXShnZXRDb29yZGluYXRlcyhldmVudCkpO1xuICAgICAgfSk7XG4gICAgfVxuICB9O1xufV0pO1xuXG4vKipcbiAqIEBuZ2RvYyBkaXJlY3RpdmVcbiAqIEBuYW1lIG5nTW9iaWxlLmRpcmVjdGl2ZTpuZ1RhcFxuICpcbiAqIEBkZXNjcmlwdGlvblxuICogU3BlY2lmeSBjdXN0b20gYmVoYXZpb3Igd2hlbiBlbGVtZW50IGlzIHRhcHBlZCBvbiBhIHRvdWNoc2NyZWVuIGRldmljZS5cbiAqIEEgdGFwIGlzIGEgYnJpZWYsIGRvd24tYW5kLXVwIHRvdWNoIHdpdGhvdXQgbXVjaCBtb3Rpb24uXG4gKlxuICogQGVsZW1lbnQgQU5ZXG4gKiBAcGFyYW0ge2V4cHJlc3Npb259IG5nQ2xpY2sge0BsaW5rIGd1aWRlL2V4cHJlc3Npb24gRXhwcmVzc2lvbn0gdG8gZXZhbHVhdGVcbiAqIHVwb24gdGFwLiAoRXZlbnQgb2JqZWN0IGlzIGF2YWlsYWJsZSBhcyBgJGV2ZW50YClcbiAqXG4gKiBAZXhhbXBsZVxuICAgIDxkb2M6ZXhhbXBsZT5cbiAgICAgIDxkb2M6c291cmNlPlxuICAgICAgICA8YnV0dG9uIG5nLXRhcD1cImNvdW50ID0gY291bnQgKyAxXCIgbmctaW5pdD1cImNvdW50PTBcIj5cbiAgICAgICAgICBJbmNyZW1lbnRcbiAgICAgICAgPC9idXR0b24+XG4gICAgICAgIGNvdW50OiB7eyBjb3VudCB9fVxuICAgICAgPC9kb2M6c291cmNlPlxuICAgIDwvZG9jOmV4YW1wbGU+XG4gKi9cblxubmdNb2JpbGUuY29uZmlnKFsnJHByb3ZpZGUnLCBmdW5jdGlvbigkcHJvdmlkZSkge1xuICAkcHJvdmlkZS5kZWNvcmF0b3IoJ25nQ2xpY2tEaXJlY3RpdmUnLCBbJyRkZWxlZ2F0ZScsIGZ1bmN0aW9uKCRkZWxlZ2F0ZSkge1xuICAgIC8vIGRyb3AgdGhlIGRlZmF1bHQgbmdDbGljayBkaXJlY3RpdmVcbiAgICAkZGVsZWdhdGUuc2hpZnQoKTtcbiAgICByZXR1cm4gJGRlbGVnYXRlO1xuICB9XSk7XG59XSk7XG5cbm5nTW9iaWxlLmRpcmVjdGl2ZSgnbmdDbGljaycsIFsnJHBhcnNlJywgJyR0aW1lb3V0JywgJyRyb290RWxlbWVudCcsXG4gICAgZnVuY3Rpb24oJHBhcnNlLCAkdGltZW91dCwgJHJvb3RFbGVtZW50KSB7XG4gIHZhciBUQVBfRFVSQVRJT04gPSA3NTA7IC8vIFNob3J0ZXIgdGhhbiA3NTBtcyBpcyBhIHRhcCwgbG9uZ2VyIGlzIGEgdGFwaG9sZCBvciBkcmFnLlxuICB2YXIgTU9WRV9UT0xFUkFOQ0UgPSAxMjsgLy8gMTJweCBzZWVtcyB0byB3b3JrIGluIG1vc3QgbW9iaWxlIGJyb3dzZXJzLlxuICB2YXIgUFJFVkVOVF9EVVJBVElPTiA9IDI1MDA7IC8vIDIuNSBzZWNvbmRzIG1heGltdW0gZnJvbSBwcmV2ZW50R2hvc3RDbGljayBjYWxsIHRvIGNsaWNrXG4gIHZhciBDTElDS0JVU1RFUl9USFJFU0hPTEQgPSAyNTsgLy8gMjUgcGl4ZWxzIGluIGFueSBkaW1lbnNpb24gaXMgdGhlIGxpbWl0IGZvciBidXN0aW5nIGNsaWNrcy5cbiAgdmFyIGxhc3RQcmV2ZW50ZWRUaW1lO1xuICB2YXIgdG91Y2hDb29yZGluYXRlcztcblxuXG4gIC8vIFRBUCBFVkVOVFMgQU5EIEdIT1NUIENMSUNLU1xuICAvL1xuICAvLyBXaHkgdGFwIGV2ZW50cz9cbiAgLy8gTW9iaWxlIGJyb3dzZXJzIGRldGVjdCBhIHRhcCwgdGhlbiB3YWl0IGEgbW9tZW50ICh1c3VhbGx5IH4zMDBtcykgdG8gc2VlIGlmIHlvdSdyZVxuICAvLyBkb3VibGUtdGFwcGluZywgYW5kIHRoZW4gZmlyZSBhIGNsaWNrIGV2ZW50LlxuICAvL1xuICAvLyBUaGlzIGRlbGF5IHN1Y2tzIGFuZCBtYWtlcyBtb2JpbGUgYXBwcyBmZWVsIHVucmVzcG9uc2l2ZS5cbiAgLy8gU28gd2UgZGV0ZWN0IHRvdWNoc3RhcnQsIHRvdWNobW92ZSwgdG91Y2hjYW5jZWwgYW5kIHRvdWNoZW5kIG91cnNlbHZlcyBhbmQgZGV0ZXJtaW5lIHdoZW5cbiAgLy8gdGhlIHVzZXIgaGFzIHRhcHBlZCBvbiBzb21ldGhpbmcuXG4gIC8vXG4gIC8vIFdoYXQgaGFwcGVucyB3aGVuIHRoZSBicm93c2VyIHRoZW4gZ2VuZXJhdGVzIGEgY2xpY2sgZXZlbnQ/XG4gIC8vIFRoZSBicm93c2VyLCBvZiBjb3Vyc2UsIGFsc28gZGV0ZWN0cyB0aGUgdGFwIGFuZCBmaXJlcyBhIGNsaWNrIGFmdGVyIGEgZGVsYXkuIFRoaXMgcmVzdWx0cyBpblxuICAvLyB0YXBwaW5nL2NsaWNraW5nIHR3aWNlLiBTbyB3ZSBkbyBcImNsaWNrYnVzdGluZ1wiIHRvIHByZXZlbnQgaXQuXG4gIC8vXG4gIC8vIEhvdyBkb2VzIGl0IHdvcms/XG4gIC8vIFdlIGF0dGFjaCBnbG9iYWwgdG91Y2hzdGFydCBhbmQgY2xpY2sgaGFuZGxlcnMsIHRoYXQgcnVuIGR1cmluZyB0aGUgY2FwdHVyZSAoZWFybHkpIHBoYXNlLlxuICAvLyBTbyB0aGUgc2VxdWVuY2UgZm9yIGEgdGFwIGlzOlxuICAvLyAtIGdsb2JhbCB0b3VjaHN0YXJ0OiBTZXRzIGFuIFwiYWxsb3dhYmxlIHJlZ2lvblwiIGF0IHRoZSBwb2ludCB0b3VjaGVkLlxuICAvLyAtIGVsZW1lbnQncyB0b3VjaHN0YXJ0OiBTdGFydHMgYSB0b3VjaFxuICAvLyAoLSB0b3VjaG1vdmUgb3IgdG91Y2hjYW5jZWwgZW5kcyB0aGUgdG91Y2gsIG5vIGNsaWNrIGZvbGxvd3MpXG4gIC8vIC0gZWxlbWVudCdzIHRvdWNoZW5kOiBEZXRlcm1pbmVzIGlmIHRoZSB0YXAgaXMgdmFsaWQgKGRpZG4ndCBtb3ZlIHRvbyBmYXIgYXdheSwgZGlkbid0IGhvbGRcbiAgLy8gICB0b28gbG9uZykgYW5kIGZpcmVzIHRoZSB1c2VyJ3MgdGFwIGhhbmRsZXIuIFRoZSB0b3VjaGVuZCBhbHNvIGNhbGxzIHByZXZlbnRHaG9zdENsaWNrKCkuXG4gIC8vIC0gcHJldmVudEdob3N0Q2xpY2soKSByZW1vdmVzIHRoZSBhbGxvd2FibGUgcmVnaW9uIHRoZSBnbG9iYWwgdG91Y2hzdGFydCBjcmVhdGVkLlxuICAvLyAtIFRoZSBicm93c2VyIGdlbmVyYXRlcyBhIGNsaWNrIGV2ZW50LlxuICAvLyAtIFRoZSBnbG9iYWwgY2xpY2sgaGFuZGxlciBjYXRjaGVzIHRoZSBjbGljaywgYW5kIGNoZWNrcyB3aGV0aGVyIGl0IHdhcyBpbiBhbiBhbGxvd2FibGUgcmVnaW9uLlxuICAvLyAgICAgLSBJZiBwcmV2ZW50R2hvc3RDbGljayB3YXMgY2FsbGVkLCB0aGUgcmVnaW9uIHdpbGwgaGF2ZSBiZWVuIHJlbW92ZWQsIHRoZSBjbGljayBpcyBidXN0ZWQuXG4gIC8vICAgICAtIElmIHRoZSByZWdpb24gaXMgc3RpbGwgdGhlcmUsIHRoZSBjbGljayBwcm9jZWVkcyBub3JtYWxseS4gVGhlcmVmb3JlIGNsaWNrcyBvbiBsaW5rcyBhbmRcbiAgLy8gICAgICAgb3RoZXIgZWxlbWVudHMgd2l0aG91dCBuZ1RhcCBvbiB0aGVtIHdvcmsgbm9ybWFsbHkuXG4gIC8vXG4gIC8vIFRoaXMgaXMgYW4gdWdseSwgdGVycmlibGUgaGFjayFcbiAgLy8gWWVhaCwgdGVsbCBtZSBhYm91dCBpdC4gVGhlIGFsdGVybmF0aXZlcyBhcmUgdXNpbmcgdGhlIHNsb3cgY2xpY2sgZXZlbnRzLCBvciBtYWtpbmcgb3VyIHVzZXJzXG4gIC8vIGRlYWwgd2l0aCB0aGUgZ2hvc3QgY2xpY2tzLCBzbyBJIGNvbnNpZGVyIHRoaXMgdGhlIGxlYXN0IG9mIGV2aWxzLiBGb3J0dW5hdGVseSBBbmd1bGFyXG4gIC8vIGVuY2Fwc3VsYXRlcyB0aGlzIHVnbHkgbG9naWMgYXdheSBmcm9tIHRoZSB1c2VyLlxuICAvL1xuICAvLyBXaHkgbm90IGp1c3QgcHV0IGNsaWNrIGhhbmRsZXJzIG9uIHRoZSBlbGVtZW50P1xuICAvLyBXZSBkbyB0aGF0IHRvbywganVzdCB0byBiZSBzdXJlLiBUaGUgcHJvYmxlbSBpcyB0aGF0IHRoZSB0YXAgZXZlbnQgbWlnaHQgaGF2ZSBjYXVzZWQgdGhlIERPTVxuICAvLyB0byBjaGFuZ2UsIHNvIHRoYXQgdGhlIGNsaWNrIGZpcmVzIGluIHRoZSBzYW1lIHBvc2l0aW9uIGJ1dCBzb21ldGhpbmcgZWxzZSBpcyB0aGVyZSBub3cuIFNvXG4gIC8vIHRoZSBoYW5kbGVycyBhcmUgZ2xvYmFsIGFuZCBjYXJlIG9ubHkgYWJvdXQgY29vcmRpbmF0ZXMgYW5kIG5vdCBlbGVtZW50cy5cblxuICAvLyBDaGVja3MgaWYgdGhlIGNvb3JkaW5hdGVzIGFyZSBjbG9zZSBlbm91Z2ggdG8gYmUgd2l0aGluIHRoZSByZWdpb24uXG4gIGZ1bmN0aW9uIGhpdCh4MSwgeTEsIHgyLCB5Mikge1xuICAgIHJldHVybiBNYXRoLmFicyh4MSAtIHgyKSA8IENMSUNLQlVTVEVSX1RIUkVTSE9MRCAmJiBNYXRoLmFicyh5MSAtIHkyKSA8IENMSUNLQlVTVEVSX1RIUkVTSE9MRDtcbiAgfVxuXG4gIC8vIENoZWNrcyBhIGxpc3Qgb2YgYWxsb3dhYmxlIHJlZ2lvbnMgYWdhaW5zdCBhIGNsaWNrIGxvY2F0aW9uLlxuICAvLyBSZXR1cm5zIHRydWUgaWYgdGhlIGNsaWNrIHNob3VsZCBiZSBhbGxvd2VkLlxuICAvLyBTcGxpY2VzIG91dCB0aGUgYWxsb3dhYmxlIHJlZ2lvbiBmcm9tIHRoZSBsaXN0IGFmdGVyIGl0IGhhcyBiZWVuIHVzZWQuXG4gIGZ1bmN0aW9uIGNoZWNrQWxsb3dhYmxlUmVnaW9ucyh0b3VjaENvb3JkaW5hdGVzLCB4LCB5KSB7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0b3VjaENvb3JkaW5hdGVzLmxlbmd0aDsgaSArPSAyKSB7XG4gICAgICBpZiAoaGl0KHRvdWNoQ29vcmRpbmF0ZXNbaV0sIHRvdWNoQ29vcmRpbmF0ZXNbaSsxXSwgeCwgeSkpIHtcbiAgICAgICAgdG91Y2hDb29yZGluYXRlcy5zcGxpY2UoaSwgaSArIDIpO1xuICAgICAgICByZXR1cm4gdHJ1ZTsgLy8gYWxsb3dhYmxlIHJlZ2lvblxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7IC8vIE5vIGFsbG93YWJsZSByZWdpb247IGJ1c3QgaXQuXG4gIH1cblxuICAvLyBHbG9iYWwgY2xpY2sgaGFuZGxlciB0aGF0IHByZXZlbnRzIHRoZSBjbGljayBpZiBpdCdzIGluIGEgYnVzdGFibGUgem9uZSBhbmQgcHJldmVudEdob3N0Q2xpY2tcbiAgLy8gd2FzIGNhbGxlZCByZWNlbnRseS5cbiAgZnVuY3Rpb24gb25DbGljayhldmVudCkge1xuICAgIGlmIChEYXRlLm5vdygpIC0gbGFzdFByZXZlbnRlZFRpbWUgPiBQUkVWRU5UX0RVUkFUSU9OKSB7XG4gICAgICByZXR1cm47IC8vIFRvbyBvbGQuXG4gICAgfVxuXG4gICAgdmFyIHRvdWNoZXMgPSBldmVudC50b3VjaGVzICYmIGV2ZW50LnRvdWNoZXMubGVuZ3RoID8gZXZlbnQudG91Y2hlcyA6IFtldmVudF07XG4gICAgdmFyIHggPSB0b3VjaGVzWzBdLmNsaWVudFg7XG4gICAgdmFyIHkgPSB0b3VjaGVzWzBdLmNsaWVudFk7XG4gICAgLy8gV29yayBhcm91bmQgZGVza3RvcCBXZWJraXQgcXVpcmsgd2hlcmUgY2xpY2tpbmcgYSBsYWJlbCB3aWxsIGZpcmUgdHdvIGNsaWNrcyAob24gdGhlIGxhYmVsXG4gICAgLy8gYW5kIG9uIHRoZSBpbnB1dCBlbGVtZW50KS4gRGVwZW5kaW5nIG9uIHRoZSBleGFjdCBicm93c2VyLCB0aGlzIHNlY29uZCBjbGljayB3ZSBkb24ndCB3YW50XG4gICAgLy8gdG8gYnVzdCBoYXMgZWl0aGVyICgwLDApIG9yIG5lZ2F0aXZlIGNvb3JkaW5hdGVzLlxuICAgIGlmICh4IDwgMSAmJiB5IDwgMSkge1xuICAgICAgcmV0dXJuOyAvLyBvZmZzY3JlZW5cbiAgICB9XG5cbiAgICAvLyBMb29rIGZvciBhbiBhbGxvd2FibGUgcmVnaW9uIGNvbnRhaW5pbmcgdGhpcyBjbGljay5cbiAgICAvLyBJZiB3ZSBmaW5kIG9uZSwgdGhhdCBtZWFucyBpdCB3YXMgY3JlYXRlZCBieSB0b3VjaHN0YXJ0IGFuZCBub3QgcmVtb3ZlZCBieVxuICAgIC8vIHByZXZlbnRHaG9zdENsaWNrLCBzbyB3ZSBkb24ndCBidXN0IGl0LlxuICAgIGlmIChjaGVja0FsbG93YWJsZVJlZ2lvbnModG91Y2hDb29yZGluYXRlcywgeCwgeSkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBJZiB3ZSBkaWRuJ3QgZmluZCBhbiBhbGxvd2FibGUgcmVnaW9uLCBidXN0IHRoZSBjbGljay5cbiAgICBldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICB9XG5cblxuICAvLyBHbG9iYWwgdG91Y2hzdGFydCBoYW5kbGVyIHRoYXQgY3JlYXRlcyBhbiBhbGxvd2FibGUgcmVnaW9uIGZvciBhIGNsaWNrIGV2ZW50LlxuICAvLyBUaGlzIGFsbG93YWJsZSByZWdpb24gY2FuIGJlIHJlbW92ZWQgYnkgcHJldmVudEdob3N0Q2xpY2sgaWYgd2Ugd2FudCB0byBidXN0IGl0LlxuICBmdW5jdGlvbiBvblRvdWNoU3RhcnQoZXZlbnQpIHtcbiAgICB2YXIgdG91Y2hlcyA9IGV2ZW50LnRvdWNoZXMgJiYgZXZlbnQudG91Y2hlcy5sZW5ndGggPyBldmVudC50b3VjaGVzIDogW2V2ZW50XTtcbiAgICB2YXIgeCA9IHRvdWNoZXNbMF0uY2xpZW50WDtcbiAgICB2YXIgeSA9IHRvdWNoZXNbMF0uY2xpZW50WTtcbiAgICB0b3VjaENvb3JkaW5hdGVzLnB1c2goeCwgeSk7XG5cbiAgICAkdGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgIC8vIFJlbW92ZSB0aGUgYWxsb3dhYmxlIHJlZ2lvbi5cbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdG91Y2hDb29yZGluYXRlcy5sZW5ndGg7IGkgKz0gMikge1xuICAgICAgICBpZiAodG91Y2hDb29yZGluYXRlc1tpXSA9PSB4ICYmIHRvdWNoQ29vcmRpbmF0ZXNbaSsxXSA9PSB5KSB7XG4gICAgICAgICAgdG91Y2hDb29yZGluYXRlcy5zcGxpY2UoaSwgaSArIDIpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sIFBSRVZFTlRfRFVSQVRJT04sIGZhbHNlKTtcbiAgfVxuXG4gIC8vIE9uIHRoZSBmaXJzdCBjYWxsLCBhdHRhY2hlcyBzb21lIGV2ZW50IGhhbmRsZXJzLiBUaGVuIHdoZW5ldmVyIGl0IGdldHMgY2FsbGVkLCBpdCBjcmVhdGVzIGFcbiAgLy8gem9uZSBhcm91bmQgdGhlIHRvdWNoc3RhcnQgd2hlcmUgY2xpY2tzIHdpbGwgZ2V0IGJ1c3RlZC5cbiAgZnVuY3Rpb24gcHJldmVudEdob3N0Q2xpY2soeCwgeSkge1xuICAgIGlmICghdG91Y2hDb29yZGluYXRlcykge1xuICAgICAgJHJvb3RFbGVtZW50WzBdLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgb25DbGljaywgdHJ1ZSk7XG4gICAgICAkcm9vdEVsZW1lbnRbMF0uYWRkRXZlbnRMaXN0ZW5lcigndG91Y2hzdGFydCcsIG9uVG91Y2hTdGFydCwgdHJ1ZSk7XG4gICAgICB0b3VjaENvb3JkaW5hdGVzID0gW107XG4gICAgfVxuXG4gICAgbGFzdFByZXZlbnRlZFRpbWUgPSBEYXRlLm5vdygpO1xuXG4gICAgY2hlY2tBbGxvd2FibGVSZWdpb25zKHRvdWNoQ29vcmRpbmF0ZXMsIHgsIHkpO1xuICB9XG5cbiAgLy8gQWN0dWFsIGxpbmtpbmcgZnVuY3Rpb24uXG4gIHJldHVybiBmdW5jdGlvbihzY29wZSwgZWxlbWVudCwgYXR0cikge1xuICAgIHZhciBjbGlja0hhbmRsZXIgPSAkcGFyc2UoYXR0ci5uZ0NsaWNrKSxcbiAgICAgICAgdGFwcGluZyA9IGZhbHNlLFxuICAgICAgICB0YXBFbGVtZW50LCAgLy8gVXNlZCB0byBibHVyIHRoZSBlbGVtZW50IGFmdGVyIGEgdGFwLlxuICAgICAgICBzdGFydFRpbWUsICAgLy8gVXNlZCB0byBjaGVjayBpZiB0aGUgdGFwIHdhcyBoZWxkIHRvbyBsb25nLlxuICAgICAgICB0b3VjaFN0YXJ0WCxcbiAgICAgICAgdG91Y2hTdGFydFk7XG5cbiAgICBmdW5jdGlvbiByZXNldFN0YXRlKCkge1xuICAgICAgdGFwcGluZyA9IGZhbHNlO1xuICAgIH1cblxuICAgIGVsZW1lbnQuYmluZCgndG91Y2hzdGFydCcsIGZ1bmN0aW9uKGV2ZW50KSB7XG4gICAgICB0YXBwaW5nID0gdHJ1ZTtcbiAgICAgIHRhcEVsZW1lbnQgPSBldmVudC50YXJnZXQgPyBldmVudC50YXJnZXQgOiBldmVudC5zcmNFbGVtZW50OyAvLyBJRSB1c2VzIHNyY0VsZW1lbnQuXG4gICAgICAvLyBIYWNrIGZvciBTYWZhcmksIHdoaWNoIGNhbiB0YXJnZXQgdGV4dCBub2RlcyBpbnN0ZWFkIG9mIGNvbnRhaW5lcnMuXG4gICAgICBpZih0YXBFbGVtZW50Lm5vZGVUeXBlID09IDMpIHtcbiAgICAgICAgdGFwRWxlbWVudCA9IHRhcEVsZW1lbnQucGFyZW50Tm9kZTtcbiAgICAgIH1cblxuICAgICAgc3RhcnRUaW1lID0gRGF0ZS5ub3coKTtcblxuICAgICAgdmFyIHRvdWNoZXMgPSBldmVudC50b3VjaGVzICYmIGV2ZW50LnRvdWNoZXMubGVuZ3RoID8gZXZlbnQudG91Y2hlcyA6IFtldmVudF07XG4gICAgICB2YXIgZSA9IHRvdWNoZXNbMF0ub3JpZ2luYWxFdmVudCB8fCB0b3VjaGVzWzBdO1xuICAgICAgdG91Y2hTdGFydFggPSBlLmNsaWVudFg7XG4gICAgICB0b3VjaFN0YXJ0WSA9IGUuY2xpZW50WTtcbiAgICB9KTtcblxuICAgIGVsZW1lbnQuYmluZCgndG91Y2htb3ZlJywgZnVuY3Rpb24oZXZlbnQpIHtcbiAgICAgIHJlc2V0U3RhdGUoKTtcbiAgICB9KTtcblxuICAgIGVsZW1lbnQuYmluZCgndG91Y2hjYW5jZWwnLCBmdW5jdGlvbihldmVudCkge1xuICAgICAgcmVzZXRTdGF0ZSgpO1xuICAgIH0pO1xuXG4gICAgZWxlbWVudC5iaW5kKCd0b3VjaGVuZCcsIGZ1bmN0aW9uKGV2ZW50KSB7XG4gICAgICB2YXIgZGlmZiA9IERhdGUubm93KCkgLSBzdGFydFRpbWU7XG5cbiAgICAgIHZhciB0b3VjaGVzID0gKGV2ZW50LmNoYW5nZWRUb3VjaGVzICYmIGV2ZW50LmNoYW5nZWRUb3VjaGVzLmxlbmd0aCkgPyBldmVudC5jaGFuZ2VkVG91Y2hlcyA6XG4gICAgICAgICAgKChldmVudC50b3VjaGVzICYmIGV2ZW50LnRvdWNoZXMubGVuZ3RoKSA/IGV2ZW50LnRvdWNoZXMgOiBbZXZlbnRdKTtcbiAgICAgIHZhciBlID0gdG91Y2hlc1swXS5vcmlnaW5hbEV2ZW50IHx8IHRvdWNoZXNbMF07XG4gICAgICB2YXIgeCA9IGUuY2xpZW50WDtcbiAgICAgIHZhciB5ID0gZS5jbGllbnRZO1xuICAgICAgdmFyIGRpc3QgPSBNYXRoLnNxcnQoIE1hdGgucG93KHggLSB0b3VjaFN0YXJ0WCwgMikgKyBNYXRoLnBvdyh5IC0gdG91Y2hTdGFydFksIDIpICk7XG5cbiAgICAgIGlmICh0YXBwaW5nICYmIGRpZmYgPCBUQVBfRFVSQVRJT04gJiYgZGlzdCA8IE1PVkVfVE9MRVJBTkNFKSB7XG4gICAgICAgIC8vIENhbGwgcHJldmVudEdob3N0Q2xpY2sgc28gdGhlIGNsaWNrYnVzdGVyIHdpbGwgY2F0Y2ggdGhlIGNvcnJlc3BvbmRpbmcgY2xpY2suXG4gICAgICAgIHByZXZlbnRHaG9zdENsaWNrKHgsIHkpO1xuXG4gICAgICAgIC8vIEJsdXIgdGhlIGZvY3VzZWQgZWxlbWVudCAodGhlIGJ1dHRvbiwgcHJvYmFibHkpIGJlZm9yZSBmaXJpbmcgdGhlIGNhbGxiYWNrLlxuICAgICAgICAvLyBUaGlzIGRvZXNuJ3Qgd29yayBwZXJmZWN0bHkgb24gQW5kcm9pZCBDaHJvbWUsIGJ1dCBzZWVtcyB0byB3b3JrIGVsc2V3aGVyZS5cbiAgICAgICAgLy8gSSBjb3VsZG4ndCBnZXQgYW55dGhpbmcgdG8gd29yayByZWxpYWJseSBvbiBBbmRyb2lkIENocm9tZS5cbiAgICAgICAgaWYgKHRhcEVsZW1lbnQpIHtcbiAgICAgICAgICB0YXBFbGVtZW50LmJsdXIoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHNjb3BlLiRhcHBseShmdW5jdGlvbigpIHtcbiAgICAgICAgICAvLyBUT0RPKGJyYWRlbik6IFRoaXMgaXMgc2VuZGluZyB0aGUgdG91Y2hlbmQsIG5vdCBhIHRhcCBvciBjbGljay4gSXMgdGhhdCBrb3NoZXI/XG4gICAgICAgICAgY2xpY2tIYW5kbGVyKHNjb3BlLCB7JGV2ZW50OiBldmVudH0pO1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICAgIHRhcHBpbmcgPSBmYWxzZTtcbiAgICB9KTtcblxuICAgIC8vIEhhY2sgZm9yIGlPUyBTYWZhcmkncyBiZW5lZml0LiBJdCBnb2VzIHNlYXJjaGluZyBmb3Igb25jbGljayBoYW5kbGVycyBhbmQgaXMgbGlhYmxlIHRvIGNsaWNrXG4gICAgLy8gc29tZXRoaW5nIGVsc2UgbmVhcmJ5LlxuICAgIGVsZW1lbnQub25jbGljayA9IGZ1bmN0aW9uKGV2ZW50KSB7IH07XG5cbiAgICAvLyBGYWxsYmFjayBjbGljayBoYW5kbGVyLlxuICAgIC8vIEJ1c3RlZCBjbGlja3MgZG9uJ3QgZ2V0IHRoaXMgZmFyLCBhbmQgYWRkaW5nIHRoaXMgaGFuZGxlciBhbGxvd3MgbmctdGFwIHRvIGJlIHVzZWQgb25cbiAgICAvLyBkZXNrdG9wIGFzIHdlbGwsIHRvIGFsbG93IG1vcmUgcG9ydGFibGUgc2l0ZXMuXG4gICAgZWxlbWVudC5iaW5kKCdjbGljaycsIGZ1bmN0aW9uKGV2ZW50KSB7XG4gICAgICBzY29wZS4kYXBwbHkoZnVuY3Rpb24oKSB7XG4gICAgICAgIGNsaWNrSGFuZGxlcihzY29wZSwgeyRldmVudDogZXZlbnR9KTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9O1xufV0pO1xuXG4vKipcbiAqIEBuZ2RvYyBkaXJlY3RpdmVcbiAqIEBuYW1lIG5nTW9iaWxlLmRpcmVjdGl2ZTpuZ1N3aXBlTGVmdFxuICpcbiAqIEBkZXNjcmlwdGlvblxuICogU3BlY2lmeSBjdXN0b20gYmVoYXZpb3Igd2hlbiBhbiBlbGVtZW50IGlzIHN3aXBlZCB0byB0aGUgbGVmdCBvbiBhIHRvdWNoc2NyZWVuIGRldmljZS5cbiAqIEEgbGVmdHdhcmQgc3dpcGUgaXMgYSBxdWljaywgcmlnaHQtdG8tbGVmdCBzbGlkZSBvZiB0aGUgZmluZ2VyLlxuICogVGhvdWdoIG5nU3dpcGVMZWZ0IGlzIGRlc2lnbmVkIGZvciB0b3VjaC1iYXNlZCBkZXZpY2VzLCBpdCB3aWxsIHdvcmsgd2l0aCBhIG1vdXNlIGNsaWNrIGFuZCBkcmFnIHRvby5cbiAqXG4gKiBAZWxlbWVudCBBTllcbiAqIEBwYXJhbSB7ZXhwcmVzc2lvbn0gbmdTd2lwZUxlZnQge0BsaW5rIGd1aWRlL2V4cHJlc3Npb24gRXhwcmVzc2lvbn0gdG8gZXZhbHVhdGVcbiAqIHVwb24gbGVmdCBzd2lwZS4gKEV2ZW50IG9iamVjdCBpcyBhdmFpbGFibGUgYXMgYCRldmVudGApXG4gKlxuICogQGV4YW1wbGVcbiAgICA8ZG9jOmV4YW1wbGU+XG4gICAgICA8ZG9jOnNvdXJjZT5cbiAgICAgICAgPGRpdiBuZy1zaG93PVwiIXNob3dBY3Rpb25zXCIgbmctc3dpcGUtbGVmdD1cInNob3dBY3Rpb25zID0gdHJ1ZVwiPlxuICAgICAgICAgIFNvbWUgbGlzdCBjb250ZW50LCBsaWtlIGFuIGVtYWlsIGluIHRoZSBpbmJveFxuICAgICAgICA8L2Rpdj5cbiAgICAgICAgPGRpdiBuZy1zaG93PVwic2hvd0FjdGlvbnNcIiBuZy1zd2lwZS1yaWdodD1cInNob3dBY3Rpb25zID0gZmFsc2VcIj5cbiAgICAgICAgICA8YnV0dG9uIG5nLWNsaWNrPVwicmVwbHkoKVwiPlJlcGx5PC9idXR0b24+XG4gICAgICAgICAgPGJ1dHRvbiBuZy1jbGljaz1cImRlbGV0ZSgpXCI+RGVsZXRlPC9idXR0b24+XG4gICAgICAgIDwvZGl2PlxuICAgICAgPC9kb2M6c291cmNlPlxuICAgIDwvZG9jOmV4YW1wbGU+XG4gKi9cblxuLyoqXG4gKiBAbmdkb2MgZGlyZWN0aXZlXG4gKiBAbmFtZSBuZ01vYmlsZS5kaXJlY3RpdmU6bmdTd2lwZVJpZ2h0XG4gKlxuICogQGRlc2NyaXB0aW9uXG4gKiBTcGVjaWZ5IGN1c3RvbSBiZWhhdmlvciB3aGVuIGFuIGVsZW1lbnQgaXMgc3dpcGVkIHRvIHRoZSByaWdodCBvbiBhIHRvdWNoc2NyZWVuIGRldmljZS5cbiAqIEEgcmlnaHR3YXJkIHN3aXBlIGlzIGEgcXVpY2ssIGxlZnQtdG8tcmlnaHQgc2xpZGUgb2YgdGhlIGZpbmdlci5cbiAqIFRob3VnaCBuZ1N3aXBlUmlnaHQgaXMgZGVzaWduZWQgZm9yIHRvdWNoLWJhc2VkIGRldmljZXMsIGl0IHdpbGwgd29yayB3aXRoIGEgbW91c2UgY2xpY2sgYW5kIGRyYWcgdG9vLlxuICpcbiAqIEBlbGVtZW50IEFOWVxuICogQHBhcmFtIHtleHByZXNzaW9ufSBuZ1N3aXBlUmlnaHQge0BsaW5rIGd1aWRlL2V4cHJlc3Npb24gRXhwcmVzc2lvbn0gdG8gZXZhbHVhdGVcbiAqIHVwb24gcmlnaHQgc3dpcGUuIChFdmVudCBvYmplY3QgaXMgYXZhaWxhYmxlIGFzIGAkZXZlbnRgKVxuICpcbiAqIEBleGFtcGxlXG4gICAgPGRvYzpleGFtcGxlPlxuICAgICAgPGRvYzpzb3VyY2U+XG4gICAgICAgIDxkaXYgbmctc2hvdz1cIiFzaG93QWN0aW9uc1wiIG5nLXN3aXBlLWxlZnQ9XCJzaG93QWN0aW9ucyA9IHRydWVcIj5cbiAgICAgICAgICBTb21lIGxpc3QgY29udGVudCwgbGlrZSBhbiBlbWFpbCBpbiB0aGUgaW5ib3hcbiAgICAgICAgPC9kaXY+XG4gICAgICAgIDxkaXYgbmctc2hvdz1cInNob3dBY3Rpb25zXCIgbmctc3dpcGUtcmlnaHQ9XCJzaG93QWN0aW9ucyA9IGZhbHNlXCI+XG4gICAgICAgICAgPGJ1dHRvbiBuZy1jbGljaz1cInJlcGx5KClcIj5SZXBseTwvYnV0dG9uPlxuICAgICAgICAgIDxidXR0b24gbmctY2xpY2s9XCJkZWxldGUoKVwiPkRlbGV0ZTwvYnV0dG9uPlxuICAgICAgICA8L2Rpdj5cbiAgICAgIDwvZG9jOnNvdXJjZT5cbiAgICA8L2RvYzpleGFtcGxlPlxuICovXG5cbmZ1bmN0aW9uIG1ha2VTd2lwZURpcmVjdGl2ZShkaXJlY3RpdmVOYW1lLCBkaXJlY3Rpb24pIHtcbiAgbmdNb2JpbGUuZGlyZWN0aXZlKGRpcmVjdGl2ZU5hbWUsIFsnJHBhcnNlJywgJyRzd2lwZScsIGZ1bmN0aW9uKCRwYXJzZSwgJHN3aXBlKSB7XG4gICAgLy8gVGhlIG1heGltdW0gdmVydGljYWwgZGVsdGEgZm9yIGEgc3dpcGUgc2hvdWxkIGJlIGxlc3MgdGhhbiA3NXB4LlxuICAgIHZhciBNQVhfVkVSVElDQUxfRElTVEFOQ0UgPSA3NTtcbiAgICAvLyBWZXJ0aWNhbCBkaXN0YW5jZSBzaG91bGQgbm90IGJlIG1vcmUgdGhhbiBhIGZyYWN0aW9uIG9mIHRoZSBob3Jpem9udGFsIGRpc3RhbmNlLlxuICAgIHZhciBNQVhfVkVSVElDQUxfUkFUSU8gPSAwLjM7XG4gICAgLy8gQXQgbGVhc3QgYSAzMHB4IGxhdGVyYWwgbW90aW9uIGlzIG5lY2Vzc2FyeSBmb3IgYSBzd2lwZS5cbiAgICB2YXIgTUlOX0hPUklaT05UQUxfRElTVEFOQ0UgPSAzMDtcblxuICAgIHJldHVybiBmdW5jdGlvbihzY29wZSwgZWxlbWVudCwgYXR0cikge1xuICAgICAgdmFyIHN3aXBlSGFuZGxlciA9ICRwYXJzZShhdHRyW2RpcmVjdGl2ZU5hbWVdKTtcblxuICAgICAgdmFyIHN0YXJ0Q29vcmRzLCB2YWxpZDtcblxuICAgICAgZnVuY3Rpb24gdmFsaWRTd2lwZShjb29yZHMpIHtcbiAgICAgICAgLy8gQ2hlY2sgdGhhdCBpdCdzIHdpdGhpbiB0aGUgY29vcmRpbmF0ZXMuXG4gICAgICAgIC8vIEFic29sdXRlIHZlcnRpY2FsIGRpc3RhbmNlIG11c3QgYmUgd2l0aGluIHRvbGVyYW5jZXMuXG4gICAgICAgIC8vIEhvcml6b250YWwgZGlzdGFuY2UsIHdlIHRha2UgdGhlIGN1cnJlbnQgWCAtIHRoZSBzdGFydGluZyBYLlxuICAgICAgICAvLyBUaGlzIGlzIG5lZ2F0aXZlIGZvciBsZWZ0d2FyZCBzd2lwZXMgYW5kIHBvc2l0aXZlIGZvciByaWdodHdhcmQgc3dpcGVzLlxuICAgICAgICAvLyBBZnRlciBtdWx0aXBseWluZyBieSB0aGUgZGlyZWN0aW9uICgtMSBmb3IgbGVmdCwgKzEgZm9yIHJpZ2h0KSwgbGVnYWwgc3dpcGVzXG4gICAgICAgIC8vIChpZS4gc2FtZSBkaXJlY3Rpb24gYXMgdGhlIGRpcmVjdGl2ZSB3YW50cykgd2lsbCBoYXZlIGEgcG9zaXRpdmUgZGVsdGEgYW5kXG4gICAgICAgIC8vIGlsbGVnYWwgb25lcyBhIG5lZ2F0aXZlIGRlbHRhLlxuICAgICAgICAvLyBUaGVyZWZvcmUgdGhpcyBkZWx0YSBtdXN0IGJlIHBvc2l0aXZlLCBhbmQgbGFyZ2VyIHRoYW4gdGhlIG1pbmltdW0uXG4gICAgICAgIGlmICghc3RhcnRDb29yZHMpIHJldHVybiBmYWxzZTtcbiAgICAgICAgdmFyIGRlbHRhWSA9IE1hdGguYWJzKGNvb3Jkcy55IC0gc3RhcnRDb29yZHMueSk7XG4gICAgICAgIHZhciBkZWx0YVggPSAoY29vcmRzLnggLSBzdGFydENvb3Jkcy54KSAqIGRpcmVjdGlvbjtcbiAgICAgICAgcmV0dXJuIHZhbGlkICYmIC8vIFNob3J0IGNpcmN1aXQgZm9yIGFscmVhZHktaW52YWxpZGF0ZWQgc3dpcGVzLlxuICAgICAgICAgICAgZGVsdGFZIDwgTUFYX1ZFUlRJQ0FMX0RJU1RBTkNFICYmXG4gICAgICAgICAgICBkZWx0YVggPiAwICYmXG4gICAgICAgICAgICBkZWx0YVggPiBNSU5fSE9SSVpPTlRBTF9ESVNUQU5DRSAmJlxuICAgICAgICAgICAgZGVsdGFZIC8gZGVsdGFYIDwgTUFYX1ZFUlRJQ0FMX1JBVElPO1xuICAgICAgfVxuXG4gICAgICAkc3dpcGUuYmluZChlbGVtZW50LCB7XG4gICAgICAgICdzdGFydCc6IGZ1bmN0aW9uKGNvb3Jkcykge1xuICAgICAgICAgIHN0YXJ0Q29vcmRzID0gY29vcmRzO1xuICAgICAgICAgIHZhbGlkID0gdHJ1ZTtcbiAgICAgICAgfSxcbiAgICAgICAgJ2NhbmNlbCc6IGZ1bmN0aW9uKCkge1xuICAgICAgICAgIHZhbGlkID0gZmFsc2U7XG4gICAgICAgIH0sXG4gICAgICAgICdlbmQnOiBmdW5jdGlvbihjb29yZHMpIHtcbiAgICAgICAgICBpZiAodmFsaWRTd2lwZShjb29yZHMpKSB7XG4gICAgICAgICAgICBzY29wZS4kYXBwbHkoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgIHN3aXBlSGFuZGxlcihzY29wZSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH07XG4gIH1dKTtcbn1cblxuLy8gTGVmdCBpcyBuZWdhdGl2ZSBYLWNvb3JkaW5hdGUsIHJpZ2h0IGlzIHBvc2l0aXZlLlxubWFrZVN3aXBlRGlyZWN0aXZlKCduZ1N3aXBlTGVmdCcsIC0xKTtcbm1ha2VTd2lwZURpcmVjdGl2ZSgnbmdTd2lwZVJpZ2h0JywgMSk7XG5cblxuXG59KSh3aW5kb3csIHdpbmRvdy5hbmd1bGFyKTtcbiIsIid1c2Ugc3RyaWN0JztcblxuKGZ1bmN0aW9uKCkge1xuICB2YXIgbXNpZSA9IHBhcnNlSW50KCgvbXNpZSAoXFxkKykvLmV4ZWMobmF2aWdhdG9yLnVzZXJBZ2VudC50b0xvd2VyQ2FzZSgpKSB8fCBbXSlbMV0sIDEwKTtcblxuICBmdW5jdGlvbiBpbmRleE9mKGFycmF5LCBvYmopIHtcbiAgICBpZiAoYXJyYXkuaW5kZXhPZikgcmV0dXJuIGFycmF5LmluZGV4T2Yob2JqKTtcblxuICAgIGZvciAoIHZhciBpID0gMDsgaSA8IGFycmF5Lmxlbmd0aDsgaSsrKSB7XG4gICAgICBpZiAob2JqID09PSBhcnJheVtpXSkgcmV0dXJuIGk7XG4gICAgfVxuICAgIHJldHVybiAtMTtcbiAgfVxuXG5cblxuICAvKipcbiAgICogVHJpZ2dlcnMgYSBicm93c2VyIGV2ZW50LiBBdHRlbXB0cyB0byBjaG9vc2UgdGhlIHJpZ2h0IGV2ZW50IGlmIG9uZSBpc1xuICAgKiBub3Qgc3BlY2lmaWVkLlxuICAgKlxuICAgKiBAcGFyYW0ge09iamVjdH0gZWxlbWVudCBFaXRoZXIgYSB3cmFwcGVkIGpRdWVyeS9qcUxpdGUgbm9kZSBvciBhIERPTUVsZW1lbnRcbiAgICogQHBhcmFtIHtzdHJpbmd9IGV2ZW50VHlwZSBPcHRpb25hbCBldmVudCB0eXBlLlxuICAgKiBAcGFyYW0ge0FycmF5LjxzdHJpbmc+PX0ga2V5cyBPcHRpb25hbCBsaXN0IG9mIHByZXNzZWQga2V5c1xuICAgKiAgICAgICAgKHZhbGlkIHZhbHVlczogJ2FsdCcsICdtZXRhJywgJ3NoaWZ0JywgJ2N0cmwnKVxuICAgKiBAcGFyYW0ge251bWJlcn0geCBPcHRpb25hbCB4LWNvb3JkaW5hdGUgZm9yIG1vdXNlL3RvdWNoIGV2ZW50cy5cbiAgICogQHBhcmFtIHtudW1iZXJ9IHkgT3B0aW9uYWwgeS1jb29yZGluYXRlIGZvciBtb3VzZS90b3VjaCBldmVudHMuXG4gICAqL1xuICB3aW5kb3cuYnJvd3NlclRyaWdnZXIgPSBmdW5jdGlvbiBicm93c2VyVHJpZ2dlcihlbGVtZW50LCBldmVudFR5cGUsIGtleXMsIHgsIHkpIHtcbiAgICBpZiAoZWxlbWVudCAmJiAhZWxlbWVudC5ub2RlTmFtZSkgZWxlbWVudCA9IGVsZW1lbnRbMF07XG4gICAgaWYgKCFlbGVtZW50KSByZXR1cm47XG5cbiAgICB2YXIgaW5wdXRUeXBlID0gKGVsZW1lbnQudHlwZSkgPyBlbGVtZW50LnR5cGUudG9Mb3dlckNhc2UoKSA6IG51bGwsXG4gICAgICAgIG5vZGVOYW1lID0gZWxlbWVudC5ub2RlTmFtZS50b0xvd2VyQ2FzZSgpO1xuXG4gICAgaWYgKCFldmVudFR5cGUpIHtcbiAgICAgIGV2ZW50VHlwZSA9IHtcbiAgICAgICAgJ3RleHQnOiAgICAgICAgICAgICdjaGFuZ2UnLFxuICAgICAgICAndGV4dGFyZWEnOiAgICAgICAgJ2NoYW5nZScsXG4gICAgICAgICdoaWRkZW4nOiAgICAgICAgICAnY2hhbmdlJyxcbiAgICAgICAgJ3Bhc3N3b3JkJzogICAgICAgICdjaGFuZ2UnLFxuICAgICAgICAnYnV0dG9uJzogICAgICAgICAgJ2NsaWNrJyxcbiAgICAgICAgJ3N1Ym1pdCc6ICAgICAgICAgICdjbGljaycsXG4gICAgICAgICdyZXNldCc6ICAgICAgICAgICAnY2xpY2snLFxuICAgICAgICAnaW1hZ2UnOiAgICAgICAgICAgJ2NsaWNrJyxcbiAgICAgICAgJ2NoZWNrYm94JzogICAgICAgICdjbGljaycsXG4gICAgICAgICdyYWRpbyc6ICAgICAgICAgICAnY2xpY2snLFxuICAgICAgICAnc2VsZWN0LW9uZSc6ICAgICAgJ2NoYW5nZScsXG4gICAgICAgICdzZWxlY3QtbXVsdGlwbGUnOiAnY2hhbmdlJyxcbiAgICAgICAgJ19kZWZhdWx0Xyc6ICAgICAgICdjbGljaydcbiAgICAgIH1baW5wdXRUeXBlIHx8ICdfZGVmYXVsdF8nXTtcbiAgICB9XG5cbiAgICBpZiAobm9kZU5hbWUgPT0gJ29wdGlvbicpIHtcbiAgICAgIGVsZW1lbnQucGFyZW50Tm9kZS52YWx1ZSA9IGVsZW1lbnQudmFsdWU7XG4gICAgICBlbGVtZW50ID0gZWxlbWVudC5wYXJlbnROb2RlO1xuICAgICAgZXZlbnRUeXBlID0gJ2NoYW5nZSc7XG4gICAgfVxuXG4gICAga2V5cyA9IGtleXMgfHwgW107XG4gICAgZnVuY3Rpb24gcHJlc3NlZChrZXkpIHtcbiAgICAgIHJldHVybiBpbmRleE9mKGtleXMsIGtleSkgIT09IC0xO1xuICAgIH1cblxuICAgIGlmIChtc2llIDwgOSkge1xuICAgICAgaWYgKGlucHV0VHlwZSA9PSAncmFkaW8nIHx8IGlucHV0VHlwZSA9PSAnY2hlY2tib3gnKSB7XG4gICAgICAgICAgZWxlbWVudC5jaGVja2VkID0gIWVsZW1lbnQuY2hlY2tlZDtcbiAgICAgIH1cblxuICAgICAgLy8gV1RGISEhIEVycm9yOiBVbnNwZWNpZmllZCBlcnJvci5cbiAgICAgIC8vIERvbid0IGtub3cgd2h5LCBidXQgc29tZSBlbGVtZW50cyB3aGVuIGRldGFjaGVkIHNlZW0gdG8gYmUgaW4gaW5jb25zaXN0ZW50IHN0YXRlIGFuZFxuICAgICAgLy8gY2FsbGluZyAuZmlyZUV2ZW50KCkgb24gdGhlbSB3aWxsIHJlc3VsdCBpbiB2ZXJ5IHVuaGVscGZ1bCBlcnJvciAoRXJyb3I6IFVuc3BlY2lmaWVkIGVycm9yKVxuICAgICAgLy8gZm9yY2luZyB0aGUgYnJvd3NlciB0byBjb21wdXRlIHRoZSBlbGVtZW50IHBvc2l0aW9uIChieSByZWFkaW5nIGl0cyBDU1MpXG4gICAgICAvLyBwdXRzIHRoZSBlbGVtZW50IGluIGNvbnNpc3RlbnQgc3RhdGUuXG4gICAgICBlbGVtZW50LnN0eWxlLnBvc0xlZnQ7XG5cbiAgICAgIC8vIFRPRE8odm9qdGEpOiBjcmVhdGUgZXZlbnQgb2JqZWN0cyB3aXRoIHByZXNzZWQga2V5cyB0byBnZXQgaXQgd29ya2luZyBvbiBJRTw5XG4gICAgICB2YXIgcmV0ID0gZWxlbWVudC5maXJlRXZlbnQoJ29uJyArIGV2ZW50VHlwZSk7XG4gICAgICBpZiAoaW5wdXRUeXBlID09ICdzdWJtaXQnKSB7XG4gICAgICAgIHdoaWxlKGVsZW1lbnQpIHtcbiAgICAgICAgICBpZiAoZWxlbWVudC5ub2RlTmFtZS50b0xvd2VyQ2FzZSgpID09ICdmb3JtJykge1xuICAgICAgICAgICAgZWxlbWVudC5maXJlRXZlbnQoJ29uc3VibWl0Jyk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG4gICAgICAgICAgZWxlbWVudCA9IGVsZW1lbnQucGFyZW50Tm9kZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIHJldDtcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIGV2bnQgPSBkb2N1bWVudC5jcmVhdGVFdmVudCgnTW91c2VFdmVudHMnKSxcbiAgICAgICAgICBvcmlnaW5hbFByZXZlbnREZWZhdWx0ID0gZXZudC5wcmV2ZW50RGVmYXVsdCxcbiAgICAgICAgICBhcHBXaW5kb3cgPSBlbGVtZW50Lm93bmVyRG9jdW1lbnQuZGVmYXVsdFZpZXcsXG4gICAgICAgICAgZmFrZVByb2Nlc3NEZWZhdWx0ID0gdHJ1ZSxcbiAgICAgICAgICBmaW5hbFByb2Nlc3NEZWZhdWx0LFxuICAgICAgICAgIGFuZ3VsYXIgPSBhcHBXaW5kb3cuYW5ndWxhciB8fCB7fTtcblxuICAgICAgLy8gaWdvcjogdGVtcG9yYXJ5IGZpeCBmb3IgaHR0cHM6Ly9idWd6aWxsYS5tb3ppbGxhLm9yZy9zaG93X2J1Zy5jZ2k/aWQ9Njg0MjA4XG4gICAgICBhbmd1bGFyWydmZi02ODQyMDgtcHJldmVudERlZmF1bHQnXSA9IGZhbHNlO1xuICAgICAgZXZudC5wcmV2ZW50RGVmYXVsdCA9IGZ1bmN0aW9uKCkge1xuICAgICAgICBmYWtlUHJvY2Vzc0RlZmF1bHQgPSBmYWxzZTtcbiAgICAgICAgcmV0dXJuIG9yaWdpbmFsUHJldmVudERlZmF1bHQuYXBwbHkoZXZudCwgYXJndW1lbnRzKTtcbiAgICAgIH07XG5cbiAgICAgIHggPSB4IHx8IDA7XG4gICAgICB5ID0geSB8fCAwO1xuICAgICAgZXZudC5pbml0TW91c2VFdmVudChldmVudFR5cGUsIHRydWUsIHRydWUsIHdpbmRvdywgMCwgeCwgeSwgeCwgeSwgcHJlc3NlZCgnY3RybCcpLCBwcmVzc2VkKCdhbHQnKSxcbiAgICAgICAgICBwcmVzc2VkKCdzaGlmdCcpLCBwcmVzc2VkKCdtZXRhJyksIDAsIGVsZW1lbnQpO1xuXG4gICAgICBlbGVtZW50LmRpc3BhdGNoRXZlbnQoZXZudCk7XG4gICAgICBmaW5hbFByb2Nlc3NEZWZhdWx0ID0gIShhbmd1bGFyWydmZi02ODQyMDgtcHJldmVudERlZmF1bHQnXSB8fCAhZmFrZVByb2Nlc3NEZWZhdWx0KTtcblxuICAgICAgZGVsZXRlIGFuZ3VsYXJbJ2ZmLTY4NDIwOC1wcmV2ZW50RGVmYXVsdCddO1xuXG4gICAgICByZXR1cm4gZmluYWxQcm9jZXNzRGVmYXVsdDtcbiAgICB9XG4gIH1cbn0oKSk7XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBjYXJvdXNlbEF1dG9TbGlkZSA9IGFuZ3VsYXIubW9kdWxlKCdhbmd1bGFyLWNhcm91c2VsJylcbi5kaXJlY3RpdmUoJ3JuQ2Fyb3VzZWxBdXRvU2xpZGUnLCBbJyRpbnRlcnZhbCcsIGZ1bmN0aW9uKCRpbnRlcnZhbCkge1xuICByZXR1cm4ge1xuICAgIHJlc3RyaWN0OiAnQScsXG4gICAgbGluazogZnVuY3Rpb24gKHNjb3BlLCBlbGVtZW50LCBhdHRycykge1xuICAgICAgICB2YXIgc3RvcEF1dG9QbGF5ID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBpZiAoc2NvcGUuYXV0b1NsaWRlcikge1xuICAgICAgICAgICAgICAgICRpbnRlcnZhbC5jYW5jZWwoc2NvcGUuYXV0b1NsaWRlcik7XG4gICAgICAgICAgICAgICAgc2NvcGUuYXV0b1NsaWRlciA9IG51bGw7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHZhciByZXN0YXJ0VGltZXIgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHNjb3BlLmF1dG9TbGlkZSgpO1xuICAgICAgICB9O1xuXG4gICAgICAgIHNjb3BlLiR3YXRjaCgnY2Fyb3VzZWxJbmRleCcsIHJlc3RhcnRUaW1lcik7XG5cbiAgICAgICAgaWYgKGF0dHJzLmhhc093blByb3BlcnR5KCdybkNhcm91c2VsUGF1c2VPbkhvdmVyJykgJiYgYXR0cnMucm5DYXJvdXNlbFBhdXNlT25Ib3ZlciAhPT0gJ2ZhbHNlJyl7XG4gICAgICAgICAgICBlbGVtZW50Lm9uKCdtb3VzZWVudGVyJywgc3RvcEF1dG9QbGF5KTtcbiAgICAgICAgICAgIGVsZW1lbnQub24oJ21vdXNlbGVhdmUnLCByZXN0YXJ0VGltZXIpO1xuICAgICAgICB9XG5cbiAgICAgICAgc2NvcGUuJG9uKCckZGVzdHJveScsIGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICBzdG9wQXV0b1BsYXkoKTtcbiAgICAgICAgICAgIGVsZW1lbnQub2ZmKCdtb3VzZWVudGVyJywgc3RvcEF1dG9QbGF5KTtcbiAgICAgICAgICAgIGVsZW1lbnQub2ZmKCdtb3VzZWxlYXZlJywgcmVzdGFydFRpbWVyKTtcbiAgICAgICAgfSk7XG4gICAgfVxuICB9O1xufV0pO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGNhcm91c2VsQXV0b1NsaWRlO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgQW5ndWxhckNhcm91c2VsID0gYW5ndWxhci5tb2R1bGUoJ2FuZ3VsYXItY2Fyb3VzZWwnKVxuLnNlcnZpY2UoJ0RldmljZUNhcGFiaWxpdGllcycsIGZ1bmN0aW9uKCkge1xuICAgIC8vIFRPRE86IG1lcmdlIGluIGEgc2luZ2xlIGZ1bmN0aW9uXG5cbiAgICAvLyBkZXRlY3Qgc3VwcG9ydGVkIENTUyBwcm9wZXJ0eVxuICAgIGZ1bmN0aW9uIGRldGVjdFRyYW5zZm9ybVByb3BlcnR5KCkge1xuICAgICAgICB2YXIgdHJhbnNmb3JtUHJvcGVydHkgPSAndHJhbnNmb3JtJyxcbiAgICAgICAgICAgIHNhZmFyaVByb3BlcnR5SGFjayA9ICd3ZWJraXRUcmFuc2Zvcm0nO1xuICAgICAgICBpZiAodHlwZW9mIGRvY3VtZW50LmJvZHkuc3R5bGVbdHJhbnNmb3JtUHJvcGVydHldICE9PSAndW5kZWZpbmVkJykge1xuXG4gICAgICAgICAgICBbJ3dlYmtpdCcsICdtb3onLCAnbycsICdtcyddLmV2ZXJ5KGZ1bmN0aW9uIChwcmVmaXgpIHtcbiAgICAgICAgICAgICAgICB2YXIgZSA9ICctJyArIHByZWZpeCArICctdHJhbnNmb3JtJztcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGRvY3VtZW50LmJvZHkuc3R5bGVbZV0gIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICAgICAgICAgIHRyYW5zZm9ybVByb3BlcnR5ID0gZTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBkb2N1bWVudC5ib2R5LnN0eWxlW3NhZmFyaVByb3BlcnR5SGFja10gIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICB0cmFuc2Zvcm1Qcm9wZXJ0eSA9ICctd2Via2l0LXRyYW5zZm9ybSc7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0cmFuc2Zvcm1Qcm9wZXJ0eSA9IHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdHJhbnNmb3JtUHJvcGVydHk7XG4gICAgfVxuXG4gICAgLy9EZXRlY3Qgc3VwcG9ydCBvZiB0cmFuc2xhdGUzZFxuICAgIGZ1bmN0aW9uIGRldGVjdDNkU3VwcG9ydCgpIHtcbiAgICAgICAgdmFyIGVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgncCcpLFxuICAgICAgICAgICAgaGFzM2QsXG4gICAgICAgICAgICB0cmFuc2Zvcm1zID0ge1xuICAgICAgICAgICAgICAgICd3ZWJraXRUcmFuc2Zvcm0nOiAnLXdlYmtpdC10cmFuc2Zvcm0nLFxuICAgICAgICAgICAgICAgICdtc1RyYW5zZm9ybSc6ICctbXMtdHJhbnNmb3JtJyxcbiAgICAgICAgICAgICAgICAndHJhbnNmb3JtJzogJ3RyYW5zZm9ybSdcbiAgICAgICAgICAgIH07XG4gICAgICAgIC8vIEFkZCBpdCB0byB0aGUgYm9keSB0byBnZXQgdGhlIGNvbXB1dGVkIHN0eWxlXG4gICAgICAgIGRvY3VtZW50LmJvZHkuaW5zZXJ0QmVmb3JlKGVsLCBudWxsKTtcbiAgICAgICAgZm9yICh2YXIgdCBpbiB0cmFuc2Zvcm1zKSB7XG4gICAgICAgICAgICBpZiAoZWwuc3R5bGVbdF0gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIGVsLnN0eWxlW3RdID0gJ3RyYW5zbGF0ZTNkKDFweCwxcHgsMXB4KSc7XG4gICAgICAgICAgICAgICAgaGFzM2QgPSB3aW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZShlbCkuZ2V0UHJvcGVydHlWYWx1ZSh0cmFuc2Zvcm1zW3RdKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBkb2N1bWVudC5ib2R5LnJlbW92ZUNoaWxkKGVsKTtcbiAgICAgICAgcmV0dXJuIChoYXMzZCAhPT0gdW5kZWZpbmVkICYmIGhhczNkLmxlbmd0aCA+IDAgJiYgaGFzM2QgIT09IFwibm9uZVwiKTtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBoYXMzZDogZGV0ZWN0M2RTdXBwb3J0KCksXG4gICAgICAgIHRyYW5zZm9ybVByb3BlcnR5OiBkZXRlY3RUcmFuc2Zvcm1Qcm9wZXJ0eSgpXG4gICAgfTtcblxufSlcblxuLnNlcnZpY2UoJ2NvbXB1dGVDYXJvdXNlbFNsaWRlU3R5bGUnLCBmdW5jdGlvbihEZXZpY2VDYXBhYmlsaXRpZXMpIHtcbiAgICAvLyBjb21wdXRlIHRyYW5zaXRpb24gdHJhbnNmb3JtIHByb3BlcnRpZXMgZm9yIGEgZ2l2ZW4gc2xpZGUgYW5kIGdsb2JhbCBvZmZzZXRcbiAgICByZXR1cm4gZnVuY3Rpb24oc2xpZGVJbmRleCwgb2Zmc2V0LCB0cmFuc2l0aW9uVHlwZSkge1xuICAgICAgICB2YXIgc3R5bGUgPSB7XG4gICAgICAgICAgICAgICAgZGlzcGxheTogJ2lubGluZS1ibG9jaydcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBvcGFjaXR5LFxuICAgICAgICAgICAgYWJzb2x1dGVMZWZ0ID0gKHNsaWRlSW5kZXggKiAxMDApICsgb2Zmc2V0LFxuICAgICAgICAgICAgc2xpZGVUcmFuc2Zvcm1WYWx1ZSA9IERldmljZUNhcGFiaWxpdGllcy5oYXMzZCA/ICd0cmFuc2xhdGUzZCgnICsgYWJzb2x1dGVMZWZ0ICsgJyUsIDAsIDApJyA6ICd0cmFuc2xhdGUzZCgnICsgYWJzb2x1dGVMZWZ0ICsgJyUsIDApJyxcbiAgICAgICAgICAgIGRpc3RhbmNlID0gKCgxMDAgLSBNYXRoLmFicyhhYnNvbHV0ZUxlZnQpKSAvIDEwMCk7XG5cbiAgICAgICAgaWYgKCFEZXZpY2VDYXBhYmlsaXRpZXMudHJhbnNmb3JtUHJvcGVydHkpIHtcbiAgICAgICAgICAgIC8vIGZhbGxiYWNrIHRvIGRlZmF1bHQgc2xpZGUgaWYgdHJhbnNmb3JtUHJvcGVydHkgaXMgbm90IGF2YWlsYWJsZVxuICAgICAgICAgICAgc3R5bGVbJ21hcmdpbi1sZWZ0J10gPSBhYnNvbHV0ZUxlZnQgKyAnJSc7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpZiAodHJhbnNpdGlvblR5cGUgPT0gJ2ZhZGVBbmRTbGlkZScpIHtcbiAgICAgICAgICAgICAgICBzdHlsZVtEZXZpY2VDYXBhYmlsaXRpZXMudHJhbnNmb3JtUHJvcGVydHldID0gc2xpZGVUcmFuc2Zvcm1WYWx1ZTtcbiAgICAgICAgICAgICAgICBvcGFjaXR5ID0gMDtcbiAgICAgICAgICAgICAgICBpZiAoTWF0aC5hYnMoYWJzb2x1dGVMZWZ0KSA8IDEwMCkge1xuICAgICAgICAgICAgICAgICAgICBvcGFjaXR5ID0gMC4zICsgZGlzdGFuY2UgKiAwLjc7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHN0eWxlLm9wYWNpdHkgPSBvcGFjaXR5O1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0cmFuc2l0aW9uVHlwZSA9PSAnaGV4YWdvbicpIHtcbiAgICAgICAgICAgICAgICB2YXIgdHJhbnNmb3JtRnJvbSA9IDEwMCxcbiAgICAgICAgICAgICAgICAgICAgZGVncmVlcyA9IDAsXG4gICAgICAgICAgICAgICAgICAgIG1heERlZ3JlZXMgPSA2MCAqIChkaXN0YW5jZSAtIDEpO1xuXG4gICAgICAgICAgICAgICAgdHJhbnNmb3JtRnJvbSA9IG9mZnNldCA8IChzbGlkZUluZGV4ICogLTEwMCkgPyAxMDAgOiAwO1xuICAgICAgICAgICAgICAgIGRlZ3JlZXMgPSBvZmZzZXQgPCAoc2xpZGVJbmRleCAqIC0xMDApID8gbWF4RGVncmVlcyA6IC1tYXhEZWdyZWVzO1xuICAgICAgICAgICAgICAgIHN0eWxlW0RldmljZUNhcGFiaWxpdGllcy50cmFuc2Zvcm1Qcm9wZXJ0eV0gPSBzbGlkZVRyYW5zZm9ybVZhbHVlICsgJyAnICsgJ3JvdGF0ZVkoJyArIGRlZ3JlZXMgKyAnZGVnKSc7XG4gICAgICAgICAgICAgICAgc3R5bGVbRGV2aWNlQ2FwYWJpbGl0aWVzLnRyYW5zZm9ybVByb3BlcnR5ICsgJy1vcmlnaW4nXSA9IHRyYW5zZm9ybUZyb20gKyAnJSA1MCUnO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0cmFuc2l0aW9uVHlwZSA9PSAnem9vbScpIHtcbiAgICAgICAgICAgICAgICBzdHlsZVtEZXZpY2VDYXBhYmlsaXRpZXMudHJhbnNmb3JtUHJvcGVydHldID0gc2xpZGVUcmFuc2Zvcm1WYWx1ZTtcbiAgICAgICAgICAgICAgICB2YXIgc2NhbGUgPSAxO1xuICAgICAgICAgICAgICAgIGlmIChNYXRoLmFicyhhYnNvbHV0ZUxlZnQpIDwgMTAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHNjYWxlID0gMSArICgoMSAtIGRpc3RhbmNlKSAqIDIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBzdHlsZVtEZXZpY2VDYXBhYmlsaXRpZXMudHJhbnNmb3JtUHJvcGVydHldICs9ICcgc2NhbGUoJyArIHNjYWxlICsgJyknO1xuICAgICAgICAgICAgICAgIHN0eWxlW0RldmljZUNhcGFiaWxpdGllcy50cmFuc2Zvcm1Qcm9wZXJ0eSArICctb3JpZ2luJ10gPSAnNTAlIDUwJSc7XG4gICAgICAgICAgICAgICAgb3BhY2l0eSA9IDA7XG4gICAgICAgICAgICAgICAgaWYgKE1hdGguYWJzKGFic29sdXRlTGVmdCkgPCAxMDApIHtcbiAgICAgICAgICAgICAgICAgICAgb3BhY2l0eSA9IDAuMyArIGRpc3RhbmNlICogMC43O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBzdHlsZS5vcGFjaXR5ID0gb3BhY2l0eTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgc3R5bGVbRGV2aWNlQ2FwYWJpbGl0aWVzLnRyYW5zZm9ybVByb3BlcnR5XSA9IHNsaWRlVHJhbnNmb3JtVmFsdWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHN0eWxlO1xuICAgIH07XG59KVxuXG4uc2VydmljZSgnY3JlYXRlU3R5bGVTdHJpbmcnLCBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24ob2JqZWN0KSB7XG4gICAgICAgIHZhciBzdHlsZXMgPSBbXTtcbiAgICAgICAgYW5ndWxhci5mb3JFYWNoKG9iamVjdCwgZnVuY3Rpb24odmFsdWUsIGtleSkge1xuICAgICAgICAgICAgc3R5bGVzLnB1c2goa2V5ICsgJzonICsgdmFsdWUpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHN0eWxlcy5qb2luKCc7Jyk7XG4gICAgfTtcbn0pXG5cbi5kaXJlY3RpdmUoJ3JuQ2Fyb3VzZWwnLCBbJyRzd2lwZScsICckd2luZG93JywgJyRkb2N1bWVudCcsICckcGFyc2UnLCAnJGNvbXBpbGUnLCAnJHRpbWVvdXQnLCAnJGludGVydmFsJywgJ2NvbXB1dGVDYXJvdXNlbFNsaWRlU3R5bGUnLCAnY3JlYXRlU3R5bGVTdHJpbmcnLCAnVHdlZW5hYmxlJyxcbiAgICBmdW5jdGlvbigkc3dpcGUsICR3aW5kb3csICRkb2N1bWVudCwgJHBhcnNlLCAkY29tcGlsZSwgJHRpbWVvdXQsICRpbnRlcnZhbCwgY29tcHV0ZUNhcm91c2VsU2xpZGVTdHlsZSwgY3JlYXRlU3R5bGVTdHJpbmcsIFR3ZWVuYWJsZSkge1xuICAgICAgICAvLyBpbnRlcm5hbCBpZHMgdG8gYWxsb3cgbXVsdGlwbGUgaW5zdGFuY2VzXG4gICAgICAgIHZhciBjYXJvdXNlbElkID0gMCxcbiAgICAgICAgICAgIC8vIGluIGFic29sdXRlIHBpeGVscywgYXQgd2hpY2ggZGlzdGFuY2UgdGhlIHNsaWRlIHN0aWNrIHRvIHRoZSBlZGdlIG9uIHJlbGVhc2VcbiAgICAgICAgICAgIHJ1YmJlclRyZXNob2xkID0gMztcblxuICAgICAgICB2YXIgcmVxdWVzdEFuaW1hdGlvbkZyYW1lID0gJHdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUgfHwgJHdpbmRvdy53ZWJraXRSZXF1ZXN0QW5pbWF0aW9uRnJhbWUgfHwgJHdpbmRvdy5tb3pSZXF1ZXN0QW5pbWF0aW9uRnJhbWU7XG5cbiAgICAgICAgZnVuY3Rpb24gZ2V0SXRlbUluZGV4KGNvbGxlY3Rpb24sIHRhcmdldCwgZGVmYXVsdEluZGV4KSB7XG4gICAgICAgICAgICB2YXIgcmVzdWx0ID0gZGVmYXVsdEluZGV4O1xuICAgICAgICAgICAgY29sbGVjdGlvbi5ldmVyeShmdW5jdGlvbihpdGVtLCBpbmRleCkge1xuICAgICAgICAgICAgICAgIGlmIChhbmd1bGFyLmVxdWFscyhpdGVtLCB0YXJnZXQpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdCA9IGluZGV4O1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHJlc3RyaWN0OiAnQScsXG4gICAgICAgICAgICBzY29wZTogdHJ1ZSxcbiAgICAgICAgICAgIGNvbXBpbGU6IGZ1bmN0aW9uKHRFbGVtZW50LCB0QXR0cmlidXRlcykge1xuICAgICAgICAgICAgICAgIC8vIHVzZSB0aGUgY29tcGlsZSBwaGFzZSB0byBjdXN0b21pemUgdGhlIERPTVxuICAgICAgICAgICAgICAgIHZhciBmaXJzdENoaWxkID0gdEVsZW1lbnRbMF0ucXVlcnlTZWxlY3RvcignbGknKSxcbiAgICAgICAgICAgICAgICAgICAgZmlyc3RDaGlsZEF0dHJpYnV0ZXMgPSAoZmlyc3RDaGlsZCkgPyBmaXJzdENoaWxkLmF0dHJpYnV0ZXMgOiBbXSxcbiAgICAgICAgICAgICAgICAgICAgaXNSZXBlYXRCYXNlZCA9IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICBpc0J1ZmZlcmVkID0gZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgIHJlcGVhdEl0ZW0sXG4gICAgICAgICAgICAgICAgICAgIHJlcGVhdENvbGxlY3Rpb247XG5cbiAgICAgICAgICAgICAgICAvLyB0cnkgdG8gZmluZCBhbiBuZ1JlcGVhdCBleHByZXNzaW9uXG4gICAgICAgICAgICAgICAgLy8gYXQgdGhpcyBwb2ludCwgdGhlIGF0dHJpYnV0ZXMgYXJlIG5vdCB5ZXQgbm9ybWFsaXplZCBzbyB3ZSBuZWVkIHRvIHRyeSB2YXJpb3VzIHN5bnRheFxuICAgICAgICAgICAgICAgIFsnbmctcmVwZWF0JywgJ2RhdGEtbmctcmVwZWF0JywgJ25nOnJlcGVhdCcsICd4LW5nLXJlcGVhdCddLmV2ZXJ5KGZ1bmN0aW9uKGF0dHIpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHJlcGVhdEF0dHJpYnV0ZSA9IGZpcnN0Q2hpbGRBdHRyaWJ1dGVzW2F0dHJdO1xuICAgICAgICAgICAgICAgICAgICBpZiAoYW5ndWxhci5pc0RlZmluZWQocmVwZWF0QXR0cmlidXRlKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gbmdSZXBlYXQgcmVnZXhwIGV4dHJhY3RlZCBmcm9tIGFuZ3VsYXIgMS4yLjcgc3JjXG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgZXhwck1hdGNoID0gcmVwZWF0QXR0cmlidXRlLnZhbHVlLm1hdGNoKC9eXFxzKihbXFxzXFxTXSs/KVxccytpblxccysoW1xcc1xcU10rPykoPzpcXHMrdHJhY2tcXHMrYnlcXHMrKFtcXHNcXFNdKz8pKT9cXHMqJC8pLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRyYWNrUHJvcGVydHkgPSBleHByTWF0Y2hbM107XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIHJlcGVhdEl0ZW0gPSBleHByTWF0Y2hbMV07XG4gICAgICAgICAgICAgICAgICAgICAgICByZXBlYXRDb2xsZWN0aW9uID0gZXhwck1hdGNoWzJdO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocmVwZWF0SXRlbSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChhbmd1bGFyLmlzRGVmaW5lZCh0QXR0cmlidXRlc1sncm5DYXJvdXNlbEJ1ZmZlcmVkJ10pKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHVwZGF0ZSB0aGUgY3VycmVudCBuZ1JlcGVhdCBleHByZXNzaW9uIGFuZCBhZGQgYSBzbGljZSBvcGVyYXRvciBpZiBidWZmZXJlZFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpc0J1ZmZlcmVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVwZWF0QXR0cmlidXRlLnZhbHVlID0gcmVwZWF0SXRlbSArICcgaW4gJyArIHJlcGVhdENvbGxlY3Rpb24gKyAnfGNhcm91c2VsU2xpY2U6Y2Fyb3VzZWxCdWZmZXJJbmRleDpjYXJvdXNlbEJ1ZmZlclNpemUnO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAodHJhY2tQcm9wZXJ0eSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVwZWF0QXR0cmlidXRlLnZhbHVlICs9ICcgdHJhY2sgYnkgJyArIHRyYWNrUHJvcGVydHk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaXNSZXBlYXRCYXNlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgcmV0dXJuIGZ1bmN0aW9uKHNjb3BlLCBpRWxlbWVudCwgaUF0dHJpYnV0ZXMsIGNvbnRhaW5lckN0cmwpIHtcblxuICAgICAgICAgICAgICAgICAgICBjYXJvdXNlbElkKys7XG5cbiAgICAgICAgICAgICAgICAgICAgdmFyIGRlZmF1bHRPcHRpb25zID0ge1xuICAgICAgICAgICAgICAgICAgICAgICAgdHJhbnNpdGlvblR5cGU6IGlBdHRyaWJ1dGVzLnJuQ2Fyb3VzZWxUcmFuc2l0aW9uIHx8ICdzbGlkZScsXG4gICAgICAgICAgICAgICAgICAgICAgICB0cmFuc2l0aW9uRWFzaW5nOiBpQXR0cmlidXRlcy5ybkNhcm91c2VsRWFzaW5nIHx8ICdlYXNlVG8nLFxuICAgICAgICAgICAgICAgICAgICAgICAgdHJhbnNpdGlvbkR1cmF0aW9uOiBwYXJzZUludChpQXR0cmlidXRlcy5ybkNhcm91c2VsRHVyYXRpb24sIDEwKSB8fCAzMDAsXG4gICAgICAgICAgICAgICAgICAgICAgICBpc1NlcXVlbnRpYWw6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBhdXRvU2xpZGVEdXJhdGlvbjogMyxcbiAgICAgICAgICAgICAgICAgICAgICAgIGJ1ZmZlclNpemU6IDUsXG4gICAgICAgICAgICAgICAgICAgICAgICAvKiBpbiBjb250YWluZXIgJSBob3cgbXVjaCB3ZSBuZWVkIHRvIGRyYWcgdG8gdHJpZ2dlciB0aGUgc2xpZGUgY2hhbmdlICovXG4gICAgICAgICAgICAgICAgICAgICAgICBtb3ZlVHJlc2hvbGQ6IDAuMVxuICAgICAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIFRPRE9cbiAgICAgICAgICAgICAgICAgICAgdmFyIG9wdGlvbnMgPSBhbmd1bGFyLmV4dGVuZCh7fSwgZGVmYXVsdE9wdGlvbnMpO1xuXG4gICAgICAgICAgICAgICAgICAgIHZhciBwcmVzc2VkLFxuICAgICAgICAgICAgICAgICAgICAgICAgc3RhcnRYLFxuICAgICAgICAgICAgICAgICAgICAgICAgaXNJbmRleEJvdW5kID0gZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgICAgICBvZmZzZXQgPSAwLFxuICAgICAgICAgICAgICAgICAgICAgICAgZGVzdGluYXRpb24sXG4gICAgICAgICAgICAgICAgICAgICAgICBzd2lwZU1vdmVkID0gZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgICAgICAvL2FuaW1PbkluZGV4Q2hhbmdlID0gdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGN1cnJlbnRTbGlkZXMgPSBbXSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsV2lkdGggPSBudWxsLFxuICAgICAgICAgICAgICAgICAgICAgICAgZWxYID0gbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGFuaW1hdGVUcmFuc2l0aW9ucyA9IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBpbnRpYWxTdGF0ZSA9IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBhbmltYXRpbmcgPSBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1vdXNlVXBCb3VuZCA9IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgbG9ja2VkID0gZmFsc2U7XG5cbiAgICAgICAgICAgICAgICAgICAgJHN3aXBlLmJpbmQoaUVsZW1lbnQsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0YXJ0OiBzd2lwZVN0YXJ0LFxuICAgICAgICAgICAgICAgICAgICAgICAgbW92ZTogc3dpcGVNb3ZlLFxuICAgICAgICAgICAgICAgICAgICAgICAgZW5kOiBzd2lwZUVuZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhbmNlbDogZnVuY3Rpb24oZXZlbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzd2lwZUVuZCh7fSwgZXZlbnQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgICAgICBmdW5jdGlvbiBnZXRTbGlkZXNET00oKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gaUVsZW1lbnRbMF0ucXVlcnlTZWxlY3RvckFsbCgndWxbcm4tY2Fyb3VzZWxdID4gbGknKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uIGRvY3VtZW50TW91c2VVcEV2ZW50KGV2ZW50KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBpbiBjYXNlIHdlIGNsaWNrIG91dHNpZGUgdGhlIGNhcm91c2VsLCB0cmlnZ2VyIGEgZmFrZSBzd2lwZUVuZFxuICAgICAgICAgICAgICAgICAgICAgICAgc3dpcGVNb3ZlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICBzd2lwZUVuZCh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgeDogZXZlbnQuY2xpZW50WCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB5OiBldmVudC5jbGllbnRZXG4gICAgICAgICAgICAgICAgICAgICAgICB9LCBldmVudCk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBmdW5jdGlvbiB1cGRhdGVTbGlkZXNQb3NpdGlvbihvZmZzZXQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIG1hbnVhbGx5IGFwcGx5IHRyYW5zZm9ybWF0aW9uIHRvIGNhcm91c2VsIGNoaWxkcmVuc1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gdG9kbyA6IG9wdGltIDogYXBwbHkgb25seSB0byB2aXNpYmxlIGl0ZW1zXG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgeCA9IHNjb3BlLmNhcm91c2VsQnVmZmVySW5kZXggKiAxMDAgKyBvZmZzZXQ7XG4gICAgICAgICAgICAgICAgICAgICAgICBhbmd1bGFyLmZvckVhY2goZ2V0U2xpZGVzRE9NKCksIGZ1bmN0aW9uKGNoaWxkLCBpbmRleCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNoaWxkLnN0eWxlLmNzc1RleHQgPSBjcmVhdGVTdHlsZVN0cmluZyhjb21wdXRlQ2Fyb3VzZWxTbGlkZVN0eWxlKGluZGV4LCB4LCBvcHRpb25zLnRyYW5zaXRpb25UeXBlKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIHNjb3BlLm5leHRTbGlkZSA9IGZ1bmN0aW9uKHNsaWRlT3B0aW9ucykge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGluZGV4ID0gc2NvcGUuY2Fyb3VzZWxJbmRleCArIDE7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoaW5kZXggPiBjdXJyZW50U2xpZGVzLmxlbmd0aCAtIDEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpbmRleCA9IDA7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIWxvY2tlZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGdvVG9TbGlkZShpbmRleCwgc2xpZGVPcHRpb25zKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICAgICAgICBzY29wZS5wcmV2U2xpZGUgPSBmdW5jdGlvbihzbGlkZU9wdGlvbnMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBpbmRleCA9IHNjb3BlLmNhcm91c2VsSW5kZXggLSAxO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGluZGV4IDwgMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGluZGV4ID0gY3VycmVudFNsaWRlcy5sZW5ndGggLSAxO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgZ29Ub1NsaWRlKGluZGV4LCBzbGlkZU9wdGlvbnMpO1xuICAgICAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uIGdvVG9TbGlkZShpbmRleCwgc2xpZGVPcHRpb25zKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvL2NvbnNvbGUubG9nKCdnb1RvU2xpZGUnLCBhcmd1bWVudHMpO1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gbW92ZSBhIHRvIHRoZSBnaXZlbiBzbGlkZSBpbmRleFxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGluZGV4ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpbmRleCA9IHNjb3BlLmNhcm91c2VsSW5kZXg7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIHNsaWRlT3B0aW9ucyA9IHNsaWRlT3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChzbGlkZU9wdGlvbnMuYW5pbWF0ZSA9PT0gZmFsc2UgfHwgb3B0aW9ucy50cmFuc2l0aW9uVHlwZSA9PT0gJ25vbmUnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbG9ja2VkID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgb2Zmc2V0ID0gaW5kZXggKiAtMTAwO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNjb3BlLmNhcm91c2VsSW5kZXggPSBpbmRleDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB1cGRhdGVCdWZmZXJJbmRleCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgbG9ja2VkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciB0d2VlbmFibGUgPSBuZXcgVHdlZW5hYmxlKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB0d2VlbmFibGUudHdlZW4oe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZyb206IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJ3gnOiBvZmZzZXRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRvOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICd4JzogaW5kZXggKiAtMTAwXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkdXJhdGlvbjogb3B0aW9ucy50cmFuc2l0aW9uRHVyYXRpb24sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZWFzaW5nOiBvcHRpb25zLnRyYW5zaXRpb25FYXNpbmcsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RlcDogZnVuY3Rpb24oc3RhdGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdXBkYXRlU2xpZGVzUG9zaXRpb24oc3RhdGUueCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmaW5pc2g6IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzY29wZS4kYXBwbHkoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzY29wZS5jYXJvdXNlbEluZGV4ID0gaW5kZXg7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvZmZzZXQgPSBpbmRleCAqIC0xMDA7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB1cGRhdGVCdWZmZXJJbmRleCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJHRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBsb2NrZWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0sIDAsIGZhbHNlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBmdW5jdGlvbiBnZXRDb250YWluZXJXaWR0aCgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciByZWN0ID0gaUVsZW1lbnRbMF0uZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVjdC53aWR0aCA/IHJlY3Qud2lkdGggOiByZWN0LnJpZ2h0IC0gcmVjdC5sZWZ0O1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgZnVuY3Rpb24gdXBkYXRlQ29udGFpbmVyV2lkdGgoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBlbFdpZHRoID0gZ2V0Q29udGFpbmVyV2lkdGgoKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uIGJpbmRNb3VzZVVwRXZlbnQoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIW1vdXNlVXBCb3VuZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICBtb3VzZVVwQm91bmQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAkZG9jdW1lbnQuYmluZCgnbW91c2V1cCcsIGRvY3VtZW50TW91c2VVcEV2ZW50KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uIHVuYmluZE1vdXNlVXBFdmVudCgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChtb3VzZVVwQm91bmQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgbW91c2VVcEJvdW5kID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICRkb2N1bWVudC51bmJpbmQoJ21vdXNldXAnLCBkb2N1bWVudE1vdXNlVXBFdmVudCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBmdW5jdGlvbiBzd2lwZVN0YXJ0KGNvb3JkcywgZXZlbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGNvbnNvbGUubG9nKCdzd2lwZVN0YXJ0JywgY29vcmRzLCBldmVudCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAobG9ja2VkIHx8IGN1cnJlbnRTbGlkZXMubGVuZ3RoIDw9IDEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB1cGRhdGVDb250YWluZXJXaWR0aCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgZWxYID0gaUVsZW1lbnRbMF0ucXVlcnlTZWxlY3RvcignbGknKS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKS5sZWZ0O1xuICAgICAgICAgICAgICAgICAgICAgICAgcHJlc3NlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdGFydFggPSBjb29yZHMueDtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uIHN3aXBlTW92ZShjb29yZHMsIGV2ZW50KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvL2NvbnNvbGUubG9nKCdzd2lwZU1vdmUnLCBjb29yZHMsIGV2ZW50KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciB4LCBkZWx0YTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJpbmRNb3VzZVVwRXZlbnQoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChwcmVzc2VkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgeCA9IGNvb3Jkcy54O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlbHRhID0gc3RhcnRYIC0geDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoZGVsdGEgPiAyIHx8IGRlbHRhIDwgLTIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3dpcGVNb3ZlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhciBtb3ZlT2Zmc2V0ID0gb2Zmc2V0ICsgKC1kZWx0YSAqIDEwMCAvIGVsV2lkdGgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB1cGRhdGVTbGlkZXNQb3NpdGlvbihtb3ZlT2Zmc2V0KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICB2YXIgaW5pdCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIHNjb3BlLmNhcm91c2VsSW5kZXggPSAwO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmICghaXNSZXBlYXRCYXNlZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gZmFrZSBhcnJheSB3aGVuIG5vIG5nLXJlcGVhdFxuICAgICAgICAgICAgICAgICAgICAgICAgY3VycmVudFNsaWRlcyA9IFtdO1xuICAgICAgICAgICAgICAgICAgICAgICAgYW5ndWxhci5mb3JFYWNoKGdldFNsaWRlc0RPTSgpLCBmdW5jdGlvbihub2RlLCBpbmRleCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGN1cnJlbnRTbGlkZXMucHVzaCh7aWQ6IGluZGV4fSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGlmIChpQXR0cmlidXRlcy5ybkNhcm91c2VsQ29udHJvbHMhPT11bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGRvbnQgdXNlIGEgZGlyZWN0aXZlIGZvciB0aGlzXG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgbmV4dFNsaWRlSW5kZXhDb21wYXJlVmFsdWUgPSBpc1JlcGVhdEJhc2VkID8gcmVwZWF0Q29sbGVjdGlvbi5yZXBsYWNlKCc6OicsICcnKSArICcubGVuZ3RoIC0gMScgOiBjdXJyZW50U2xpZGVzLmxlbmd0aCAtIDE7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgdHBsID0gJzxkaXYgY2xhc3M9XCJybi1jYXJvdXNlbC1jb250cm9sc1wiPlxcbicgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICcgIDxzcGFuIGNsYXNzPVwicm4tY2Fyb3VzZWwtY29udHJvbCBybi1jYXJvdXNlbC1jb250cm9sLXByZXZcIiBuZy1jbGljaz1cInByZXZTbGlkZSgpXCIgbmctaWY9XCJjYXJvdXNlbEluZGV4ID4gMFwiPjwvc3Bhbj5cXG4nICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAnICA8c3BhbiBjbGFzcz1cInJuLWNhcm91c2VsLWNvbnRyb2wgcm4tY2Fyb3VzZWwtY29udHJvbC1uZXh0XCIgbmctY2xpY2s9XCJuZXh0U2xpZGUoKVwiIG5nLWlmPVwiY2Fyb3VzZWxJbmRleCA8ICcgKyBuZXh0U2xpZGVJbmRleENvbXBhcmVWYWx1ZSArICdcIj48L3NwYW4+XFxuJyArXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgJzwvZGl2Pic7XG4gICAgICAgICAgICAgICAgICAgICAgICBpRWxlbWVudC5hcHBlbmQoJGNvbXBpbGUoYW5ndWxhci5lbGVtZW50KHRwbCkpKHNjb3BlKSk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBpZiAoaUF0dHJpYnV0ZXMucm5DYXJvdXNlbEF1dG9TbGlkZSE9PXVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGR1cmF0aW9uID0gcGFyc2VJbnQoaUF0dHJpYnV0ZXMucm5DYXJvdXNlbEF1dG9TbGlkZSwgMTApIHx8IG9wdGlvbnMuYXV0b1NsaWRlRHVyYXRpb247XG4gICAgICAgICAgICAgICAgICAgICAgICBzY29wZS5hdXRvU2xpZGUgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoc2NvcGUuYXV0b1NsaWRlcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAkaW50ZXJ2YWwuY2FuY2VsKHNjb3BlLmF1dG9TbGlkZXIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzY29wZS5hdXRvU2xpZGVyID0gbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2NvcGUuYXV0b1NsaWRlciA9ICRpbnRlcnZhbChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFsb2NrZWQgJiYgIXByZXNzZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNjb3BlLm5leHRTbGlkZSgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSwgZHVyYXRpb24gKiAxMDAwKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBpZiAoaUF0dHJpYnV0ZXMucm5DYXJvdXNlbEluZGV4KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgdXBkYXRlUGFyZW50SW5kZXggPSBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGluZGV4TW9kZWwuYXNzaWduKHNjb3BlLiRwYXJlbnQsIHZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgaW5kZXhNb2RlbCA9ICRwYXJzZShpQXR0cmlidXRlcy5ybkNhcm91c2VsSW5kZXgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGFuZ3VsYXIuaXNGdW5jdGlvbihpbmRleE1vZGVsLmFzc2lnbikpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvKiBjaGVjayBpZiB0aGlzIHByb3BlcnR5IGlzIGFzc2lnbmFibGUgdGhlbiB3YXRjaCBpdCAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNjb3BlLiR3YXRjaCgnY2Fyb3VzZWxJbmRleCcsIGZ1bmN0aW9uKG5ld1ZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHVwZGF0ZVBhcmVudEluZGV4KG5ld1ZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzY29wZS4kcGFyZW50LiR3YXRjaChpbmRleE1vZGVsLCBmdW5jdGlvbihuZXdWYWx1ZSwgb2xkVmFsdWUpIHtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAobmV3VmFsdWUgIT09IHVuZGVmaW5lZCAmJiBuZXdWYWx1ZSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGN1cnJlbnRTbGlkZXMgJiYgY3VycmVudFNsaWRlcy5sZW5ndGggPiAwICYmIG5ld1ZhbHVlID49IGN1cnJlbnRTbGlkZXMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbmV3VmFsdWUgPSBjdXJyZW50U2xpZGVzLmxlbmd0aCAtIDE7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdXBkYXRlUGFyZW50SW5kZXgobmV3VmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChjdXJyZW50U2xpZGVzICYmIG5ld1ZhbHVlIDwgMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5ld1ZhbHVlID0gMDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB1cGRhdGVQYXJlbnRJbmRleChuZXdWYWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIWxvY2tlZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGdvVG9TbGlkZShuZXdWYWx1ZSwge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhbmltYXRlOiAhaW5pdFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaW5pdCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaXNJbmRleEJvdW5kID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoIWlzTmFOKGlBdHRyaWJ1dGVzLnJuQ2Fyb3VzZWxJbmRleCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvKiBpZiB1c2VyIGp1c3Qgc2V0IGFuIGluaXRpYWwgbnVtYmVyLCBzZXQgaXQgKi9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBnb1RvU2xpZGUocGFyc2VJbnQoaUF0dHJpYnV0ZXMucm5DYXJvdXNlbEluZGV4LCAxMCksIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYW5pbWF0ZTogZmFsc2VcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGdvVG9TbGlkZSgwLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYW5pbWF0ZTogIWluaXRcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgaW5pdCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGlBdHRyaWJ1dGVzLnJuQ2Fyb3VzZWxMb2NrZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNjb3BlLiR3YXRjaChpQXR0cmlidXRlcy5ybkNhcm91c2VsTG9ja2VkLCBmdW5jdGlvbihuZXdWYWx1ZSwgb2xkVmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBvbmx5IGJpbmQgc3dpcGUgd2hlbiBpdCdzIG5vdCBzd2l0Y2hlZCBvZmZcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZihuZXdWYWx1ZSA9PT0gdHJ1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBsb2NrZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxvY2tlZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGlzUmVwZWF0QmFzZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHVzZSBybi1jYXJvdXNlbC1kZWVwLXdhdGNoIHRvIGZpZ2h0IHRoZSBBbmd1bGFyICR3YXRjaENvbGxlY3Rpb24gd2Vha25lc3MgOiBodHRwczovL2dpdGh1Yi5jb20vYW5ndWxhci9hbmd1bGFyLmpzL2lzc3Vlcy8yNjIxXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBvcHRpb25hbCBiZWNhdXNlIGl0IGhhdmUgc29tZSBwZXJmb3JtYW5jZSBpbXBhY3RzIChkZWVwIHdhdGNoKVxuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGRlZXBXYXRjaCA9IChpQXR0cmlidXRlcy5ybkNhcm91c2VsRGVlcFdhdGNoIT09dW5kZWZpbmVkKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgc2NvcGVbZGVlcFdhdGNoPyckd2F0Y2gnOickd2F0Y2hDb2xsZWN0aW9uJ10ocmVwZWF0Q29sbGVjdGlvbiwgZnVuY3Rpb24obmV3VmFsdWUsIG9sZFZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy9jb25zb2xlLmxvZygncmVwZWF0Q29sbGVjdGlvbicsIGN1cnJlbnRTbGlkZXMpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGN1cnJlbnRTbGlkZXMgPSBuZXdWYWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBpZiBkZWVwV2F0Y2ggT04gLG1hbnVhbGx5IGNvbXBhcmUgb2JqZWN0cyB0byBndWVzcyB0aGUgbmV3IHBvc2l0aW9uXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGRlZXBXYXRjaCAmJiBhbmd1bGFyLmlzQXJyYXkobmV3VmFsdWUpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhciBhY3RpdmVFbGVtZW50ID0gb2xkVmFsdWVbc2NvcGUuY2Fyb3VzZWxJbmRleF07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhciBuZXdJbmRleCA9IGdldEl0ZW1JbmRleChuZXdWYWx1ZSwgYWN0aXZlRWxlbWVudCwgc2NvcGUuY2Fyb3VzZWxJbmRleCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGdvVG9TbGlkZShuZXdJbmRleCwge2FuaW1hdGU6IGZhbHNlfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZ29Ub1NsaWRlKHNjb3BlLmNhcm91c2VsSW5kZXgsIHthbmltYXRlOiBmYWxzZX0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH0sIHRydWUpO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgZnVuY3Rpb24gc3dpcGVFbmQoY29vcmRzLCBldmVudCwgZm9yY2VBbmltYXRpb24pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vICBjb25zb2xlLmxvZygnc3dpcGVFbmQnLCAnc2NvcGUuY2Fyb3VzZWxJbmRleCcsIHNjb3BlLmNhcm91c2VsSW5kZXgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gUHJldmVudCBjbGlja3Mgb24gYnV0dG9ucyBpbnNpZGUgc2xpZGVyIHRvIHRyaWdnZXIgXCJzd2lwZUVuZFwiIGV2ZW50IG9uIHRvdWNoZW5kL21vdXNldXBcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChldmVudCAmJiAhc3dpcGVNb3ZlZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIHVuYmluZE1vdXNlVXBFdmVudCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcHJlc3NlZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICAgICAgc3dpcGVNb3ZlZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICAgICAgZGVzdGluYXRpb24gPSBzdGFydFggLSBjb29yZHMueDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChkZXN0aW5hdGlvbj09PTApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAobG9ja2VkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgb2Zmc2V0ICs9ICgtZGVzdGluYXRpb24gKiAxMDAgLyBlbFdpZHRoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChvcHRpb25zLmlzU2VxdWVudGlhbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhciBtaW5Nb3ZlID0gb3B0aW9ucy5tb3ZlVHJlc2hvbGQgKiBlbFdpZHRoLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhYnNNb3ZlID0gLWRlc3RpbmF0aW9uLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzbGlkZXNNb3ZlID0gLU1hdGhbYWJzTW92ZSA+PSAwID8gJ2NlaWwnIDogJ2Zsb29yJ10oYWJzTW92ZSAvIGVsV2lkdGgpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzaG91bGRNb3ZlID0gTWF0aC5hYnMoYWJzTW92ZSkgPiBtaW5Nb3ZlO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGN1cnJlbnRTbGlkZXMgJiYgKHNsaWRlc01vdmUgKyBzY29wZS5jYXJvdXNlbEluZGV4KSA+PSBjdXJyZW50U2xpZGVzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzbGlkZXNNb3ZlID0gY3VycmVudFNsaWRlcy5sZW5ndGggLSAxIC0gc2NvcGUuY2Fyb3VzZWxJbmRleDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKChzbGlkZXNNb3ZlICsgc2NvcGUuY2Fyb3VzZWxJbmRleCkgPCAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNsaWRlc01vdmUgPSAtc2NvcGUuY2Fyb3VzZWxJbmRleDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFyIG1vdmVPZmZzZXQgPSBzaG91bGRNb3ZlID8gc2xpZGVzTW92ZSA6IDA7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZXN0aW5hdGlvbiA9IChzY29wZS5jYXJvdXNlbEluZGV4ICsgbW92ZU9mZnNldCk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBnb1RvU2xpZGUoZGVzdGluYXRpb24pO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzY29wZS4kYXBwbHkoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNjb3BlLmNhcm91c2VsSW5kZXggPSBwYXJzZUludCgtb2Zmc2V0IC8gMTAwLCAxMCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHVwZGF0ZUJ1ZmZlckluZGV4KCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgc2NvcGUuJG9uKCckZGVzdHJveScsIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdW5iaW5kTW91c2VVcEV2ZW50KCk7XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgICAgIHNjb3BlLmNhcm91c2VsQnVmZmVySW5kZXggPSAwO1xuICAgICAgICAgICAgICAgICAgICBzY29wZS5jYXJvdXNlbEJ1ZmZlclNpemUgPSBvcHRpb25zLmJ1ZmZlclNpemU7XG5cbiAgICAgICAgICAgICAgICAgICAgZnVuY3Rpb24gdXBkYXRlQnVmZmVySW5kZXgoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyB1cGRhdGUgYW5kIGNhcCB0ZSBidWZmZXIgaW5kZXhcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBidWZmZXJJbmRleCA9IDA7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgYnVmZmVyRWRnZVNpemUgPSAoc2NvcGUuY2Fyb3VzZWxCdWZmZXJTaXplIC0gMSkgLyAyO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGlzQnVmZmVyZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoc2NvcGUuY2Fyb3VzZWxJbmRleCA8PSBidWZmZXJFZGdlU2l6ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBmaXJzdCBidWZmZXIgcGFydFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBidWZmZXJJbmRleCA9IDA7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChjdXJyZW50U2xpZGVzICYmIGN1cnJlbnRTbGlkZXMubGVuZ3RoIDwgc2NvcGUuY2Fyb3VzZWxCdWZmZXJTaXplKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHNtYWxsZXIgdGhhbiBidWZmZXJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYnVmZmVySW5kZXggPSAwO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoY3VycmVudFNsaWRlcyAmJiBzY29wZS5jYXJvdXNlbEluZGV4ID4gY3VycmVudFNsaWRlcy5sZW5ndGggLSBzY29wZS5jYXJvdXNlbEJ1ZmZlclNpemUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gbGFzdCBidWZmZXIgcGFydFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBidWZmZXJJbmRleCA9IGN1cnJlbnRTbGlkZXMubGVuZ3RoIC0gc2NvcGUuY2Fyb3VzZWxCdWZmZXJTaXplO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGNvbXB1dGUgYnVmZmVyIHN0YXJ0XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJ1ZmZlckluZGV4ID0gc2NvcGUuY2Fyb3VzZWxJbmRleCAtIGJ1ZmZlckVkZ2VTaXplO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNjb3BlLmNhcm91c2VsQnVmZmVySW5kZXggPSBidWZmZXJJbmRleDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAkdGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdXBkYXRlU2xpZGVzUG9zaXRpb24ob2Zmc2V0KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9LCAwLCBmYWxzZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICR0aW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB1cGRhdGVTbGlkZXNQb3NpdGlvbihvZmZzZXQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0sIDAsIGZhbHNlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uIG9uT3JpZW50YXRpb25DaGFuZ2UoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB1cGRhdGVDb250YWluZXJXaWR0aCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgZ29Ub1NsaWRlKCk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvLyBoYW5kbGUgb3JpZW50YXRpb24gY2hhbmdlXG4gICAgICAgICAgICAgICAgICAgIHZhciB3aW5FbCA9IGFuZ3VsYXIuZWxlbWVudCgkd2luZG93KTtcbiAgICAgICAgICAgICAgICAgICAgd2luRWwuYmluZCgnb3JpZW50YXRpb25jaGFuZ2UnLCBvbk9yaWVudGF0aW9uQ2hhbmdlKTtcbiAgICAgICAgICAgICAgICAgICAgd2luRWwuYmluZCgncmVzaXplJywgb25PcmllbnRhdGlvbkNoYW5nZSk7XG5cbiAgICAgICAgICAgICAgICAgICAgc2NvcGUuJG9uKCckZGVzdHJveScsIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdW5iaW5kTW91c2VVcEV2ZW50KCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB3aW5FbC51bmJpbmQoJ29yaWVudGF0aW9uY2hhbmdlJywgb25PcmllbnRhdGlvbkNoYW5nZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB3aW5FbC51bmJpbmQoJ3Jlc2l6ZScsIG9uT3JpZW50YXRpb25DaGFuZ2UpO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgIH1cbl0pO1xuXG5tb2R1bGUuZXhwb3J0cyA9IEFuZ3VsYXJDYXJvdXNlbDtcbiIsbnVsbCwiJ3VzZSBzdHJpY3QnO1xudmFyIENhcm91c2VsSW5kaWNhdG9ycyA9IGFuZ3VsYXIubW9kdWxlKCdhbmd1bGFyLWNhcm91c2VsJylcblxuLmRpcmVjdGl2ZSgncm5DYXJvdXNlbEluZGljYXRvcnMnLCBbJyRwYXJzZScsIGZ1bmN0aW9uKCRwYXJzZSkge1xuICByZXR1cm4ge1xuICAgIHJlc3RyaWN0OiAnQScsXG4gICAgc2NvcGU6IHtcbiAgICAgIHNsaWRlczogJz0nLFxuICAgICAgaW5kZXg6ICc9cm5DYXJvdXNlbEluZGV4J1xuICAgIH0sXG4gICAgdGVtcGxhdGVVcmw6ICdjYXJvdXNlbC1pbmRpY2F0b3JzLmh0bWwnLFxuICAgIGxpbms6IGZ1bmN0aW9uKHNjb3BlLCBpRWxlbWVudCwgaUF0dHJpYnV0ZXMpIHtcbiAgICAgIHZhciBpbmRleE1vZGVsID0gJHBhcnNlKGlBdHRyaWJ1dGVzLnJuQ2Fyb3VzZWxJbmRleCk7XG4gICAgICBzY29wZS5nb1RvU2xpZGUgPSBmdW5jdGlvbihpbmRleCkge1xuICAgICAgICBpbmRleE1vZGVsLmFzc2lnbihzY29wZS4kcGFyZW50LiRwYXJlbnQsIGluZGV4KTtcbiAgICAgIH07XG4gICAgfVxuICB9O1xufV0pO1xuXG5hbmd1bGFyLm1vZHVsZSgnYW5ndWxhci1jYXJvdXNlbCcpLnJ1bihbJyR0ZW1wbGF0ZUNhY2hlJywgZnVuY3Rpb24oJHRlbXBsYXRlQ2FjaGUpIHtcbiAgLy8gVE9ETzogQ2hyaXN0LCBmaXggdGhpc1xuICAkdGVtcGxhdGVDYWNoZS5wdXQoJ2Nhcm91c2VsLWluZGljYXRvcnMuaHRtbCcsXG4gICAgICAnPGRpdiBjbGFzcz1cInJuLWNhcm91c2VsLWluZGljYXRvclwiPlxcbicgK1xuICAgICAgICAnPHNwYW4gbmctcmVwZWF0PVwic2xpZGUgaW4gc2xpZGVzXCIgbmctY2xhc3M9XCJ7YWN0aXZlOiAkaW5kZXg9PWluZGV4fVwiIG5nLWNsaWNrPVwiZ29Ub1NsaWRlKCRpbmRleClcIj7il488L3NwYW4+JyArXG4gICAgICAnPC9kaXY+J1xuICApO1xufV0pO1xuXG5tb2R1bGUuZXhwb3J0cyA9IENhcm91c2VsSW5kaWNhdG9ycztcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIFNoaWZ0eSA9IGFuZ3VsYXIubW9kdWxlKCdhbmd1bGFyLWNhcm91c2VsLnNoaWZ0eScsIFtdKVxuXG4uZmFjdG9yeSgnVHdlZW5hYmxlJywgZnVuY3Rpb24oKSB7XG5cbiAgICAvKiEgc2hpZnR5IC0gdjEuMy40IC0gMjAxNC0xMC0yOSAtIGh0dHA6Ly9qZXJlbXlja2Fobi5naXRodWIuaW8vc2hpZnR5ICovXG4gIDsoZnVuY3Rpb24gKHJvb3QpIHtcblxuICAvKiFcbiAgICogU2hpZnR5IENvcmVcbiAgICogQnkgSmVyZW15IEthaG4gLSBqZXJlbXlja2FobkBnbWFpbC5jb21cbiAgICovXG5cbiAgdmFyIFR3ZWVuYWJsZSA9IChmdW5jdGlvbiAoKSB7XG5cbiAgICAvLyBBbGlhc2VzIHRoYXQgZ2V0IGRlZmluZWQgbGF0ZXIgaW4gdGhpcyBmdW5jdGlvblxuICAgIHZhciBmb3JtdWxhO1xuXG4gICAgLy8gQ09OU1RBTlRTXG4gICAgdmFyIERFRkFVTFRfU0NIRURVTEVfRlVOQ1RJT047XG4gICAgdmFyIERFRkFVTFRfRUFTSU5HID0gJ2xpbmVhcic7XG4gICAgdmFyIERFRkFVTFRfRFVSQVRJT04gPSA1MDA7XG4gICAgdmFyIFVQREFURV9USU1FID0gMTAwMCAvIDYwO1xuXG4gICAgdmFyIF9ub3cgPSBEYXRlLm5vdyA/IERhdGUubm93IDogZnVuY3Rpb24gKCkge3JldHVybiArbmV3IERhdGUoKTt9O1xuXG4gICAgdmFyIG5vdyA9IHR5cGVvZiBTSElGVFlfREVCVUdfTk9XICE9PSAndW5kZWZpbmVkJyA/IFNISUZUWV9ERUJVR19OT1cgOiBfbm93O1xuXG4gICAgaWYgKHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAvLyByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKSBzaGltIGJ5IFBhdWwgSXJpc2ggKG1vZGlmaWVkIGZvciBTaGlmdHkpXG4gICAgICAvLyBodHRwOi8vcGF1bGlyaXNoLmNvbS8yMDExL3JlcXVlc3RhbmltYXRpb25mcmFtZS1mb3Itc21hcnQtYW5pbWF0aW5nL1xuICAgICAgREVGQVVMVF9TQ0hFRFVMRV9GVU5DVElPTiA9IHdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWVcbiAgICAgICAgIHx8IHdpbmRvdy53ZWJraXRSZXF1ZXN0QW5pbWF0aW9uRnJhbWVcbiAgICAgICAgIHx8IHdpbmRvdy5vUmVxdWVzdEFuaW1hdGlvbkZyYW1lXG4gICAgICAgICB8fCB3aW5kb3cubXNSZXF1ZXN0QW5pbWF0aW9uRnJhbWVcbiAgICAgICAgIHx8ICh3aW5kb3cubW96Q2FuY2VsUmVxdWVzdEFuaW1hdGlvbkZyYW1lXG4gICAgICAgICAmJiB3aW5kb3cubW96UmVxdWVzdEFuaW1hdGlvbkZyYW1lKVxuICAgICAgICAgfHwgc2V0VGltZW91dDtcbiAgICB9IGVsc2Uge1xuICAgICAgREVGQVVMVF9TQ0hFRFVMRV9GVU5DVElPTiA9IHNldFRpbWVvdXQ7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbm9vcCAoKSB7XG4gICAgICAvLyBOT09QIVxuICAgIH1cblxuICAgIC8qIVxuICAgICAqIEhhbmR5IHNob3J0Y3V0IGZvciBkb2luZyBhIGZvci1pbiBsb29wLiBUaGlzIGlzIG5vdCBhIFwibm9ybWFsXCIgZWFjaFxuICAgICAqIGZ1bmN0aW9uLCBpdCBpcyBvcHRpbWl6ZWQgZm9yIFNoaWZ0eS4gIFRoZSBpdGVyYXRvciBmdW5jdGlvbiBvbmx5IHJlY2VpdmVzXG4gICAgICogdGhlIHByb3BlcnR5IG5hbWUsIG5vdCB0aGUgdmFsdWUuXG4gICAgICogQHBhcmFtIHtPYmplY3R9IG9ialxuICAgICAqIEBwYXJhbSB7RnVuY3Rpb24oc3RyaW5nKX0gZm5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBlYWNoIChvYmosIGZuKSB7XG4gICAgICB2YXIga2V5O1xuICAgICAgZm9yIChrZXkgaW4gb2JqKSB7XG4gICAgICAgIGlmIChPYmplY3QuaGFzT3duUHJvcGVydHkuY2FsbChvYmosIGtleSkpIHtcbiAgICAgICAgICBmbihrZXkpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgLyohXG4gICAgICogUGVyZm9ybSBhIHNoYWxsb3cgY29weSBvZiBPYmplY3QgcHJvcGVydGllcy5cbiAgICAgKiBAcGFyYW0ge09iamVjdH0gdGFyZ2V0T2JqZWN0IFRoZSBvYmplY3QgdG8gY29weSBpbnRvXG4gICAgICogQHBhcmFtIHtPYmplY3R9IHNyY09iamVjdCBUaGUgb2JqZWN0IHRvIGNvcHkgZnJvbVxuICAgICAqIEByZXR1cm4ge09iamVjdH0gQSByZWZlcmVuY2UgdG8gdGhlIGF1Z21lbnRlZCBgdGFyZ2V0T2JqYCBPYmplY3RcbiAgICAgKi9cbiAgICBmdW5jdGlvbiBzaGFsbG93Q29weSAodGFyZ2V0T2JqLCBzcmNPYmopIHtcbiAgICAgIGVhY2goc3JjT2JqLCBmdW5jdGlvbiAocHJvcCkge1xuICAgICAgICB0YXJnZXRPYmpbcHJvcF0gPSBzcmNPYmpbcHJvcF07XG4gICAgICB9KTtcblxuICAgICAgcmV0dXJuIHRhcmdldE9iajtcbiAgICB9XG5cbiAgICAvKiFcbiAgICAgKiBDb3BpZXMgZWFjaCBwcm9wZXJ0eSBmcm9tIHNyYyBvbnRvIHRhcmdldCwgYnV0IG9ubHkgaWYgdGhlIHByb3BlcnR5IHRvXG4gICAgICogY29weSB0byB0YXJnZXQgaXMgdW5kZWZpbmVkLlxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSB0YXJnZXQgTWlzc2luZyBwcm9wZXJ0aWVzIGluIHRoaXMgT2JqZWN0IGFyZSBmaWxsZWQgaW5cbiAgICAgKiBAcGFyYW0ge09iamVjdH0gc3JjXG4gICAgICovXG4gICAgZnVuY3Rpb24gZGVmYXVsdHMgKHRhcmdldCwgc3JjKSB7XG4gICAgICBlYWNoKHNyYywgZnVuY3Rpb24gKHByb3ApIHtcbiAgICAgICAgaWYgKHR5cGVvZiB0YXJnZXRbcHJvcF0gPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgdGFyZ2V0W3Byb3BdID0gc3JjW3Byb3BdO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvKiFcbiAgICAgKiBDYWxjdWxhdGVzIHRoZSBpbnRlcnBvbGF0ZWQgdHdlZW4gdmFsdWVzIG9mIGFuIE9iamVjdCBmb3IgYSBnaXZlblxuICAgICAqIHRpbWVzdGFtcC5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gZm9yUG9zaXRpb24gVGhlIHBvc2l0aW9uIHRvIGNvbXB1dGUgdGhlIHN0YXRlIGZvci5cbiAgICAgKiBAcGFyYW0ge09iamVjdH0gY3VycmVudFN0YXRlIEN1cnJlbnQgc3RhdGUgcHJvcGVydGllcy5cbiAgICAgKiBAcGFyYW0ge09iamVjdH0gb3JpZ2luYWxTdGF0ZTogVGhlIG9yaWdpbmFsIHN0YXRlIHByb3BlcnRpZXMgdGhlIE9iamVjdCBpc1xuICAgICAqIHR3ZWVuaW5nIGZyb20uXG4gICAgICogQHBhcmFtIHtPYmplY3R9IHRhcmdldFN0YXRlOiBUaGUgZGVzdGluYXRpb24gc3RhdGUgcHJvcGVydGllcyB0aGUgT2JqZWN0XG4gICAgICogaXMgdHdlZW5pbmcgdG8uXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGR1cmF0aW9uOiBUaGUgbGVuZ3RoIG9mIHRoZSB0d2VlbiBpbiBtaWxsaXNlY29uZHMuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHRpbWVzdGFtcDogVGhlIFVOSVggZXBvY2ggdGltZSBhdCB3aGljaCB0aGUgdHdlZW4gYmVnYW4uXG4gICAgICogQHBhcmFtIHtPYmplY3R9IGVhc2luZzogVGhpcyBPYmplY3QncyBrZXlzIG11c3QgY29ycmVzcG9uZCB0byB0aGUga2V5cyBpblxuICAgICAqIHRhcmdldFN0YXRlLlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIHR3ZWVuUHJvcHMgKGZvclBvc2l0aW9uLCBjdXJyZW50U3RhdGUsIG9yaWdpbmFsU3RhdGUsIHRhcmdldFN0YXRlLFxuICAgICAgZHVyYXRpb24sIHRpbWVzdGFtcCwgZWFzaW5nKSB7XG4gICAgICB2YXIgbm9ybWFsaXplZFBvc2l0aW9uID0gKGZvclBvc2l0aW9uIC0gdGltZXN0YW1wKSAvIGR1cmF0aW9uO1xuXG4gICAgICB2YXIgcHJvcDtcbiAgICAgIGZvciAocHJvcCBpbiBjdXJyZW50U3RhdGUpIHtcbiAgICAgICAgaWYgKGN1cnJlbnRTdGF0ZS5oYXNPd25Qcm9wZXJ0eShwcm9wKSkge1xuICAgICAgICAgIGN1cnJlbnRTdGF0ZVtwcm9wXSA9IHR3ZWVuUHJvcChvcmlnaW5hbFN0YXRlW3Byb3BdLFxuICAgICAgICAgICAgdGFyZ2V0U3RhdGVbcHJvcF0sIGZvcm11bGFbZWFzaW5nW3Byb3BdXSwgbm9ybWFsaXplZFBvc2l0aW9uKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gY3VycmVudFN0YXRlO1xuICAgIH1cblxuICAgIC8qIVxuICAgICAqIFR3ZWVucyBhIHNpbmdsZSBwcm9wZXJ0eS5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gc3RhcnQgVGhlIHZhbHVlIHRoYXQgdGhlIHR3ZWVuIHN0YXJ0ZWQgZnJvbS5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gZW5kIFRoZSB2YWx1ZSB0aGF0IHRoZSB0d2VlbiBzaG91bGQgZW5kIGF0LlxuICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IGVhc2luZ0Z1bmMgVGhlIGVhc2luZyBjdXJ2ZSB0byBhcHBseSB0byB0aGUgdHdlZW4uXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHBvc2l0aW9uIFRoZSBub3JtYWxpemVkIHBvc2l0aW9uIChiZXR3ZWVuIDAuMCBhbmQgMS4wKSB0b1xuICAgICAqIGNhbGN1bGF0ZSB0aGUgbWlkcG9pbnQgb2YgJ3N0YXJ0JyBhbmQgJ2VuZCcgYWdhaW5zdC5cbiAgICAgKiBAcmV0dXJuIHtudW1iZXJ9IFRoZSB0d2VlbmVkIHZhbHVlLlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIHR3ZWVuUHJvcCAoc3RhcnQsIGVuZCwgZWFzaW5nRnVuYywgcG9zaXRpb24pIHtcbiAgICAgIHJldHVybiBzdGFydCArIChlbmQgLSBzdGFydCkgKiBlYXNpbmdGdW5jKHBvc2l0aW9uKTtcbiAgICB9XG5cbiAgICAvKiFcbiAgICAgKiBBcHBsaWVzIGEgZmlsdGVyIHRvIFR3ZWVuYWJsZSBpbnN0YW5jZS5cbiAgICAgKiBAcGFyYW0ge1R3ZWVuYWJsZX0gdHdlZW5hYmxlIFRoZSBgVHdlZW5hYmxlYCBpbnN0YW5jZSB0byBjYWxsIHRoZSBmaWx0ZXJcbiAgICAgKiB1cG9uLlxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBmaWx0ZXJOYW1lIFRoZSBuYW1lIG9mIHRoZSBmaWx0ZXIgdG8gYXBwbHkuXG4gICAgICovXG4gICAgZnVuY3Rpb24gYXBwbHlGaWx0ZXIgKHR3ZWVuYWJsZSwgZmlsdGVyTmFtZSkge1xuICAgICAgdmFyIGZpbHRlcnMgPSBUd2VlbmFibGUucHJvdG90eXBlLmZpbHRlcjtcbiAgICAgIHZhciBhcmdzID0gdHdlZW5hYmxlLl9maWx0ZXJBcmdzO1xuXG4gICAgICBlYWNoKGZpbHRlcnMsIGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICAgIGlmICh0eXBlb2YgZmlsdGVyc1tuYW1lXVtmaWx0ZXJOYW1lXSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICBmaWx0ZXJzW25hbWVdW2ZpbHRlck5hbWVdLmFwcGx5KHR3ZWVuYWJsZSwgYXJncyk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHZhciB0aW1lb3V0SGFuZGxlcl9lbmRUaW1lO1xuICAgIHZhciB0aW1lb3V0SGFuZGxlcl9jdXJyZW50VGltZTtcbiAgICB2YXIgdGltZW91dEhhbmRsZXJfaXNFbmRlZDtcbiAgICB2YXIgdGltZW91dEhhbmRsZXJfb2Zmc2V0O1xuICAgIC8qIVxuICAgICAqIEhhbmRsZXMgdGhlIHVwZGF0ZSBsb2dpYyBmb3Igb25lIHN0ZXAgb2YgYSB0d2Vlbi5cbiAgICAgKiBAcGFyYW0ge1R3ZWVuYWJsZX0gdHdlZW5hYmxlXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHRpbWVzdGFtcFxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBkdXJhdGlvblxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBjdXJyZW50U3RhdGVcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gb3JpZ2luYWxTdGF0ZVxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSB0YXJnZXRTdGF0ZVxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBlYXNpbmdcbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9uKE9iamVjdCwgKiwgbnVtYmVyKX0gc3RlcFxuICAgICAqIEBwYXJhbSB7RnVuY3Rpb24oRnVuY3Rpb24sbnVtYmVyKX19IHNjaGVkdWxlXG4gICAgICovXG4gICAgZnVuY3Rpb24gdGltZW91dEhhbmRsZXIgKHR3ZWVuYWJsZSwgdGltZXN0YW1wLCBkdXJhdGlvbiwgY3VycmVudFN0YXRlLFxuICAgICAgb3JpZ2luYWxTdGF0ZSwgdGFyZ2V0U3RhdGUsIGVhc2luZywgc3RlcCwgc2NoZWR1bGUpIHtcbiAgICAgIHRpbWVvdXRIYW5kbGVyX2VuZFRpbWUgPSB0aW1lc3RhbXAgKyBkdXJhdGlvbjtcbiAgICAgIHRpbWVvdXRIYW5kbGVyX2N1cnJlbnRUaW1lID0gTWF0aC5taW4obm93KCksIHRpbWVvdXRIYW5kbGVyX2VuZFRpbWUpO1xuICAgICAgdGltZW91dEhhbmRsZXJfaXNFbmRlZCA9XG4gICAgICAgIHRpbWVvdXRIYW5kbGVyX2N1cnJlbnRUaW1lID49IHRpbWVvdXRIYW5kbGVyX2VuZFRpbWU7XG5cbiAgICAgIHRpbWVvdXRIYW5kbGVyX29mZnNldCA9IGR1cmF0aW9uIC0gKFxuICAgICAgICAgIHRpbWVvdXRIYW5kbGVyX2VuZFRpbWUgLSB0aW1lb3V0SGFuZGxlcl9jdXJyZW50VGltZSk7XG5cbiAgICAgIGlmICh0d2VlbmFibGUuaXNQbGF5aW5nKCkgJiYgIXRpbWVvdXRIYW5kbGVyX2lzRW5kZWQpIHtcbiAgICAgICAgdHdlZW5hYmxlLl9zY2hlZHVsZUlkID0gc2NoZWR1bGUodHdlZW5hYmxlLl90aW1lb3V0SGFuZGxlciwgVVBEQVRFX1RJTUUpO1xuXG4gICAgICAgIGFwcGx5RmlsdGVyKHR3ZWVuYWJsZSwgJ2JlZm9yZVR3ZWVuJyk7XG4gICAgICAgIHR3ZWVuUHJvcHModGltZW91dEhhbmRsZXJfY3VycmVudFRpbWUsIGN1cnJlbnRTdGF0ZSwgb3JpZ2luYWxTdGF0ZSxcbiAgICAgICAgICB0YXJnZXRTdGF0ZSwgZHVyYXRpb24sIHRpbWVzdGFtcCwgZWFzaW5nKTtcbiAgICAgICAgYXBwbHlGaWx0ZXIodHdlZW5hYmxlLCAnYWZ0ZXJUd2VlbicpO1xuXG4gICAgICAgIHN0ZXAoY3VycmVudFN0YXRlLCB0d2VlbmFibGUuX2F0dGFjaG1lbnQsIHRpbWVvdXRIYW5kbGVyX29mZnNldCk7XG4gICAgICB9IGVsc2UgaWYgKHRpbWVvdXRIYW5kbGVyX2lzRW5kZWQpIHtcbiAgICAgICAgc3RlcCh0YXJnZXRTdGF0ZSwgdHdlZW5hYmxlLl9hdHRhY2htZW50LCB0aW1lb3V0SGFuZGxlcl9vZmZzZXQpO1xuICAgICAgICB0d2VlbmFibGUuc3RvcCh0cnVlKTtcbiAgICAgIH1cbiAgICB9XG5cblxuICAgIC8qIVxuICAgICAqIENyZWF0ZXMgYSB1c2FibGUgZWFzaW5nIE9iamVjdCBmcm9tIGVpdGhlciBhIHN0cmluZyBvciBhbm90aGVyIGVhc2luZ1xuICAgICAqIE9iamVjdC4gIElmIGBlYXNpbmdgIGlzIGFuIE9iamVjdCwgdGhlbiB0aGlzIGZ1bmN0aW9uIGNsb25lcyBpdCBhbmQgZmlsbHNcbiAgICAgKiBpbiB0aGUgbWlzc2luZyBwcm9wZXJ0aWVzIHdpdGggXCJsaW5lYXJcIi5cbiAgICAgKiBAcGFyYW0ge09iamVjdH0gZnJvbVR3ZWVuUGFyYW1zXG4gICAgICogQHBhcmFtIHtPYmplY3R8c3RyaW5nfSBlYXNpbmdcbiAgICAgKi9cbiAgICBmdW5jdGlvbiBjb21wb3NlRWFzaW5nT2JqZWN0IChmcm9tVHdlZW5QYXJhbXMsIGVhc2luZykge1xuICAgICAgdmFyIGNvbXBvc2VkRWFzaW5nID0ge307XG5cbiAgICAgIGlmICh0eXBlb2YgZWFzaW5nID09PSAnc3RyaW5nJykge1xuICAgICAgICBlYWNoKGZyb21Ud2VlblBhcmFtcywgZnVuY3Rpb24gKHByb3ApIHtcbiAgICAgICAgICBjb21wb3NlZEVhc2luZ1twcm9wXSA9IGVhc2luZztcbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBlYWNoKGZyb21Ud2VlblBhcmFtcywgZnVuY3Rpb24gKHByb3ApIHtcbiAgICAgICAgICBpZiAoIWNvbXBvc2VkRWFzaW5nW3Byb3BdKSB7XG4gICAgICAgICAgICBjb21wb3NlZEVhc2luZ1twcm9wXSA9IGVhc2luZ1twcm9wXSB8fCBERUZBVUxUX0VBU0lORztcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gY29tcG9zZWRFYXNpbmc7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVHdlZW5hYmxlIGNvbnN0cnVjdG9yLlxuICAgICAqIEBwYXJhbSB7T2JqZWN0PX0gb3B0X2luaXRpYWxTdGF0ZSBUaGUgdmFsdWVzIHRoYXQgdGhlIGluaXRpYWwgdHdlZW4gc2hvdWxkIHN0YXJ0IGF0IGlmIGEgXCJmcm9tXCIgb2JqZWN0IGlzIG5vdCBwcm92aWRlZCB0byBUd2VlbmFibGUjdHdlZW4uXG4gICAgICogQHBhcmFtIHtPYmplY3Q9fSBvcHRfY29uZmlnIFNlZSBUd2VlbmFibGUucHJvdG90eXBlLnNldENvbmZpZygpXG4gICAgICogQGNvbnN0cnVjdG9yXG4gICAgICovXG4gICAgZnVuY3Rpb24gVHdlZW5hYmxlIChvcHRfaW5pdGlhbFN0YXRlLCBvcHRfY29uZmlnKSB7XG4gICAgICB0aGlzLl9jdXJyZW50U3RhdGUgPSBvcHRfaW5pdGlhbFN0YXRlIHx8IHt9O1xuICAgICAgdGhpcy5fY29uZmlndXJlZCA9IGZhbHNlO1xuICAgICAgdGhpcy5fc2NoZWR1bGVGdW5jdGlvbiA9IERFRkFVTFRfU0NIRURVTEVfRlVOQ1RJT047XG5cbiAgICAgIC8vIFRvIHByZXZlbnQgdW5uZWNlc3NhcnkgY2FsbHMgdG8gc2V0Q29uZmlnIGRvIG5vdCBzZXQgZGVmYXVsdCBjb25maWd1cmF0aW9uIGhlcmUuXG4gICAgICAvLyBPbmx5IHNldCBkZWZhdWx0IGNvbmZpZ3VyYXRpb24gaW1tZWRpYXRlbHkgYmVmb3JlIHR3ZWVuaW5nIGlmIG5vbmUgaGFzIGJlZW4gc2V0LlxuICAgICAgaWYgKHR5cGVvZiBvcHRfY29uZmlnICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICB0aGlzLnNldENvbmZpZyhvcHRfY29uZmlnKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDb25maWd1cmUgYW5kIHN0YXJ0IGEgdHdlZW4uXG4gICAgICogQHBhcmFtIHtPYmplY3Q9fSBvcHRfY29uZmlnIFNlZSBUd2VlbmFibGUucHJvdG90eXBlLnNldENvbmZpZygpXG4gICAgICogQHJldHVybiB7VHdlZW5hYmxlfVxuICAgICAqL1xuICAgIFR3ZWVuYWJsZS5wcm90b3R5cGUudHdlZW4gPSBmdW5jdGlvbiAob3B0X2NvbmZpZykge1xuICAgICAgaWYgKHRoaXMuX2lzVHdlZW5pbmcpIHtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICB9XG5cbiAgICAgIC8vIE9ubHkgc2V0IGRlZmF1bHQgY29uZmlnIGlmIG5vIGNvbmZpZ3VyYXRpb24gaGFzIGJlZW4gc2V0IHByZXZpb3VzbHkgYW5kIG5vbmUgaXMgcHJvdmlkZWQgbm93LlxuICAgICAgaWYgKG9wdF9jb25maWcgIT09IHVuZGVmaW5lZCB8fCAhdGhpcy5fY29uZmlndXJlZCkge1xuICAgICAgICB0aGlzLnNldENvbmZpZyhvcHRfY29uZmlnKTtcbiAgICAgIH1cblxuICAgICAgdGhpcy5fdGltZXN0YW1wID0gbm93KCk7XG4gICAgICB0aGlzLl9zdGFydCh0aGlzLmdldCgpLCB0aGlzLl9hdHRhY2htZW50KTtcbiAgICAgIHJldHVybiB0aGlzLnJlc3VtZSgpO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSB0d2VlbiBjb25maWd1cmF0aW9uLiBgY29uZmlnYCBtYXkgaGF2ZSB0aGUgZm9sbG93aW5nIG9wdGlvbnM6XG4gICAgICpcbiAgICAgKiAtIF9fZnJvbV9fIChfT2JqZWN0PV8pOiBTdGFydGluZyBwb3NpdGlvbi4gIElmIG9taXR0ZWQsIHRoZSBjdXJyZW50IHN0YXRlIGlzIHVzZWQuXG4gICAgICogLSBfX3RvX18gKF9PYmplY3Q9Xyk6IEVuZGluZyBwb3NpdGlvbi5cbiAgICAgKiAtIF9fZHVyYXRpb25fXyAoX251bWJlcj1fKTogSG93IG1hbnkgbWlsbGlzZWNvbmRzIHRvIGFuaW1hdGUgZm9yLlxuICAgICAqIC0gX19zdGFydF9fIChfRnVuY3Rpb24oT2JqZWN0KV8pOiBGdW5jdGlvbiB0byBleGVjdXRlIHdoZW4gdGhlIHR3ZWVuIGJlZ2lucy4gIFJlY2VpdmVzIHRoZSBzdGF0ZSBvZiB0aGUgdHdlZW4gYXMgdGhlIGZpcnN0IHBhcmFtZXRlci4gQXR0YWNobWVudCBpcyB0aGUgc2Vjb25kIHBhcmFtZXRlci5cbiAgICAgKiAtIF9fc3RlcF9fIChfRnVuY3Rpb24oT2JqZWN0LCAqLCBudW1iZXIpXyk6IEZ1bmN0aW9uIHRvIGV4ZWN1dGUgb24gZXZlcnkgdGljay4gIFJlY2VpdmVzIHRoZSBzdGF0ZSBvZiB0aGUgdHdlZW4gYXMgdGhlIGZpcnN0IHBhcmFtZXRlci4gQXR0YWNobWVudCBpcyB0aGUgc2Vjb25kIHBhcmFtZXRlciwgYW5kIHRoZSB0aW1lIGVsYXBzZWQgc2luY2UgdGhlIHN0YXJ0IG9mIHRoZSB0d2VlbiBpcyB0aGUgdGhpcmQgcGFyYW1ldGVyLiBUaGlzIGZ1bmN0aW9uIGlzIG5vdCBjYWxsZWQgb24gdGhlIGZpbmFsIHN0ZXAgb2YgdGhlIGFuaW1hdGlvbiwgYnV0IGBmaW5pc2hgIGlzLlxuICAgICAqIC0gX19maW5pc2hfXyAoX0Z1bmN0aW9uKE9iamVjdCwgKilfKTogRnVuY3Rpb24gdG8gZXhlY3V0ZSB1cG9uIHR3ZWVuIGNvbXBsZXRpb24uICBSZWNlaXZlcyB0aGUgc3RhdGUgb2YgdGhlIHR3ZWVuIGFzIHRoZSBmaXJzdCBwYXJhbWV0ZXIuIEF0dGFjaG1lbnQgaXMgdGhlIHNlY29uZCBwYXJhbWV0ZXIuXG4gICAgICogLSBfX2Vhc2luZ19fIChfT2JqZWN0fHN0cmluZz1fKTogRWFzaW5nIGN1cnZlIG5hbWUocykgdG8gdXNlIGZvciB0aGUgdHdlZW4uXG4gICAgICogLSBfX2F0dGFjaG1lbnRfXyAoX09iamVjdHxzdHJpbmd8YW55PV8pOiBWYWx1ZSB0aGF0IGlzIGF0dGFjaGVkIHRvIHRoaXMgaW5zdGFuY2UgYW5kIHBhc3NlZCBvbiB0byB0aGUgc3RlcC9zdGFydC9maW5pc2ggbWV0aG9kcy5cbiAgICAgKiBAcGFyYW0ge09iamVjdH0gY29uZmlnXG4gICAgICogQHJldHVybiB7VHdlZW5hYmxlfVxuICAgICAqL1xuICAgIFR3ZWVuYWJsZS5wcm90b3R5cGUuc2V0Q29uZmlnID0gZnVuY3Rpb24gKGNvbmZpZykge1xuICAgICAgY29uZmlnID0gY29uZmlnIHx8IHt9O1xuICAgICAgdGhpcy5fY29uZmlndXJlZCA9IHRydWU7XG5cbiAgICAgIC8vIEF0dGFjaCBzb21ldGhpbmcgdG8gdGhpcyBUd2VlbmFibGUgaW5zdGFuY2UgKGUuZy46IGEgRE9NIGVsZW1lbnQsIGFuIG9iamVjdCwgYSBzdHJpbmcsIGV0Yy4pO1xuICAgICAgdGhpcy5fYXR0YWNobWVudCA9IGNvbmZpZy5hdHRhY2htZW50O1xuXG4gICAgICAvLyBJbml0IHRoZSBpbnRlcm5hbCBzdGF0ZVxuICAgICAgdGhpcy5fcGF1c2VkQXRUaW1lID0gbnVsbDtcbiAgICAgIHRoaXMuX3NjaGVkdWxlSWQgPSBudWxsO1xuICAgICAgdGhpcy5fc3RhcnQgPSBjb25maWcuc3RhcnQgfHwgbm9vcDtcbiAgICAgIHRoaXMuX3N0ZXAgPSBjb25maWcuc3RlcCB8fCBub29wO1xuICAgICAgdGhpcy5fZmluaXNoID0gY29uZmlnLmZpbmlzaCB8fCBub29wO1xuICAgICAgdGhpcy5fZHVyYXRpb24gPSBjb25maWcuZHVyYXRpb24gfHwgREVGQVVMVF9EVVJBVElPTjtcbiAgICAgIHRoaXMuX2N1cnJlbnRTdGF0ZSA9IGNvbmZpZy5mcm9tIHx8IHRoaXMuZ2V0KCk7XG4gICAgICB0aGlzLl9vcmlnaW5hbFN0YXRlID0gdGhpcy5nZXQoKTtcbiAgICAgIHRoaXMuX3RhcmdldFN0YXRlID0gY29uZmlnLnRvIHx8IHRoaXMuZ2V0KCk7XG5cbiAgICAgIC8vIEFsaWFzZXMgdXNlZCBiZWxvd1xuICAgICAgdmFyIGN1cnJlbnRTdGF0ZSA9IHRoaXMuX2N1cnJlbnRTdGF0ZTtcbiAgICAgIHZhciB0YXJnZXRTdGF0ZSA9IHRoaXMuX3RhcmdldFN0YXRlO1xuXG4gICAgICAvLyBFbnN1cmUgdGhhdCB0aGVyZSBpcyBhbHdheXMgc29tZXRoaW5nIHRvIHR3ZWVuIHRvLlxuICAgICAgZGVmYXVsdHModGFyZ2V0U3RhdGUsIGN1cnJlbnRTdGF0ZSk7XG5cbiAgICAgIHRoaXMuX2Vhc2luZyA9IGNvbXBvc2VFYXNpbmdPYmplY3QoXG4gICAgICAgIGN1cnJlbnRTdGF0ZSwgY29uZmlnLmVhc2luZyB8fCBERUZBVUxUX0VBU0lORyk7XG5cbiAgICAgIHRoaXMuX2ZpbHRlckFyZ3MgPVxuICAgICAgICBbY3VycmVudFN0YXRlLCB0aGlzLl9vcmlnaW5hbFN0YXRlLCB0YXJnZXRTdGF0ZSwgdGhpcy5fZWFzaW5nXTtcblxuICAgICAgYXBwbHlGaWx0ZXIodGhpcywgJ3R3ZWVuQ3JlYXRlZCcpO1xuICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIEdldHMgdGhlIGN1cnJlbnQgc3RhdGUuXG4gICAgICogQHJldHVybiB7T2JqZWN0fVxuICAgICAqL1xuICAgIFR3ZWVuYWJsZS5wcm90b3R5cGUuZ2V0ID0gZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIHNoYWxsb3dDb3B5KHt9LCB0aGlzLl9jdXJyZW50U3RhdGUpO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSBjdXJyZW50IHN0YXRlLlxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBzdGF0ZVxuICAgICAqL1xuICAgIFR3ZWVuYWJsZS5wcm90b3R5cGUuc2V0ID0gZnVuY3Rpb24gKHN0YXRlKSB7XG4gICAgICB0aGlzLl9jdXJyZW50U3RhdGUgPSBzdGF0ZTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogUGF1c2VzIGEgdHdlZW4uICBQYXVzZWQgdHdlZW5zIGNhbiBiZSByZXN1bWVkIGZyb20gdGhlIHBvaW50IGF0IHdoaWNoIHRoZXkgd2VyZSBwYXVzZWQuICBUaGlzIGlzIGRpZmZlcmVudCB0aGFuIFtgc3RvcCgpYF0oI3N0b3ApLCBhcyB0aGF0IG1ldGhvZCBjYXVzZXMgYSB0d2VlbiB0byBzdGFydCBvdmVyIHdoZW4gaXQgaXMgcmVzdW1lZC5cbiAgICAgKiBAcmV0dXJuIHtUd2VlbmFibGV9XG4gICAgICovXG4gICAgVHdlZW5hYmxlLnByb3RvdHlwZS5wYXVzZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIHRoaXMuX3BhdXNlZEF0VGltZSA9IG5vdygpO1xuICAgICAgdGhpcy5faXNQYXVzZWQgPSB0cnVlO1xuICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIFJlc3VtZXMgYSBwYXVzZWQgdHdlZW4uXG4gICAgICogQHJldHVybiB7VHdlZW5hYmxlfVxuICAgICAqL1xuICAgIFR3ZWVuYWJsZS5wcm90b3R5cGUucmVzdW1lID0gZnVuY3Rpb24gKCkge1xuICAgICAgaWYgKHRoaXMuX2lzUGF1c2VkKSB7XG4gICAgICAgIHRoaXMuX3RpbWVzdGFtcCArPSBub3coKSAtIHRoaXMuX3BhdXNlZEF0VGltZTtcbiAgICAgIH1cblxuICAgICAgdGhpcy5faXNQYXVzZWQgPSBmYWxzZTtcbiAgICAgIHRoaXMuX2lzVHdlZW5pbmcgPSB0cnVlO1xuXG4gICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICB0aGlzLl90aW1lb3V0SGFuZGxlciA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGltZW91dEhhbmRsZXIoc2VsZiwgc2VsZi5fdGltZXN0YW1wLCBzZWxmLl9kdXJhdGlvbiwgc2VsZi5fY3VycmVudFN0YXRlLFxuICAgICAgICAgIHNlbGYuX29yaWdpbmFsU3RhdGUsIHNlbGYuX3RhcmdldFN0YXRlLCBzZWxmLl9lYXNpbmcsIHNlbGYuX3N0ZXAsXG4gICAgICAgICAgc2VsZi5fc2NoZWR1bGVGdW5jdGlvbik7XG4gICAgICB9O1xuXG4gICAgICB0aGlzLl90aW1lb3V0SGFuZGxlcigpO1xuXG4gICAgICByZXR1cm4gdGhpcztcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogTW92ZSB0aGUgc3RhdGUgb2YgdGhlIGFuaW1hdGlvbiB0byBhIHNwZWNpZmljIHBvaW50IGluIHRoZSB0d2VlbidzIHRpbWVsaW5lLlxuICAgICAqIElmIHRoZSBhbmltYXRpb24gaXMgbm90IHJ1bm5pbmcsIHRoaXMgd2lsbCBjYXVzZSB0aGUgYHN0ZXBgIGhhbmRsZXJzIHRvIGJlXG4gICAgICogY2FsbGVkLlxuICAgICAqIEBwYXJhbSB7bWlsbGlzZWNvbmR9IG1pbGxpc2Vjb25kIFRoZSBtaWxsaXNlY29uZCBvZiB0aGUgYW5pbWF0aW9uIHRvIHNlZWsgdG8uXG4gICAgICogQHJldHVybiB7VHdlZW5hYmxlfVxuICAgICAqL1xuICAgIFR3ZWVuYWJsZS5wcm90b3R5cGUuc2VlayA9IGZ1bmN0aW9uIChtaWxsaXNlY29uZCkge1xuICAgICAgdGhpcy5fdGltZXN0YW1wID0gbm93KCkgLSBtaWxsaXNlY29uZDtcblxuICAgICAgaWYgKCF0aGlzLmlzUGxheWluZygpKSB7XG4gICAgICAgIHRoaXMuX2lzVHdlZW5pbmcgPSB0cnVlO1xuICAgICAgICB0aGlzLl9pc1BhdXNlZCA9IGZhbHNlO1xuXG4gICAgICAgIC8vIElmIHRoZSBhbmltYXRpb24gaXMgbm90IHJ1bm5pbmcsIGNhbGwgdGltZW91dEhhbmRsZXIgdG8gbWFrZSBzdXJlIHRoYXRcbiAgICAgICAgLy8gYW55IHN0ZXAgaGFuZGxlcnMgYXJlIHJ1bi5cbiAgICAgICAgdGltZW91dEhhbmRsZXIodGhpcywgdGhpcy5fdGltZXN0YW1wLCB0aGlzLl9kdXJhdGlvbiwgdGhpcy5fY3VycmVudFN0YXRlLFxuICAgICAgICAgIHRoaXMuX29yaWdpbmFsU3RhdGUsIHRoaXMuX3RhcmdldFN0YXRlLCB0aGlzLl9lYXNpbmcsIHRoaXMuX3N0ZXAsXG4gICAgICAgICAgdGhpcy5fc2NoZWR1bGVGdW5jdGlvbik7XG5cbiAgICAgICAgdGhpcy5fdGltZW91dEhhbmRsZXIoKTtcbiAgICAgICAgdGhpcy5wYXVzZSgpO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gdGhpcztcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogU3RvcHMgYW5kIGNhbmNlbHMgYSB0d2Vlbi5cbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW49fSBnb3RvRW5kIElmIGZhbHNlIG9yIG9taXR0ZWQsIHRoZSB0d2VlbiBqdXN0IHN0b3BzIGF0IGl0cyBjdXJyZW50IHN0YXRlLCBhbmQgdGhlIFwiZmluaXNoXCIgaGFuZGxlciBpcyBub3QgaW52b2tlZC4gIElmIHRydWUsIHRoZSB0d2VlbmVkIG9iamVjdCdzIHZhbHVlcyBhcmUgaW5zdGFudGx5IHNldCB0byB0aGUgdGFyZ2V0IHZhbHVlcywgYW5kIFwiZmluaXNoXCIgaXMgaW52b2tlZC5cbiAgICAgKiBAcmV0dXJuIHtUd2VlbmFibGV9XG4gICAgICovXG4gICAgVHdlZW5hYmxlLnByb3RvdHlwZS5zdG9wID0gZnVuY3Rpb24gKGdvdG9FbmQpIHtcbiAgICAgIHRoaXMuX2lzVHdlZW5pbmcgPSBmYWxzZTtcbiAgICAgIHRoaXMuX2lzUGF1c2VkID0gZmFsc2U7XG4gICAgICB0aGlzLl90aW1lb3V0SGFuZGxlciA9IG5vb3A7XG5cbiAgICAgIChyb290LmNhbmNlbEFuaW1hdGlvbkZyYW1lICAgICAgICAgICAgfHxcbiAgICAgICAgcm9vdC53ZWJraXRDYW5jZWxBbmltYXRpb25GcmFtZSAgICAgfHxcbiAgICAgICAgcm9vdC5vQ2FuY2VsQW5pbWF0aW9uRnJhbWUgICAgICAgICAgfHxcbiAgICAgICAgcm9vdC5tc0NhbmNlbEFuaW1hdGlvbkZyYW1lICAgICAgICAgfHxcbiAgICAgICAgcm9vdC5tb3pDYW5jZWxSZXF1ZXN0QW5pbWF0aW9uRnJhbWUgfHxcbiAgICAgICAgcm9vdC5jbGVhclRpbWVvdXQpKHRoaXMuX3NjaGVkdWxlSWQpO1xuXG4gICAgICBpZiAoZ290b0VuZCkge1xuICAgICAgICBzaGFsbG93Q29weSh0aGlzLl9jdXJyZW50U3RhdGUsIHRoaXMuX3RhcmdldFN0YXRlKTtcbiAgICAgICAgYXBwbHlGaWx0ZXIodGhpcywgJ2FmdGVyVHdlZW5FbmQnKTtcbiAgICAgICAgdGhpcy5fZmluaXNoLmNhbGwodGhpcywgdGhpcy5fY3VycmVudFN0YXRlLCB0aGlzLl9hdHRhY2htZW50KTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgd2hldGhlciBvciBub3QgYSB0d2VlbiBpcyBydW5uaW5nLlxuICAgICAqIEByZXR1cm4ge2Jvb2xlYW59XG4gICAgICovXG4gICAgVHdlZW5hYmxlLnByb3RvdHlwZS5pc1BsYXlpbmcgPSBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4gdGhpcy5faXNUd2VlbmluZyAmJiAhdGhpcy5faXNQYXVzZWQ7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIFNldHMgYSBjdXN0b20gc2NoZWR1bGUgZnVuY3Rpb24uXG4gICAgICpcbiAgICAgKiBJZiBhIGN1c3RvbSBmdW5jdGlvbiBpcyBub3Qgc2V0IHRoZSBkZWZhdWx0IG9uZSBpcyB1c2VkIFtgcmVxdWVzdEFuaW1hdGlvbkZyYW1lYF0oaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvQVBJL3dpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUpIGlmIGF2YWlsYWJsZSwgb3RoZXJ3aXNlIFtgc2V0VGltZW91dGBdKGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0FQSS9XaW5kb3cuc2V0VGltZW91dCkpLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtGdW5jdGlvbihGdW5jdGlvbixudW1iZXIpfSBzY2hlZHVsZUZ1bmN0aW9uIFRoZSBmdW5jdGlvbiB0byBiZSBjYWxsZWQgdG8gc2NoZWR1bGUgdGhlIG5leHQgZnJhbWUgdG8gYmUgcmVuZGVyZWRcbiAgICAgKi9cbiAgICBUd2VlbmFibGUucHJvdG90eXBlLnNldFNjaGVkdWxlRnVuY3Rpb24gPSBmdW5jdGlvbiAoc2NoZWR1bGVGdW5jdGlvbikge1xuICAgICAgdGhpcy5fc2NoZWR1bGVGdW5jdGlvbiA9IHNjaGVkdWxlRnVuY3Rpb247XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIGBkZWxldGVgcyBhbGwgXCJvd25cIiBwcm9wZXJ0aWVzLiAgQ2FsbCB0aGlzIHdoZW4gdGhlIGBUd2VlbmFibGVgIGluc3RhbmNlIGlzIG5vIGxvbmdlciBuZWVkZWQgdG8gZnJlZSBtZW1vcnkuXG4gICAgICovXG4gICAgVHdlZW5hYmxlLnByb3RvdHlwZS5kaXNwb3NlID0gZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIHByb3A7XG4gICAgICBmb3IgKHByb3AgaW4gdGhpcykge1xuICAgICAgICBpZiAodGhpcy5oYXNPd25Qcm9wZXJ0eShwcm9wKSkge1xuICAgICAgICAgIGRlbGV0ZSB0aGlzW3Byb3BdO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfTtcblxuICAgIC8qIVxuICAgICAqIEZpbHRlcnMgYXJlIHVzZWQgZm9yIHRyYW5zZm9ybWluZyB0aGUgcHJvcGVydGllcyBvZiBhIHR3ZWVuIGF0IHZhcmlvdXNcbiAgICAgKiBwb2ludHMgaW4gYSBUd2VlbmFibGUncyBsaWZlIGN5Y2xlLiAgU2VlIHRoZSBSRUFETUUgZm9yIG1vcmUgaW5mbyBvbiB0aGlzLlxuICAgICAqL1xuICAgIFR3ZWVuYWJsZS5wcm90b3R5cGUuZmlsdGVyID0ge307XG5cbiAgICAvKiFcbiAgICAgKiBUaGlzIG9iamVjdCBjb250YWlucyBhbGwgb2YgdGhlIHR3ZWVucyBhdmFpbGFibGUgdG8gU2hpZnR5LiAgSXQgaXMgZXh0ZW5kaWJsZSAtIHNpbXBseSBhdHRhY2ggcHJvcGVydGllcyB0byB0aGUgVHdlZW5hYmxlLnByb3RvdHlwZS5mb3JtdWxhIE9iamVjdCBmb2xsb3dpbmcgdGhlIHNhbWUgZm9ybWF0IGF0IGxpbmVhci5cbiAgICAgKlxuICAgICAqIGBwb3NgIHNob3VsZCBiZSBhIG5vcm1hbGl6ZWQgYG51bWJlcmAgKGJldHdlZW4gMCBhbmQgMSkuXG4gICAgICovXG4gICAgVHdlZW5hYmxlLnByb3RvdHlwZS5mb3JtdWxhID0ge1xuICAgICAgbGluZWFyOiBmdW5jdGlvbiAocG9zKSB7XG4gICAgICAgIHJldHVybiBwb3M7XG4gICAgICB9XG4gICAgfTtcblxuICAgIGZvcm11bGEgPSBUd2VlbmFibGUucHJvdG90eXBlLmZvcm11bGE7XG5cbiAgICBzaGFsbG93Q29weShUd2VlbmFibGUsIHtcbiAgICAgICdub3cnOiBub3dcbiAgICAgICwnZWFjaCc6IGVhY2hcbiAgICAgICwndHdlZW5Qcm9wcyc6IHR3ZWVuUHJvcHNcbiAgICAgICwndHdlZW5Qcm9wJzogdHdlZW5Qcm9wXG4gICAgICAsJ2FwcGx5RmlsdGVyJzogYXBwbHlGaWx0ZXJcbiAgICAgICwnc2hhbGxvd0NvcHknOiBzaGFsbG93Q29weVxuICAgICAgLCdkZWZhdWx0cyc6IGRlZmF1bHRzXG4gICAgICAsJ2NvbXBvc2VFYXNpbmdPYmplY3QnOiBjb21wb3NlRWFzaW5nT2JqZWN0XG4gICAgfSk7XG5cbiAgICByb290LlR3ZWVuYWJsZSA9IFR3ZWVuYWJsZTtcbiAgICByZXR1cm4gVHdlZW5hYmxlO1xuXG4gIH0gKCkpO1xuXG4gIC8qIVxuICAgKiBBbGwgZXF1YXRpb25zIGFyZSBhZGFwdGVkIGZyb20gVGhvbWFzIEZ1Y2hzJyBbU2NyaXB0eTJdKGh0dHBzOi8vZ2l0aHViLmNvbS9tYWRyb2JieS9zY3JpcHR5Mi9ibG9iL21hc3Rlci9zcmMvZWZmZWN0cy90cmFuc2l0aW9ucy9wZW5uZXIuanMpLlxuICAgKlxuICAgKiBCYXNlZCBvbiBFYXNpbmcgRXF1YXRpb25zIChjKSAyMDAzIFtSb2JlcnQgUGVubmVyXShodHRwOi8vd3d3LnJvYmVydHBlbm5lci5jb20vKSwgYWxsIHJpZ2h0cyByZXNlcnZlZC4gVGhpcyB3b3JrIGlzIFtzdWJqZWN0IHRvIHRlcm1zXShodHRwOi8vd3d3LnJvYmVydHBlbm5lci5jb20vZWFzaW5nX3Rlcm1zX29mX3VzZS5odG1sKS5cbiAgICovXG5cbiAgLyohXG4gICAqICBURVJNUyBPRiBVU0UgLSBFQVNJTkcgRVFVQVRJT05TXG4gICAqICBPcGVuIHNvdXJjZSB1bmRlciB0aGUgQlNEIExpY2Vuc2UuXG4gICAqICBFYXNpbmcgRXF1YXRpb25zIChjKSAyMDAzIFJvYmVydCBQZW5uZXIsIGFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gICAqL1xuXG4gIDsoZnVuY3Rpb24gKCkge1xuXG4gICAgVHdlZW5hYmxlLnNoYWxsb3dDb3B5KFR3ZWVuYWJsZS5wcm90b3R5cGUuZm9ybXVsYSwge1xuICAgICAgZWFzZUluUXVhZDogZnVuY3Rpb24gKHBvcykge1xuICAgICAgICByZXR1cm4gTWF0aC5wb3cocG9zLCAyKTtcbiAgICAgIH0sXG5cbiAgICAgIGVhc2VPdXRRdWFkOiBmdW5jdGlvbiAocG9zKSB7XG4gICAgICAgIHJldHVybiAtKE1hdGgucG93KChwb3MgLSAxKSwgMikgLSAxKTtcbiAgICAgIH0sXG5cbiAgICAgIGVhc2VJbk91dFF1YWQ6IGZ1bmN0aW9uIChwb3MpIHtcbiAgICAgICAgaWYgKChwb3MgLz0gMC41KSA8IDEpIHtyZXR1cm4gMC41ICogTWF0aC5wb3cocG9zLDIpO31cbiAgICAgICAgcmV0dXJuIC0wLjUgKiAoKHBvcyAtPSAyKSAqIHBvcyAtIDIpO1xuICAgICAgfSxcblxuICAgICAgZWFzZUluQ3ViaWM6IGZ1bmN0aW9uIChwb3MpIHtcbiAgICAgICAgcmV0dXJuIE1hdGgucG93KHBvcywgMyk7XG4gICAgICB9LFxuXG4gICAgICBlYXNlT3V0Q3ViaWM6IGZ1bmN0aW9uIChwb3MpIHtcbiAgICAgICAgcmV0dXJuIChNYXRoLnBvdygocG9zIC0gMSksIDMpICsgMSk7XG4gICAgICB9LFxuXG4gICAgICBlYXNlSW5PdXRDdWJpYzogZnVuY3Rpb24gKHBvcykge1xuICAgICAgICBpZiAoKHBvcyAvPSAwLjUpIDwgMSkge3JldHVybiAwLjUgKiBNYXRoLnBvdyhwb3MsMyk7fVxuICAgICAgICByZXR1cm4gMC41ICogKE1hdGgucG93KChwb3MgLSAyKSwzKSArIDIpO1xuICAgICAgfSxcblxuICAgICAgZWFzZUluUXVhcnQ6IGZ1bmN0aW9uIChwb3MpIHtcbiAgICAgICAgcmV0dXJuIE1hdGgucG93KHBvcywgNCk7XG4gICAgICB9LFxuXG4gICAgICBlYXNlT3V0UXVhcnQ6IGZ1bmN0aW9uIChwb3MpIHtcbiAgICAgICAgcmV0dXJuIC0oTWF0aC5wb3coKHBvcyAtIDEpLCA0KSAtIDEpO1xuICAgICAgfSxcblxuICAgICAgZWFzZUluT3V0UXVhcnQ6IGZ1bmN0aW9uIChwb3MpIHtcbiAgICAgICAgaWYgKChwb3MgLz0gMC41KSA8IDEpIHtyZXR1cm4gMC41ICogTWF0aC5wb3cocG9zLDQpO31cbiAgICAgICAgcmV0dXJuIC0wLjUgKiAoKHBvcyAtPSAyKSAqIE1hdGgucG93KHBvcywzKSAtIDIpO1xuICAgICAgfSxcblxuICAgICAgZWFzZUluUXVpbnQ6IGZ1bmN0aW9uIChwb3MpIHtcbiAgICAgICAgcmV0dXJuIE1hdGgucG93KHBvcywgNSk7XG4gICAgICB9LFxuXG4gICAgICBlYXNlT3V0UXVpbnQ6IGZ1bmN0aW9uIChwb3MpIHtcbiAgICAgICAgcmV0dXJuIChNYXRoLnBvdygocG9zIC0gMSksIDUpICsgMSk7XG4gICAgICB9LFxuXG4gICAgICBlYXNlSW5PdXRRdWludDogZnVuY3Rpb24gKHBvcykge1xuICAgICAgICBpZiAoKHBvcyAvPSAwLjUpIDwgMSkge3JldHVybiAwLjUgKiBNYXRoLnBvdyhwb3MsNSk7fVxuICAgICAgICByZXR1cm4gMC41ICogKE1hdGgucG93KChwb3MgLSAyKSw1KSArIDIpO1xuICAgICAgfSxcblxuICAgICAgZWFzZUluU2luZTogZnVuY3Rpb24gKHBvcykge1xuICAgICAgICByZXR1cm4gLU1hdGguY29zKHBvcyAqIChNYXRoLlBJIC8gMikpICsgMTtcbiAgICAgIH0sXG5cbiAgICAgIGVhc2VPdXRTaW5lOiBmdW5jdGlvbiAocG9zKSB7XG4gICAgICAgIHJldHVybiBNYXRoLnNpbihwb3MgKiAoTWF0aC5QSSAvIDIpKTtcbiAgICAgIH0sXG5cbiAgICAgIGVhc2VJbk91dFNpbmU6IGZ1bmN0aW9uIChwb3MpIHtcbiAgICAgICAgcmV0dXJuICgtMC41ICogKE1hdGguY29zKE1hdGguUEkgKiBwb3MpIC0gMSkpO1xuICAgICAgfSxcblxuICAgICAgZWFzZUluRXhwbzogZnVuY3Rpb24gKHBvcykge1xuICAgICAgICByZXR1cm4gKHBvcyA9PT0gMCkgPyAwIDogTWF0aC5wb3coMiwgMTAgKiAocG9zIC0gMSkpO1xuICAgICAgfSxcblxuICAgICAgZWFzZU91dEV4cG86IGZ1bmN0aW9uIChwb3MpIHtcbiAgICAgICAgcmV0dXJuIChwb3MgPT09IDEpID8gMSA6IC1NYXRoLnBvdygyLCAtMTAgKiBwb3MpICsgMTtcbiAgICAgIH0sXG5cbiAgICAgIGVhc2VJbk91dEV4cG86IGZ1bmN0aW9uIChwb3MpIHtcbiAgICAgICAgaWYgKHBvcyA9PT0gMCkge3JldHVybiAwO31cbiAgICAgICAgaWYgKHBvcyA9PT0gMSkge3JldHVybiAxO31cbiAgICAgICAgaWYgKChwb3MgLz0gMC41KSA8IDEpIHtyZXR1cm4gMC41ICogTWF0aC5wb3coMiwxMCAqIChwb3MgLSAxKSk7fVxuICAgICAgICByZXR1cm4gMC41ICogKC1NYXRoLnBvdygyLCAtMTAgKiAtLXBvcykgKyAyKTtcbiAgICAgIH0sXG5cbiAgICAgIGVhc2VJbkNpcmM6IGZ1bmN0aW9uIChwb3MpIHtcbiAgICAgICAgcmV0dXJuIC0oTWF0aC5zcXJ0KDEgLSAocG9zICogcG9zKSkgLSAxKTtcbiAgICAgIH0sXG5cbiAgICAgIGVhc2VPdXRDaXJjOiBmdW5jdGlvbiAocG9zKSB7XG4gICAgICAgIHJldHVybiBNYXRoLnNxcnQoMSAtIE1hdGgucG93KChwb3MgLSAxKSwgMikpO1xuICAgICAgfSxcblxuICAgICAgZWFzZUluT3V0Q2lyYzogZnVuY3Rpb24gKHBvcykge1xuICAgICAgICBpZiAoKHBvcyAvPSAwLjUpIDwgMSkge3JldHVybiAtMC41ICogKE1hdGguc3FydCgxIC0gcG9zICogcG9zKSAtIDEpO31cbiAgICAgICAgcmV0dXJuIDAuNSAqIChNYXRoLnNxcnQoMSAtIChwb3MgLT0gMikgKiBwb3MpICsgMSk7XG4gICAgICB9LFxuXG4gICAgICBlYXNlT3V0Qm91bmNlOiBmdW5jdGlvbiAocG9zKSB7XG4gICAgICAgIGlmICgocG9zKSA8ICgxIC8gMi43NSkpIHtcbiAgICAgICAgICByZXR1cm4gKDcuNTYyNSAqIHBvcyAqIHBvcyk7XG4gICAgICAgIH0gZWxzZSBpZiAocG9zIDwgKDIgLyAyLjc1KSkge1xuICAgICAgICAgIHJldHVybiAoNy41NjI1ICogKHBvcyAtPSAoMS41IC8gMi43NSkpICogcG9zICsgMC43NSk7XG4gICAgICAgIH0gZWxzZSBpZiAocG9zIDwgKDIuNSAvIDIuNzUpKSB7XG4gICAgICAgICAgcmV0dXJuICg3LjU2MjUgKiAocG9zIC09ICgyLjI1IC8gMi43NSkpICogcG9zICsgMC45Mzc1KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gKDcuNTYyNSAqIChwb3MgLT0gKDIuNjI1IC8gMi43NSkpICogcG9zICsgMC45ODQzNzUpO1xuICAgICAgICB9XG4gICAgICB9LFxuXG4gICAgICBlYXNlSW5CYWNrOiBmdW5jdGlvbiAocG9zKSB7XG4gICAgICAgIHZhciBzID0gMS43MDE1ODtcbiAgICAgICAgcmV0dXJuIChwb3MpICogcG9zICogKChzICsgMSkgKiBwb3MgLSBzKTtcbiAgICAgIH0sXG5cbiAgICAgIGVhc2VPdXRCYWNrOiBmdW5jdGlvbiAocG9zKSB7XG4gICAgICAgIHZhciBzID0gMS43MDE1ODtcbiAgICAgICAgcmV0dXJuIChwb3MgPSBwb3MgLSAxKSAqIHBvcyAqICgocyArIDEpICogcG9zICsgcykgKyAxO1xuICAgICAgfSxcblxuICAgICAgZWFzZUluT3V0QmFjazogZnVuY3Rpb24gKHBvcykge1xuICAgICAgICB2YXIgcyA9IDEuNzAxNTg7XG4gICAgICAgIGlmICgocG9zIC89IDAuNSkgPCAxKSB7cmV0dXJuIDAuNSAqIChwb3MgKiBwb3MgKiAoKChzICo9ICgxLjUyNSkpICsgMSkgKiBwb3MgLSBzKSk7fVxuICAgICAgICByZXR1cm4gMC41ICogKChwb3MgLT0gMikgKiBwb3MgKiAoKChzICo9ICgxLjUyNSkpICsgMSkgKiBwb3MgKyBzKSArIDIpO1xuICAgICAgfSxcblxuICAgICAgZWxhc3RpYzogZnVuY3Rpb24gKHBvcykge1xuICAgICAgICByZXR1cm4gLTEgKiBNYXRoLnBvdyg0LC04ICogcG9zKSAqIE1hdGguc2luKChwb3MgKiA2IC0gMSkgKiAoMiAqIE1hdGguUEkpIC8gMikgKyAxO1xuICAgICAgfSxcblxuICAgICAgc3dpbmdGcm9tVG86IGZ1bmN0aW9uIChwb3MpIHtcbiAgICAgICAgdmFyIHMgPSAxLjcwMTU4O1xuICAgICAgICByZXR1cm4gKChwb3MgLz0gMC41KSA8IDEpID8gMC41ICogKHBvcyAqIHBvcyAqICgoKHMgKj0gKDEuNTI1KSkgKyAxKSAqIHBvcyAtIHMpKSA6XG4gICAgICAgICAgICAwLjUgKiAoKHBvcyAtPSAyKSAqIHBvcyAqICgoKHMgKj0gKDEuNTI1KSkgKyAxKSAqIHBvcyArIHMpICsgMik7XG4gICAgICB9LFxuXG4gICAgICBzd2luZ0Zyb206IGZ1bmN0aW9uIChwb3MpIHtcbiAgICAgICAgdmFyIHMgPSAxLjcwMTU4O1xuICAgICAgICByZXR1cm4gcG9zICogcG9zICogKChzICsgMSkgKiBwb3MgLSBzKTtcbiAgICAgIH0sXG5cbiAgICAgIHN3aW5nVG86IGZ1bmN0aW9uIChwb3MpIHtcbiAgICAgICAgdmFyIHMgPSAxLjcwMTU4O1xuICAgICAgICByZXR1cm4gKHBvcyAtPSAxKSAqIHBvcyAqICgocyArIDEpICogcG9zICsgcykgKyAxO1xuICAgICAgfSxcblxuICAgICAgYm91bmNlOiBmdW5jdGlvbiAocG9zKSB7XG4gICAgICAgIGlmIChwb3MgPCAoMSAvIDIuNzUpKSB7XG4gICAgICAgICAgcmV0dXJuICg3LjU2MjUgKiBwb3MgKiBwb3MpO1xuICAgICAgICB9IGVsc2UgaWYgKHBvcyA8ICgyIC8gMi43NSkpIHtcbiAgICAgICAgICByZXR1cm4gKDcuNTYyNSAqIChwb3MgLT0gKDEuNSAvIDIuNzUpKSAqIHBvcyArIDAuNzUpO1xuICAgICAgICB9IGVsc2UgaWYgKHBvcyA8ICgyLjUgLyAyLjc1KSkge1xuICAgICAgICAgIHJldHVybiAoNy41NjI1ICogKHBvcyAtPSAoMi4yNSAvIDIuNzUpKSAqIHBvcyArIDAuOTM3NSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuICg3LjU2MjUgKiAocG9zIC09ICgyLjYyNSAvIDIuNzUpKSAqIHBvcyArIDAuOTg0Mzc1KTtcbiAgICAgICAgfVxuICAgICAgfSxcblxuICAgICAgYm91bmNlUGFzdDogZnVuY3Rpb24gKHBvcykge1xuICAgICAgICBpZiAocG9zIDwgKDEgLyAyLjc1KSkge1xuICAgICAgICAgIHJldHVybiAoNy41NjI1ICogcG9zICogcG9zKTtcbiAgICAgICAgfSBlbHNlIGlmIChwb3MgPCAoMiAvIDIuNzUpKSB7XG4gICAgICAgICAgcmV0dXJuIDIgLSAoNy41NjI1ICogKHBvcyAtPSAoMS41IC8gMi43NSkpICogcG9zICsgMC43NSk7XG4gICAgICAgIH0gZWxzZSBpZiAocG9zIDwgKDIuNSAvIDIuNzUpKSB7XG4gICAgICAgICAgcmV0dXJuIDIgLSAoNy41NjI1ICogKHBvcyAtPSAoMi4yNSAvIDIuNzUpKSAqIHBvcyArIDAuOTM3NSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIDIgLSAoNy41NjI1ICogKHBvcyAtPSAoMi42MjUgLyAyLjc1KSkgKiBwb3MgKyAwLjk4NDM3NSk7XG4gICAgICAgIH1cbiAgICAgIH0sXG5cbiAgICAgIGVhc2VGcm9tVG86IGZ1bmN0aW9uIChwb3MpIHtcbiAgICAgICAgaWYgKChwb3MgLz0gMC41KSA8IDEpIHtyZXR1cm4gMC41ICogTWF0aC5wb3cocG9zLDQpO31cbiAgICAgICAgcmV0dXJuIC0wLjUgKiAoKHBvcyAtPSAyKSAqIE1hdGgucG93KHBvcywzKSAtIDIpO1xuICAgICAgfSxcblxuICAgICAgZWFzZUZyb206IGZ1bmN0aW9uIChwb3MpIHtcbiAgICAgICAgcmV0dXJuIE1hdGgucG93KHBvcyw0KTtcbiAgICAgIH0sXG5cbiAgICAgIGVhc2VUbzogZnVuY3Rpb24gKHBvcykge1xuICAgICAgICByZXR1cm4gTWF0aC5wb3cocG9zLDAuMjUpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gIH0oKSk7XG5cbiAgLyohXG4gICAqIFRoZSBCZXppZXIgbWFnaWMgaW4gdGhpcyBmaWxlIGlzIGFkYXB0ZWQvY29waWVkIGFsbW9zdCB3aG9sZXNhbGUgZnJvbVxuICAgKiBbU2NyaXB0eTJdKGh0dHBzOi8vZ2l0aHViLmNvbS9tYWRyb2JieS9zY3JpcHR5Mi9ibG9iL21hc3Rlci9zcmMvZWZmZWN0cy90cmFuc2l0aW9ucy9jdWJpYy1iZXppZXIuanMpLFxuICAgKiB3aGljaCB3YXMgYWRhcHRlZCBmcm9tIEFwcGxlIGNvZGUgKHdoaWNoIHByb2JhYmx5IGNhbWUgZnJvbVxuICAgKiBbaGVyZV0oaHR0cDovL29wZW5zb3VyY2UuYXBwbGUuY29tL3NvdXJjZS9XZWJDb3JlL1dlYkNvcmUtOTU1LjY2L3BsYXRmb3JtL2dyYXBoaWNzL1VuaXRCZXppZXIuaCkpLlxuICAgKiBTcGVjaWFsIHRoYW5rcyB0byBBcHBsZSBhbmQgVGhvbWFzIEZ1Y2hzIGZvciBtdWNoIG9mIHRoaXMgY29kZS5cbiAgICovXG5cbiAgLyohXG4gICAqICBDb3B5cmlnaHQgKGMpIDIwMDYgQXBwbGUgQ29tcHV0ZXIsIEluYy4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAgICpcbiAgICogIFJlZGlzdHJpYnV0aW9uIGFuZCB1c2UgaW4gc291cmNlIGFuZCBiaW5hcnkgZm9ybXMsIHdpdGggb3Igd2l0aG91dFxuICAgKiAgbW9kaWZpY2F0aW9uLCBhcmUgcGVybWl0dGVkIHByb3ZpZGVkIHRoYXQgdGhlIGZvbGxvd2luZyBjb25kaXRpb25zIGFyZSBtZXQ6XG4gICAqXG4gICAqICAxLiBSZWRpc3RyaWJ1dGlvbnMgb2Ygc291cmNlIGNvZGUgbXVzdCByZXRhaW4gdGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UsXG4gICAqICB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyLlxuICAgKlxuICAgKiAgMi4gUmVkaXN0cmlidXRpb25zIGluIGJpbmFyeSBmb3JtIG11c3QgcmVwcm9kdWNlIHRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlLFxuICAgKiAgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lciBpbiB0aGUgZG9jdW1lbnRhdGlvblxuICAgKiAgYW5kL29yIG90aGVyIG1hdGVyaWFscyBwcm92aWRlZCB3aXRoIHRoZSBkaXN0cmlidXRpb24uXG4gICAqXG4gICAqICAzLiBOZWl0aGVyIHRoZSBuYW1lIG9mIHRoZSBjb3B5cmlnaHQgaG9sZGVyKHMpIG5vciB0aGUgbmFtZXMgb2YgYW55XG4gICAqICBjb250cmlidXRvcnMgbWF5IGJlIHVzZWQgdG8gZW5kb3JzZSBvciBwcm9tb3RlIHByb2R1Y3RzIGRlcml2ZWQgZnJvbVxuICAgKiAgdGhpcyBzb2Z0d2FyZSB3aXRob3V0IHNwZWNpZmljIHByaW9yIHdyaXR0ZW4gcGVybWlzc2lvbi5cbiAgICpcbiAgICogIFRISVMgU09GVFdBUkUgSVMgUFJPVklERUQgQlkgVEhFIENPUFlSSUdIVCBIT0xERVJTIEFORCBDT05UUklCVVRPUlNcbiAgICogIFwiQVMgSVNcIiBBTkQgQU5ZIEVYUFJFU1MgT1IgSU1QTElFRCBXQVJSQU5USUVTLCBJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTyxcbiAgICogIFRIRSBJTVBMSUVEIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZIEFORCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRVxuICAgKiAgQVJFIERJU0NMQUlNRUQuIElOIE5PIEVWRU5UIFNIQUxMIFRIRSBDT1BZUklHSFQgT1dORVIgT1IgQ09OVFJJQlVUT1JTIEJFIExJQUJMRVxuICAgKiAgRk9SIEFOWSBESVJFQ1QsIElORElSRUNULCBJTkNJREVOVEFMLCBTUEVDSUFMLCBFWEVNUExBUlksIE9SIENPTlNFUVVFTlRJQUwgREFNQUdFU1xuICAgKiAgKElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBQUk9DVVJFTUVOVCBPRiBTVUJTVElUVVRFIEdPT0RTIE9SIFNFUlZJQ0VTO1xuICAgKiAgTE9TUyBPRiBVU0UsIERBVEEsIE9SIFBST0ZJVFM7IE9SIEJVU0lORVNTIElOVEVSUlVQVElPTikgSE9XRVZFUiBDQVVTRUQgQU5EIE9OXG4gICAqICBBTlkgVEhFT1JZIE9GIExJQUJJTElUWSwgV0hFVEhFUiBJTiBDT05UUkFDVCwgU1RSSUNUIExJQUJJTElUWSwgT1IgVE9SVFxuICAgKiAgKElOQ0xVRElORyBORUdMSUdFTkNFIE9SIE9USEVSV0lTRSkgQVJJU0lORyBJTiBBTlkgV0FZIE9VVCBPRiBUSEUgVVNFIE9GIFRISVNcbiAgICogIFNPRlRXQVJFLCBFVkVOIElGIEFEVklTRUQgT0YgVEhFIFBPU1NJQklMSVRZIE9GIFNVQ0ggREFNQUdFLlxuICAgKi9cbiAgOyhmdW5jdGlvbiAoKSB7XG4gICAgLy8gcG9ydCBvZiB3ZWJraXQgY3ViaWMgYmV6aWVyIGhhbmRsaW5nIGJ5IGh0dHA6Ly93d3cubmV0emdlc3RhLmRlL2Rldi9cbiAgICBmdW5jdGlvbiBjdWJpY0JlemllckF0VGltZSh0LHAxeCxwMXkscDJ4LHAyeSxkdXJhdGlvbikge1xuICAgICAgdmFyIGF4ID0gMCxieCA9IDAsY3ggPSAwLGF5ID0gMCxieSA9IDAsY3kgPSAwO1xuICAgICAgZnVuY3Rpb24gc2FtcGxlQ3VydmVYKHQpIHtyZXR1cm4gKChheCAqIHQgKyBieCkgKiB0ICsgY3gpICogdDt9XG4gICAgICBmdW5jdGlvbiBzYW1wbGVDdXJ2ZVkodCkge3JldHVybiAoKGF5ICogdCArIGJ5KSAqIHQgKyBjeSkgKiB0O31cbiAgICAgIGZ1bmN0aW9uIHNhbXBsZUN1cnZlRGVyaXZhdGl2ZVgodCkge3JldHVybiAoMy4wICogYXggKiB0ICsgMi4wICogYngpICogdCArIGN4O31cbiAgICAgIGZ1bmN0aW9uIHNvbHZlRXBzaWxvbihkdXJhdGlvbikge3JldHVybiAxLjAgLyAoMjAwLjAgKiBkdXJhdGlvbik7fVxuICAgICAgZnVuY3Rpb24gc29sdmUoeCxlcHNpbG9uKSB7cmV0dXJuIHNhbXBsZUN1cnZlWShzb2x2ZUN1cnZlWCh4LGVwc2lsb24pKTt9XG4gICAgICBmdW5jdGlvbiBmYWJzKG4pIHtpZiAobiA+PSAwKSB7cmV0dXJuIG47fWVsc2Uge3JldHVybiAwIC0gbjt9fVxuICAgICAgZnVuY3Rpb24gc29sdmVDdXJ2ZVgoeCxlcHNpbG9uKSB7XG4gICAgICAgIHZhciB0MCx0MSx0Mix4MixkMixpO1xuICAgICAgICBmb3IgKHQyID0geCwgaSA9IDA7IGkgPCA4OyBpKyspIHt4MiA9IHNhbXBsZUN1cnZlWCh0MikgLSB4OyBpZiAoZmFicyh4MikgPCBlcHNpbG9uKSB7cmV0dXJuIHQyO30gZDIgPSBzYW1wbGVDdXJ2ZURlcml2YXRpdmVYKHQyKTsgaWYgKGZhYnMoZDIpIDwgMWUtNikge2JyZWFrO30gdDIgPSB0MiAtIHgyIC8gZDI7fVxuICAgICAgICB0MCA9IDAuMDsgdDEgPSAxLjA7IHQyID0geDsgaWYgKHQyIDwgdDApIHtyZXR1cm4gdDA7fSBpZiAodDIgPiB0MSkge3JldHVybiB0MTt9XG4gICAgICAgIHdoaWxlICh0MCA8IHQxKSB7eDIgPSBzYW1wbGVDdXJ2ZVgodDIpOyBpZiAoZmFicyh4MiAtIHgpIDwgZXBzaWxvbikge3JldHVybiB0Mjt9IGlmICh4ID4geDIpIHt0MCA9IHQyO31lbHNlIHt0MSA9IHQyO30gdDIgPSAodDEgLSB0MCkgKiAwLjUgKyB0MDt9XG4gICAgICAgIHJldHVybiB0MjsgLy8gRmFpbHVyZS5cbiAgICAgIH1cbiAgICAgIGN4ID0gMy4wICogcDF4OyBieCA9IDMuMCAqIChwMnggLSBwMXgpIC0gY3g7IGF4ID0gMS4wIC0gY3ggLSBieDsgY3kgPSAzLjAgKiBwMXk7IGJ5ID0gMy4wICogKHAyeSAtIHAxeSkgLSBjeTsgYXkgPSAxLjAgLSBjeSAtIGJ5O1xuICAgICAgcmV0dXJuIHNvbHZlKHQsIHNvbHZlRXBzaWxvbihkdXJhdGlvbikpO1xuICAgIH1cbiAgICAvKiFcbiAgICAgKiAgZ2V0Q3ViaWNCZXppZXJUcmFuc2l0aW9uKHgxLCB5MSwgeDIsIHkyKSAtPiBGdW5jdGlvblxuICAgICAqXG4gICAgICogIEdlbmVyYXRlcyBhIHRyYW5zaXRpb24gZWFzaW5nIGZ1bmN0aW9uIHRoYXQgaXMgY29tcGF0aWJsZVxuICAgICAqICB3aXRoIFdlYktpdCdzIENTUyB0cmFuc2l0aW9ucyBgLXdlYmtpdC10cmFuc2l0aW9uLXRpbWluZy1mdW5jdGlvbmBcbiAgICAgKiAgQ1NTIHByb3BlcnR5LlxuICAgICAqXG4gICAgICogIFRoZSBXM0MgaGFzIG1vcmUgaW5mb3JtYXRpb24gYWJvdXRcbiAgICAgKiAgPGEgaHJlZj1cImh0dHA6Ly93d3cudzMub3JnL1RSL2NzczMtdHJhbnNpdGlvbnMvI3RyYW5zaXRpb24tdGltaW5nLWZ1bmN0aW9uX3RhZ1wiPlxuICAgICAqICBDU1MzIHRyYW5zaXRpb24gdGltaW5nIGZ1bmN0aW9uczwvYT4uXG4gICAgICpcbiAgICAgKiAgQHBhcmFtIHtudW1iZXJ9IHgxXG4gICAgICogIEBwYXJhbSB7bnVtYmVyfSB5MVxuICAgICAqICBAcGFyYW0ge251bWJlcn0geDJcbiAgICAgKiAgQHBhcmFtIHtudW1iZXJ9IHkyXG4gICAgICogIEByZXR1cm4ge2Z1bmN0aW9ufVxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGdldEN1YmljQmV6aWVyVHJhbnNpdGlvbiAoeDEsIHkxLCB4MiwgeTIpIHtcbiAgICAgIHJldHVybiBmdW5jdGlvbiAocG9zKSB7XG4gICAgICAgIHJldHVybiBjdWJpY0JlemllckF0VGltZShwb3MseDEseTEseDIseTIsMSk7XG4gICAgICB9O1xuICAgIH1cbiAgICAvLyBFbmQgcG9ydGVkIGNvZGVcblxuICAgIC8qKlxuICAgICAqIENyZWF0ZXMgYSBCZXppZXIgZWFzaW5nIGZ1bmN0aW9uIGFuZCBhdHRhY2hlcyBpdCB0byBgVHdlZW5hYmxlLnByb3RvdHlwZS5mb3JtdWxhYC4gIFRoaXMgZnVuY3Rpb24gZ2l2ZXMgeW91IHRvdGFsIGNvbnRyb2wgb3ZlciB0aGUgZWFzaW5nIGN1cnZlLiAgTWF0dGhldyBMZWluJ3MgW0NlYXNlcl0oaHR0cDovL21hdHRoZXdsZWluLmNvbS9jZWFzZXIvKSBpcyBhIHVzZWZ1bCB0b29sIGZvciB2aXN1YWxpemluZyB0aGUgY3VydmVzIHlvdSBjYW4gbWFrZSB3aXRoIHRoaXMgZnVuY3Rpb24uXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gbmFtZSBUaGUgbmFtZSBvZiB0aGUgZWFzaW5nIGN1cnZlLiAgT3ZlcndyaXRlcyB0aGUgb2xkIGVhc2luZyBmdW5jdGlvbiBvbiBUd2VlbmFibGUucHJvdG90eXBlLmZvcm11bGEgaWYgaXQgZXhpc3RzLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSB4MVxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSB5MVxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSB4MlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSB5MlxuICAgICAqIEByZXR1cm4ge2Z1bmN0aW9ufSBUaGUgZWFzaW5nIGZ1bmN0aW9uIHRoYXQgd2FzIGF0dGFjaGVkIHRvIFR3ZWVuYWJsZS5wcm90b3R5cGUuZm9ybXVsYS5cbiAgICAgKi9cbiAgICBUd2VlbmFibGUuc2V0QmV6aWVyRnVuY3Rpb24gPSBmdW5jdGlvbiAobmFtZSwgeDEsIHkxLCB4MiwgeTIpIHtcbiAgICAgIHZhciBjdWJpY0JlemllclRyYW5zaXRpb24gPSBnZXRDdWJpY0JlemllclRyYW5zaXRpb24oeDEsIHkxLCB4MiwgeTIpO1xuICAgICAgY3ViaWNCZXppZXJUcmFuc2l0aW9uLngxID0geDE7XG4gICAgICBjdWJpY0JlemllclRyYW5zaXRpb24ueTEgPSB5MTtcbiAgICAgIGN1YmljQmV6aWVyVHJhbnNpdGlvbi54MiA9IHgyO1xuICAgICAgY3ViaWNCZXppZXJUcmFuc2l0aW9uLnkyID0geTI7XG5cbiAgICAgIHJldHVybiBUd2VlbmFibGUucHJvdG90eXBlLmZvcm11bGFbbmFtZV0gPSBjdWJpY0JlemllclRyYW5zaXRpb247XG4gICAgfTtcblxuXG4gICAgLyoqXG4gICAgICogYGRlbGV0ZWBzIGFuIGVhc2luZyBmdW5jdGlvbiBmcm9tIGBUd2VlbmFibGUucHJvdG90eXBlLmZvcm11bGFgLiAgQmUgY2FyZWZ1bCB3aXRoIHRoaXMgbWV0aG9kLCBhcyBpdCBgZGVsZXRlYHMgd2hhdGV2ZXIgZWFzaW5nIGZvcm11bGEgbWF0Y2hlcyBgbmFtZWAgKHdoaWNoIG1lYW5zIHlvdSBjYW4gZGVsZXRlIGRlZmF1bHQgU2hpZnR5IGVhc2luZyBmdW5jdGlvbnMpLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IG5hbWUgVGhlIG5hbWUgb2YgdGhlIGVhc2luZyBmdW5jdGlvbiB0byBkZWxldGUuXG4gICAgICogQHJldHVybiB7ZnVuY3Rpb259XG4gICAgICovXG4gICAgVHdlZW5hYmxlLnVuc2V0QmV6aWVyRnVuY3Rpb24gPSBmdW5jdGlvbiAobmFtZSkge1xuICAgICAgZGVsZXRlIFR3ZWVuYWJsZS5wcm90b3R5cGUuZm9ybXVsYVtuYW1lXTtcbiAgICB9O1xuXG4gIH0pKCk7XG5cbiAgOyhmdW5jdGlvbiAoKSB7XG5cbiAgICBmdW5jdGlvbiBnZXRJbnRlcnBvbGF0ZWRWYWx1ZXMgKFxuICAgICAgZnJvbSwgY3VycmVudCwgdGFyZ2V0U3RhdGUsIHBvc2l0aW9uLCBlYXNpbmcpIHtcbiAgICAgIHJldHVybiBUd2VlbmFibGUudHdlZW5Qcm9wcyhcbiAgICAgICAgcG9zaXRpb24sIGN1cnJlbnQsIGZyb20sIHRhcmdldFN0YXRlLCAxLCAwLCBlYXNpbmcpO1xuICAgIH1cblxuICAgIC8vIEZha2UgYSBUd2VlbmFibGUgYW5kIHBhdGNoIHNvbWUgaW50ZXJuYWxzLiAgVGhpcyBhcHByb2FjaCBhbGxvd3MgdXMgdG9cbiAgICAvLyBza2lwIHVuZWNjZXNzYXJ5IHByb2Nlc3NpbmcgYW5kIG9iamVjdCByZWNyZWF0aW9uLCBjdXR0aW5nIGRvd24gb24gZ2FyYmFnZVxuICAgIC8vIGNvbGxlY3Rpb24gcGF1c2VzLlxuICAgIHZhciBtb2NrVHdlZW5hYmxlID0gbmV3IFR3ZWVuYWJsZSgpO1xuICAgIG1vY2tUd2VlbmFibGUuX2ZpbHRlckFyZ3MgPSBbXTtcblxuICAgIC8qKlxuICAgICAqIENvbXB1dGUgdGhlIG1pZHBvaW50IG9mIHR3byBPYmplY3RzLiAgVGhpcyBtZXRob2QgZWZmZWN0aXZlbHkgY2FsY3VsYXRlcyBhIHNwZWNpZmljIGZyYW1lIG9mIGFuaW1hdGlvbiB0aGF0IFtUd2VlbmFibGUjdHdlZW5dKHNoaWZ0eS5jb3JlLmpzLmh0bWwjdHdlZW4pIGRvZXMgbWFueSB0aW1lcyBvdmVyIHRoZSBjb3Vyc2Ugb2YgYSB0d2Vlbi5cbiAgICAgKlxuICAgICAqIEV4YW1wbGU6XG4gICAgICpcbiAgICAgKiAgICAgdmFyIGludGVycG9sYXRlZFZhbHVlcyA9IFR3ZWVuYWJsZS5pbnRlcnBvbGF0ZSh7XG4gICAgICogICAgICAgd2lkdGg6ICcxMDBweCcsXG4gICAgICogICAgICAgb3BhY2l0eTogMCxcbiAgICAgKiAgICAgICBjb2xvcjogJyNmZmYnXG4gICAgICogICAgIH0sIHtcbiAgICAgKiAgICAgICB3aWR0aDogJzIwMHB4JyxcbiAgICAgKiAgICAgICBvcGFjaXR5OiAxLFxuICAgICAqICAgICAgIGNvbG9yOiAnIzAwMCdcbiAgICAgKiAgICAgfSwgMC41KTtcbiAgICAgKlxuICAgICAqICAgICBjb25zb2xlLmxvZyhpbnRlcnBvbGF0ZWRWYWx1ZXMpO1xuICAgICAqICAgICAvLyB7b3BhY2l0eTogMC41LCB3aWR0aDogXCIxNTBweFwiLCBjb2xvcjogXCJyZ2IoMTI3LDEyNywxMjcpXCJ9XG4gICAgICpcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gZnJvbSBUaGUgc3RhcnRpbmcgdmFsdWVzIHRvIHR3ZWVuIGZyb20uXG4gICAgICogQHBhcmFtIHtPYmplY3R9IHRhcmdldFN0YXRlIFRoZSBlbmRpbmcgdmFsdWVzIHRvIHR3ZWVuIHRvLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBwb3NpdGlvbiBUaGUgbm9ybWFsaXplZCBwb3NpdGlvbiB2YWx1ZSAoYmV0d2VlbiAwLjAgYW5kIDEuMCkgdG8gaW50ZXJwb2xhdGUgdGhlIHZhbHVlcyBiZXR3ZWVuIGBmcm9tYCBhbmQgYHRvYCBmb3IuICBgZnJvbWAgcmVwcmVzZW50cyAwIGFuZCBgdG9gIHJlcHJlc2VudHMgYDFgLlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfE9iamVjdH0gZWFzaW5nIFRoZSBlYXNpbmcgY3VydmUocykgdG8gY2FsY3VsYXRlIHRoZSBtaWRwb2ludCBhZ2FpbnN0LiAgWW91IGNhbiByZWZlcmVuY2UgYW55IGVhc2luZyBmdW5jdGlvbiBhdHRhY2hlZCB0byBgVHdlZW5hYmxlLnByb3RvdHlwZS5mb3JtdWxhYC4gIElmIG9taXR0ZWQsIHRoaXMgZGVmYXVsdHMgdG8gXCJsaW5lYXJcIi5cbiAgICAgKiBAcmV0dXJuIHtPYmplY3R9XG4gICAgICovXG4gICAgVHdlZW5hYmxlLmludGVycG9sYXRlID0gZnVuY3Rpb24gKGZyb20sIHRhcmdldFN0YXRlLCBwb3NpdGlvbiwgZWFzaW5nKSB7XG4gICAgICB2YXIgY3VycmVudCA9IFR3ZWVuYWJsZS5zaGFsbG93Q29weSh7fSwgZnJvbSk7XG4gICAgICB2YXIgZWFzaW5nT2JqZWN0ID0gVHdlZW5hYmxlLmNvbXBvc2VFYXNpbmdPYmplY3QoXG4gICAgICAgIGZyb20sIGVhc2luZyB8fCAnbGluZWFyJyk7XG5cbiAgICAgIG1vY2tUd2VlbmFibGUuc2V0KHt9KTtcblxuICAgICAgLy8gQWxpYXMgYW5kIHJldXNlIHRoZSBfZmlsdGVyQXJncyBhcnJheSBpbnN0ZWFkIG9mIHJlY3JlYXRpbmcgaXQuXG4gICAgICB2YXIgZmlsdGVyQXJncyA9IG1vY2tUd2VlbmFibGUuX2ZpbHRlckFyZ3M7XG4gICAgICBmaWx0ZXJBcmdzLmxlbmd0aCA9IDA7XG4gICAgICBmaWx0ZXJBcmdzWzBdID0gY3VycmVudDtcbiAgICAgIGZpbHRlckFyZ3NbMV0gPSBmcm9tO1xuICAgICAgZmlsdGVyQXJnc1syXSA9IHRhcmdldFN0YXRlO1xuICAgICAgZmlsdGVyQXJnc1szXSA9IGVhc2luZ09iamVjdDtcblxuICAgICAgLy8gQW55IGRlZmluZWQgdmFsdWUgdHJhbnNmb3JtYXRpb24gbXVzdCBiZSBhcHBsaWVkXG4gICAgICBUd2VlbmFibGUuYXBwbHlGaWx0ZXIobW9ja1R3ZWVuYWJsZSwgJ3R3ZWVuQ3JlYXRlZCcpO1xuICAgICAgVHdlZW5hYmxlLmFwcGx5RmlsdGVyKG1vY2tUd2VlbmFibGUsICdiZWZvcmVUd2VlbicpO1xuXG4gICAgICB2YXIgaW50ZXJwb2xhdGVkVmFsdWVzID0gZ2V0SW50ZXJwb2xhdGVkVmFsdWVzKFxuICAgICAgICBmcm9tLCBjdXJyZW50LCB0YXJnZXRTdGF0ZSwgcG9zaXRpb24sIGVhc2luZ09iamVjdCk7XG5cbiAgICAgIC8vIFRyYW5zZm9ybSB2YWx1ZXMgYmFjayBpbnRvIHRoZWlyIG9yaWdpbmFsIGZvcm1hdFxuICAgICAgVHdlZW5hYmxlLmFwcGx5RmlsdGVyKG1vY2tUd2VlbmFibGUsICdhZnRlclR3ZWVuJyk7XG5cbiAgICAgIHJldHVybiBpbnRlcnBvbGF0ZWRWYWx1ZXM7XG4gICAgfTtcblxuICB9KCkpO1xuXG4gIC8qKlxuICAgKiBBZGRzIHN0cmluZyBpbnRlcnBvbGF0aW9uIHN1cHBvcnQgdG8gU2hpZnR5LlxuICAgKlxuICAgKiBUaGUgVG9rZW4gZXh0ZW5zaW9uIGFsbG93cyBTaGlmdHkgdG8gdHdlZW4gbnVtYmVycyBpbnNpZGUgb2Ygc3RyaW5ncy4gIEFtb25nXG4gICAqIG90aGVyIHRoaW5ncywgdGhpcyBhbGxvd3MgeW91IHRvIGFuaW1hdGUgQ1NTIHByb3BlcnRpZXMuICBGb3IgZXhhbXBsZSwgeW91XG4gICAqIGNhbiBkbyB0aGlzOlxuICAgKlxuICAgKiAgICAgdmFyIHR3ZWVuYWJsZSA9IG5ldyBUd2VlbmFibGUoKTtcbiAgICogICAgIHR3ZWVuYWJsZS50d2Vlbih7XG4gICAqICAgICAgIGZyb206IHsgdHJhbnNmb3JtOiAndHJhbnNsYXRlWCg0NXB4KSd9LFxuICAgKiAgICAgICB0bzogeyB0cmFuc2Zvcm06ICd0cmFuc2xhdGVYKDkweHApJ31cbiAgICogICAgIH0pO1xuICAgKlxuICAgKiBgIGBcbiAgICogYHRyYW5zbGF0ZVgoNDUpYCB3aWxsIGJlIHR3ZWVuZWQgdG8gYHRyYW5zbGF0ZVgoOTApYC4gIFRvIGRlbW9uc3RyYXRlOlxuICAgKlxuICAgKiAgICAgdmFyIHR3ZWVuYWJsZSA9IG5ldyBUd2VlbmFibGUoKTtcbiAgICogICAgIHR3ZWVuYWJsZS50d2Vlbih7XG4gICAqICAgICAgIGZyb206IHsgdHJhbnNmb3JtOiAndHJhbnNsYXRlWCg0NXB4KSd9LFxuICAgKiAgICAgICB0bzogeyB0cmFuc2Zvcm06ICd0cmFuc2xhdGVYKDkwcHgpJ30sXG4gICAqICAgICAgIHN0ZXA6IGZ1bmN0aW9uIChzdGF0ZSkge1xuICAgKiAgICAgICAgIGNvbnNvbGUubG9nKHN0YXRlLnRyYW5zZm9ybSk7XG4gICAqICAgICAgIH1cbiAgICogICAgIH0pO1xuICAgKlxuICAgKiBgIGBcbiAgICogVGhlIGFib3ZlIHNuaXBwZXQgd2lsbCBsb2cgc29tZXRoaW5nIGxpa2UgdGhpcyBpbiB0aGUgY29uc29sZTpcbiAgICpcbiAgICogICAgIHRyYW5zbGF0ZVgoNjAuM3B4KVxuICAgKiAgICAgLi4uXG4gICAqICAgICB0cmFuc2xhdGVYKDc2LjA1cHgpXG4gICAqICAgICAuLi5cbiAgICogICAgIHRyYW5zbGF0ZVgoOTBweClcbiAgICpcbiAgICogYCBgXG4gICAqIEFub3RoZXIgdXNlIGZvciB0aGlzIGlzIGFuaW1hdGluZyBjb2xvcnM6XG4gICAqXG4gICAqICAgICB2YXIgdHdlZW5hYmxlID0gbmV3IFR3ZWVuYWJsZSgpO1xuICAgKiAgICAgdHdlZW5hYmxlLnR3ZWVuKHtcbiAgICogICAgICAgZnJvbTogeyBjb2xvcjogJ3JnYigwLDI1NSwwKSd9LFxuICAgKiAgICAgICB0bzogeyBjb2xvcjogJ3JnYigyNTUsMCwyNTUpJ30sXG4gICAqICAgICAgIHN0ZXA6IGZ1bmN0aW9uIChzdGF0ZSkge1xuICAgKiAgICAgICAgIGNvbnNvbGUubG9nKHN0YXRlLmNvbG9yKTtcbiAgICogICAgICAgfVxuICAgKiAgICAgfSk7XG4gICAqXG4gICAqIGAgYFxuICAgKiBUaGUgYWJvdmUgc25pcHBldCB3aWxsIGxvZyBzb21ldGhpbmcgbGlrZSB0aGlzOlxuICAgKlxuICAgKiAgICAgcmdiKDg0LDE3MCw4NClcbiAgICogICAgIC4uLlxuICAgKiAgICAgcmdiKDE3MCw4NCwxNzApXG4gICAqICAgICAuLi5cbiAgICogICAgIHJnYigyNTUsMCwyNTUpXG4gICAqXG4gICAqIGAgYFxuICAgKiBUaGlzIGV4dGVuc2lvbiBhbHNvIHN1cHBvcnRzIGhleGFkZWNpbWFsIGNvbG9ycywgaW4gYm90aCBsb25nIChgI2ZmMDBmZmApXG4gICAqIGFuZCBzaG9ydCAoYCNmMGZgKSBmb3Jtcy4gIEJlIGF3YXJlIHRoYXQgaGV4YWRlY2ltYWwgaW5wdXQgdmFsdWVzIHdpbGwgYmVcbiAgICogY29udmVydGVkIGludG8gdGhlIGVxdWl2YWxlbnQgUkdCIG91dHB1dCB2YWx1ZXMuICBUaGlzIGlzIGRvbmUgdG8gb3B0aW1pemVcbiAgICogZm9yIHBlcmZvcm1hbmNlLlxuICAgKlxuICAgKiAgICAgdmFyIHR3ZWVuYWJsZSA9IG5ldyBUd2VlbmFibGUoKTtcbiAgICogICAgIHR3ZWVuYWJsZS50d2Vlbih7XG4gICAqICAgICAgIGZyb206IHsgY29sb3I6ICcjMGYwJ30sXG4gICAqICAgICAgIHRvOiB7IGNvbG9yOiAnI2YwZid9LFxuICAgKiAgICAgICBzdGVwOiBmdW5jdGlvbiAoc3RhdGUpIHtcbiAgICogICAgICAgICBjb25zb2xlLmxvZyhzdGF0ZS5jb2xvcik7XG4gICAqICAgICAgIH1cbiAgICogICAgIH0pO1xuICAgKlxuICAgKiBgIGBcbiAgICogVGhpcyBzbmlwcGV0IHdpbGwgZ2VuZXJhdGUgdGhlIHNhbWUgb3V0cHV0IGFzIHRoZSBvbmUgYmVmb3JlIGl0IGJlY2F1c2VcbiAgICogZXF1aXZhbGVudCB2YWx1ZXMgd2VyZSBzdXBwbGllZCAoanVzdCBpbiBoZXhhZGVjaW1hbCBmb3JtIHJhdGhlciB0aGFuIFJHQik6XG4gICAqXG4gICAqICAgICByZ2IoODQsMTcwLDg0KVxuICAgKiAgICAgLi4uXG4gICAqICAgICByZ2IoMTcwLDg0LDE3MClcbiAgICogICAgIC4uLlxuICAgKiAgICAgcmdiKDI1NSwwLDI1NSlcbiAgICpcbiAgICogYCBgXG4gICAqIGAgYFxuICAgKiAjIyBFYXNpbmcgc3VwcG9ydFxuICAgKlxuICAgKiBFYXNpbmcgd29ya3Mgc29tZXdoYXQgZGlmZmVyZW50bHkgaW4gdGhlIFRva2VuIGV4dGVuc2lvbi4gIFRoaXMgaXMgYmVjYXVzZVxuICAgKiBzb21lIENTUyBwcm9wZXJ0aWVzIGhhdmUgbXVsdGlwbGUgdmFsdWVzIGluIHRoZW0sIGFuZCB5b3UgbWlnaHQgbmVlZCB0b1xuICAgKiB0d2VlbiBlYWNoIHZhbHVlIGFsb25nIGl0cyBvd24gZWFzaW5nIGN1cnZlLiAgQSBiYXNpYyBleGFtcGxlOlxuICAgKlxuICAgKiAgICAgdmFyIHR3ZWVuYWJsZSA9IG5ldyBUd2VlbmFibGUoKTtcbiAgICogICAgIHR3ZWVuYWJsZS50d2Vlbih7XG4gICAqICAgICAgIGZyb206IHsgdHJhbnNmb3JtOiAndHJhbnNsYXRlWCgwcHgpIHRyYW5zbGF0ZVkoMHB4KSd9LFxuICAgKiAgICAgICB0bzogeyB0cmFuc2Zvcm06ICAgJ3RyYW5zbGF0ZVgoMTAwcHgpIHRyYW5zbGF0ZVkoMTAwcHgpJ30sXG4gICAqICAgICAgIGVhc2luZzogeyB0cmFuc2Zvcm06ICdlYXNlSW5RdWFkJyB9LFxuICAgKiAgICAgICBzdGVwOiBmdW5jdGlvbiAoc3RhdGUpIHtcbiAgICogICAgICAgICBjb25zb2xlLmxvZyhzdGF0ZS50cmFuc2Zvcm0pO1xuICAgKiAgICAgICB9XG4gICAqICAgICB9KTtcbiAgICpcbiAgICogYCBgXG4gICAqIFRoZSBhYm92ZSBzbmlwcGV0IGNyZWF0ZSB2YWx1ZXMgbGlrZSB0aGlzOlxuICAgKlxuICAgKiAgICAgdHJhbnNsYXRlWCgxMS41NjAwMDAwMDAwMDAwMDJweCkgdHJhbnNsYXRlWSgxMS41NjAwMDAwMDAwMDAwMDJweClcbiAgICogICAgIC4uLlxuICAgKiAgICAgdHJhbnNsYXRlWCg0Ni4yNDAwMDAwMDAwMDAwMXB4KSB0cmFuc2xhdGVZKDQ2LjI0MDAwMDAwMDAwMDAxcHgpXG4gICAqICAgICAuLi5cbiAgICogICAgIHRyYW5zbGF0ZVgoMTAwcHgpIHRyYW5zbGF0ZVkoMTAwcHgpXG4gICAqXG4gICAqIGAgYFxuICAgKiBJbiB0aGlzIGNhc2UsIHRoZSB2YWx1ZXMgZm9yIGB0cmFuc2xhdGVYYCBhbmQgYHRyYW5zbGF0ZVlgIGFyZSBhbHdheXMgdGhlXG4gICAqIHNhbWUgZm9yIGVhY2ggc3RlcCBvZiB0aGUgdHdlZW4sIGJlY2F1c2UgdGhleSBoYXZlIHRoZSBzYW1lIHN0YXJ0IGFuZCBlbmRcbiAgICogcG9pbnRzIGFuZCBib3RoIHVzZSB0aGUgc2FtZSBlYXNpbmcgY3VydmUuICBXZSBjYW4gYWxzbyB0d2VlbiBgdHJhbnNsYXRlWGBcbiAgICogYW5kIGB0cmFuc2xhdGVZYCBhbG9uZyBpbmRlcGVuZGVudCBjdXJ2ZXM6XG4gICAqXG4gICAqICAgICB2YXIgdHdlZW5hYmxlID0gbmV3IFR3ZWVuYWJsZSgpO1xuICAgKiAgICAgdHdlZW5hYmxlLnR3ZWVuKHtcbiAgICogICAgICAgZnJvbTogeyB0cmFuc2Zvcm06ICd0cmFuc2xhdGVYKDBweCkgdHJhbnNsYXRlWSgwcHgpJ30sXG4gICAqICAgICAgIHRvOiB7IHRyYW5zZm9ybTogICAndHJhbnNsYXRlWCgxMDBweCkgdHJhbnNsYXRlWSgxMDBweCknfSxcbiAgICogICAgICAgZWFzaW5nOiB7IHRyYW5zZm9ybTogJ2Vhc2VJblF1YWQgYm91bmNlJyB9LFxuICAgKiAgICAgICBzdGVwOiBmdW5jdGlvbiAoc3RhdGUpIHtcbiAgICogICAgICAgICBjb25zb2xlLmxvZyhzdGF0ZS50cmFuc2Zvcm0pO1xuICAgKiAgICAgICB9XG4gICAqICAgICB9KTtcbiAgICpcbiAgICogYCBgXG4gICAqIFRoZSBhYm92ZSBzbmlwcGV0IGNyZWF0ZSB2YWx1ZXMgbGlrZSB0aGlzOlxuICAgKlxuICAgKiAgICAgdHJhbnNsYXRlWCgxMC44OXB4KSB0cmFuc2xhdGVZKDgyLjM1NTYyNXB4KVxuICAgKiAgICAgLi4uXG4gICAqICAgICB0cmFuc2xhdGVYKDQ0Ljg5MDAwMDAwMDAwMDAxcHgpIHRyYW5zbGF0ZVkoODYuNzMwNjI1MDAwMDAwMDJweClcbiAgICogICAgIC4uLlxuICAgKiAgICAgdHJhbnNsYXRlWCgxMDBweCkgdHJhbnNsYXRlWSgxMDBweClcbiAgICpcbiAgICogYCBgXG4gICAqIGB0cmFuc2xhdGVYYCBhbmQgYHRyYW5zbGF0ZVlgIGFyZSBub3QgaW4gc3luYyBhbnltb3JlLCBiZWNhdXNlIGBlYXNlSW5RdWFkYFxuICAgKiB3YXMgc3BlY2lmaWVkIGZvciBgdHJhbnNsYXRlWGAgYW5kIGBib3VuY2VgIGZvciBgdHJhbnNsYXRlWWAuICBNaXhpbmcgYW5kXG4gICAqIG1hdGNoaW5nIGVhc2luZyBjdXJ2ZXMgY2FuIG1ha2UgZm9yIHNvbWUgaW50ZXJlc3RpbmcgbW90aW9uIGluIHlvdXJcbiAgICogYW5pbWF0aW9ucy5cbiAgICpcbiAgICogVGhlIG9yZGVyIG9mIHRoZSBzcGFjZS1zZXBhcmF0ZWQgZWFzaW5nIGN1cnZlcyBjb3JyZXNwb25kIHRoZSB0b2tlbiB2YWx1ZXNcbiAgICogdGhleSBhcHBseSB0by4gIElmIHRoZXJlIGFyZSBtb3JlIHRva2VuIHZhbHVlcyB0aGFuIGVhc2luZyBjdXJ2ZXMgbGlzdGVkLFxuICAgKiB0aGUgbGFzdCBlYXNpbmcgY3VydmUgbGlzdGVkIGlzIHVzZWQuXG4gICAqL1xuICBmdW5jdGlvbiB0b2tlbiAoKSB7XG4gICAgLy8gRnVuY3Rpb25hbGl0eSBmb3IgdGhpcyBleHRlbnNpb24gcnVucyBpbXBsaWNpdGx5IGlmIGl0IGlzIGxvYWRlZC5cbiAgfSAvKiEqL1xuXG4gIC8vIHRva2VuIGZ1bmN0aW9uIGlzIGRlZmluZWQgYWJvdmUgb25seSBzbyB0aGF0IGRveC1mb3VuZGF0aW9uIHNlZXMgaXQgYXNcbiAgLy8gZG9jdW1lbnRhdGlvbiBhbmQgcmVuZGVycyBpdC4gIEl0IGlzIG5ldmVyIHVzZWQsIGFuZCBpcyBvcHRpbWl6ZWQgYXdheSBhdFxuICAvLyBidWlsZCB0aW1lLlxuXG4gIDsoZnVuY3Rpb24gKFR3ZWVuYWJsZSkge1xuXG4gICAgLyohXG4gICAgICogQHR5cGVkZWYge3tcbiAgICAgKiAgIGZvcm1hdFN0cmluZzogc3RyaW5nXG4gICAgICogICBjaHVua05hbWVzOiBBcnJheS48c3RyaW5nPlxuICAgICAqIH19XG4gICAgICovXG4gICAgdmFyIGZvcm1hdE1hbmlmZXN0O1xuXG4gICAgLy8gQ09OU1RBTlRTXG5cbiAgICB2YXIgUl9OVU1CRVJfQ09NUE9ORU5UID0gLyhcXGR8XFwtfFxcLikvO1xuICAgIHZhciBSX0ZPUk1BVF9DSFVOS1MgPSAvKFteXFwtMC05XFwuXSspL2c7XG4gICAgdmFyIFJfVU5GT1JNQVRURURfVkFMVUVTID0gL1swLTkuXFwtXSsvZztcbiAgICB2YXIgUl9SR0IgPSBuZXcgUmVnRXhwKFxuICAgICAgJ3JnYlxcXFwoJyArIFJfVU5GT1JNQVRURURfVkFMVUVTLnNvdXJjZSArXG4gICAgICAoLyxcXHMqLy5zb3VyY2UpICsgUl9VTkZPUk1BVFRFRF9WQUxVRVMuc291cmNlICtcbiAgICAgICgvLFxccyovLnNvdXJjZSkgKyBSX1VORk9STUFUVEVEX1ZBTFVFUy5zb3VyY2UgKyAnXFxcXCknLCAnZycpO1xuICAgIHZhciBSX1JHQl9QUkVGSVggPSAvXi4qXFwoLztcbiAgICB2YXIgUl9IRVggPSAvIyhbMC05XXxbYS1mXSl7Myw2fS9naTtcbiAgICB2YXIgVkFMVUVfUExBQ0VIT0xERVIgPSAnVkFMJztcblxuICAgIC8vIEhFTFBFUlNcblxuICAgIHZhciBnZXRGb3JtYXRDaHVua3NGcm9tX2FjY3VtdWxhdG9yID0gW107XG4gICAgLyohXG4gICAgICogQHBhcmFtIHtBcnJheS5udW1iZXJ9IHJhd1ZhbHVlc1xuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBwcmVmaXhcbiAgICAgKlxuICAgICAqIEByZXR1cm4ge0FycmF5LjxzdHJpbmc+fVxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGdldEZvcm1hdENodW5rc0Zyb20gKHJhd1ZhbHVlcywgcHJlZml4KSB7XG4gICAgICBnZXRGb3JtYXRDaHVua3NGcm9tX2FjY3VtdWxhdG9yLmxlbmd0aCA9IDA7XG5cbiAgICAgIHZhciByYXdWYWx1ZXNMZW5ndGggPSByYXdWYWx1ZXMubGVuZ3RoO1xuICAgICAgdmFyIGk7XG5cbiAgICAgIGZvciAoaSA9IDA7IGkgPCByYXdWYWx1ZXNMZW5ndGg7IGkrKykge1xuICAgICAgICBnZXRGb3JtYXRDaHVua3NGcm9tX2FjY3VtdWxhdG9yLnB1c2goJ18nICsgcHJlZml4ICsgJ18nICsgaSk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBnZXRGb3JtYXRDaHVua3NGcm9tX2FjY3VtdWxhdG9yO1xuICAgIH1cblxuICAgIC8qIVxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBmb3JtYXR0ZWRTdHJpbmdcbiAgICAgKlxuICAgICAqIEByZXR1cm4ge3N0cmluZ31cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBnZXRGb3JtYXRTdHJpbmdGcm9tIChmb3JtYXR0ZWRTdHJpbmcpIHtcbiAgICAgIHZhciBjaHVua3MgPSBmb3JtYXR0ZWRTdHJpbmcubWF0Y2goUl9GT1JNQVRfQ0hVTktTKTtcblxuICAgICAgaWYgKCFjaHVua3MpIHtcbiAgICAgICAgLy8gY2h1bmtzIHdpbGwgYmUgbnVsbCBpZiB0aGVyZSB3ZXJlIG5vIHRva2VucyB0byBwYXJzZSBpblxuICAgICAgICAvLyBmb3JtYXR0ZWRTdHJpbmcgKGZvciBleGFtcGxlLCBpZiBmb3JtYXR0ZWRTdHJpbmcgaXMgJzInKS4gIENvZXJjZVxuICAgICAgICAvLyBjaHVua3MgdG8gYmUgdXNlZnVsIGhlcmUuXG4gICAgICAgIGNodW5rcyA9IFsnJywgJyddO1xuXG4gICAgICAgIC8vIElmIHRoZXJlIGlzIG9ubHkgb25lIGNodW5rLCBhc3N1bWUgdGhhdCB0aGUgc3RyaW5nIGlzIGEgbnVtYmVyXG4gICAgICAgIC8vIGZvbGxvd2VkIGJ5IGEgdG9rZW4uLi5cbiAgICAgICAgLy8gTk9URTogVGhpcyBtYXkgYmUgYW4gdW53aXNlIGFzc3VtcHRpb24uXG4gICAgICB9IGVsc2UgaWYgKGNodW5rcy5sZW5ndGggPT09IDEgfHxcbiAgICAgICAgICAvLyAuLi5vciBpZiB0aGUgc3RyaW5nIHN0YXJ0cyB3aXRoIGEgbnVtYmVyIGNvbXBvbmVudCAoXCIuXCIsIFwiLVwiLCBvciBhXG4gICAgICAgICAgLy8gZGlnaXQpLi4uXG4gICAgICAgICAgZm9ybWF0dGVkU3RyaW5nWzBdLm1hdGNoKFJfTlVNQkVSX0NPTVBPTkVOVCkpIHtcbiAgICAgICAgLy8gLi4ucHJlcGVuZCBhbiBlbXB0eSBzdHJpbmcgaGVyZSB0byBtYWtlIHN1cmUgdGhhdCB0aGUgZm9ybWF0dGVkIG51bWJlclxuICAgICAgICAvLyBpcyBwcm9wZXJseSByZXBsYWNlZCBieSBWQUxVRV9QTEFDRUhPTERFUlxuICAgICAgICBjaHVua3MudW5zaGlmdCgnJyk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBjaHVua3Muam9pbihWQUxVRV9QTEFDRUhPTERFUik7XG4gICAgfVxuXG4gICAgLyohXG4gICAgICogQ29udmVydCBhbGwgaGV4IGNvbG9yIHZhbHVlcyB3aXRoaW4gYSBzdHJpbmcgdG8gYW4gcmdiIHN0cmluZy5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBzdGF0ZU9iamVjdFxuICAgICAqXG4gICAgICogQHJldHVybiB7T2JqZWN0fSBUaGUgbW9kaWZpZWQgb2JqXG4gICAgICovXG4gICAgZnVuY3Rpb24gc2FuaXRpemVPYmplY3RGb3JIZXhQcm9wcyAoc3RhdGVPYmplY3QpIHtcbiAgICAgIFR3ZWVuYWJsZS5lYWNoKHN0YXRlT2JqZWN0LCBmdW5jdGlvbiAocHJvcCkge1xuICAgICAgICB2YXIgY3VycmVudFByb3AgPSBzdGF0ZU9iamVjdFtwcm9wXTtcblxuICAgICAgICBpZiAodHlwZW9mIGN1cnJlbnRQcm9wID09PSAnc3RyaW5nJyAmJiBjdXJyZW50UHJvcC5tYXRjaChSX0hFWCkpIHtcbiAgICAgICAgICBzdGF0ZU9iamVjdFtwcm9wXSA9IHNhbml0aXplSGV4Q2h1bmtzVG9SR0IoY3VycmVudFByb3ApO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvKiFcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gc3RyXG4gICAgICpcbiAgICAgKiBAcmV0dXJuIHtzdHJpbmd9XG4gICAgICovXG4gICAgZnVuY3Rpb24gIHNhbml0aXplSGV4Q2h1bmtzVG9SR0IgKHN0cikge1xuICAgICAgcmV0dXJuIGZpbHRlclN0cmluZ0NodW5rcyhSX0hFWCwgc3RyLCBjb252ZXJ0SGV4VG9SR0IpO1xuICAgIH1cblxuICAgIC8qIVxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBoZXhTdHJpbmdcbiAgICAgKlxuICAgICAqIEByZXR1cm4ge3N0cmluZ31cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBjb252ZXJ0SGV4VG9SR0IgKGhleFN0cmluZykge1xuICAgICAgdmFyIHJnYkFyciA9IGhleFRvUkdCQXJyYXkoaGV4U3RyaW5nKTtcbiAgICAgIHJldHVybiAncmdiKCcgKyByZ2JBcnJbMF0gKyAnLCcgKyByZ2JBcnJbMV0gKyAnLCcgKyByZ2JBcnJbMl0gKyAnKSc7XG4gICAgfVxuXG4gICAgdmFyIGhleFRvUkdCQXJyYXlfcmV0dXJuQXJyYXkgPSBbXTtcbiAgICAvKiFcbiAgICAgKiBDb252ZXJ0IGEgaGV4YWRlY2ltYWwgc3RyaW5nIHRvIGFuIGFycmF5IHdpdGggdGhyZWUgaXRlbXMsIG9uZSBlYWNoIGZvclxuICAgICAqIHRoZSByZWQsIGJsdWUsIGFuZCBncmVlbiBkZWNpbWFsIHZhbHVlcy5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBoZXggQSBoZXhhZGVjaW1hbCBzdHJpbmcuXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7QXJyYXkuPG51bWJlcj59IFRoZSBjb252ZXJ0ZWQgQXJyYXkgb2YgUkdCIHZhbHVlcyBpZiBgaGV4YCBpcyBhXG4gICAgICogdmFsaWQgc3RyaW5nLCBvciBhbiBBcnJheSBvZiB0aHJlZSAwJ3MuXG4gICAgICovXG4gICAgZnVuY3Rpb24gaGV4VG9SR0JBcnJheSAoaGV4KSB7XG5cbiAgICAgIGhleCA9IGhleC5yZXBsYWNlKC8jLywgJycpO1xuXG4gICAgICAvLyBJZiB0aGUgc3RyaW5nIGlzIGEgc2hvcnRoYW5kIHRocmVlIGRpZ2l0IGhleCBub3RhdGlvbiwgbm9ybWFsaXplIGl0IHRvXG4gICAgICAvLyB0aGUgc3RhbmRhcmQgc2l4IGRpZ2l0IG5vdGF0aW9uXG4gICAgICBpZiAoaGV4Lmxlbmd0aCA9PT0gMykge1xuICAgICAgICBoZXggPSBoZXguc3BsaXQoJycpO1xuICAgICAgICBoZXggPSBoZXhbMF0gKyBoZXhbMF0gKyBoZXhbMV0gKyBoZXhbMV0gKyBoZXhbMl0gKyBoZXhbMl07XG4gICAgICB9XG5cbiAgICAgIGhleFRvUkdCQXJyYXlfcmV0dXJuQXJyYXlbMF0gPSBoZXhUb0RlYyhoZXguc3Vic3RyKDAsIDIpKTtcbiAgICAgIGhleFRvUkdCQXJyYXlfcmV0dXJuQXJyYXlbMV0gPSBoZXhUb0RlYyhoZXguc3Vic3RyKDIsIDIpKTtcbiAgICAgIGhleFRvUkdCQXJyYXlfcmV0dXJuQXJyYXlbMl0gPSBoZXhUb0RlYyhoZXguc3Vic3RyKDQsIDIpKTtcblxuICAgICAgcmV0dXJuIGhleFRvUkdCQXJyYXlfcmV0dXJuQXJyYXk7XG4gICAgfVxuXG4gICAgLyohXG4gICAgICogQ29udmVydCBhIGJhc2UtMTYgbnVtYmVyIHRvIGJhc2UtMTAuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge051bWJlcnxTdHJpbmd9IGhleCBUaGUgdmFsdWUgdG8gY29udmVydFxuICAgICAqXG4gICAgICogQHJldHVybnMge051bWJlcn0gVGhlIGJhc2UtMTAgZXF1aXZhbGVudCBvZiBgaGV4YC5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBoZXhUb0RlYyAoaGV4KSB7XG4gICAgICByZXR1cm4gcGFyc2VJbnQoaGV4LCAxNik7XG4gICAgfVxuXG4gICAgLyohXG4gICAgICogUnVucyBhIGZpbHRlciBvcGVyYXRpb24gb24gYWxsIGNodW5rcyBvZiBhIHN0cmluZyB0aGF0IG1hdGNoIGEgUmVnRXhwXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1JlZ0V4cH0gcGF0dGVyblxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSB1bmZpbHRlcmVkU3RyaW5nXG4gICAgICogQHBhcmFtIHtmdW5jdGlvbihzdHJpbmcpfSBmaWx0ZXJcbiAgICAgKlxuICAgICAqIEByZXR1cm4ge3N0cmluZ31cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBmaWx0ZXJTdHJpbmdDaHVua3MgKHBhdHRlcm4sIHVuZmlsdGVyZWRTdHJpbmcsIGZpbHRlcikge1xuICAgICAgdmFyIHBhdHRlbk1hdGNoZXMgPSB1bmZpbHRlcmVkU3RyaW5nLm1hdGNoKHBhdHRlcm4pO1xuICAgICAgdmFyIGZpbHRlcmVkU3RyaW5nID0gdW5maWx0ZXJlZFN0cmluZy5yZXBsYWNlKHBhdHRlcm4sIFZBTFVFX1BMQUNFSE9MREVSKTtcblxuICAgICAgaWYgKHBhdHRlbk1hdGNoZXMpIHtcbiAgICAgICAgdmFyIHBhdHRlbk1hdGNoZXNMZW5ndGggPSBwYXR0ZW5NYXRjaGVzLmxlbmd0aDtcbiAgICAgICAgdmFyIGN1cnJlbnRDaHVuaztcblxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHBhdHRlbk1hdGNoZXNMZW5ndGg7IGkrKykge1xuICAgICAgICAgIGN1cnJlbnRDaHVuayA9IHBhdHRlbk1hdGNoZXMuc2hpZnQoKTtcbiAgICAgICAgICBmaWx0ZXJlZFN0cmluZyA9IGZpbHRlcmVkU3RyaW5nLnJlcGxhY2UoXG4gICAgICAgICAgICBWQUxVRV9QTEFDRUhPTERFUiwgZmlsdGVyKGN1cnJlbnRDaHVuaykpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBmaWx0ZXJlZFN0cmluZztcbiAgICB9XG5cbiAgICAvKiFcbiAgICAgKiBDaGVjayBmb3IgZmxvYXRpbmcgcG9pbnQgdmFsdWVzIHdpdGhpbiByZ2Igc3RyaW5ncyBhbmQgcm91bmRzIHRoZW0uXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gZm9ybWF0dGVkU3RyaW5nXG4gICAgICpcbiAgICAgKiBAcmV0dXJuIHtzdHJpbmd9XG4gICAgICovXG4gICAgZnVuY3Rpb24gc2FuaXRpemVSR0JDaHVua3MgKGZvcm1hdHRlZFN0cmluZykge1xuICAgICAgcmV0dXJuIGZpbHRlclN0cmluZ0NodW5rcyhSX1JHQiwgZm9ybWF0dGVkU3RyaW5nLCBzYW5pdGl6ZVJHQkNodW5rKTtcbiAgICB9XG5cbiAgICAvKiFcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gcmdiQ2h1bmtcbiAgICAgKlxuICAgICAqIEByZXR1cm4ge3N0cmluZ31cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBzYW5pdGl6ZVJHQkNodW5rIChyZ2JDaHVuaykge1xuICAgICAgdmFyIG51bWJlcnMgPSByZ2JDaHVuay5tYXRjaChSX1VORk9STUFUVEVEX1ZBTFVFUyk7XG4gICAgICB2YXIgbnVtYmVyc0xlbmd0aCA9IG51bWJlcnMubGVuZ3RoO1xuICAgICAgdmFyIHNhbml0aXplZFN0cmluZyA9IHJnYkNodW5rLm1hdGNoKFJfUkdCX1BSRUZJWClbMF07XG5cbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbnVtYmVyc0xlbmd0aDsgaSsrKSB7XG4gICAgICAgIHNhbml0aXplZFN0cmluZyArPSBwYXJzZUludChudW1iZXJzW2ldLCAxMCkgKyAnLCc7XG4gICAgICB9XG5cbiAgICAgIHNhbml0aXplZFN0cmluZyA9IHNhbml0aXplZFN0cmluZy5zbGljZSgwLCAtMSkgKyAnKSc7XG5cbiAgICAgIHJldHVybiBzYW5pdGl6ZWRTdHJpbmc7XG4gICAgfVxuXG4gICAgLyohXG4gICAgICogQHBhcmFtIHtPYmplY3R9IHN0YXRlT2JqZWN0XG4gICAgICpcbiAgICAgKiBAcmV0dXJuIHtPYmplY3R9IEFuIE9iamVjdCBvZiBmb3JtYXRNYW5pZmVzdHMgdGhhdCBjb3JyZXNwb25kIHRvXG4gICAgICogdGhlIHN0cmluZyBwcm9wZXJ0aWVzIG9mIHN0YXRlT2JqZWN0XG4gICAgICovXG4gICAgZnVuY3Rpb24gZ2V0Rm9ybWF0TWFuaWZlc3RzIChzdGF0ZU9iamVjdCkge1xuICAgICAgdmFyIG1hbmlmZXN0QWNjdW11bGF0b3IgPSB7fTtcblxuICAgICAgVHdlZW5hYmxlLmVhY2goc3RhdGVPYmplY3QsIGZ1bmN0aW9uIChwcm9wKSB7XG4gICAgICAgIHZhciBjdXJyZW50UHJvcCA9IHN0YXRlT2JqZWN0W3Byb3BdO1xuXG4gICAgICAgIGlmICh0eXBlb2YgY3VycmVudFByb3AgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgdmFyIHJhd1ZhbHVlcyA9IGdldFZhbHVlc0Zyb20oY3VycmVudFByb3ApO1xuXG4gICAgICAgICAgbWFuaWZlc3RBY2N1bXVsYXRvcltwcm9wXSA9IHtcbiAgICAgICAgICAgICdmb3JtYXRTdHJpbmcnOiBnZXRGb3JtYXRTdHJpbmdGcm9tKGN1cnJlbnRQcm9wKVxuICAgICAgICAgICAgLCdjaHVua05hbWVzJzogZ2V0Rm9ybWF0Q2h1bmtzRnJvbShyYXdWYWx1ZXMsIHByb3ApXG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIHJldHVybiBtYW5pZmVzdEFjY3VtdWxhdG9yO1xuICAgIH1cblxuICAgIC8qIVxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBzdGF0ZU9iamVjdFxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBmb3JtYXRNYW5pZmVzdHNcbiAgICAgKi9cbiAgICBmdW5jdGlvbiBleHBhbmRGb3JtYXR0ZWRQcm9wZXJ0aWVzIChzdGF0ZU9iamVjdCwgZm9ybWF0TWFuaWZlc3RzKSB7XG4gICAgICBUd2VlbmFibGUuZWFjaChmb3JtYXRNYW5pZmVzdHMsIGZ1bmN0aW9uIChwcm9wKSB7XG4gICAgICAgIHZhciBjdXJyZW50UHJvcCA9IHN0YXRlT2JqZWN0W3Byb3BdO1xuICAgICAgICB2YXIgcmF3VmFsdWVzID0gZ2V0VmFsdWVzRnJvbShjdXJyZW50UHJvcCk7XG4gICAgICAgIHZhciByYXdWYWx1ZXNMZW5ndGggPSByYXdWYWx1ZXMubGVuZ3RoO1xuXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcmF3VmFsdWVzTGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICBzdGF0ZU9iamVjdFtmb3JtYXRNYW5pZmVzdHNbcHJvcF0uY2h1bmtOYW1lc1tpXV0gPSArcmF3VmFsdWVzW2ldO1xuICAgICAgICB9XG5cbiAgICAgICAgZGVsZXRlIHN0YXRlT2JqZWN0W3Byb3BdO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyohXG4gICAgICogQHBhcmFtIHtPYmplY3R9IHN0YXRlT2JqZWN0XG4gICAgICogQHBhcmFtIHtPYmplY3R9IGZvcm1hdE1hbmlmZXN0c1xuICAgICAqL1xuICAgIGZ1bmN0aW9uIGNvbGxhcHNlRm9ybWF0dGVkUHJvcGVydGllcyAoc3RhdGVPYmplY3QsIGZvcm1hdE1hbmlmZXN0cykge1xuICAgICAgVHdlZW5hYmxlLmVhY2goZm9ybWF0TWFuaWZlc3RzLCBmdW5jdGlvbiAocHJvcCkge1xuICAgICAgICB2YXIgY3VycmVudFByb3AgPSBzdGF0ZU9iamVjdFtwcm9wXTtcbiAgICAgICAgdmFyIGZvcm1hdENodW5rcyA9IGV4dHJhY3RQcm9wZXJ0eUNodW5rcyhcbiAgICAgICAgICBzdGF0ZU9iamVjdCwgZm9ybWF0TWFuaWZlc3RzW3Byb3BdLmNodW5rTmFtZXMpO1xuICAgICAgICB2YXIgdmFsdWVzTGlzdCA9IGdldFZhbHVlc0xpc3QoXG4gICAgICAgICAgZm9ybWF0Q2h1bmtzLCBmb3JtYXRNYW5pZmVzdHNbcHJvcF0uY2h1bmtOYW1lcyk7XG4gICAgICAgIGN1cnJlbnRQcm9wID0gZ2V0Rm9ybWF0dGVkVmFsdWVzKFxuICAgICAgICAgIGZvcm1hdE1hbmlmZXN0c1twcm9wXS5mb3JtYXRTdHJpbmcsIHZhbHVlc0xpc3QpO1xuICAgICAgICBzdGF0ZU9iamVjdFtwcm9wXSA9IHNhbml0aXplUkdCQ2h1bmtzKGN1cnJlbnRQcm9wKTtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8qIVxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBzdGF0ZU9iamVjdFxuICAgICAqIEBwYXJhbSB7QXJyYXkuPHN0cmluZz59IGNodW5rTmFtZXNcbiAgICAgKlxuICAgICAqIEByZXR1cm4ge09iamVjdH0gVGhlIGV4dHJhY3RlZCB2YWx1ZSBjaHVua3MuXG4gICAgICovXG4gICAgZnVuY3Rpb24gZXh0cmFjdFByb3BlcnR5Q2h1bmtzIChzdGF0ZU9iamVjdCwgY2h1bmtOYW1lcykge1xuICAgICAgdmFyIGV4dHJhY3RlZFZhbHVlcyA9IHt9O1xuICAgICAgdmFyIGN1cnJlbnRDaHVua05hbWUsIGNodW5rTmFtZXNMZW5ndGggPSBjaHVua05hbWVzLmxlbmd0aDtcblxuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjaHVua05hbWVzTGVuZ3RoOyBpKyspIHtcbiAgICAgICAgY3VycmVudENodW5rTmFtZSA9IGNodW5rTmFtZXNbaV07XG4gICAgICAgIGV4dHJhY3RlZFZhbHVlc1tjdXJyZW50Q2h1bmtOYW1lXSA9IHN0YXRlT2JqZWN0W2N1cnJlbnRDaHVua05hbWVdO1xuICAgICAgICBkZWxldGUgc3RhdGVPYmplY3RbY3VycmVudENodW5rTmFtZV07XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBleHRyYWN0ZWRWYWx1ZXM7XG4gICAgfVxuXG4gICAgdmFyIGdldFZhbHVlc0xpc3RfYWNjdW11bGF0b3IgPSBbXTtcbiAgICAvKiFcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gc3RhdGVPYmplY3RcbiAgICAgKiBAcGFyYW0ge0FycmF5LjxzdHJpbmc+fSBjaHVua05hbWVzXG4gICAgICpcbiAgICAgKiBAcmV0dXJuIHtBcnJheS48bnVtYmVyPn1cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBnZXRWYWx1ZXNMaXN0IChzdGF0ZU9iamVjdCwgY2h1bmtOYW1lcykge1xuICAgICAgZ2V0VmFsdWVzTGlzdF9hY2N1bXVsYXRvci5sZW5ndGggPSAwO1xuICAgICAgdmFyIGNodW5rTmFtZXNMZW5ndGggPSBjaHVua05hbWVzLmxlbmd0aDtcblxuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjaHVua05hbWVzTGVuZ3RoOyBpKyspIHtcbiAgICAgICAgZ2V0VmFsdWVzTGlzdF9hY2N1bXVsYXRvci5wdXNoKHN0YXRlT2JqZWN0W2NodW5rTmFtZXNbaV1dKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIGdldFZhbHVlc0xpc3RfYWNjdW11bGF0b3I7XG4gICAgfVxuXG4gICAgLyohXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IGZvcm1hdFN0cmluZ1xuICAgICAqIEBwYXJhbSB7QXJyYXkuPG51bWJlcj59IHJhd1ZhbHVlc1xuICAgICAqXG4gICAgICogQHJldHVybiB7c3RyaW5nfVxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGdldEZvcm1hdHRlZFZhbHVlcyAoZm9ybWF0U3RyaW5nLCByYXdWYWx1ZXMpIHtcbiAgICAgIHZhciBmb3JtYXR0ZWRWYWx1ZVN0cmluZyA9IGZvcm1hdFN0cmluZztcbiAgICAgIHZhciByYXdWYWx1ZXNMZW5ndGggPSByYXdWYWx1ZXMubGVuZ3RoO1xuXG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHJhd1ZhbHVlc0xlbmd0aDsgaSsrKSB7XG4gICAgICAgIGZvcm1hdHRlZFZhbHVlU3RyaW5nID0gZm9ybWF0dGVkVmFsdWVTdHJpbmcucmVwbGFjZShcbiAgICAgICAgICBWQUxVRV9QTEFDRUhPTERFUiwgK3Jhd1ZhbHVlc1tpXS50b0ZpeGVkKDQpKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIGZvcm1hdHRlZFZhbHVlU3RyaW5nO1xuICAgIH1cblxuICAgIC8qIVxuICAgICAqIE5vdGU6IEl0J3MgdGhlIGR1dHkgb2YgdGhlIGNhbGxlciB0byBjb252ZXJ0IHRoZSBBcnJheSBlbGVtZW50cyBvZiB0aGVcbiAgICAgKiByZXR1cm4gdmFsdWUgaW50byBudW1iZXJzLiAgVGhpcyBpcyBhIHBlcmZvcm1hbmNlIG9wdGltaXphdGlvbi5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBmb3JtYXR0ZWRTdHJpbmdcbiAgICAgKlxuICAgICAqIEByZXR1cm4ge0FycmF5LjxzdHJpbmc+fG51bGx9XG4gICAgICovXG4gICAgZnVuY3Rpb24gZ2V0VmFsdWVzRnJvbSAoZm9ybWF0dGVkU3RyaW5nKSB7XG4gICAgICByZXR1cm4gZm9ybWF0dGVkU3RyaW5nLm1hdGNoKFJfVU5GT1JNQVRURURfVkFMVUVTKTtcbiAgICB9XG5cbiAgICAvKiFcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gZWFzaW5nT2JqZWN0XG4gICAgICogQHBhcmFtIHtPYmplY3R9IHRva2VuRGF0YVxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGV4cGFuZEVhc2luZ09iamVjdCAoZWFzaW5nT2JqZWN0LCB0b2tlbkRhdGEpIHtcbiAgICAgIFR3ZWVuYWJsZS5lYWNoKHRva2VuRGF0YSwgZnVuY3Rpb24gKHByb3ApIHtcbiAgICAgICAgdmFyIGN1cnJlbnRQcm9wID0gdG9rZW5EYXRhW3Byb3BdO1xuICAgICAgICB2YXIgY2h1bmtOYW1lcyA9IGN1cnJlbnRQcm9wLmNodW5rTmFtZXM7XG4gICAgICAgIHZhciBjaHVua0xlbmd0aCA9IGNodW5rTmFtZXMubGVuZ3RoO1xuICAgICAgICB2YXIgZWFzaW5nQ2h1bmtzID0gZWFzaW5nT2JqZWN0W3Byb3BdLnNwbGl0KCcgJyk7XG4gICAgICAgIHZhciBsYXN0RWFzaW5nQ2h1bmsgPSBlYXNpbmdDaHVua3NbZWFzaW5nQ2h1bmtzLmxlbmd0aCAtIDFdO1xuXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY2h1bmtMZW5ndGg7IGkrKykge1xuICAgICAgICAgIGVhc2luZ09iamVjdFtjaHVua05hbWVzW2ldXSA9IGVhc2luZ0NodW5rc1tpXSB8fCBsYXN0RWFzaW5nQ2h1bms7XG4gICAgICAgIH1cblxuICAgICAgICBkZWxldGUgZWFzaW5nT2JqZWN0W3Byb3BdO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyohXG4gICAgICogQHBhcmFtIHtPYmplY3R9IGVhc2luZ09iamVjdFxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSB0b2tlbkRhdGFcbiAgICAgKi9cbiAgICBmdW5jdGlvbiBjb2xsYXBzZUVhc2luZ09iamVjdCAoZWFzaW5nT2JqZWN0LCB0b2tlbkRhdGEpIHtcbiAgICAgIFR3ZWVuYWJsZS5lYWNoKHRva2VuRGF0YSwgZnVuY3Rpb24gKHByb3ApIHtcbiAgICAgICAgdmFyIGN1cnJlbnRQcm9wID0gdG9rZW5EYXRhW3Byb3BdO1xuICAgICAgICB2YXIgY2h1bmtOYW1lcyA9IGN1cnJlbnRQcm9wLmNodW5rTmFtZXM7XG4gICAgICAgIHZhciBjaHVua0xlbmd0aCA9IGNodW5rTmFtZXMubGVuZ3RoO1xuICAgICAgICB2YXIgY29tcG9zZWRFYXNpbmdTdHJpbmcgPSAnJztcblxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGNodW5rTGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICBjb21wb3NlZEVhc2luZ1N0cmluZyArPSAnICcgKyBlYXNpbmdPYmplY3RbY2h1bmtOYW1lc1tpXV07XG4gICAgICAgICAgZGVsZXRlIGVhc2luZ09iamVjdFtjaHVua05hbWVzW2ldXTtcbiAgICAgICAgfVxuXG4gICAgICAgIGVhc2luZ09iamVjdFtwcm9wXSA9IGNvbXBvc2VkRWFzaW5nU3RyaW5nLnN1YnN0cigxKTtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIFR3ZWVuYWJsZS5wcm90b3R5cGUuZmlsdGVyLnRva2VuID0ge1xuICAgICAgJ3R3ZWVuQ3JlYXRlZCc6IGZ1bmN0aW9uIChjdXJyZW50U3RhdGUsIGZyb21TdGF0ZSwgdG9TdGF0ZSwgZWFzaW5nT2JqZWN0KSB7XG4gICAgICAgIHNhbml0aXplT2JqZWN0Rm9ySGV4UHJvcHMoY3VycmVudFN0YXRlKTtcbiAgICAgICAgc2FuaXRpemVPYmplY3RGb3JIZXhQcm9wcyhmcm9tU3RhdGUpO1xuICAgICAgICBzYW5pdGl6ZU9iamVjdEZvckhleFByb3BzKHRvU3RhdGUpO1xuICAgICAgICB0aGlzLl90b2tlbkRhdGEgPSBnZXRGb3JtYXRNYW5pZmVzdHMoY3VycmVudFN0YXRlKTtcbiAgICAgIH0sXG5cbiAgICAgICdiZWZvcmVUd2Vlbic6IGZ1bmN0aW9uIChjdXJyZW50U3RhdGUsIGZyb21TdGF0ZSwgdG9TdGF0ZSwgZWFzaW5nT2JqZWN0KSB7XG4gICAgICAgIGV4cGFuZEVhc2luZ09iamVjdChlYXNpbmdPYmplY3QsIHRoaXMuX3Rva2VuRGF0YSk7XG4gICAgICAgIGV4cGFuZEZvcm1hdHRlZFByb3BlcnRpZXMoY3VycmVudFN0YXRlLCB0aGlzLl90b2tlbkRhdGEpO1xuICAgICAgICBleHBhbmRGb3JtYXR0ZWRQcm9wZXJ0aWVzKGZyb21TdGF0ZSwgdGhpcy5fdG9rZW5EYXRhKTtcbiAgICAgICAgZXhwYW5kRm9ybWF0dGVkUHJvcGVydGllcyh0b1N0YXRlLCB0aGlzLl90b2tlbkRhdGEpO1xuICAgICAgfSxcblxuICAgICAgJ2FmdGVyVHdlZW4nOiBmdW5jdGlvbiAoY3VycmVudFN0YXRlLCBmcm9tU3RhdGUsIHRvU3RhdGUsIGVhc2luZ09iamVjdCkge1xuICAgICAgICBjb2xsYXBzZUZvcm1hdHRlZFByb3BlcnRpZXMoY3VycmVudFN0YXRlLCB0aGlzLl90b2tlbkRhdGEpO1xuICAgICAgICBjb2xsYXBzZUZvcm1hdHRlZFByb3BlcnRpZXMoZnJvbVN0YXRlLCB0aGlzLl90b2tlbkRhdGEpO1xuICAgICAgICBjb2xsYXBzZUZvcm1hdHRlZFByb3BlcnRpZXModG9TdGF0ZSwgdGhpcy5fdG9rZW5EYXRhKTtcbiAgICAgICAgY29sbGFwc2VFYXNpbmdPYmplY3QoZWFzaW5nT2JqZWN0LCB0aGlzLl90b2tlbkRhdGEpO1xuICAgICAgfVxuICAgIH07XG5cbiAgfSAoVHdlZW5hYmxlKSk7XG5cbiAgfSh3aW5kb3cpKTtcblxuICByZXR1cm4gd2luZG93LlR3ZWVuYWJsZTtcbn0pO1xuXG5tb2R1bGUuZXhwb3J0cyA9IFNoaWZ0eTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIENhcm91c2VsU2xpY2UgPSBhbmd1bGFyLm1vZHVsZSgnYW5ndWxhci1jYXJvdXNlbCcpXG4uZmlsdGVyKCdjYXJvdXNlbFNsaWNlJywgZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKGNvbGxlY3Rpb24sIHN0YXJ0LCBzaXplKSB7XG4gICAgICAgIGlmIChhbmd1bGFyLmlzQXJyYXkoY29sbGVjdGlvbikpIHtcbiAgICAgICAgICAgIHJldHVybiBjb2xsZWN0aW9uLnNsaWNlKHN0YXJ0LCBzdGFydCArIHNpemUpO1xuICAgICAgICB9IGVsc2UgaWYgKGFuZ3VsYXIuaXNPYmplY3QoY29sbGVjdGlvbikpIHtcbiAgICAgICAgICAgIC8vIGRvbnQgdHJ5IHRvIHNsaWNlIGNvbGxlY3Rpb25zIDopXG4gICAgICAgICAgICByZXR1cm4gY29sbGVjdGlvbjtcbiAgICAgICAgfVxuICAgIH07XG59KTtcblxubW9kdWxlLmV4cG9ydHMgPSBDYXJvdXNlbFNsaWNlO1xuIl19
