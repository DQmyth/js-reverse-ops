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
    assert.ok(report.families.every((f) => ['eval-packer', 'string-table-obfuscation', 'webpack-bundle', 'webpack-chunk', 'browserify-bundle', 'control-flow-flattening', 'numeric-ascii-vm-or-table'].includes(f)), report.families.join(','));
  });
}

test('the unbundler is offered for what it handles — a bundle whose modules are all in the file, a chunk file — and not for a bundle that loads chunks', OPT, () => {
  const offered = (rel) => inspect(rel).next_tools.map((t) => t.script);
  for (const rel of ['webpack-4.production.js', 'webpack-4.development.js', 'webpack-5.production.js', 'webpack-5.development.js', 'webpack-5.esm.js', 'browserify-17.js']) {
    assert.ok(offered(`static-toolchain/${rel}`).includes('scripts/unbundle.js'), rel);
  }
  // v1.9.0 offered the unbundler for both of these as well, and for the bundle it wrote a tree
  // that failed at run time
  for (const rel of ['webpack-4.multichunk.js', 'webpack-5.multichunk.js']) {
    const details = inspect(`static-toolchain/${rel}`).details;
    assert.ok(!offered(`static-toolchain/${rel}`).includes('scripts/unbundle.js'), rel);
    assert.strictEqual(details.webpack.chunk_loading, true, `${rel}: a bundle, one that loads chunks`);
    assert.strictEqual(details.webpack_chunk, null);
  }
  // a chunk file it splits, for reading
  for (const rel of ['webpack-4.multichunk.lazy.js', 'webpack-5.multichunk.lazy.js']) {
    const tools = inspect(`static-toolchain/${rel}`).next_tools;
    assert.strictEqual(tools.length, 1, rel);
    assert.strictEqual(tools[0].script, 'scripts/unbundle.js', rel);
    assert.strictEqual(inspect(`static-toolchain/${rel}`).details.webpack, null, `${rel}: no bootstrap`);
  }
  // what the bundle asks for is named, so the files to collect next are known
  const asked = inspect('static-toolchain/webpack-5.multichunk.js').details.webpack.chunk_calls;
  assert.strictEqual(inspect('static-toolchain/webpack-5.multichunk.lazy.js').details.webpack_chunk.chunk_ids.join(), asked.join());
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
