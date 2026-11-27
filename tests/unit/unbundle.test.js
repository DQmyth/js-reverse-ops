'use strict';
// unbundle on REAL bundles (webpack 5.113 ×3, browserify 17 — all built by the tools themselves).
// Four things are pinned per bundle:
//   1. the unbundled tree runs and does exactly what the bundle does (stdout, compared)
//   2. every module file holds the bundle's own bytes for that factory (source_range → verbatim)
//   3. nothing lost, nothing invented: the bundle's string literals are the literals of
//      runtime.js plus those of the module files (startup.js is a copy, counted once)
//   4. the graph is right: modules, what each requires, where the entry is
// The tool itself never runs the bundle; this test does — on fixtures built here.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { stringLiterals } = require('../helpers/string-literals');

const ROOT = path.join(__dirname, '..', '..');
const TOOL = path.join(ROOT, 'scripts', 'unbundle.js');
const ST = path.join(__dirname, '..', 'fixtures', 'static-toolchain');
const OPT = { timeout: 60000 };

const run = (args, cwd) => spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 40000, cwd });
const BUNDLES = [
  // requires: module id → the ids it requires. webpack 5.9x+ keeps the entry out of the map.
  { file: 'webpack-5.production.js', bundler: 'webpack', modules: 2, startup: true,
    entry: (e) => e.kind === 'inlined-startup' && e.requires.length === 2, requires: { 556: [], 213: [] } },
  { file: 'webpack-5.development.js', bundler: 'webpack', modules: 2, startup: true,
    entry: (e) => e.kind === 'inlined-startup' && e.requires.join() === './src/lib.js,./src/signer.js',
    requires: { './src/lib.js': [], './src/signer.js': [] } },
  { file: 'webpack-5.esm.js', bundler: 'webpack', modules: 2, startup: true,
    entry: (e) => e.kind === 'inlined-startup', requires: { 958: [], 779: [] } },
  { file: 'browserify-17.js', bundler: 'browserify', modules: 3, startup: false,
    entry: (e) => e.kind === 'in-map' && e.ids.join() === '1', requires: { 1: ['2', '3'], 2: [], 3: [] } },
];

for (const { file, bundler, modules, entry, startup, requires } of BUNDLES) {
  test(`unbundle ${file}: the tree runs like the bundle, verbatim, nothing lost`, OPT, (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unbundle-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const bundle = path.join(ST, file);
    const out = path.join(dir, 'tree');
    const r = run([TOOL, bundle, '--out', out]);
    assert.strictEqual(r.status, 0, r.stderr);
    const raw = fs.readFileSync(bundle, 'utf8');
    const graph = JSON.parse(fs.readFileSync(path.join(out, 'graph.json'), 'utf8'));

    assert.strictEqual(graph.bundler, bundler);
    assert.strictEqual(graph.module_count, modules);
    assert.ok(fs.existsSync(path.join(out, 'runtime.js')));
    assert.strictEqual(fs.existsSync(path.join(out, 'startup.js')), startup);
    assert.ok(entry(graph.entry), JSON.stringify(graph.entry));
    assert.ok(graph.self_check.parsed.length >= modules + 1, 'every written file was parsed');

    // 1. behaviour: the bundle's output, byte for byte
    const direct = run([bundle]);
    const rebuilt = run([path.join('runtime.js')], out);
    assert.strictEqual(direct.status, 0, direct.stderr);
    assert.strictEqual(rebuilt.status, 0, rebuilt.stderr);
    assert.strictEqual(rebuilt.stdout, direct.stdout);
    assert.ok(direct.stdout.trim().length > 20, 'the bundle printed something to compare');

    // 2. verbatim: the bundle's bytes at source_range are inside the module file
    assert.strictEqual(graph.modules.length, modules);
    for (const m of graph.modules) {
      const factory = raw.slice(m.source_range[0], m.source_range[1]);
      assert.ok(factory.length > 20, m.id);
      assert.strictEqual(m.bytes, Buffer.byteLength(factory));
      const written = fs.readFileSync(path.join(out, m.file), 'utf8');
      assert.ok(written.includes(factory), `module ${m.id}: the file holds the bundle's own bytes`);

      // … and what it requires is what the source says it requires
      assert.deepStrictEqual(m.requires, requires[m.id], `module ${m.id}`);
    }
    assert.deepStrictEqual(graph.modules.map((m) => m.id).sort(), Object.keys(requires).sort());

    // 3. nothing lost, nothing invented: string literals are shared out exactly
    const generated = new Set(fs.readdirSync(path.join(out, 'modules')).map((f) => path.join('modules', f)));
    const inTree = stringLiterals(fs.readFileSync(path.join(out, 'runtime.js'), 'utf8'))
      .filter((s) => !s.startsWith('./modules/'))
      .concat([...generated].flatMap((f) => stringLiterals(fs.readFileSync(path.join(out, f), 'utf8'))));
    assert.deepStrictEqual(inTree.sort(), stringLiterals(raw).sort());
  });
}

test('webpack: the inlined entry is readable on its own — startup.js holds the code after the bootstrap', OPT, (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unbundle-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const raw = fs.readFileSync(path.join(ST, 'webpack-5.production.js'), 'utf8');
  assert.strictEqual(run([TOOL, path.join(ST, 'webpack-5.production.js'), '--out', dir]).status, 0);
  const startup = fs.readFileSync(path.join(dir, 'startup.js'), 'utf8');
  assert.ok(startup.includes('window.__boot'), 'the entry code');
  // a copy for reading: byte for byte what follows the bootstrap `}` in the bundle
  const bootstrapEnd = raw.indexOf('i.exports}const r=n(556)');
  assert.ok(bootstrapEnd > 0);
  // the IIFE body runs from after the bootstrap `}` to before its own closing `}`
  const afterBootstrap = raw.slice(bootstrapEnd + 'i.exports}'.length).replace(/\}\)\(\);\s*$/, '');
  assert.ok(afterBootstrap.trim().startsWith('const r=n(556)'), 'expectation itself is anchored');
  assert.ok(startup.includes(afterBootstrap.trim()), 'the start-up text, complete, from its first character');
});

test('what is not a bundle: refused with a reason, and nothing is written', OPT, (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unbundle-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const [rel, reason] of [
    ['static-toolchain/src/entry.js', /no webpack or browserify module map/],
    ['static-toolchain/packer-62.js', /no webpack or browserify module map/],
    ['recover-string-table/obfuscator-5.10.1-rc4-hardened.js', /no webpack or browserify module map/],
  ]) {
    const out = path.join(dir, `out-${path.basename(rel, '.js')}`);
    const r = run([TOOL, path.join(ST, '..', rel), '--out', out]);
    assert.strictEqual(r.status, 1, `${rel}: ${r.stderr}`);
    assert.match(r.stderr, reason);
    assert.strictEqual(r.stdout, '', 'no report on stdout for a refusal');
    assert.ok(!fs.existsSync(out), `${rel}: refusing means not even creating the directory`);
  }
});

test('usage, a missing file and an occupied output directory', OPT, (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unbundle-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const usage = run([TOOL]);
  assert.strictEqual(usage.status, 2);
  assert.match(usage.stderr, /^Usage: unbundle\.js/m);
  const missing = run([TOOL, path.join(dir, 'none.js'), '--out', path.join(dir, 'o')]);
  assert.strictEqual(missing.status, 2);
  fs.mkdirSync(path.join(dir, 'occupied'));
  fs.writeFileSync(path.join(dir, 'occupied', 'keep.txt'), 'x');
  const occupied = run([TOOL, path.join(ST, 'browserify-17.js'), '--out', path.join(dir, 'occupied')]);
  assert.strictEqual(occupied.status, 1);
  assert.match(occupied.stderr, /not empty/);
  assert.deepStrictEqual(fs.readdirSync(path.join(dir, 'occupied')), ['keep.txt']);
});

test('a tree with a module file missing does not run: the runtime really needs the files (the test can fail)', OPT, (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unbundle-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = path.join(dir, 'tree');
  assert.strictEqual(run([TOOL, path.join(ST, 'browserify-17.js'), '--out', out]).status, 0);
  const victim = JSON.parse(fs.readFileSync(path.join(out, 'graph.json'), 'utf8')).modules[0].file;
  const kept = fs.readFileSync(path.join(out, victim), 'utf8');
  fs.unlinkSync(path.join(out, victim));
  const broken = run([path.join('runtime.js')], out);
  assert.notStrictEqual(broken.status, 0);
  fs.writeFileSync(path.join(out, victim), kept);
  assert.strictEqual(run([path.join('runtime.js')], out).status, 0);
});
