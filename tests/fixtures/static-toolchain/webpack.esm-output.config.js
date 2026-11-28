// src/entry.js written as an ES module by webpack 5 (`experiments.outputModule`): a file that runs
// on its own and makes no exports — `.mjs` is all that sets it apart.
// Usage: webpack -c webpack.esm-output.config.js --mode production --output-path <dir>
module.exports = { context: __dirname, entry: './src/entry.js', devtool: false, target: 'node', experiments: { outputModule: true }, output: { filename: 'esm-output-webpack-5.mjs', module: true } };
