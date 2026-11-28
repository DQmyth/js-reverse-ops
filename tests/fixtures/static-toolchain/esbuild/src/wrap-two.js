// an esbuild entry that wraps TWO webpack bundles and one plain module, each used lazily — the
// shape of packages that are themselves built from bundles (a test library shipping its matchers)
const a = () => require('../../webpack-4.development.js');
const b = () => require('../../webpack-4.production.js');
const lib = require('../../srct/lib.js');
module.exports = { a, b, lib };
