// As webpack.split.config.js, with the common setting that gives the bootstrap (webpack's runtime)
// a chunk file of its own. A page then loads two files up front — the runtime chunk, then the
// entry chunk — before any lazy one. The same config builds with webpack 4 (there: runtimeChunk)
// and webpack 5.
module.exports = {
  context: __dirname, entry: './srcsplit/entry.mjs', devtool: false, output: { filename: '[name].js' },
  optimization: { runtimeChunk: 'single', splitChunks: { minSize: 0 } },
};
