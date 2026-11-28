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
const { tokenAt, skipToken } = require('../../scripts/inspect_obfuscation_family.js');

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

test('a bundle that loads chunks, given without its chunk files: exit 1, says which it asks for and how to hand them over, nothing written', OPT, (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unbundle-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  // from the bundle alone no tree could run: v1.9.0 still said "written" for these, and a tree
  // cut from the webpack 5 one then failed at run time with exit 1
  const cases = [
    ['webpack-5.multichunk.js', /n\.e\(245\)/, /2 of its modules/],
    ['webpack-4.multichunk.js', /o\.e\(0\)/, /3 of its modules/],
  ];
  for (const [file, ...reasons] of cases) {
    const out = path.join(dir, `out-${file}`);
    const r = run([TOOL, path.join(ST, file), '--out', out]);
    assert.strictEqual(r.status, 1, `${file}: ${r.stderr}`);
    assert.match(r.stderr, /^unbundle: a bundle that loads chunks at run time/m);
    for (const reason of reasons) assert.match(r.stderr, reason);
    assert.match(r.stderr, new RegExp(`node scripts/unbundle\\.js ${file.replace(/[.]/g, '\\.')} <chunk file>… --out`), 'it says how the chunk files are passed');
    assert.match(r.stderr, /nothing was written/);
    assert.strictEqual(r.stdout, '', 'no report on stdout for a refusal');
    assert.ok(!fs.existsSync(out), `${file}: refusing means not even creating the directory`);
  }
});

// --- a bundle with the chunk files it loads: one tree for all of them ---------------------
// Each directory is one real build of srcsplit/ (two dynamic imports of a module both share):
// main.js, and the chunk files, as webpack named them. Per set:
//   1. `node runtime.js`, with nothing else, prints what the source prints — and what the files
//      themselves print on a page (tests/helpers/page-shim.js plays the page: the <script> tags
//      the bundle attaches, and the document webpack's publicPath reads)
//   2. the graph says which file each module stands in, what each require resolves to, and which
//      chunks the code asks for (none missing here)
//   3. every factory is the bytes of the file it stands in
//   4. nothing lost, nothing invented, across all the files given
//   5. a module in a chunk file requires one in the bundle and one next to it — both resolve
// The "default" sets are webpack's own splitting: a module this small is copied into every chunk
// that needs it, and each chunk file is minified on its own, so the copies differ in text. The
// "shared" sets set splitChunks.minSize to 0: the module has a chunk file of its own.
const SHIM = path.join(__dirname, '..', 'helpers', 'page-shim.js');
const SOURCE_OUTPUT = run([path.join(ST, 'srcsplit', 'entry.mjs')]).stdout;
const SETS = [
  { dir: 'split-webpack-5', chunkFiles: { 'lazy-a.js': [543], 'lazy-b.js': [340] }, modules: 5, inBundle: 2, requests: [543, 340],
    copiesDiffer: ['225'], lazy: '205', needs: ['225', '328'], shared: '225', sharedPlaces: 2 },
  { dir: 'split-webpack-4', chunkFiles: { 'lazy-a.js': [0], 'lazy-b.js': [1] }, modules: 6, inBundle: 3, requests: [0, 1],
    copiesDiffer: ['5'], lazy: '4', needs: ['5', '1'], shared: '5', sharedPlaces: 2 },
  { dir: 'split-shared-webpack-5', chunkFiles: { '225.js': [225], 'lazy-a.js': [543], 'lazy-b.js': [340] }, modules: 5, inBundle: 2, requests: [225, 543, 340],
    copiesDiffer: [], lazy: '205', needs: ['225', '328'], shared: '225', sharedPlaces: 1 },
  { dir: 'split-shared-webpack-4', chunkFiles: { 'lazy-a~lazy-b.js': [0], 'lazy-a.js': [1], 'lazy-b.js': [2] }, modules: 6, inBundle: 3, requests: [0, 1, 2],
    copiesDiffer: [], lazy: '4', needs: ['5', '1'], shared: '5', sharedPlaces: 1 },
];
const ascending = (a, b) => a - b;
// Every string token of a text, as written — quote, escapes and all — counted. Unlike the AST
// reader above this needs no parse: webpack's chunk runtime uses `?.` and `??`, and a factory that
// is a method's body — `(module, exports) {…}` — parses only with a `function` in front. For text
// moved verbatim the tokens are the same on both sides
const stringTokens = (text) => {
  const out = [];
  for (let i = 0; i < text.length; i += 1) {
    const kind = tokenAt(text, i);
    if (!kind) continue;
    if (kind === 'string') out.push(text.slice(i, skipToken(text, i)));
    i = skipToken(text, i) - 1;
  }
  return out.sort();
};
// the same, with what a template interpolates left out: a copy minified on its own renames the
// locals inside `${…}`; the text around them is the module's own
const templatesBlanked = (text) => stringTokens(text).map((token) => {
  if (!token.startsWith('`')) return token;
  let out = '`';
  let depth = 0;
  for (let i = 1; i < token.length - 1;) {
    if (depth === 0 && token.startsWith('${', i)) { out += '${}'; depth = 1; i += 2; continue; }
    if (depth > 0) {
      if (token[i] === '}') { depth -= 1; i += 1; continue; }
      if ('"`\''.includes(token[i])) { i = skipToken(token, i); continue; }
      i += 1; continue;
    }
    if (token[i] === '\\') { out += token.slice(i, i + 2); i += 2; continue; }
    out += token[i];
    i += 1;
  }
  return out;
});
const filesOf = (dir) => Object.fromEntries(fs.readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')]));

for (const set of SETS) {
  test(`bundle set ${set.dir}: one tree for the bundle and its chunk files, and it does what the set does on a page`, OPT, (t) => {
    const dir = path.join(ST, set.dir);
    const files = filesOf(dir);
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'unbundle-set-'));
    t.after(() => fs.rmSync(out, { recursive: true, force: true }));
    const inputs = [path.join(dir, 'main.js'), ...Object.keys(set.chunkFiles).map((f) => path.join(dir, f))];
    const r = run([TOOL, ...inputs, '--out', out]);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.match(r.stderr, /run with: node .*runtime\.js/);
    assert.doesNotMatch(r.stderr, /not among the files given/, r.stderr);
    const graph = JSON.parse(fs.readFileSync(path.join(out, 'graph.json'), 'utf8'));

    // 1. behaviour
    assert.ok(SOURCE_OUTPUT.trim().split('\n').length >= 2, 'the source prints its boot line and then what the lazy modules return');
    const rebuilt = run([path.join('runtime.js')], out);
    assert.strictEqual(rebuilt.status, 0, rebuilt.stderr);
    assert.strictEqual(rebuilt.stdout, SOURCE_OUTPUT);
    const onPage = spawnSync(process.execPath, ['-r', SHIM, path.join(dir, 'main.js')], { encoding: 'utf8', timeout: 40000, env: { ...process.env, PAGE_DIR: dir } });
    assert.strictEqual(onPage.status, 0, onPage.stderr);
    assert.strictEqual(onPage.stdout, SOURCE_OUTPUT, 'the files themselves, on a page, print what the source prints');
    assert.match(onPage.stderr, new RegExp(`page-shim: ${Object.keys(set.chunkFiles).length} script tag\\(s\\) attached`), 'on a page every chunk file is fetched by a script tag');
    assert.doesNotMatch(rebuilt.stderr || '', /script tag/, 'in the tree nothing is fetched');

    // 2. the graph
    assert.strictEqual(graph.kind, 'bundle');
    assert.strictEqual(graph.chunk_files, Object.keys(set.chunkFiles).length);
    assert.deepStrictEqual(graph.missing_chunks, []);
    assert.deepStrictEqual(graph.unrequested_chunks, []);
    assert.deepStrictEqual(graph.chunk_requests.slice().sort(ascending), set.requests.slice().sort(ascending));
    assert.strictEqual(graph.module_count, set.modules);
    assert.strictEqual(graph.modules_in_bundle, set.inBundle);
    assert.deepStrictEqual(Object.fromEntries(graph.chunks.map((c) => [c.name, c.ids])), set.chunkFiles, 'each chunk file, with the chunk ids it registers');
    for (const c of graph.chunks) assert.ok(fs.existsSync(path.join(out, c.file)), c.file);

    // 3. verbatim. A module that stands in two files is kept once; its other copy is not what was
    //    kept — but it is the same module: the same string literals
    for (const m of graph.modules) {
      const written = fs.readFileSync(path.join(out, m.file), 'utf8');
      const kept = files[m.in[0].file].slice(m.in[0].source_range[0], m.in[0].source_range[1]);
      assert.ok(kept.length > 20, m.id);
      assert.strictEqual(m.bytes, Buffer.byteLength(kept));
      assert.ok(written.includes(kept), `module ${m.id}: the file holds the bytes of ${m.in[0].file}`);
      for (const place of m.in.slice(1)) {
        const copy = files[place.file].slice(place.source_range[0], place.source_range[1]);
        assert.strictEqual(place.same_text, kept === copy, `${m.id} in ${place.file}: same_text says whether the copy reads the same`);
        if (!place.same_text) {
          assert.ok(!written.includes(copy));
          assert.deepStrictEqual(templatesBlanked(copy), templatesBlanked(kept), `${m.id}: the copy in ${place.file} is the same module`);
        }
      }
    }
    assert.deepStrictEqual(graph.modules.filter((m) => m.copies_differ).map((m) => m.id).sort(), set.copiesDiffer.slice().sort());
    if (set.copiesDiffer.length) assert.match(r.stderr, new RegExp(`module "${set.copiesDiffer[0]}" stands in 2 files and the copies differ in text`), 'it is said');

    // 4. nothing lost, nothing invented — page.js is not counted: it is generated, and holds
    //    nothing of the inputs. Nor are the copies of a module that were not kept (a copy that
    //    was kept stands for them: the same tokens, checked above), nor the stubs' own paths
    const counts = (tokens) => tokens.reduce((map, t) => map.set(t, (map.get(t) || 0) + 1), new Map());
    const written = counts(['runtime.js', ...graph.chunks.map((c) => c.file), ...graph.modules.map((m) => m.file)]
      .flatMap((f) => stringTokens(fs.readFileSync(path.join(out, f), 'utf8')))
      .filter((s) => !/^["']\.{1,2}\/(chunks|modules|page\.js)/.test(s)));
    const given = counts(Object.values(files).flatMap(stringTokens));
    for (const m of graph.modules) {
      for (const place of m.in.slice(1)) {
        if (place.same_text !== false) continue;
        for (const t of stringTokens(files[place.file].slice(place.source_range[0], place.source_range[1]))) given.set(t, given.get(t) - 1);
      }
    }
    assert.deepStrictEqual([...written].sort(), [...given].filter(([, n]) => n > 0).sort());
    const byId = Object.fromEntries(graph.modules.map((m) => [m.id, m]));
    const lazy = byId[set.lazy];
    assert.ok(lazy, 'the lazy-a module');
    assert.deepStrictEqual(lazy.in[0].chunk, set.chunkFiles['lazy-a.js'], 'it stands in lazy-a.js');
    assert.deepStrictEqual(lazy.requires, set.needs);
    const shared = byId[set.shared];
    assert.strictEqual(shared.in.length, set.sharedPlaces);
    assert.strictEqual(shared.in[0].chunk ? 'chunk file' : 'bundle', 'chunk file', 'the shared module lives in a chunk file');
    assert.strictEqual(byId[set.needs[1]].in[0].chunk, null, 'the module the entry uses too stays in the bundle');
    assert.deepStrictEqual(lazy.resolves, set.needs.map((id) => ({ id, file: byId[id].file })), 'every require resolves inside the tree');
    for (const x of lazy.resolves) assert.ok(fs.existsSync(path.join(out, x.file)), x.file);
  });
}

test('a chunk file the code asks for is missing: the tree is still cut, says what is missing, and fails with a reason when it is needed', OPT, (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unbundle-set-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const cases = [
    ['split-webpack-5', 'lazy-b.js', /— 340: the tree fails/, 340, /chunk not in this tree \(.*lazy-b\.js\)/],
    ['split-webpack-4', 'lazy-b.js', /— 1: the tree fails/, 1, /chunk not in this tree \(.*lazy-b\.js\)/],
  ];
  for (const [name, missing, said, id, failed] of cases) {
    const set = path.join(ST, name);
    const files = fs.readdirSync(set).map((f) => path.join(set, f)).filter((f) => !f.endsWith('main.js') && !f.endsWith(missing));
    const out = path.join(dir, name);
    const r = run([TOOL, path.join(set, 'main.js'), ...files, '--out', out]);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.match(r.stderr, said);
    const graph = JSON.parse(fs.readFileSync(path.join(out, 'graph.json'), 'utf8'));
    assert.deepStrictEqual(graph.missing_chunks, [id]);
    assert.ok(graph.chunk_requests.includes(id));
    assert.match(fs.readFileSync(path.join(out, 'runtime.js'), 'utf8'), /NOT the whole set: the code asks for 1 chunk\(s\)/);
    // …the bundle's own output still comes; the part that needs the missing chunk fails, saying why
    const ran = run([path.join('runtime.js')], out);
    assert.notStrictEqual(ran.status, 0);
    assert.strictEqual(ran.stdout, `${SOURCE_OUTPUT.split('\n')[0]}\n`);
    assert.match(ran.stderr, failed);
  }
});

test('inputs that do not go together: refused with a reason, nothing written', OPT, (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unbundle-set-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const set = path.join(ST, 'split-webpack-5');
  const cases = [
    // a plain module file where a chunk file is expected
    [[path.join(set, 'main.js'), path.join(ST, 'src', 'lib.js')], /lib\.js is not a webpack chunk file/],
    // chunk files for a bundle that loads none
    [[path.join(ST, 'webpack-5.production.js'), path.join(set, 'lazy-a.js')], /does not load any chunk: lazy-a\.js/],
    // a browserify bundle is given a chunk file
    [[path.join(ST, 'browserify-17.js'), path.join(set, 'lazy-a.js')], /is not a bundle that loads chunks/],
    // chunk files with no bundle in front
    [[path.join(set, 'lazy-a.js'), path.join(set, 'lazy-b.js')], /is not a bundle that loads chunks/],
    // the plain source of the set
    [[path.join(ST, 'srcsplit', 'entry.mjs'), path.join(set, 'lazy-a.js')], /is not a bundle that loads chunks/],
  ];
  for (const [args, reason] of cases) {
    const out = path.join(dir, `out-${path.basename(args[0])}`);
    const r = run([TOOL, ...args, '--out', out]);
    assert.strictEqual(r.status, 1, `${args.join(' ')}: ${r.stderr}`);
    assert.match(r.stderr, reason);
    assert.match(r.stderr, /nothing was written/);
    assert.strictEqual(r.stdout, '');
    assert.ok(!fs.existsSync(out));
  }
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
