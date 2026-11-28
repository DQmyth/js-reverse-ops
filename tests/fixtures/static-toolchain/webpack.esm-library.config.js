// srct/lib.js written as an ES-module library by webpack 5 (`output.module`, `library.type:
// "module"`): `export` statements at the top level, the module in the same map inside.
// Usage: webpack -c webpack.esm-library.config.js --mode production --output-path <dir>
module.exports = {
  context: __dirname, entry: './srct/lib.js', devtool: false, experiments: { outputModule: true },
  output: { filename: 'esm-library-webpack-5.mjs', module: true, library: { type: 'module' } },
};
