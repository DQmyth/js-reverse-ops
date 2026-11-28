// srct/: constructs that a token scanner has to get right (nested template literals, regexes after
// `)`, comment marks inside strings and templates). Built by webpack 4 and by webpack 5; output
// path and file name come from the command line (see README, "Regenerating").
module.exports = { context: __dirname, entry: './srct/entry.js', devtool: false, output: { filename: '[name].js' } };
