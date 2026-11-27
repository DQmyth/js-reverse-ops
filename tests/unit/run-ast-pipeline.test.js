'use strict';
// run_ast_pipeline on real inputs. Three things are pinned:
//   1. behaviour is kept: the cleaned file does what its input does (stdout, compared)
//   2. the documented chain holds — webcrack (recover_string_table.js) then this pipeline — on
//      real javascript-obfuscator output
//   3. what must not happen again: a crash on raw obfuscator.io output. Found in the v1.8.7
//      review: "Numeric literal whose value is negative" from escodegen (constant folding made
//      a negative literal). Now: negative results print as unary minus, and a file that still
//      carries its string table is refused with a pointer to recover_string_table.js.
// MUTATOR_TOOL=<path> swaps the tool under test.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { createRequire } = require('module');

const TOOL = process.env.MUTATOR_TOOL || path.join(__dirname, '..', '..', 'scripts', 'run_ast_pipeline.js');
const RECOVER = path.join(__dirname, '..', '..', 'scripts', 'recover_string_table.js');
const FIX = path.join(__dirname, '..', 'fixtures');
const ST = path.join(FIX, 'static-toolchain');
const OPT = { timeout: 120000 };

function clean(input, ...args) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ast-'));
  const output = path.join(dir, 'cleaned.js');
  const r = spawnSync(process.execPath, [TOOL, input, output, ...args], { encoding: 'utf8', timeout: 60000 });
  // not `...r`: a spawnSync result carries an `output` field of its own (null here), and it would
  // silently replace the cleaned file's path
  return { dir, output, status: r.status, stdout: r.stdout, stderr: r.stderr };
}
function run(file, cwd, env) {
  return spawnSync(process.execPath, [file], { encoding: 'utf8', timeout: 20000, cwd, env: env ? { ...process.env, ...env } : process.env });
}

// real input → what it must keep doing. 'program' files print when run; 'lib' files export
// helpers, so their exports are called instead (a library prints nothing to compare)
const LIB_PROBE = (file) => ['--eval', `const m = require(${JSON.stringify(file)}); console.log(JSON.stringify([m.route('x'), m.header('T'), m.classify({ ready: 1, ghost: 0 }), m.MESSAGES, typeof m.header]))`];
const PROBE = {
  'terser-5.minified.js': LIB_PROBE,
  'packer-62.js': LIB_PROBE,
  'webpack-5.development.js': (file) => [file],
  'browserify-17.js': (file) => [file],
};
for (const name of Object.keys(PROBE)) {
  test(`cleaning keeps behaviour: ${name}`, OPT, (t) => {
    const input = path.join(ST, name);
    const r = clean(input);
    t.after(() => fs.rmSync(r.dir, { recursive: true, force: true }));
    assert.strictEqual(r.status, 0, r.stderr);
    const before = spawnSync(process.execPath, PROBE[name](input), { encoding: 'utf8', timeout: 20000 });
    const after = spawnSync(process.execPath, PROBE[name](r.output), { encoding: 'utf8', timeout: 20000 });
    assert.strictEqual(before.status, 0, before.stderr);
    assert.strictEqual(after.status, 0, after.stderr);
    assert.strictEqual(after.stdout, before.stdout);
    assert.ok(after.stdout.trim().length > 20, 'the input produced something to compare');
    // the probe reached the helpers: their strings are in what the input produced
    assert.ok(before.stdout.includes('/api/v2/') || before.stdout.includes('api.example.test'), before.stdout.slice(0, 120));
  });
}

// locate webcrack the way recover-string-table.test.js does, without importing that file
function webcrackNodePath() {
  const npx = path.join(os.homedir(), '.npm', '_npx');
  let caches = [];
  try { caches = fs.readdirSync(npx); } catch (_err) { return null; }
  for (const cache of caches) {
    const modules = path.join(npx, cache, 'node_modules');
    if (fs.existsSync(path.join(modules, 'webcrack', 'package.json'))) return modules;
  }
  try { createRequire(path.join(__dirname, '..', '..', 'noop.js')).resolve('webcrack'); return ''; } catch (_err) { return null; }
}
function onSupportedNode() {
  const major = Number(process.versions.node.split('.')[0]);
  return major === 22 || major === 24;
}

test('the documented chain holds: recover_string_table.js → run_ast_pipeline.js, on real javascript-obfuscator output', { ...OPT, skip: !onSupportedNode() || webcrackNodePath() === null ? 'needs webcrack (optional dependency) on Node 22 or 24' : false }, (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ast-chain-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const sample = path.join(FIX, 'recover-string-table', 'obfuscator-5.10.1-rc4-hardened.js');
  const decoded = path.join(dir, 'decoded.js');
  const nodePath = webcrackNodePath();
  const step1 = spawnSync(process.execPath, [RECOVER, sample, '--output', decoded], { encoding: 'utf8', timeout: 90000, env: nodePath ? { ...process.env, NODE_PATH: [nodePath, process.env.NODE_PATH].filter(Boolean).join(path.delimiter) } : process.env });
  assert.strictEqual(step1.status, 0, step1.stderr);
  const cleaned = path.join(dir, 'cleaned.js');
  const step2 = spawnSync(process.execPath, [TOOL, decoded, cleaned], { encoding: 'utf8', timeout: 60000 });
  assert.strictEqual(step2.status, 0, step2.stderr);
  const want = run(path.join(FIX, 'recover-string-table', 'source.js'));
  const got = run(cleaned);
  assert.strictEqual(got.status, 0, got.stderr);
  assert.strictEqual(got.stdout, want.stdout);
});

test('negative numbers survive constant folding: -5 is unary minus on 5, never a negative numeric literal', OPT, (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ast-neg-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  // what obfuscator.io emits once numbers are turned into arithmetic
  const input = path.join(dir, 'numbers.js');
  fs.writeFileSync(input, [
    'const a = 3 - 8;',
    'const b = -(2 * 3);',
    'const c = 0 - 0.5;',
    'const d = (0 - 1) / 0;',
    'const e = 0 / 0;',
    'const f = 0x11a - 0x3ff * 0x1;',
    'if (a < 0) { console.log(JSON.stringify([a, b, c, f, 1 === 1, -(2 - 5)])); console.log(String(d), String(e), d < 0, e !== e); }',
  ].join('\n'));
  const r = clean(input);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(r.output), 'an output file was written');
  const ran = run(r.output);
  assert.strictEqual(ran.status, 0, ran.stderr);
  const [json, rest] = ran.stdout.trim().split('\n');
  assert.deepStrictEqual(JSON.parse(json), [-5, -6, -0.5, -741, true, 3]);
  assert.strictEqual(rest, '-Infinity NaN true true');
  assert.ok(!/Numeric literal/.test(String(r.stderr)));
});

test('a file that still carries its string table is refused, with a pointer — nothing is written', OPT, (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ast-raw-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const sample = path.join(FIX, 'recover-string-table', 'obfuscator-5.10.1-rc4-hardened.js');
  const output = path.join(dir, 'cleaned.js');
  const r = spawnSync(process.execPath, [TOOL, sample, output], { encoding: 'utf8', timeout: 60000 });
  assert.strictEqual(r.status, 1, r.stderr);
  assert.match(r.stderr, /still carries a string table/);
  assert.match(r.stderr, /recover_string_table\.js/);
  assert.ok(!fs.existsSync(output));
});

test('--force: the tree is printed and parses; the warning says the result is for reading', OPT, (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ast-force-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const sample = path.join(FIX, 'recover-string-table', 'obfuscator-5.10.1-rc4-hardened.js');
  const r = clean(sample, '--force');
  t.after(() => fs.rmSync(r.dir, { recursive: true, force: true }));
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(r.output));
  assert.match(r.stderr, /for reading only/);
  assert.strictEqual(spawnSync(process.execPath, ['--check', r.output], { encoding: 'utf8' }).status, 0);
});

test('usage is 2; a missing file is 1 with the reason, and no output', OPT, () => {
  const usage = spawnSync(process.execPath, [TOOL], { encoding: 'utf8' });
  assert.strictEqual(usage.status, 2);
  assert.match(usage.stderr, /^Usage: run_ast_pipeline\.js/m);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ast-missing-'));
  const out = path.join(dir, 'o.js');
  try {
    const r = spawnSync(process.execPath, [TOOL, path.join(dir, 'none.js'), out], { encoding: 'utf8' });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /cannot read/);
    assert.ok(!fs.existsSync(out));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
