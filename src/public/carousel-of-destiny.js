'use strict';
var angular = require('angular');
require('angular-touch');

var theApp = angular.module('angular-carousel', [
    'ngTouch',
    'angular-carousel.shifty'
]).config(function trustVimeo($sceDelegateProvider) {
  console.log('i have the provider', $sceDelegateProvider);

  $sceDelegateProvider.resourceUrlWhitelist([
    'self',
    'http://player.vimeo.com/video/**',
    'https://player.vimeo.com/video/**'
  ]);
});

theApp.controller('MainCtrl', function MainCtrlDefinition($scope) {

  $scope.carouselIndex1 = 0;
  $scope.carouselIndex2 = 0;


  $scope.slideImagesOnly = [
    {
      id: 0,
      href: 'http://placekitten.com/g/200/300',
      type: 'image'
    },
    {
      id: 1,
      href: 'http://placekitten.com/g/200/300',
      type: 'image'
    },
    {
      id: 2,
      href: 'http://placekitten.com/g/200/300',
      type: 'image'
    },
    {
      id: 3,
      href: 'https://player.vimeo.com/video/62348620?api=1&player_id=player2',
      type: 'video',
      videoID: 'player2'
    },
    {
      id: 4,
      href: 'http://placekitten.com/g/200/300',
      type: 'image'
    }
  ];

  $scope.slideWithVideo = [
    {
      id: 0,
      href: 'http://placekitten.com/g/200/300',
      type: 'image'
    },
    {
      id: 1,
      href: 'https://player.vimeo.com/video/62798091?api=1&player_id=player1',
      type: 'video',
      videoID: 'player1'
    },
    {
      id: 2,
      href: 'http://placekitten.com/g/200/300',
      type: 'image'
    }
  ];

  $scope.randoFunc = function() {
    console.log('I AM RANDOOOOO', this);
  };

  setTimeout(function() {
    function setupFroogaloop(id) {
        var iframe = $(id)[0];
        var player = $f(iframe);
        var status = $('.status');

        // When the player is ready, add listeners for pause, finish, and playProgress
        player.addEvent('ready', function() {
            status.text('ready');
            
            player.addEvent('pause', onPause);
            player.addEvent('finish', onFinish);
            player.addEvent('playProgress', onPlayProgress);
            player.addEvent('play', onPlay);
        });

        function onPlay(id) {
          status.text('playing ' + id);
        }

        // Call the API when a button is pressed
        $('button').bind('click', function() {
            player.api($(this).text().toLowerCase());
        });

        function onPause(id) {
            status.text('paused');
        }

        function onFinish(id) {
            status.text('finished');
        }

        function onPlayProgress(data, id) {
            status.text(data.seconds + 's played');
        }
    }

    setupFroogaloop('#player2');

    });
});
