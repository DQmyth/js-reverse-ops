// One dynamic import (srcmc/entry.js) → a main bundle that loads a chunk file at run time.
// The same config builds with webpack 4 and webpack 5; output path and file name come from the
// command line, so that nothing lands in this directory (see README, "Regenerating").
module.exports = { context: __dirname, entry: './srcmc/entry.js', devtool: false, output: { filename: '[name].js' } };
