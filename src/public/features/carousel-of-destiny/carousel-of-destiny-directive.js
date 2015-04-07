'use strict';
var angular = require('angular');

angular.module('angular-carousel')
  .directive('carouselOfDestiny', [function carouselOfDestinyDirective() {

    function linkCarouselOfDestiny($scope, $element, $attrs) {
    }

    return {
      'restrict': 'E',
      'scope': {
        'slides': '=?'
      },
      'link': linkCarouselOfDestiny,
      'templateUrl': '/partials/carousel-of-destiny/carousel-of-destiny-partial.html',
      'replace': true
    };

  }]);
