'use strict';

var gulp = require('gulp');
var concat = require('gulp-concat');
var stylus = require('gulp-stylus');
var transform = require('vinyl-transform');
var uglify = require('gulp-uglify');
var sourcemaps = require('gulp-sourcemaps');
var browserify = require('browserify');
var gutil = require('gulp-util');
var source = require('vinyl-source-stream');
var tap = require('gulp-tap');
var debug = require('gulp-debug');
var manifest = require('gulp-concat-filenames');

var options = {
  'javascript': {
    'buildFile': 'app.js',
    'sources': [
      './src/core/**/*.js',
      './src/common/**/*.js',
      './src/features/**/*.js'
    ]
  },
  'browserify': {
    'debug': true
  },
  'manifest': {
    'root': './',
    'prepend': 'require("./',
    'append': '");'
  },
  'styles': {
    'buildFile': 'styles.css',
    'sources': [
      './src/styles'
    ]
  }
};

function buildJavascript() {
  function doBrowserification(file) {
    return browserify(file, options.browserify)
      .bundle()
      .pipe(source('features.js'))
      .pipe(gulp.dest('./dist/'));
  }

  return gulp
    .src(options.javascript.sources)
    .pipe(manifest('features.js', options.manifest))
    .pipe(tap(doBrowserification))
}

function buildStyles() {

}

function buildPartials() {

}

gulp.task('build-javascript', buildJavascript);
gulp.task('build-styles', buildStyles);
gulp.task('build-partials', buildPartials);

gulp.task('build', ['build-javascript', 'build-styles', 'build-partials']);
