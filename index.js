var fs = require('fs');
var path = require('path');
var through = require('through');
var FileSystemLoader = require('css-modules-loader-core/lib/file-system-loader');
var assign = require('object-assign');

var cssExt = /\.css$/;
module.exports = function (browserify, options) {
  options = options || {};

  var cssOutFilename = options.output || options.o;
  if (!cssOutFilename) {
    throw new Error('css-modulesify needs the --output / -o option (path to output css file)');
  }

  // keep track of css files visited
  var filenames = [];

  // keep track of all tokens so we can avoid duplicates
  var tokensByFile = {};

  // keep track of all source files for later builds: when
  // using watchify, not all files will be caught on subsequent
  // bundles
  var sourceByFile = {};

  browserify.transform(function transform (filename) {
    // only handle .css files
    if (!cssExt.test(filename)) {
      return through();
    }

    // collect visited filenames
    filenames.push(filename);

    return through(function noop () {}, function end () {
      var self = this;

      var loader = new FileSystemLoader(path.dirname(filename));

      // pre-populate the loader's tokensByFile
      loader.tokensByFile = tokensByFile;

      loader.fetch(path.basename(filename), '/').then(function (tokens) {
        var output = "module.exports = " + JSON.stringify(tokens);

        assign(tokensByFile, loader.tokensByFile);

        // store this file's source to be written out to disk later
        sourceByFile[filename] = loader.finalSource;

        self.queue(output);
        self.queue(null);
      }, function (err) {
        console.error(err);
      });
    });
  });

  // wrap the `bundle` function
  var bundle = browserify.bundle;
  browserify.bundle = function (opts, cb) {
    // reset the `tokensByFile` cache
    tokensByFile = {};

    // call the original
    var stream = bundle.apply(browserify, arguments);

    // close the css stream
    stream.on('end', function () {
      // Combine the collected sources into a single CSS file
      var css = Object.keys(sourceByFile).map(function(file) {
        return sourceByFile[file];
      }).join('\n');

      fs.writeFile(cssOutFilename, css, function(err) {
        if (err) console.error(err);
      });
    });

    return stream;
  };

  return browserify;
};
