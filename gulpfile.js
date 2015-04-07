'use strict';

var gulp = require('gulp');
var concat = require('gulp-concat');
var stylus = require('gulp-stylus');
var buffer = require('vinyl-buffer');
var uglify = require('gulp-uglify');
var browserify = require('browserify');
var source = require('vinyl-source-stream');
var tap = require('gulp-tap');
var manifest = require('gulp-concat-filenames');

var options = {
  'buildDir': './dist/',
  'javascript': {
    'buildFile': 'carousel-of-destiny.js',
    'sources': [
      './src/public/carousel-of-destiny.js',
      './src/public/core/**/*.js',
      './src/public/common/**/*.js',
      './src/public/features/**/*.js'
    ]
  },
  'styles': {
    'buildFile': 'styles.css',
    'sources': [
      './src/public/styles/**/*.styl'
    ]
  },
  'partials': {
    'sources': './src/public/features/**/*.html',
    'subDir': '/partials'
  },
  'pages': {
    'buildFile': 'index.html',
    'sources': [
      './src/public/index.html'
    ]
  },
  'browserify': {
    'debug': true
  },
  'manifest': {
    'root': './',
    'prepend': 'require("./',
    'append': '");'
  }
};

function buildJavascript() {
  function doBrowserification(file) {
    return browserify(file, options.browserify)
      .bundle()
      .pipe(source(options.javascript.buildFile))
      //.pipe(buffer())
      //.pipe(uglify())
      .pipe(gulp.dest(options.buildDir));
  }

  return gulp
    .src(options.javascript.sources)
    //.pipe(uglify())
    .pipe(manifest(options.javascript.buildFile, options.manifest))
    .pipe(tap(doBrowserification));
}

function buildStyles() {
  return gulp.src(options.styles.sources)
    .pipe(stylus())
    .pipe(concat(options.styles.buildFile))
    .pipe(gulp.dest(options.buildDir));
}

function buildPages() {
  return gulp.src(options.pages.sources)
    .pipe(gulp.dest(options.buildDir));
}

function buildPartials() {
  return gulp.src(options.partials.sources)
    .pipe(gulp.dest(options.buildDir + options.partials.subDir));
}

gulp.task('build-javascript', buildJavascript);
gulp.task('build-styles', buildStyles);
gulp.task('build-partials', buildPartials);
gulp.task('build-pages', buildPages);

gulp.task('build', [
  'build-javascript',
  'build-styles',
  'build-partials',
  'build-pages'
]);
