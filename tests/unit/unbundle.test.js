'use strict';
// unbundle on REAL bundles (webpack 4.47 ×2, webpack 5.113 ×3, browserify 17 — all built by the
// tools themselves). Five things are pinned per bundle:
//   1. the unbundled tree runs and does exactly what the bundle does (stdout, compared)
//   2. every module file holds the bundle's own bytes for that factory (source_range → verbatim)
//   3. nothing lost, nothing invented: the bundle's string literals are the literals of
//      runtime.js plus those of the module files (startup.js is a copy, counted once)
//   4. the graph is right: modules, what each requires, where the entry is
//   5. what the tool is not for is refused with a reason, and nothing is written
// The tool itself never runs the bundle; this test does — on fixtures built by the tools.
// MUTATOR_TOOL=<path> swaps the tool under test (it needs inspect_obfuscation_family.js next to it).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { stringLiterals } = require('../helpers/string-literals');

const ROOT = path.join(__dirname, '..', '..');
const TOOL = process.env.MUTATOR_TOOL || path.join(ROOT, 'scripts', 'unbundle.js');
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
  // webpack 4: the map is the array handed to the bootstrap's enclosing function, factories are
  // `(function (…) {…})` or `"path": (function (…) {…})`, the entry is in the map. v1.9.0 said
  // "handled" with no sample; on these it refused (production) and wrote text that did not parse
  // (development)
  { file: 'webpack-4.production.js', bundler: 'webpack', modules: 3, startup: true,
    entry: (e) => e.kind === 'in-map' && e.id === '0', requires: { 0: ['1', '2'], 1: [], 2: [] } },
  { file: 'webpack-4.development.js', bundler: 'webpack', modules: 3, startup: true,
    entry: (e) => e.kind === 'in-map' && e.id === './src/entry.js',
    requires: { './src/entry.js': ['./src/lib.js', './src/signer.js'], './src/lib.js': [], './src/signer.js': [] } },
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

test('webpack 4: startup.js is the helper block and the start call that follow the bootstrap — not the factories', OPT, (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unbundle-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const bundle = path.join(ST, 'webpack-4.production.js');
  const raw = fs.readFileSync(bundle, 'utf8');
  assert.strictEqual(run([TOOL, bundle, '--out', dir]).status, 0);
  const startup = fs.readFileSync(path.join(dir, 'startup.js'), 'utf8');
  // what stands between the bootstrap's closing brace and the `([` that hands over the map
  const between = /\.p="",([^}]+)\}\(\[/.exec(raw);
  assert.ok(between, 'expectation itself is anchored');
  assert.ok(startup.includes(between[1]), 'the helpers and the start call, verbatim');
  const graph = JSON.parse(fs.readFileSync(path.join(dir, 'graph.json'), 'utf8'));
  assert.strictEqual(graph.entry.kind, 'in-map', 'the entry is one of the mapped modules');
  assert.strictEqual(graph.kind, 'bundle');
  assert.strictEqual(graph.module_map, 'e', 'the parameter the bootstrap indexes the map by');
});

test('a bundle that loads chunks at run time is refused: exit 1, the reason named, nothing written', OPT, (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unbundle-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const cases = [
    ['webpack-5.multichunk.js', /n\.e\(\d+\)/, /3 of|2 of/],
    ['webpack-4.multichunk.js', /chunk loader is written into the bootstrap/],
  ];
  for (const [file, ...reasons] of cases) {
    const out = path.join(dir, `out-${file}`);
    const r = run([TOOL, path.join(ST, file), '--out', out]);
    assert.strictEqual(r.status, 1, `${file}: ${r.stderr}`);
    assert.match(r.stderr, /^unbundle: a bundle that loads chunks at run time/m);
    for (const reason of reasons) assert.match(r.stderr, reason);
    assert.match(r.stderr, /nothing was written/);
    assert.strictEqual(r.stdout, '', 'no report on stdout for a refusal');
    assert.ok(!fs.existsSync(out), `${file}: refusing means not even creating the directory`);
  }
  // the bundle itself cannot be run on its own here either (it needs the page's `self`): the point
  // is that v1.9.0 said "written" for it. A tree from it then failed at run time with exit 1
  assert.notStrictEqual(run([path.join(ST, 'webpack-5.multichunk.js')]).status, 0);
});

// A chunk file does nothing on its own: it registers its modules on a global array. To compare
// the file with a tree cut from it, both are run with this preloaded. It stands in for the page's
// global object, records what gets pushed, calls every registered module the way a bundle would
// (module, exports, require), and prints the chunk ids with each module's exports.
const REGISTRY_SHIM = `'use strict';
const registry = { webpackChunk: [], webpackJsonp: [] };
const pushed = [];
for (const list of Object.values(registry)) list.push = (entry) => { pushed.push(entry); };
global.self = registry;
global.window = registry;
process.on('exit', () => {
  process.stdout.write(JSON.stringify(pushed.map(([ids, map]) => ({ ids, modules: Object.keys(map).sort().map((id) => {
    const module = { exports: {} };
    map[id](module, module.exports, () => { throw new Error('unexpected require'); });
    return [id, module.exports];
  }) }))) + '\\n');
});
`;

for (const [file, globalName] of [['webpack-5.multichunk.lazy.js', 'webpackChunk'], ['webpack-4.multichunk.lazy.js', 'webpackJsonp']]) {
  test(`chunk file ${file}: split like a bundle, and the tree registers what the file registers`, OPT, (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unbundle-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const chunk = path.join(ST, file);
    const out = path.join(dir, 'tree');
    const r = run([TOOL, chunk, '--out', out]);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.match(r.stderr, /A chunk file does nothing on its own/);
    const raw = fs.readFileSync(chunk, 'utf8');
    const graph = JSON.parse(fs.readFileSync(path.join(out, 'graph.json'), 'utf8'));
    assert.strictEqual(graph.kind, 'chunk');
    assert.deepStrictEqual(graph.chunk, { ids: graph.chunk.ids, global: globalName });
    assert.strictEqual(graph.chunk.ids.length, 1);
    assert.strictEqual(graph.module_count, 1);
    assert.strictEqual(graph.entry, null, 'a chunk has no entry');
    assert.strictEqual(fs.existsSync(path.join(out, 'startup.js')), false);

    // verbatim: the file's bytes at source_range are what the module file holds
    const [m] = graph.modules;
    const factory = raw.slice(m.source_range[0], m.source_range[1]);
    assert.ok(factory.length > 20);
    assert.ok(fs.readFileSync(path.join(out, m.file), 'utf8').includes(factory));
    // nothing lost, nothing invented
    assert.deepStrictEqual(
      stringLiterals(fs.readFileSync(path.join(out, 'runtime.js'), 'utf8')).filter((s) => !s.startsWith('./modules/'))
        .concat(stringLiterals(fs.readFileSync(path.join(out, m.file), 'utf8'))).sort(),
      stringLiterals(raw).sort());

    // behaviour: what the file registers is what the tree registers, module for module
    const shim = path.join(dir, 'registry-shim.js');
    fs.writeFileSync(shim, REGISTRY_SHIM);
    const direct = run(['-r', shim, chunk], dir);
    const rebuilt = run(['-r', shim, path.join(out, 'runtime.js')], out);
    assert.strictEqual(direct.status, 0, direct.stderr);
    assert.strictEqual(rebuilt.status, 0, rebuilt.stderr);
    assert.strictEqual(rebuilt.stdout, direct.stdout);
    const registered = JSON.parse(direct.stdout);
    assert.strictEqual(registered.length, 1, 'one chunk registered');
    assert.deepStrictEqual(registered[0].ids, graph.chunk.ids);
    assert.deepStrictEqual(registered[0].modules, [[registered[0].modules[0][0], { salt: 'FIXTURE_SALT_7d41' }]], 'the module, run, exports what the source says');
  });
}

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
