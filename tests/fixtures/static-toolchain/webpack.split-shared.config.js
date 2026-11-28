// As webpack.split.config.js, with the common splitChunks setting that gives the shared module a
// chunk of its own (default: a module this small is copied into every chunk that uses it).
// The same config builds with webpack 4 and webpack 5; output path comes from the command line.
module.exports = {
  context: __dirname, entry: './srcsplit/entry.mjs', devtool: false, output: { filename: '[name].js' },
  optimization: { splitChunks: { minSize: 0 } },
};
