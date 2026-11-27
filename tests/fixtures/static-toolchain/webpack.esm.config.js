module.exports = {
  context: __dirname,
  entry: './srcm/entry.mjs', devtool: false, target: 'web',
  optimization: { concatenateModules: false },
  output: { path: __dirname, filename: '[name].js' },
};
