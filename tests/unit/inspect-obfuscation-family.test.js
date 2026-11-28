'use strict';
// inspect_obfuscation_family on REAL tool output. Used through the CLI (a child process) so that
// the same cases can be run against another build of the tool: asked to, they must fail on the
// code before v1.9.0, which answered "unknown" for every javascript-obfuscator sample under 500
// hex identifiers and never knew bundles at all.
// MUTATOR_TOOL=<path> swaps the tool under test.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const TOOL = process.env.MUTATOR_TOOL || path.join(__dirname, '..', '..', 'scripts', 'inspect_obfuscation_family.js');
const FIX = path.join(__dirname, '..', 'fixtures');
const ST = path.join(FIX, 'static-toolchain');
const OPT = { timeout: 60000 };

function run(file, ...args) {
  return spawnSync(process.execPath, [TOOL, file, ...args], { encoding: 'utf8', timeout: 50000 });
}
const inspectPlain = (file) => {
  const r = run(file);
  assert.strictEqual(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
};
function inspect(rel) {
  const r = run(path.join(FIX, rel));
  assert.strictEqual(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

const OB = 'recover-string-table/obfuscator-';
const DE = 'decode-string-array-runtime/obfuscator-';

// sample → what it must read as. Every line is real output of the tool named in the file name.
const EXPECTED = [
  [`${OB}0.27.4-plain-table.js`, 'string-table-obfuscation', (d) => d.string_table.layout === 'top-level-array' && d.string_table.key_scheme === 'plain'],
  [`${OB}2.19.1-plain-table.js`, 'string-table-obfuscation', (d) => d.string_table.layout === 'table-function' && d.string_table.key_scheme === 'plain' && d.string_table.lookups.length === 1],
  [`${OB}4.1.1-plain-table.js`, 'string-table-obfuscation', (d) => d.string_table.layout === 'table-function' && d.string_table.key_scheme === 'plain'],
  [`${OB}5.10.1-plain-table.js`, 'string-table-obfuscation', (d) => d.string_table.layout === 'table-function' && d.string_table.key_scheme === 'plain' && !d.control_flow],
  [`${OB}4.1.1-rc4-hardened.js`, 'string-table-obfuscation', (d) => d.string_table.key_scheme === 'rc4' && Boolean(d.control_flow)],
  [`${OB}5.10.1-rc4-hardened.js`, 'string-table-obfuscation', (d) => d.string_table.key_scheme === 'rc4' && Boolean(d.control_flow) && Boolean(d.self_defending)],
  [`${DE}0.27.4-plain-strings.js`, 'string-table-obfuscation', (d) => d.string_table.layout === 'top-level-array' && d.string_table.key_scheme === 'plain'],
  [`${DE}2.19.1-base64.js`, 'string-table-obfuscation', (d) => d.string_table.key_scheme === 'base64'],
  [`${DE}4.1.1-base64.js`, 'string-table-obfuscation', (d) => d.string_table.key_scheme === 'base64'],
  [`${DE}5.10.1-base64.js`, 'string-table-obfuscation', (d) => d.string_table.key_scheme === 'base64'],
  [`${DE}5.10.1-rc4.js`, 'string-table-obfuscation', (d) => d.string_table.key_scheme === 'rc4'],
  ['static-toolchain/webpack-5.production.js', 'webpack-bundle', (d) => d.webpack.module_count === 2 && d.webpack.entry_layout === 'inlined-startup' && d.webpack.startup_requires.length === 2 && !d.webpack.esm_modules],
  ['static-toolchain/webpack-5.development.js', 'webpack-bundle', (d) => d.webpack.module_count === 2 && d.webpack.entry_layout === 'inlined-startup' && d.webpack.startup_requires.join() === './src/lib.js,./src/signer.js'],
  ['static-toolchain/webpack-5.esm.js', 'webpack-bundle', (d) => d.webpack.module_count === 2 && d.webpack.esm_modules],
  // webpack 4: the bootstrap calls `map[id].call(…)`, and the map is the argument of the function
  // that holds it. A bundle built from CommonJS sources has every harmony helper defined and none
  // used — so esm_modules is false there. v1.9.0 had no webpack 4 sample and read these as unknown
  ['static-toolchain/webpack-4.production.js', 'webpack-bundle',
    (d) => d.webpack.module_count === 3 && d.webpack.map_layout === 'iife-argument' && /^webpack-4/.test(d.webpack.bootstrap)
      && d.webpack.entry_layout === 'in-map' && typeof d.webpack.entry_marker === 'string' && d.webpack.startup_requires.length === 0
      && !d.webpack.esm_modules && !d.webpack.chunk_loading && d.webpack.confidence === 'certain'],
  ['static-toolchain/webpack-4.development.js', 'webpack-bundle',
    (d) => d.webpack.module_count === 3 && d.webpack.map_layout === 'iife-argument' && d.webpack.entry_layout === 'in-map'
      && d.webpack.entry_marker === './src/entry.js' && d.webpack.startup_requires.length === 0 && !d.webpack.esm_modules && !d.webpack.chunk_loading],
  // a bundle with one dynamic import: more modules are in a file it loads at run time
  ['static-toolchain/webpack-4.multichunk.js', 'webpack-bundle',
    (d) => d.webpack.module_count === 3 && d.webpack.chunk_loading === true && d.webpack.chunk_loader === true],
  ['static-toolchain/webpack-5.multichunk.js', 'webpack-bundle',
    (d) => d.webpack.module_count === 2 && d.webpack.entry_layout === 'inlined-startup' && d.webpack.chunk_loading === true
      && d.webpack.chunk_calls.length === 1 && /^\d+$/.test(d.webpack.chunk_calls[0])],
  // the file it loads: modules only, no bootstrap. Ids are numbers the build chooses
  ['static-toolchain/webpack-4.multichunk.lazy.js', 'webpack-chunk', (d) => d.webpack_chunk.global === 'webpackJsonp' && d.webpack_chunk.module_count === 1 && d.webpack_chunk.chunk_ids.length === 1],
  ['static-toolchain/webpack-5.multichunk.lazy.js', 'webpack-chunk', (d) => d.webpack_chunk.global === 'webpackChunk' && d.webpack_chunk.module_count === 1 && d.webpack_chunk.chunk_ids.length === 1],
  // a fuller build of the same kind (srcsplit/: two lazy chunks and the module they share), each a
  // directory of the files as webpack named them. "split-": webpack's own cutting, the shared
  // module copied into each chunk file; "split-shared-": splitChunks, a chunk file of its own
  ['static-toolchain/split-webpack-5/main.js', 'webpack-bundle', (d) => d.webpack.module_count === 2 && d.webpack.esm_modules && d.webpack.chunk_calls.length === 2],
  ['static-toolchain/split-webpack-4/main.js', 'webpack-bundle', (d) => d.webpack.module_count === 3 && d.webpack.esm_modules && d.webpack.chunk_calls.length === 2],
  ['static-toolchain/split-shared-webpack-5/main.js', 'webpack-bundle', (d) => d.webpack.chunk_calls.length === 3],
  ['static-toolchain/split-shared-webpack-4/main.js', 'webpack-bundle', (d) => d.webpack.chunk_calls.length === 3],
  ['static-toolchain/split-webpack-5/lazy-a.js', 'webpack-chunk', (d) => d.webpack_chunk.global === 'webpackChunk' && d.webpack_chunk.module_count === 2],
  ['static-toolchain/split-shared-webpack-4/lazy-a~lazy-b.js', 'webpack-chunk', (d) => d.webpack_chunk.global === 'webpackJsonp' && d.webpack_chunk.module_count === 1],
  // a build with runtimeChunk: the bootstrap is a file of its own with no module (webpack 5 names an
  // empty map, webpack 4 hands over an empty array), the entry an entry chunk file with start-up
  // code of its own. Read as "module map not recognised" before v1.9.3
  ['static-toolchain/runtime-webpack-5/runtime.js', 'webpack-bundle', (d) => d.webpack.module_count === 0 && d.webpack.map_layout === 'named' && d.webpack.entry_layout === 'not-in-file' && d.webpack.confidence === 'certain' && d.webpack.chunk_loading],
  ['static-toolchain/runtime-webpack-4/runtime.js', 'webpack-bundle', (d) => d.webpack.module_count === 0 && d.webpack.map_layout === 'iife-argument' && d.webpack.entry_layout === 'not-in-file' && d.webpack.confidence === 'certain'],
  ['static-toolchain/runtime-webpack-5/main.js', 'webpack-chunk', (d) => d.webpack_chunk.entry_chunk === true && d.webpack_chunk.module_count === 3],
  ['static-toolchain/runtime-webpack-4/main.js', 'webpack-chunk', (d) => d.webpack_chunk.entry_chunk === true && d.webpack_chunk.module_count === 3],
  ['static-toolchain/runtime-webpack-5/lazy-a.js', 'webpack-chunk', (d) => d.webpack_chunk.entry_chunk === false],
  // development mode: the ask is `req.e(/* import() */ "lazy-a")` — a comment in front of the id.
  // chunk_calls came out empty here before v1.9.3
  ['static-toolchain/dev-webpack-5/main.js', 'webpack-bundle', (d) => d.webpack.module_count === 2 && d.webpack.esm_modules && d.webpack.chunk_calls.length === 2 && d.webpack.chunk_calls.every((id) => typeof id === 'string')],
  ['static-toolchain/dev-webpack-4/main.js', 'webpack-bundle', (d) => d.webpack.module_count === 3 && d.webpack.chunk_calls.length === 2 && d.webpack.entry_layout === 'in-map'],
  ['static-toolchain/dev-shared-webpack-5/main.js', 'webpack-bundle', (d) => d.webpack.chunk_calls.length === 3],
  ['static-toolchain/dev-webpack-5/lazy-a.js', 'webpack-chunk', (d) => d.webpack_chunk.chunk_ids.join() === 'lazy-a' && d.webpack_chunk.module_count === 3],
  ['static-toolchain/dev-shared-webpack-5/srcsplit_shared_mjs.js', 'webpack-chunk', (d) => d.webpack_chunk.chunk_ids.join() === 'srcsplit_shared_mjs' && d.webpack_chunk.entry_chunk === false],
  // srct/: bundles whose text is hard for a token scanner (a template inside a template's
  // interpolation). They read as "module map not recognised as a whole" before v1.9.3
  ['static-toolchain/webpack-5.scanner.js', 'webpack-bundle', (d) => d.webpack.module_count === 1 && d.webpack.entry_layout === 'inlined-startup' && d.webpack.startup_requires.join() === '970'],
  ['static-toolchain/webpack-4.scanner.js', 'webpack-bundle', (d) => d.webpack.module_count === 2 && d.webpack.entry_layout === 'in-map'],
  ['static-toolchain/webpack-5.scanner.development.js', 'webpack-bundle', (d) => d.webpack.module_count === 1 && d.webpack.startup_requires.join() === './srct/lib.js'],
  ['static-toolchain/webpack-4.scanner.development.js', 'webpack-bundle', (d) => d.webpack.module_count === 2 && d.webpack.entry_marker === './srct/entry.js'],
  // webpack 5 writing an ES module
  ['static-toolchain/esm-output-webpack-5.mjs', 'webpack-bundle', (d) => d.webpack.module_count === 2 && d.webpack.entry_layout === 'inlined-startup'],
  ['static-toolchain/esm-library-webpack-5.mjs', 'webpack-bundle', (d) => d.webpack.module_count === 1 && d.webpack.startup_requires.join() === '970'],
  // esbuild. Unminified, its helpers name it; around one webpack bundle that bundle is still readable
  // in place; around two, the file is not one bundle
  ['static-toolchain/esbuild/esbuild-plain.cjs.js', 'esbuild-bundle', (d) => d.esbuild && d.esbuild.outer_bundler === 'esbuild' && d.esbuild.commonjs_wrappers === 1 && d.webpack === null],
  ['static-toolchain/esbuild/esbuild-around-one-bundle.js', 'esbuild-bundle', (d) => d.esbuild && d.webpack && d.webpack.bundles_in_file === 1 && d.webpack.module_count === 3],
  ['static-toolchain/esbuild/esbuild-around-one-bundle.mjs', 'esbuild-bundle', (d) => d.esbuild && d.webpack && d.webpack.bundles_in_file === 1],
  ['static-toolchain/esbuild/esbuild-around-two-bundles.js', 'esbuild-bundle', (d) => d.esbuild && d.webpack && d.webpack.bundles_in_file === 2],
  // minified, esbuild renames its helpers: nothing names the bundler, and the inspector says unknown
  ['static-toolchain/esbuild/esbuild-plain.iife.min.js', 'unknown', () => true],
  ['static-toolchain/browserify-17.js', 'browserify-bundle', (d) => d.browserify.module_count === 3],
  ['static-toolchain/packer-62.js', 'eval-packer', (d) => d.eval_packer.base === 62 && d.eval_packer.shells === 1],
  ['static-toolchain/terser-5.minified.js', 'unknown', (d) => d.looks_minified === true],
  ['static-toolchain/src/entry.js', 'unknown', () => true],
  ['recover-string-table/source.js', 'unknown', () => true],
  // a source that merely holds an array of strings is not a string table
  ['decode-string-array-runtime/source.js', 'unknown', () => true],
];

for (const [rel, family, holds] of EXPECTED) {
  test(`${family.padEnd(26)} ${rel}`, OPT, () => {
    const report = inspect(rel);
    assert.strictEqual(report.family, family, report.families.join(','));
    // "unknown" is the one answer that comes with an empty list
    if (family === 'unknown') assert.strictEqual(report.families.length, 0);
    else assert.ok(report.families.includes(family));
    assert.ok(holds(report.details), JSON.stringify(report.details).slice(0, 300));
    assert.ok(report.families.every((f) => ['eval-packer', 'string-table-obfuscation', 'webpack-bundle', 'webpack-chunk', 'webpack-bundle', 'esbuild-bundle', 'several-webpack-bundles', 'browserify-bundle', 'control-flow-flattening', 'numeric-ascii-vm-or-table'].includes(f)), report.families.join(','));
  });
}

test('the unbundler is offered for every webpack file, and the reason says what to pass with it', OPT, () => {
  const offer = (rel) => inspect(rel).next_tools.find((t) => t.script === 'scripts/unbundle.js');
  // a bundle whose modules are all in the file
  for (const rel of ['webpack-4.production.js', 'webpack-4.development.js', 'webpack-5.production.js', 'webpack-5.development.js', 'webpack-5.esm.js']) {
    assert.match(offer(`static-toolchain/${rel}`).why, /module map → one file per module, a runnable tree/, rel);
  }
  assert.match(offer('static-toolchain/browserify-17.js').why, /^browserify module map/);
  // a bundle that loads chunks: cut together with those files, which it names
  const mains = [
    ['webpack-5.multichunk.js', [245]], ['webpack-4.multichunk.js', [0]],
    ['split-webpack-5/main.js', [543, 340]], ['split-webpack-4/main.js', [0, 1]],
    ['split-shared-webpack-5/main.js', [225, 543, 340]], ['split-shared-webpack-4/main.js', [0, 1, 2]],
    ['dev-webpack-5/main.js', ['lazy-a', 'lazy-b']], ['dev-webpack-4/main.js', ['lazy-a', 'lazy-b']],
    ['dev-shared-webpack-5/main.js', ['srcsplit_shared_mjs', 'lazy-a', 'lazy-b']],
    // the runtime file of a runtimeChunk build: no ask in it — the entry chunk's code asks
    ['runtime-webpack-5/runtime.js', []], ['runtime-webpack-4/runtime.js', []],
  ];
  for (const [rel, asked] of mains) {
    const details = inspect(`static-toolchain/${rel}`).details;
    assert.deepStrictEqual(details.webpack.chunk_calls.slice().sort(), asked.slice().sort(), rel);
    assert.strictEqual(details.webpack.chunk_loading, true, rel);
    if (details.webpack.module_count === 0) {
      assert.match(offer(`static-toolchain/${rel}`).why, /runtime on its own — the bootstrap and no module: pass it with the chunk files/, rel);
    } else {
      assert.match(offer(`static-toolchain/${rel}`).why, new RegExp(`pass the chunk files after the bundle — it asks for ${details.webpack.chunk_calls.join(', ')}`), rel);
    }
  }
  // a chunk file on its own: split to read
  for (const rel of ['webpack-4.multichunk.lazy.js', 'webpack-5.multichunk.lazy.js', 'split-webpack-5/lazy-a.js', 'split-shared-webpack-4/lazy-a~lazy-b.js']) {
    assert.match(offer(`static-toolchain/${rel}`).why, /^a webpack chunk file → one file per module, to read/, rel);
    assert.strictEqual(inspect(`static-toolchain/${rel}`).details.webpack, null, `${rel}: no bootstrap`);
  }
  // for the four split sets, the chunks the bundle asks for are exactly the chunk files of the set
  for (const dir of ['split-webpack-5', 'split-shared-webpack-5']) {
    const base = `static-toolchain/${dir}`;
    const files = fs.readdirSync(path.join(ST, dir)).filter((f) => f !== 'main.js').sort();
    const asked = inspect(`${base}/main.js`).details.webpack.chunk_calls.map(String).sort();
    assert.deepStrictEqual(asked, files.flatMap((f) => inspect(`${base}/${f}`).details.webpack_chunk.chunk_ids.map(String)).sort(), dir);
  }
});

test('the first recommendation is what has to be undone first', OPT, () => {
  assert.match(inspect(`${OB}5.10.1-rc4-hardened.js`).next_tools[0].script, /recover_string_table\.js$/);
  // an rc4 table is not offered to the dependency-free decoder: that tool refuses rc4
  assert.ok(!inspect(`${OB}5.10.1-rc4-hardened.js`).next_tools.some((t) => /decode_string_array_runtime/.test(t.script)));
  assert.ok(inspect(`${DE}2.19.1-base64.js`).next_tools.some((t) => /decode_string_array_runtime/.test(t.script)));
  assert.match(inspect('static-toolchain/packer-62.js').next_tools[0].script, /decode_eval_wrapper\.js$/);
  assert.match(inspect('static-toolchain/webpack-5.production.js').next_tools[0].script, /unbundle\.js$/);
  // the AST pipeline is never the first thing to run while a table is still in the file
  const hardened = inspect(`${OB}5.10.1-rc4-hardened.js`).next_tools.map((t) => t.script);
  assert.ok(hardened.indexOf('scripts/recover_string_table.js') < hardened.indexOf('scripts/run_ast_pipeline.js'));
  // an unknown file offers no tool, and says what it checked
  const unknown = inspect('static-toolchain/src/entry.js');
  assert.deepStrictEqual(unknown.next_tools, []);
  assert.ok(unknown.checked.length >= 4);
});

test('not flattening: methods written `x[key] = function`, a scanner loop with a switch below, a table of numbers — three readings of real bundles that were wrong', OPT, (t) => {
  // esprima's own bundle (a parser: `while (true) { … }` with a switch further down), a 3.2 MB ES
  // module (a dozen `prototype["delete"] = function () {`), a 1.7 MB browser bundle (a numeric table)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inspect-plain-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const plain = path.join(dir, 'plain.js');
  fs.writeFileSync(plain, [
    'function Parser() {}',
    'Parser.prototype["delete"] = function () { return 1; };',
    'Parser.prototype["set" + cap(x[i])] = function (p) { return p + TABLE[i]; };',
    'Parser.prototype[key] = function () {};',
    'function directives() { var body = []; while (true) { var t = next(); if (!t) break; body.push(t);',
    '  if (body.length > 40) { switch (t) { case 1: break; default: break; } } } return body; }',
    'var TABLE = [72,101,108,108,111,44,32,119,111,114,108,100,33,10,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17];',
    'var LOOKUP = [65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95];',
  ].join('\n'));
  const j = inspectPlain(plain);
  assert.deepStrictEqual(j.families, [], j.families.join(','));
  assert.strictEqual(j.family, 'unknown');
  assert.strictEqual(j.details.control_flow, null);
  assert.ok(j.details.numeric_ascii_chunks > 8, 'the numbers are still counted');
  assert.ok(j.checked.some((line) => /numeric ASCII runs/.test(line)));
  // …and what the flattened form is, in javascript-obfuscator's own writing: a piece indexed by a call
  const flat = path.join(dir, 'flat.js');
  fs.writeFileSync(flat, "var o = {}; o[lookup(0x1, 'k')] = function (a, b) { return a + b; };\n");
  assert.deepStrictEqual(inspectPlain(flat).families, ['control-flow-flattening']);
  const labelled = path.join(dir, 'labelled.js');
  fs.writeFileSync(labelled, "while (true) { switch (pick(1)) { case 'a': doA(); continue 'loop'; default: break; } break; }\n");
  assert.deepStrictEqual(inspectPlain(labelled).families, ['control-flow-flattening']);
});

test('the outermost bundler is named first; a tool that is not for the file is listed as not offered', OPT, () => {
  // esbuild around one webpack bundle: esbuild's output first, the bundle inside second
  const aroundOne = inspect('static-toolchain/esbuild/esbuild-around-one-bundle.js');
  assert.deepStrictEqual(aroundOne.families, ['esbuild-bundle', 'webpack-bundle']);
  assert.strictEqual(aroundOne.family, 'esbuild-bundle');
  assert.deepStrictEqual(aroundOne.details.esbuild.helpers.slice().sort(), ['commonJS', 'getOwnPropNames']);
  assert.match(aroundOne.next_tools.find((t) => t.script === 'scripts/unbundle.js').why, /inside esbuild's wrapper, which the tree keeps/);
  assert.deepStrictEqual(aroundOne.not_offered, []);
  // around two bundles: one tree is not to be had, and the unbundler is not offered — with the reason
  const aroundTwo = inspect('static-toolchain/esbuild/esbuild-around-two-bundles.js');
  assert.deepStrictEqual(aroundTwo.families, ['esbuild-bundle', 'several-webpack-bundles']);
  assert.strictEqual(aroundTwo.details.bundles_in_file, 2);
  assert.deepStrictEqual(aroundTwo.next_tools, []);
  assert.strictEqual(aroundTwo.not_offered.length, 1);
  assert.match(aroundTwo.not_offered[0].why, /2 webpack bundles stand in this one file/);
  // every other file: nothing withheld
  for (const rel of ['webpack-5.production.js', 'split-webpack-5/main.js', 'runtime-webpack-5/runtime.js', 'browserify-17.js', 'src/entry.js']) {
    assert.deepStrictEqual(inspect(`static-toolchain/${rel}`).not_offered, [], rel);
  }
  // a bundle of one bundler only: one bootstrap in the file
  assert.strictEqual(inspect('static-toolchain/webpack-5.production.js').details.bundles_in_file, 1);
});

test('"unknown" says what was checked, and lists nothing that was not matched', OPT, () => {
  const report = inspect('static-toolchain/src/entry.js');
  assert.strictEqual(report.families.length, 0);
  assert.strictEqual(report.details.string_table, null);
  assert.strictEqual(report.details.webpack, null);
  assert.strictEqual(report.details.webpack_chunk, null);
});

test('the counters plan_static_toolchain.js reads are still there, and the planner keeps working', OPT, () => {
  const report = inspect(`${OB}5.10.1-rc4-hardened.js`);
  for (const key of ['hex_var_count', 'hex_dispatch_calls', 'while_switch_dispatchers', 'self_defending_markers', 'string_array_hints', 'numeric_ascii_chunks', 'browserify_bootstrap']) {
    assert.ok(Number.isInteger(report.signals[key]), key);
  }
  assert.ok(report.signals.hex_var_count > 0 && report.signals.hex_dispatch_calls > 0);
  assert.ok(report.signals.self_defending_markers > 0);
  const planner = spawnSync(process.execPath, [path.join(__dirname, '..', '..', 'scripts', 'plan_static_toolchain.js'), path.join(FIX, `${OB}5.10.1-rc4-hardened.js`), '--json'], { encoding: 'utf8', timeout: 50000 });
  assert.strictEqual(planner.status, 0, planner.stderr);
  assert.match(JSON.parse(planner.stdout).inspection.family, /^string-table-obfuscation$/);
});

test('a missing file and an empty invocation are usage errors; an unreadable tree is never "unknown"', OPT, () => {
  const missing = run(path.join(FIX, 'no-such-file.js'));
  assert.strictEqual(missing.status, 2);
  assert.match(missing.stderr, /cannot read/);
  const usage = spawnSync(process.execPath, [TOOL], { encoding: 'utf8' });
  assert.strictEqual(usage.status, 2);
  assert.match(usage.stderr, /^Usage: inspect_obfuscation_family\.js/m);
});

test('a file with no structural marker is decided in a bounded time even when large', OPT, () => {
  // 600 KB of identifiers and calls that match none of the shapes: must not blow up
  const filler = Array.from({ length: 6000 }, (_, i) => `function fn${i}(a){ const o${i} = { v${i}: a }; return o${i}.v${i} + ${i} / 3; }`).join('\n');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inspect-'));
  const file = path.join(dir, 'large.js');
  fs.writeFileSync(file, filler);
  try {
    const t0 = Date.now();
    const report = JSON.parse(run(file).stdout);
    assert.strictEqual(report.family, 'unknown');
    assert.ok(Date.now() - t0 < 20000, `${Date.now() - t0} ms`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
