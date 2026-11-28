// srct/lib.js: constructs a token scanner has to get right. Everything here is ordinary code that
// real bundles carry — each line broke, or could break, a scanner that reads to the first
// backtick, or that calls a slash after `)` a regex
const constraint = (property) => `\`${property}\` error\n`;
// a template whose interpolation holds a template of its own, which holds one again
function list(property, errors) {
  if (!errors || (errors && Object.keys(errors).length > 1)) {
    return `${`\`${property}\` errors:\n`}${Object.keys(errors).map((key) => `    - ${key}: ${`\`${errors[key]}\``}\n`).join()}`;
  }
  return constraint(property);
}
// a regex with quotes, braces, and an escaped bracket inside a character class
const SPECIAL = /[.*+?^${}()|[\]\\]/g;
const escapeRe = (text) => text.replace(SPECIAL, '\\$&');
// division, twice; then a regex after the closing brace of a block
function ratio(a, b) { return (a / b / 2) | 0; }
function afterBlock(flag) { if (flag) { return 1; } }
const afterHead = /brace" } {\//.test('x') ? '}' : '{';
// a regex after `)` that closed an if-head with parentheses nested in it
function afterNested(a, b) { if ((a && (b || a)) || (b && a)) return /["']/g.test('it\'s "quoted"'); }
// quotes, slashes and comment marks inside template text — all of them just text
const text = `it's a "quoted" // not a comment /* nor this */ ${'nested \'quoted\' string'} end`;
/* a comment holding braces } { and a quote ' and a backtick ` */
function literalKey(key) { return { 'a}b': 1, 'c{d': 2, [`e${key}f`]: 3, 'g/': /h\/i/ }; }
function lines(items) { return items.map((item) => `* ${item}\n`).join(''); }
module.exports = { constraint, list, escapeRe, ratio, afterBlock, afterHead, afterNested, text, literalKey, lines };
