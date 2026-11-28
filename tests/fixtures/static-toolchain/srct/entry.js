// srct/entry.js: calls every helper of ./lib.js and prints what comes back
const lib = require('./lib.js');
const out = {
  constraint: lib.constraint('name'),
  list: lib.list('age', { a: 1, b: 2 }),
  one: lib.list('age', { a: 1 }),
  escaped: lib.escapeRe('a.b*c'),
  ratio: lib.ratio(7, 2),
  afterBlock: lib.afterBlock(true),
  afterHead: lib.afterHead,
  nested: lib.afterNested(1, 0),
  text: lib.text,
  keys: Object.keys(lib.literalKey('k')).sort(),
  lines: lib.lines(['x', 'y']),
};
console.log(JSON.stringify(out));
