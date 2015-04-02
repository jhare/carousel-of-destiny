'use strict';

var gulp = require('gulp');
var concat = require('gulp-concat');
var stylus = require('gulp-stylus');

var options = {
  'javascript': {
    'buildFile': 'app.js',
    'sources': [
      './src/core',
      './src/common',
      './src/features'
    ]
  },

  'styles': {
    'buildFile': 'styles.css',
    'sources': [
      './src/styles'
    ]
  }
};

function buildJavascript() {
}

function buildStyles() {

}

function buildPartials() {

}

gulp.task('build-javascript', 'buildJavacript');
gulp.task('build-styles', 'buildStyles');
gulp.task('build-partials', 'buildPartials');

gulp.task(build, ['build-javascript', 'build-styles', 'build-partials']);
