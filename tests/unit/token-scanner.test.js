'use strict';
// The scanner every structural tool of this collection is built on — tokenAt / skipToken / endOf
// in scripts/inspect_obfuscation_family.js — is what finds where a string, a template, a regex or
// a comment ends, without a parser. Two things are checked:
//   1. against a real parser: for every file of this collection esprima can read, the scanner's
//      strings, templates, regexes and comments are exactly the parser's — same start, same end
//   2. on text written for what real bundles showed: a template inside a template's interpolation,
//      a regex after the `)` of a nested condition, comment marks inside strings and templates,
//      numbers as a minifier writes them (`19e3`), a bundle wrapped in one more layer of
//      parentheses by a second bundler
// A divergence here is not small. The unbundler cuts where the scanner says a token ends: found on
// a real 1.7 MB webpack bundle, where a nested template made the scanner miscount the braces after
// it, the module map's closing brace came out 1,139 characters late, and the map was "not
// recognised as a whole" — while smaller bundles cut by the same code had looked right.
// MUTATOR_TOOL=<path to another build of inspect_obfuscation_family.js> swaps the scanner under
// test; the parser side is esprima, a dependency of this package.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const esprima = require('esprima');
const estraverse = require('estraverse');

const ROOT = path.join(__dirname, '..', '..');
const SCANNER = process.env.MUTATOR_TOOL || path.join(ROOT, 'scripts', 'inspect_obfuscation_family.js');
const { tokenAt, skipToken, endOf, stripComments, blankComments, classifyMember, factoryMaps, webpackBootstrap, splitMembers } = require(SCANNER);
const OPT = { timeout: 60000 };

// [start, end, kind] of every string, template, regex and comment of a text, by the scanner
function scannerSpans(text) {
  const out = [];
  for (let i = 0; i < text.length; i += 1) {
    const kind = tokenAt(text, i);
    if (!kind) continue;
    const end = skipToken(text, i);
    out.push([i, end, kind === 'line-comment' ? 'Line' : kind === 'block-comment' ? 'Block' : kind]);
    i = end - 1;
  }
  return out;
}
// …and by a real parser. Parse only; nothing is run
function parserSpans(text) {
  let ast = null;
  for (const asModule of [false, true]) {
    try {
      ast = esprima[asModule ? 'parseModule' : 'parseScript'](text, { range: true, comment: true, tolerant: false });
      break;
    } catch (_error) { /* the other source type may fit; else the file is outside what esprima reads */ }
  }
  if (!ast) return null;
  const out = [];
  estraverse.traverse(ast, {
    enter(node) {
      if (node.type === 'Literal' && (node.regex || typeof node.value === 'string')) out.push([node.range[0], node.range[1], node.regex ? 'regex' : 'string']);
      else if (node.type === 'TemplateLiteral') out.push([node.range[0], node.range[1], 'string']);
    },
  });
  for (const comment of ast.comments) out.push([comment.range[0], comment.range[1], comment.type]);
  // the parser lists a template inside an interpolation as a node of its own; the scanner steps
  // over the whole outer template as one token. Only the outermost of nested templates is compared
  const outermost = [];
  for (const span of out.sort((a, b) => a[0] - b[0])) {
    const last = outermost[outermost.length - 1];
    if (last && span[0] < last[1] && last[2] === 'string') continue;
    outermost.push(span);
  }
  return outermost;
}

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(full);
  return /\.(js|mjs)$/.test(entry.name) ? [full] : [];
});

test('the token scanner and a real parser agree on every token of every file of this collection that esprima can read', OPT, (t) => {
  const files = [
    ...walk(path.join(__dirname, '..', 'fixtures', 'static-toolchain')),
    ...walk(path.join(__dirname, '..', 'helpers')),
    path.join(ROOT, 'scripts', 'inspect_obfuscation_family.js'),
    path.join(ROOT, 'scripts', 'unbundle.js'),
    path.join(ROOT, 'scripts', 'trace_module_graph.js'),
  ].filter((file) => fs.existsSync(file));
  assert.ok(files.length > 70, `files found: ${files.length}`);
  const compared = [];
  const outsideEsprima = [];
  let comparedSpans = 0;
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const truth = parserSpans(text);
    if (!truth) { outsideEsprima.push(path.relative(ROOT, file)); continue; }
    const mine = scannerSpans(text).sort((a, b) => a[0] - b[0]);
    compared.push(file);
    comparedSpans += truth.length;
    let first = null;
    for (let i = 0; i < Math.max(truth.length, mine.length); i += 1) {
      if (JSON.stringify(truth[i]) !== JSON.stringify(mine[i])) { first = i; break; }
    }
    if (first !== null) {
      const at = (mine[first] || truth[first])[0];
      assert.fail(`${path.relative(ROOT, file)}: token ${first} differs — scanner ${JSON.stringify(mine[first])}, parser ${JSON.stringify(truth[first])}; text: ${JSON.stringify(text.slice(Math.max(0, at - 60), at + 80))}`);
    }
  }
  t.diagnostic(`${compared.length} files, ${comparedSpans} tokens; ${outsideEsprima.length} files use syntax beyond esprima 4.0 (ES2019) and are compared nowhere here: ${outsideEsprima.map((f) => path.relative(path.join(__dirname, '..', 'fixtures'), f)).slice(0, 6).join(', ')}…`);
  // the comparison must have covered the bundles meant for it, not a handful of sources
  assert.ok(compared.some((f) => f.endsWith('webpack-5.scanner.js')), 'the scanner-torture bundle is compared');
  assert.ok(compared.some((f) => f.endsWith('esbuild-around-two-bundles.js')), 'a bundle around bundles is compared');
  assert.ok(compared.length >= 80 && comparedSpans > 1500, `${compared.length} files, ${comparedSpans} tokens compared`);
});

test('a template that holds a template in its interpolation ends where the template ends', () => {
  // as in the real bundle (\`formatWithNestedConstraints\`): the outer template's interpolation holds
  // a template, whose interpolation holds one again — and each of those has a backtick of its own
  const text = 'x = `a${ `b${ `c` }d` }e\\n`; y = 1;';
  const start = text.indexOf('`');
  const end = skipToken(text, start);
  assert.strictEqual(text.slice(start, end), '`a${ `b${ `c` }d` }e\\n`');
  assert.strictEqual(text[end], ';');
  // with a comment, a regex and quotes inside the interpolation — all stepped over
  const harder = 'x = `p${ (/* } */ 1) + (/s{2}/g.test(s) ? "it\\\'s" : \'`\') }t${ `u${v}` }`; z = 2;';
  const s = harder.indexOf('`');
  const e = skipToken(harder, s);
  assert.strictEqual(harder.slice(s, e), harder.slice(s, harder.indexOf('`; z') + 1), 'the whole template, through the comment, the regex and both kinds of quote inside it');
  // text inside a template is text: quotes, slashes and comment marks open nothing
  const plain = 'x = `it\'s "quoted" // not a comment /* nor this */ end`; y = 3;';
  const p = plain.indexOf('`');
  assert.strictEqual(plain.slice(p, skipToken(plain, p)), '`it\'s "quoted" // not a comment /* nor this */ end`');
  // and so the brace that closes an object holding such a template is found where it is
  const object = '{\n  list: (t, e) => `${`\\`${e}\\` errors:\\n`}${Object.keys(t).map((e) => `    - ${`\\`${t[e]}\\``}\\n`).join()}`,\n  re: /[.*+?^${}()|[\\]\\\\]/g,\n}';
  assert.strictEqual(endOf(object, 0, '{', '}'), object.length - 1);
});

test('a slash after `)` is a regex only when the `)` closed the head of an if / while / for / with — nested parentheses included', () => {
  const regexAt = (text, index) => tokenAt(text, index);
  // after a condition with parentheses nested in it (v1.9.2 read this as division)
  const nested = 'function f(a, b) { if ((a && (b)) || (b && a)) return /["\']/g.test(s); }';
  assert.strictEqual(regexAt(nested, nested.indexOf('/["')), 'regex');
  assert.strictEqual(skipToken(nested, nested.indexOf('/["')), nested.indexOf('/["') + '/["\']/g'.length);
  // after the `}` of a block
  const block = 'function g(a) { if (a) { return 1; } } /x/.test(s); h = 1;';
  assert.strictEqual(regexAt(block, block.indexOf('/x/')), 'regex');
  // after `)` of a call it is division; and after a name
  assert.strictEqual(regexAt('y = f(a) / b / 2;', 'y = f(a) / b / 2;'.indexOf('/')), null);
  assert.strictEqual(regexAt('y = a / b / 2;', 'y = a / b / 2;'.indexOf('/')), null);
  // a regex after a keyword, and one that holds quotes, braces and an escaped closing bracket
  assert.strictEqual(regexAt('return /brace" } {\\//.test(x);', 7), 'regex');
  assert.strictEqual(skipToken('/[.*+?^${}()|[\\]\\\\]/g', 0), '/[.*+?^${}()|[\\]\\\\]/g'.length);
  assert.strictEqual('/h\\/i/'.length, skipToken('/h\\/i/', 0));
});

test('a `}` that closes an object literal is followed by division; one that closes a block may be followed by a regex', () => {
  const slash = (text, marker) => text.indexOf(marker);
  // object literals — division both times
  assert.strictEqual(tokenAt('x = ({ a: 1 } / 2);', slash('x = ({ a: 1 } / 2);', '/ 2')), null);
  assert.strictEqual(tokenAt('y = `t${ { a: 1 } / 2 }u`;', slash('y = `t${ { a: 1 } / 2 }u`;', '/ 2')), null);
  // blocks: a regex may follow — `if (a) { … } /re/.test(x)`, a function body, an arrow block, a bare block
  assert.strictEqual(tokenAt('if (a) { b(); } /x/.test(s);', slash('if (a) { b(); } /x/.test(s);', '/x/')), 'regex');
  assert.strictEqual(tokenAt('function g() { return 1; } /y/.test(s);', slash('function g() { return 1; } /y/.test(s);', '/y/')), 'regex');
  assert.strictEqual(tokenAt('const f = (a) => { a(); }; /z/.test(s);', slash('const f = (a) => { a(); }; /z/.test(s);', '/z/')), 'regex');
  assert.strictEqual(tokenAt('while (a) { b(); } /w/.test(s);', slash('while (a) { b(); } /w/.test(s);', '/w/')), 'regex');
  assert.strictEqual(tokenAt('if (a) { if (b) { c(); } } /v/.test(s);', slash('if (a) { if (b) { c(); } } /v/.test(s);', '/v/')), 'regex', 'nested blocks');
});

test('comments: the ones outside strings and templates go, the ones inside stay', () => {
  const text = [
    'a = 1; // a line comment } {',
    '/* a block comment holding braces } { and quotes \' " and a backtick ` */',
    "b = 'brace } in a string'; /* not seen: inside the next string */ c = \"/* not a comment */\";",
    'd = `it\'s "quoted" // not a comment /* nor this */ ${ \'nested /* no */ \' } end`;',
    'e = 2;',
  ].join('\n');
  const stripped = stripComments(text);
  assert.match(stripped, /a = 1;\s+$/m);
  assert.doesNotMatch(stripped, /a line comment|a block comment/);
  assert.ok(stripped.includes("b = 'brace } in a string';"));
  assert.ok(stripped.includes('c = "/* not a comment */";'));
  assert.ok(stripped.includes('// not a comment /* nor this */'));
  assert.ok(stripped.includes('${ \'nested /* no */ \' }'));
  assert.ok(stripped.endsWith('e = 2;'));
  // blanking keeps every index in place, so what is found on it is found in the original
  const blanked = blankComments(text);
  assert.strictEqual(blanked.length, text.length);
  assert.ok(blanked.includes('a = 1;'));
});

test('members of a module map: numbers as a minifier writes them, two layers of parentheses, whitespace everywhere', () => {
  // `19e3` was the id 19000 in a real 1.7 MB bundle: read as the key `19`, the map was rejected
  assert.deepStrictEqual(classifyMember('19e3:function(e,t){}', 'object'), { type: 'function', key: '19e3', params: ['e', 't'] });
  assert.deepStrictEqual(classifyMember('0x4a4b:(e,t,r)=>{}', 'object'), { type: 'function', key: '0x4a4b', params: ['e', 't', 'r'] });
  assert.deepStrictEqual(classifyMember('1e3(e,t,r){}', 'object'), { type: 'method', key: '1e3', params: ['e', 't', 'r'] });
  // a bundle that another bundler wrapped again (esbuild around webpack, pretty-printed)
  const wrapped = '"./src/x.ts": (\n\n          ((__unused_webpack_module, exports3, __webpack_require__2) => {\n            x.y(1);\n          })\n        )';
  assert.deepStrictEqual(classifyMember(wrapped, 'object'), { type: 'function', key: '"./src/x.ts"', params: ['__unused_webpack_module', 'exports3', '__webpack_require__2'] });
  assert.deepStrictEqual(classifyMember('556(e){e.exports={}}', 'object'), { type: 'method', key: '556', params: ['e'] });
  // a factory's own parameter list is not a wrapping
  assert.deepStrictEqual(classifyMember('(e, t) => { e(t) }', 'array'), { type: 'function', key: null, params: ['e', 't'] });
  assert.deepStrictEqual(classifyMember('3: (e, t) => e(2)', 'object'), { type: 'function', key: '3', params: ['e', 't'] });
  // and an IIFE is not a factory
  assert.strictEqual(classifyMember('(function(){ return 1; })()', 'array').type, 'other');
  assert.strictEqual(classifyMember('+1', 'object').type, 'other');
});

test('a module map whose factories carry the hard cases is found whole, and its bootstrap tied to it', () => {
  const code = [
    '!function(e){function n(r){var t={};return r?t[r].exports:(t[r]={exports:{}},e[r].call(t.exports,t,t.exports,n),t[r].exports)}n(19e3)}({',
    '  0x1f: function(e,t,r){ const a = `x${ `y${z}` }w`; return /["\\/]/g.test(a); },',
    '  19e3: function(e){ e.exports = { "a}b": 1, [ `k${e}` ]: 2 }; },',
    '});',
  ].join('\n');
  const maps = factoryMaps(code);
  assert.strictEqual(maps.length, 1);
  assert.deepStrictEqual(maps[0].kinds.map((k) => k.type), ['function', 'function']);
  assert.deepStrictEqual(maps[0].kinds.map((k) => k.key), ['0x1f', '19e3']);
  const bootstrap = webpackBootstrap(code, maps);
  assert.ok(bootstrap, 'the bootstrap');
  assert.strictEqual(bootstrap.map_layout, 'iife-argument');
  assert.strictEqual(bootstrap.map.count, 2);
  assert.strictEqual(bootstrap.in_file, 1);
  assert.deepStrictEqual(splitMembers(code.slice(maps[0].openAt + 1, maps[0].close)).length, 2);
  // two bootstraps in one file: it is a file of bundles (found in a real package's test library)
  const twice = code + '\n' + code.replace('19e3', '19e4');
  assert.strictEqual(webpackBootstrap(twice, factoryMaps(twice)).in_file, 2);
});
