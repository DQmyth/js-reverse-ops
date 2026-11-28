'use strict';
// The two scripts the planner names for bundle splitting, held to real inputs — neither had a
// test before (v1.9.1: "112 scripts no test starts"):
//   trace_module_graph.js             the imports and requires of a tree of files, resolved on disk
//   extract_module_entry_contract.js  what stands at the edges of one module file
// Sources of truth: tests/fixtures/static-toolchain/srcsplit/*.mjs (ES modules, two dynamic
// imports with a webpack magic comment), src/*.js (CommonJS), the bundles built from them, and
// trees unbundle.js cuts from those (its own tests check those trees). What these still miss is
// asserted too: the lists may only shrink.
// MUTATOR_TOOL=<dir with the two scripts and inspect_obfuscation_family.js> swaps the tools.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const SCRIPTS = process.env.MUTATOR_TOOL || path.join(ROOT, 'scripts');
const ST = path.join(__dirname, '..', 'fixtures', 'static-toolchain');
const OPT = { timeout: 60000 };

function report(tool, args) {
  const r = spawnSync(process.execPath, [path.join(SCRIPTS, tool), ...args], { encoding: 'utf8', timeout: 50000 });
  assert.strictEqual(r.status, 0, `${tool} ${args.join(' ')}: ${r.stderr}`);
  return JSON.parse(r.stdout);
}
const filesOf = (dir, ext) => fs.readdirSync(dir).filter((f) => f.endsWith(ext)).sort();

// --- trace_module_graph.js ----------------------------------------------------------------

test('trace_module_graph.js: an ES-module tree — every file is reached from the entry, each import an edge of its kind', OPT, () => {
  const dir = path.join(ST, 'srcsplit');
  const g = report('trace_module_graph.js', [path.join(dir, 'entry.mjs'), '--root', dir]);
  // read from the sources: entry imports lib and signer, and lazy-a, lazy-b on demand; lazy-a
  // imports shared, deep, signer; lazy-b imports shared, lib. Seven files, seven imports, two of
  // them dynamic (`/* webpackChunkName: … */` in front of the path — missed before v1.9.2)
  assert.strictEqual(g.summary.files_analyzed, filesOf(dir, '.mjs').length);
  assert.strictEqual(filesOf(dir, '.mjs').length, 7, 'expectation itself is anchored');
  assert.deepStrictEqual(g.summary.edges_by_kind, { import: 7, 'dynamic-import': 2 });
  assert.strictEqual(g.summary.unresolved_imports, 0);
  assert.deepStrictEqual(g.unresolved_imports, []);
  const edges = g.edges.map((e) => `${e.kind} ${path.basename(e.from)} → ${e.to}`).sort();
  assert.deepStrictEqual(edges, [
    'dynamic-import entry.mjs → ./lazy-a.mjs',
    'dynamic-import entry.mjs → ./lazy-b.mjs',
    'import entry.mjs → ./lib.mjs',
    'import entry.mjs → ./signer.mjs',
    'import lazy-a.mjs → ./deep.mjs',
    'import lazy-a.mjs → ./shared.mjs',
    'import lazy-a.mjs → ./signer.mjs',
    'import lazy-b.mjs → ./lib.mjs',
    'import lazy-b.mjs → ./shared.mjs',
  ]);
  // every specifier resolved to the file it names
  for (const n of g.nodes.filter((node) => node.kind === 'module-specifier')) {
    assert.ok(n.resolved_local_path && fs.existsSync(n.resolved_local_path), n.source_path);
    assert.strictEqual(path.basename(n.resolved_local_path), n.source_path.slice(2));
  }
  // the ranking follows the content: lazy-a names a signer and a token-like salt, lib names a route
  assert.ok(g.likely_request_modules.length >= 3);
  const ranked = new Set(g.likely_request_modules.map((m) => path.basename(m.node)));
  for (const name of ['lazy-a.mjs', 'lib.mjs', 'entry.mjs']) assert.ok(ranked.has(name), name);
  for (const m of g.likely_request_modules) assert.ok(Array.isArray(m.signals) && m.signals.length > 0, m.node);
});

test('trace_module_graph.js: a CommonJS tree — requires are followed', OPT, () => {
  const dir = path.join(ST, 'src');
  const g = report('trace_module_graph.js', [path.join(dir, 'entry.js'), '--root', dir]);
  assert.strictEqual(g.summary.files_analyzed, filesOf(dir, '.js').length);
  assert.deepStrictEqual(g.edges.map((e) => `${e.kind} ${path.basename(e.from)} → ${e.to}`).sort(), ['require entry.js → ./lib.js', 'require entry.js → ./signer.js']);
  assert.strictEqual(g.summary.unresolved_imports, 0);
});

test('trace_module_graph.js: a bundle is one file to it — a bundler compiled its imports away; what it still sees is said unresolved', OPT, () => {
  // webpack renamed every require to `n(id)`: nothing to follow, and nothing claimed
  for (const rel of ['webpack-5.production.js', 'webpack-4.development.js', 'split-webpack-5/main.js', 'split-shared-webpack-4/main.js']) {
    const g = report('trace_module_graph.js', [path.join(ST, rel), '--root', ST]);
    assert.strictEqual(g.summary.files_analyzed, 1, rel);
    assert.strictEqual(g.summary.node_count, 1, rel);
    assert.strictEqual(g.summary.edge_count, 0, rel);
    assert.strictEqual(g.likely_request_modules.length, 1, `${rel}: it is still scored for request-ish content`);
    assert.ok(g.likely_request_modules[0].signals.some((signal) => signal.startsWith('request-field')), rel);
  }
  // browserify leaves `require('./lib.js')` as text inside its factories: two edges to specifiers
  // that are no files of their own — they are IN the bundle — and it says so
  const g = report('trace_module_graph.js', [path.join(ST, 'browserify-17.js'), '--root', ST]);
  assert.strictEqual(g.summary.files_analyzed, 1);
  assert.deepStrictEqual(g.edges.map((e) => `${e.kind} ${path.basename(e.from)} → ${e.to}`).sort(), ['require browserify-17.js → ./lib.js', 'require browserify-17.js → ./signer.js']);
  assert.deepStrictEqual(g.unresolved_imports.map((u) => u.specifier).sort(), ['./lib.js', './signer.js']);
});

test('trace_module_graph.js: a tree unbundle.js cut — runtime.js leads to every module file', OPT, (t) => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'graph-'));
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  const tree = path.join(work, 'tree');
  const cut = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'unbundle.js'), path.join(ST, 'webpack-4.production.js'), '--out', tree], { encoding: 'utf8', timeout: 40000 });
  assert.strictEqual(cut.status, 0, cut.stderr);
  const graph = JSON.parse(fs.readFileSync(path.join(tree, 'graph.json'), 'utf8'));
  const out = path.join(work, 'graph.json');
  const g = report('trace_module_graph.js', [path.join(tree, 'runtime.js'), '--root', tree, '--json', out]);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(out, 'utf8')), g, '--json writes what it prints');
  assert.strictEqual(g.summary.files_analyzed, graph.module_count + 1, 'the runtime and every module file');
  assert.deepStrictEqual(g.summary.edges_by_kind, { require: graph.module_count });
  assert.deepStrictEqual(g.edges.map((e) => `${path.basename(e.from)} → ${e.to}`).sort(), graph.modules.map((m) => `runtime.js → ./modules/${path.basename(m.file)}`).sort());
  for (const n of g.nodes.filter((node) => node.kind === 'module-specifier')) {
    assert.strictEqual(path.basename(n.resolved_local_path), path.basename(n.source_path));
    assert.ok(fs.existsSync(n.resolved_local_path), n.source_path);
  }
  // the entry module of the bundle is the module of the tree ranked first: it signs a request
  assert.match(g.likely_request_modules[0].node, /modules[\\/]\d+\.js$/);
  assert.ok(g.likely_request_modules[0].signals.some((signal) => signal.startsWith('request-field')), g.likely_request_modules[0].signals.join(','));
});

test('trace_module_graph.js: an entry that is not there is an error, not an empty graph with exit 0', OPT, () => {
  const r = spawnSync(process.execPath, [path.join(SCRIPTS, 'trace_module_graph.js'), path.join(os.tmpdir(), 'no-such-entry.js')], { encoding: 'utf8', timeout: 20000 });
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /entry not found/);
  assert.strictEqual(r.stdout, '');
});

test('trace_module_graph.js: known miss, still a miss — a dynamic import whose path is only known at run time is not seen', OPT, (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'graph-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const entry = path.join(dir, 'entry.js');
  fs.writeFileSync(entry, 'const pick = (name) => import(name);\nexport { pick };\n');
  const g = report('trace_module_graph.js', [entry, '--root', dir]);
  // it is not an edge, and not said as unresolved either: remove this test when it is either
  assert.strictEqual(g.summary.edge_count, 0);
  assert.strictEqual(g.summary.unresolved_imports, 0);
});

// --- extract_module_entry_contract.js ---------------------------------------------------------

test('extract_module_entry_contract.js: on every bundle of the CommonJS source — the global it assigns and what, the request words, the route', OPT, () => {
  // read from src/entry.js: `window.__boot = boot`; a header "Authorization", the X-Sign header
  // and the sign() call; the TOKEN_TABLE_PROOF_5e literal; lib's '/api/v2/' route; no imports
  // left — a bundler compiled them away — and so no dynamic imports either
  for (const rel of ['webpack-5.production.js', 'webpack-5.development.js', 'webpack-4.production.js', 'webpack-4.development.js', 'browserify-17.js']) {
    const j = report('extract_module_entry_contract.js', [path.join(ST, rel)]);
    assert.strictEqual(j.target, path.join(ST, rel));
    assert.deepStrictEqual(j.inferred.global_assignments.map((g) => g.target), ['__boot'], rel);
    // what is assigned: the boot function — one identifier, whatever the bundler named it
    assert.match(j.inferred.global_assignments[0].value, /^[A-Za-z_$][\w$]*$/, rel);
    assert.deepStrictEqual(j.inferred.request_field_hints, ['authorization', 'sign', 'token'], rel);
    assert.deepStrictEqual(j.inferred.route_hints, ['/api/v2/'], rel);
    assert.deepStrictEqual(j.inferred.import_bindings, [], rel);
    assert.deepStrictEqual(j.inferred.dynamic_imports, [], rel);
    assert.deepStrictEqual(j.inferred.bootstrap_hints, [], rel);
    assert.ok(j.excerpts.lead_block.length > 100, 'the lead of the file, for reading');
  }
});

test('extract_module_entry_contract.js: a bundle that loads chunks — the module-level globals, with exactly what is assigned', OPT, () => {
  // read from srcsplit/lib.mjs and signer.mjs: `globalThis.__side_lib = (globalThis.__side_lib || 0) + 1`
  for (const [rel, globals] of [
    ['split-webpack-5/main.js', ['__side_lib', '__side_signer']],
    ['split-webpack-4/main.js', ['webpackJsonp', '__side_lib', '__side_signer']],
  ]) {
    const j = report('extract_module_entry_contract.js', [path.join(ST, rel)]);
    assert.deepStrictEqual(j.inferred.global_assignments.map((g) => g.target), globals, rel);
    for (const g of j.inferred.global_assignments.filter((g) => g.target.startsWith('__side_'))) {
      assert.strictEqual(g.value, `(${g.target.startsWith('__side_lib') ? 'globalThis.__side_lib' : 'globalThis.__side_signer'}||0)+1`, rel);
    }
    assert.deepStrictEqual(j.inferred.route_hints, ['/api/v2/']);
  }
});

test('extract_module_entry_contract.js: an ES-module file — its import bindings and both dynamic imports', OPT, () => {
  const j = report('extract_module_entry_contract.js', [path.join(ST, 'srcsplit', 'entry.mjs')]);
  assert.deepStrictEqual(j.inferred.import_bindings, [
    { binding: '{ route }', specifier: './lib.mjs' },
    { binding: '{ sign }', specifier: './signer.mjs' },
  ]);
  // `import(/* webpackChunkName: "lazy-a" */ './lazy-a.mjs')` — missed before v1.9.2
  assert.deepStrictEqual(j.inferred.dynamic_imports, ['./lazy-a.mjs', './lazy-b.mjs']);
  assert.deepStrictEqual(j.inferred.global_assignments, []);
  // sign() and the `signature` field; no route in the entry itself
  assert.deepStrictEqual(j.inferred.request_field_hints, ['sign', 'signature']);
});

test('extract_module_entry_contract.js: a module file unbundle.js cut — the entry module on its own', OPT, (t) => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'contract-'));
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  const tree = path.join(work, 'tree');
  const cut = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'unbundle.js'), path.join(ST, 'webpack-4.development.js'), '--out', tree], { encoding: 'utf8', timeout: 40000 });
  assert.strictEqual(cut.status, 0, cut.stderr);
  const module = path.join(tree, 'modules', 'src_entry.js');
  const j = report('extract_module_entry_contract.js', [module]);
  assert.deepStrictEqual(j.inferred.global_assignments, [{ target: '__boot', value: 'boot' }]);
  assert.deepStrictEqual(j.inferred.request_field_hints, ['authorization', 'sign', 'token']);
  assert.deepStrictEqual(j.inferred.route_hints, [], 'the entry has no route of its own; lib has');
});

test('extract_module_entry_contract.js: given a trace_module_graph.js graph, it reads the module ranked first', OPT, (t) => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'contract-'));
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  const dir = path.join(ST, 'srcsplit');
  const out = path.join(work, 'graph.json');
  const g = report('trace_module_graph.js', [path.join(dir, 'entry.mjs'), '--root', dir, '--json', out]);
  const top = g.likely_request_modules[0].node;
  assert.match(top, /lazy-a\.mjs$/, 'expectation itself is anchored: lazy-a scores highest');
  const j = report('extract_module_entry_contract.js', [out]);
  assert.strictEqual(j.target, top);
  // what that module is made of: shared, deep and the signer, and its salt
  assert.deepStrictEqual(j.inferred.import_bindings.map((b) => b.specifier), ['./shared.mjs', './deep.mjs', './signer.mjs']);
  assert.ok(j.inferred.request_field_hints.includes('sign'));
});

test('extract_module_entry_contract.js: known miss, still a miss — chunks a bundle asks for are not among its dynamic imports', OPT, () => {
  // the ask is `o.e(543)` in the bundle's own code, no `import(` left; inspect_obfuscation_family.js
  // reports it as chunk_calls. Remove this test when the contract reports it too
  const j = report('extract_module_entry_contract.js', [path.join(ST, 'split-webpack-5', 'main.js')]);
  assert.deepStrictEqual(j.inferred.dynamic_imports, []);
});
