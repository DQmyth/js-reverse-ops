// Two dynamic imports that share a module (srcsplit/): a main bundle, two lazy chunks and a shared
// chunk. The same config builds with webpack 4 and webpack 5; output path comes from the command
// line, so that nothing lands in this directory (see README, "Regenerating").
module.exports = { context: __dirname, entry: './srcsplit/entry.mjs', devtool: false, output: { filename: '[name].js' } };
