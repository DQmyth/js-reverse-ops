#!/usr/bin/env node
// unbundle — splits webpack and browserify output into one file per module WITHOUT rewriting a
// byte of the bundler's code: each module factory is moved verbatim into modules/<id>.js, and its
// place in the file is taken by a stub that forwards to that file.
//   one bundle, every module in it      node scripts/unbundle.js main.js --out <dir>
//   a bundle and the chunks it loads    node scripts/unbundle.js main.js 225.js lazy-a.js --out <dir>
//   webpack's runtime on its own        node scripts/unbundle.js runtime.js main.js 225.js … --out <dir>
//   one chunk file on its own           node scripts/unbundle.js lazy-a.js --out <dir>
//   a browserify bundle                 node scripts/unbundle.js bundle.js --out <dir>
// The file with the bootstrap goes first, the chunk files after it, in any order: a tree
// registers the other chunks before the entry chunks, whose start-up code runs at registration.
// The tree:
//   <out>/runtime.js    the input files, joined: their own code with the factories factored out.
//                       `node runtime.js` does what the inputs did on their page. Written as an ES
//                       module (input named .mjs, or `import` / `export` at its top level) it is
//                       runtime.mjs, with `require` made for it from node:module
//   <out>/modules/      each factory's text, unchanged; `module.exports` is that function — always
//                       a .js file, whatever its id ends in
//   <out>/chunks/       (bundle with chunk files) each chunk file, cut the same way
//   <out>/page.js       (bundle with chunk files) what the set needs of a page, generated: the
//                       global the chunks register on, and the page URL webpack's publicPath reads.
//                       The runtime requires the chunk files, then this, before the bundle's code
//   <out>/startup.js    what follows the bootstrap, to the end of its enclosing function or of
//                       the file: webpack 5.9x+ runtime helpers, then the entry module's code,
//                       which webpack inlines there; webpack 4 its runtime helpers and the
//                       entry's start call. A copy for reading — the runtime has it too
//   <out>/graph.json    modules (the file each stands in, what each require resolves to), chunks,
//                       entry chunks, the chunk files the code asks for, entry, the self-check's
// numbers
// A bundle that loads chunks at run time is cut only together with its chunk files: from the
// bundle alone no tree could run. The chunk files asked for that are not given are named, and
// listed in graph.json; the tree fails, with a reason, when one of them is needed.
// Another bundler around ONE webpack bundle (esbuild's `__commonJS` wrapper, for one) is cut:
// the bundle's modules go to modules/, the wrapper stays in the runtime as it stands. Around
// SEVERAL: refused — cutting the first and reporting done is what this tool did before v1.9.3.
// Self-check before anything is written: the runtime, page.js, every chunk file and every module
// file must parse; the cut ranges must be in order and lie inside the map literal. A module that
// stands in several files (webpack copies a small one into each chunk that needs it) is kept
// once, its other copies recorded. The tool never runs the bundle; whether the tree behaves like
// the inputs is for the caller (the test does it).
// Why not webcrack: measured on bundles built for v1.8.7, webcrack 2.16 returned no bundle for
// default webpack 5 output (production, development, ESM) and unpacked a browserify one. This
// tool does both, with no dependency beyond Node.
// Verified on (tests/unit/unbundle.test.js, which runs each tree next to its inputs): webpack
// 4.47 and 5.113 in production, in development, with chunks webpack cuts by default, with a shared
// chunk, with runtimeChunk; webpack 5 written as an ES module (a script and a library); four
// bundles whose text is hard for a token scanner; esbuild around one bundle, as CommonJS and as an
// ES module; browserify 17; one chunk file alone from each webpack; and one bundle nobody here
// built — esprima's distribution file, as installed: its tree parses to the same AST.
// NOT verified: parcel / rollup / esbuild alone (its wrappers are not cut); a minified bundle
// around bundles (not told from one bundle); webpack devtool eval output (factories in eval);
// chunk files holding `[factory, deps]` pairs or several chunk ids; webpack target "node" chunk
// loading; CSS or worker chunks; bundles with hundreds of chunks.
// Usage: node scripts/unbundle.js <bundle.js> [<chunk.js> ...] --out <dir> [--json <report.json>]
// Exit 0 written and self-checked; 1 not something this tool handles, or an input it refuses
// (nothing written); 2 usage.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');
const {
  factoryMaps, webpackBootstrap, webpackChunkFile, memberRanges, stripComments, tokenAt, skipToken,
  KEY, MODULE_ID, unquote, chunkId, enclosingBlock,
} = require('./inspect_obfuscation_family.js');

const say = (text) => fs.writeSync(2, `${text}\n`);
const finish = (code) => process.exit(code);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const RESERVED = new Set(['runtime.js', 'startup.js', 'graph.json', 'index.js', 'page.js']);

// Where inside a member the factory is, and what has to stay around it. Offsets are into the
// member's own text; comments in front of the key are left outside. `shape` is what was found:
//   method         `id(params){…}`                  head `id`,        factory `(params){…}`
//   property       `id: function (…) {…}` / arrow   head `id:` ,      factory the function
//   pair           `id:[factory,{deps}]`            head `id:[`,      factory the function, tail `,{deps}]`
//   array element  `(function (…) {…})`             head ``,          factory the member itself
function cutMember(text, shape) {
  let i = 0;
  const skipBlank = () => {
    for (;;) {
      while (i < text.length && /\s/.test(text[i])) i += 1;
      const kind = tokenAt(text, i);
      if (kind !== 'line-comment' && kind !== 'block-comment') return;
      i = skipToken(text, i);
    }
  };
  // the end of the factory's text: trailing blanks, and the comment banners a non-minified
  // bundle prints after a member, are not its
  const trimmedEnd = (from) => {
    let end = text.length;
    for (;;) {
      while (end > from && /\s/.test(text[end - 1])) end -= 1;
      if (end - from >= 2 && text[end - 1] === '/' && text[end - 2] === '*') {
        const open = text.lastIndexOf('/*', end - 3);
        if (open >= from && tokenAt(text, open) === 'block-comment' && skipToken(text, open) === end && text.slice(from, open).trim()) { end = open; continue; }
      }
      return end;
    }
  };
  skipBlank();
  if (shape === 'array-element') return { id: null, head: '', factory: [i, trimmedEnd(i)], tail: '', shape: 'array-element' };
  const keyStart = i;
  if (tokenAt(text, i) === 'string') i = skipToken(text, i);
  else while (i < text.length && /[\w$]/.test(text[i])) i += 1;
  const id = unquote(text.slice(keyStart, i));
  skipBlank();
  if (text[i] === '(') return { id, head: text.slice(keyStart, i), factory: [i, trimmedEnd(i)], tail: '', shape: 'method' };
  if (text[i] !== ':') return null;
  // `i` stands on the value; the head is the key, the colon, and whatever comment sits after it
  i += 1;
  skipBlank();
  if (text[i] !== '[') return { id, head: text.slice(keyStart, i), factory: [i, trimmedEnd(i)], tail: '', shape: 'property' };
  const pairOpen = i;
  i += 1;
  skipBlank();
  const factoryStart = i;
  // the comma that closes the pair's first slot sits at depth 1 inside the pair
  let depth = 1;
  let comma = -1;
  for (let j = i; j < text.length; j += 1) {
    if (tokenAt(text, j)) { j = skipToken(text, j) - 1; continue; }
    const ch = text[j];
    if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    else if (ch === ')' || ch === ']' || ch === '}') { if (depth === 1 && ch === ']') break; depth -= 1; }
    else if (ch === ',' && depth === 1) { comma = j; break; }
  }
  if (comma === -1) return null;
  const end = trimmedEnd(comma + 1);
  if (text[end - 1] !== ']') return null;
  let factoryEnd = comma;
  while (factoryEnd > factoryStart && /\s/.test(text[factoryEnd - 1])) factoryEnd -= 1;
  return { id, head: text.slice(keyStart, pairOpen + 1), factory: [factoryStart, factoryEnd], tail: text.slice(comma, end), shape: 'pair' };
}

// a file name under modules/ or chunks/: the id, made safe, always ending in .js, numbered when
// two ids give the same name. (A module id like "./lib.mjs" must not give an `.mjs` file: Node
// would load it as an ES module, where `module.exports` does not exist.)
function fileFor(id, used) {
  const safe = String(id).replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[._]+/, '') || 'module';
  let name = safe.endsWith('.js') ? safe : `${safe}.js`;
  if (RESERVED.has(name)) name = `m-${name}`;
  let candidate = name;
  let n = 2;
  while (used.has(candidate)) { candidate = name.replace(/\.js$/, `-${n}.js`); n += 1; }
  used.add(candidate);
  return candidate;
}

// what the bundler calls a factory with — said in the module file's header so that the parameter
// names a bundle chose (`t`, `e`, `n`) can be read for what they are
const PARAM_ROLES = { webpack: '(module, exports, require)', browserify: '(require, module, exports)' };

// The modules of one file that holds a module map, cut, with what each requires and which chunks
// each asks for. A module's require is its third parameter when it declares one (webpack 4 always
// does; webpack 5 and chunk files when the module uses it), else the bootstrap's own name. Module
// and chunk ids are literals: `n(x)` with a variable is not something this can name
function cutModules(raw, map, bootstrap, bundler) {
  const ranges = memberRanges(raw, map.openAt, map.close);
  if (ranges.length !== map.members.length) return { error: 'member ranges do not line up with the map' };
  const modules = [];
  for (let index = 0; index < ranges.length; index += 1) {
    const range = ranges[index];
    const cut = cutMember(raw.slice(range.start, range.end), map.literal === 'array' ? 'array-element' : 'object');
    if (!cut) return { error: `member ${index} of the module map has a shape this tool cannot cut` };
    const id = cut.id === null || cut.id === undefined ? String(index) : cut.id;
    const params = (map.kinds[index] && map.kinds[index].params) || [];
    const code = stripComments(raw.slice(range.start, range.end));
    let deps = [];
    let chunkRequests = [];
    if (bundler === 'webpack') {
      const requireName = params[2] || (bootstrap ? bootstrap.require_function : null);
      if (requireName) {
        const name = escapeRe(requireName);
        deps = [...new Set([...code.matchAll(new RegExp(`(?<![\\w$.])${name}\\s*\\(\\s*(${MODULE_ID})\\s*\\)`, 'g'))].map((hit) => unquote(hit[1])))];
        chunkRequests = [...code.matchAll(new RegExp(`(?<![\\w$.])${name}\\s*\\.\\s*e\\s*\\(\\s*(${MODULE_ID})\\s*\\)`, 'g'))].map((hit) => chunkId(hit[1]));
      }
    } else {
      deps = [...new Set([...cut.tail.matchAll(new RegExp(`(${KEY})\\s*:\\s*(${KEY})`, 'g'))].map((hit) => unquote(hit[2])))];
    }
    modules.push({ id, range, cut, params, deps, chunkRequests });
  }

  // self-check 1: the cut ranges are in order, do not overlap, and lie inside the map literal —
  // so nothing of the file is cut twice or skipped, and nothing outside the map is touched
  let cursor = map.openAt;
  for (const m of modules) {
    if (m.range.start < cursor) return { error: 'self-check failed: overlapping or unordered member ranges' };
    if (m.range.end > map.close + 1) return { error: 'self-check failed: a member range lies outside the map literal' };
    cursor = m.range.end;
  }
  return { modules };
}

// the factory's text as it stands in the file, and where
const bodyOf = (raw, m) => raw.slice(m.range.start + m.cut.factory[0], m.range.start + m.cut.factory[1]);
const rangeOf = (m) => [m.range.start + m.cut.factory[0], m.range.start + m.cut.factory[1]];

// the stub that takes the factory's place, forwarding to `ref`
//   `id: (…__args)=>require(…)(…__args)` keeps the key a property, `id(…__args){return …}` keeps
//   it a method — as the bundler wrote it
function stubFor(m, ref, bundler) {
  if (bundler === 'browserify') return `${m.cut.head}${ref}${m.cut.tail}`;
  if (m.cut.shape === 'array-element') return ref;
  return m.cut.shape === 'property'
    ? `${m.cut.head}(...__args)=>${ref}(...__args)`
    : `${m.cut.head}(...__args){return ${ref}(...__args)}`;
}

// the file's own code with each factory's place taken by its stub
function textWithStubs(raw, modules, stub) {
  let out = '';
  let cursor = 0;
  for (const m of modules) {
    out += raw.slice(cursor, m.range.start) + stub(m);
    cursor = m.range.end;
  }
  return out + raw.slice(cursor);
}

// a module file: `module.exports` is the factory, its text as it stood in the file. A method
// `id(params){…}` becomes the function `function (params){…}` — the key stays with the bundle
function moduleFileText(m, bundler, base) {
  const roles = PARAM_ROLES[bundler];
  const params = m.params.map((p, i) => `${p} = ${roles.slice(1, -1).split(', ')[i] || 'extra'}`).join(', ');
  return [
    `// ${bundler}${m.chunk ? ' chunk' : ''} module ${JSON.stringify(m.id)} — the factory's text as it stands in ${base}, moved here by unbundle.js`,
    `// the bundler calls it with ${roles}; its parameters read ${m.params.length ? params : '(declares none)'}`,
    `// requires: ${m.deps.length ? m.deps.map((d) => JSON.stringify(d)).join(', ') : 'no other module'}`,
    `module.exports = ${m.isMethod ? `function ${m.body}` : `(\n${m.body}\n)`};`, '',
  ].join('\n');
}

// what starts a bundle: its entry — in the map, or inlined after the bootstrap — and the text that
// follows the bootstrap inside its enclosing function
function startupOf(raw, map, bootstrap, bundler) {
  let entry = null;
  let startup = null;
  if (bundler === 'webpack') {
    if (bootstrap.entry_marker) entry = { kind: 'in-map', id: bootstrap.entry_marker };
    // inside an enclosing function (webpack 4, and webpack 5 for the page): up to that function's
    // end; at the top level of the file (webpack 5 for Node, ES-module output): to the end of the file
    const block = enclosingBlock(raw, bootstrap.end - 1);
    const tailEnd = block && block.end > bootstrap.end ? block.end : raw.length;
    const tail = raw.slice(bootstrap.end, tailEnd).trim();
    if (tail) {
      startup = tail;
      if (!entry) entry = { kind: 'inlined-startup', file: 'startup.js', requires: bootstrap.startup_requires };
    }
  } else {
    // browserify ends its call with the entry list: `…({map},{},[1])`
    const tail = new RegExp(`\\[\\s*((?:${KEY}\\s*,?\\s*)+)\\]\\s*\\)\\s*;?\\s*$`).exec(raw.slice(map.close + 1));
    if (tail) entry = { kind: 'in-map', ids: [...tail[1].matchAll(new RegExp(KEY, 'g'))].map((hit) => unquote(hit[0])) };
  }
  return { entry, startup };
}

// the runtime chunk of a build: what follows the bootstrap is the chunk-loading helpers, and
// nothing else is started from here
function startUpNote() {
  return '// what follows the bootstrap in webpack\'s runtime chunk (a build with runtimeChunk): the chunk-loading\n// helpers. The entry is started by an entry chunk file — graph.json names it.';
}
function startupText(entry, startup) {
  // one text, three meanings: with the entry in the map this is webpack 4's helper block and its
  // start call; with the entry inlined it is webpack 5.9x+'s helpers and the entry's code; with
  // the entry in an entry chunk, only the helpers
  const inlined = Boolean(entry && entry.kind === 'inlined-startup');
  const note = inlined
    ? '// what the bundle runs after its bootstrap (webpack 5.9x+): runtime helpers first,\n// then the entry module\'s code, which webpack inlines here instead of putting it in the map.'
    : "// what follows the bootstrap inside its enclosing function (webpack 4): its runtime helpers,\n// then the call that starts the entry module. The entry's own code is in modules/.";
  return `${note}\n// A copy for reading — the runtime carries the same text in place.\n${startup}\n`;
}

// whether a file is written as an ES module: named `.mjs`, or `import` / `export` at its top level
// (they are allowed nowhere else; a dynamic `import(` and `import.meta` are not it). Read with
// strings, templates and comments blanked, so that the words inside them do not count
function isEsModule(text, source) {
  if (/\.mjs$/.test(source)) return true;
  let blanked = '';
  for (let i = 0; i < text.length; i += 1) {
    const kind = tokenAt(text, i);
    if (!kind) { blanked += text[i]; continue; }
    const end = skipToken(text, i);
    blanked += kind === 'string' ? (text[i] === '`' ? '``' : text[i] + text[i]) : ' ';
    i = end - 1;
  }
  // `import` as a statement is followed by a blank, `{`, `*` or a quote — not by `(` (a dynamic
  // import), `.` (import.meta) or a letter (`typeof importScripts`, in every webpack 5 runtime)
  return /(?:^|[^\w$])(?:import(?=[\s{'"*])|export\s+(?:default\b|\{|\*|(?:const|let|var|function|async|class)\b))/.test(blanked);
}

// an ES-module tree gets its `require` the way an ES module does. The module files stay CommonJS —
// a factory is a function, and `module.exports` is it — and the stubs call require()
const ESM_REQUIRE_HEAD = 'import { createRequire as __jsroCreateRequire } from "node:module";\nconst require = __jsroCreateRequire(import.meta.url);\n';

// self-check 2: everything that runs parses. Parsing only: nothing is run. An ES module is checked
// by Node itself (`--check` on stdin as a module); the rest through vm.Script
function parseCheck(files) {
  const parsed = [];
  for (const [name, text] of Object.entries(files)) {
    if (/^startup\.(js|mjs)$/.test(name) || name.endsWith('.json')) continue;
    try {
      if ( name.endsWith('.mjs')) {
        const check = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: text, encoding: 'utf8' });
        if (check.status !== 0) throw new Error((check.stderr.split('\n').find((line) => /Error/.test(line)) || '').trim());
      } else {
        new vm.Script(text, { filename: name });
      }
      parsed.push(name);
    } catch (err) {
      return { error: `self-check failed: ${name} does not parse — ${err.message}` };
    }
  }
  return { parsed };
}

// ONE INPUT: a bundle whose modules are all in it, a browserify bundle, or a chunk file on its own
function buildSingle(raw, source, bundler, map, bootstrap, kind) {
  const cut = cutModules(raw, map, bootstrap, bundler);
  if (cut.error) return cut;
  const used = new Set();
  const filesOf = new Map();
  for (const m of cut.modules) filesOf.set(m.id, fileFor(m.id, used));
  const refFor = (m) => `require("./modules/${filesOf.get(m.id)}")`;
  // a chunk file has no entry and no start-up code: it only registers its modules
  const { entry, startup } = kind === 'chunk' ? { entry: null, startup: null } : startupOf(raw, map, bootstrap, bundler);
  const base = path.basename(source);
  const what = kind === 'chunk' ? `webpack chunk ${map.chunk_ids.join(', ')}` : bundler === 'webpack' ? 'webpack' : 'browserify';
  const header = [
    `// generated by unbundle.js from ${base} (${what}):`,
    "// the file's own code, unchanged, with every module factory moved verbatim to ./modules/",
  ];
  if (kind === 'chunk') header.push('// a chunk file does nothing on its own: this registers the chunk on its global array, as the file did');
  header.push('');

  const files = {};
  const text = textWithStubs(raw, cut.modules, (m) => stubFor(m, refFor(m), bundler));
  const prelude = raw.startsWith('#!') ? 1 : 0;
  // written as an ES module, the runtime is one too (`runtime.mjs`), with `require` made for it
  const esm = isEsModule(raw, source);
  const runtimeFile = esm ? 'runtime.mjs' : 'runtime.js';
  const head = esm ? `${ESM_REQUIRE_HEAD}${header.join('\n')}` : header.join('\n');
  files[runtimeFile] = prelude ? `${raw.split('\n')[0]}\n${head}${text.slice(raw.indexOf('\n') + 1)}` : `${head}${text}`;
  for (const m of cut.modules) {
    files[`modules/${filesOf.get(m.id)}`] = moduleFileText(
      { id: m.id, body: bodyOf(raw, m), isMethod: bundler === 'webpack' && m.cut.shape === 'method', params: m.params, deps: m.deps, chunk: kind === 'chunk' },
      bundler, base);
  }
  if (startup !== null) files[esm ? 'startup.mjs' : 'startup.js'] = startupText(entry, startup);

  const checked = parseCheck(files);
  if (checked.error) return checked;
  const modules = cut.modules.map((m) => ({
    id: m.id,
    file: `modules/${filesOf.get(m.id)}`,
    requires: m.deps,
    parameters: m.params,
    // the factory's size in bytes (its text is not all ASCII: comments carry an em dash, a page carries more)
    bytes: Buffer.byteLength(bodyOf(raw, m)),
    // where the factory stood in the file, so that "moved verbatim" can be checked
    source_range: rangeOf(m),
  }));
  return {
    kind,
    ...(kind === 'chunk' ? { chunk: { ids: map.chunk_ids, global: map.global } } : {}),
    bundler,
    source,
    // "commonjs" (`runtime.js`) or "es-module" (`runtime.mjs`, with `require` made for it)
    format: esm ? 'es-module' : 'commonjs',
    runtime: runtimeFile,
    // the name the bootstrap indexes the map by (webpack 4: the parameter the IIFE receives it as)
    module_map: bundler === 'webpack' && bootstrap ? bootstrap.module_map : map.name,
    module_count: modules.length,
    entry,
    startup: startup !== null,
    modules,
    self_check: {
      ranges_in_order: true,
      bundle_bytes: Buffer.byteLength(raw),
      module_bytes: modules.reduce((n, m) => n + m.bytes, 0),
      parsed: checked.parsed,
    },
    files,
  };
}

// The page a bundle set was built for, as far as the set needs one where there is none (under
// Node). Generated: it holds nothing from the inputs. Runtime.js requires it before anything else.
const PAGE_FILE = [
  '// generated by unbundle.js: the page this bundle set was built for, as far as the set needs one.',
  "'use strict';",
  '// The chunk files register on a global of the page (webpack 5: self.webpackChunk, webpack 4: window.webpackJsonp).',
  'globalThis.self ??= globalThis;',
  'globalThis.window ??= globalThis;',
  "// webpack's default publicPath (\"auto\") reads the running script's URL off the document when the bundle starts.",
  'globalThis.document ??= {',
  "  currentScript: { tagName: 'SCRIPT', src: __filename },",
  '  getElementsByTagName: () => [],',
  '  createElement: () => ({ setAttribute() {}, timeout: 0, onload: null, onerror: null }),',
  '  // A chunk is loaded by attaching a <script> that fetches its file. Every chunk file given is',
  '  // registered before the bundle starts, so this is reached only for a chunk that is not in the',
  '  // tree: said here, rather than failed on a missing page.',
  '  head: {',
  '    appendChild(script) {',
  '      throw new Error(`chunk not in this tree (${script.src}): its file was not passed to scripts/unbundle.js with the bundle. graph.json lists the chunks the code asks for`);',
  '    },',
  '  },',
  '};',
  '',
].join('\n');

// A BUNDLE WITH THE CHUNK FILES IT LOADS: one tree for all of them. The bundle is cut as a
// bundle, each chunk file as a chunk, and every factory goes into the same modules/ — one file
// per module id. runtime.js registers the chunk files before the bundle's own code runs: both
// webpacks treat a chunk that is on the page before the bundle starts as already loaded, so the
// loader is never asked for a file, and the tree does what the whole set did on a page
function buildSet(main, bootstrap, chunkFiles) {
  const chunks = [];
  for (const file of chunkFiles) {
    const chunk = webpackChunkFile(file.raw);
    if (!chunk) {
      return { error: `${path.basename(file.source)} is not a webpack chunk file. A chunk file registers modules on a global array, as the bundle's loader writes them — (self.webpackChunk=…).push([[245],{829(e){…}}]); inspect_obfuscation_family.js says what this file is — nothing was written` };
    }
    chunks.push({ raw: file.raw, source: file.source, name: path.basename(file.source), chunk });
  }
  if (main.raw.startsWith('#!')) return { error: 'a bundle that starts with a #! line is not handled together with chunk files — nothing was written' };

  const mainCut = cutModules(main.raw, bootstrap.map, bootstrap, 'webpack');
  if (mainCut.error) return mainCut;
  const chunkCuts = [];
  for (const part of chunks) {
    const cut = cutModules(part.raw, part.chunk, null, 'webpack');
    if (cut.error) return { error: `${part.name}: ${cut.error}` };
    chunkCuts.push(cut);
  }

  // one module, one file. webpack copies a small module into each chunk that needs it, under the
  // same id
  const used = new Set();
  const byId = new Map();
  const addModules = (cut, raw, place) => {
    for (const m of cut.modules) {
      const body = bodyOf(raw, m);
      const where = { ...place, source_range: rangeOf(m) };
      const known = byId.get(m.id);
      if (known) {
        // webpack copies a module into each chunk that needs it, and minifies each chunk on its
        // own: the copies are one module with different local names. The first is kept; a copy
        // that differs in text is recorded, so that a chunk file from another build shows
        known.places.push({ ...where, same_text: known.body === body });
        continue;
      }
      byId.set(m.id, { id: m.id, file: fileFor(m.id, used), body, params: m.params, deps: m.deps, isMethod: m.cut.shape === 'method', places: [where] });
    }
    return null;
  };
  const mainName = path.basename(main.source);
  let failure = addModules(mainCut, main.raw, { file: mainName, chunk: null });
  for (let i = 0; i < chunks.length && !failure; i += 1) {
    failure = addModules(chunkCuts[i], chunks[i].raw, { file: chunks[i].name, chunk: chunks[i].chunk.chunk_ids });
  }
  if (failure) return failure;

  // which chunks the code asks for, anywhere in the files given, and which of those are among
  // the files. Chunk ids as the code writes them
  const allCuts = [mainCut, ...chunkCuts];
  const typed = new Map();
  for (const id of [...bootstrap.chunk_calls, ...allCuts.flatMap((cut) => cut.modules.flatMap((m) => m.chunkRequests))]) typed.set(String(id), id);
  const provided = new Set(chunks.flatMap((part) => part.chunk.chunk_ids.map(String)));
  const missingChunks = [...typed.values()].filter((id) => !provided.has(String(id)));
  // an entry chunk file carries start-up code of its own: the page runs it for its sake, not
  // because code asks for the chunk — so it is not "unrequested"
  const entryChunks = chunks.filter((part) => part.chunk.start_up).map((part) => ({ file: part.name, ids: part.chunk.chunk_ids }));
  const unrequestedChunks = chunks
    .filter((part) => !part.chunk.start_up && part.chunk.chunk_ids.every((id) => !typed.has(String(id))))
    .map((part) => ({ file: part.name, ids: part.chunk.chunk_ids }));

  const refFor = (prefix) => (m) => `require("${prefix}/modules/${byId.get(m.id).file}")`;
  // a file in chunks/ per chunk file, named by the chunk ids it registers
  const chunkNames = new Set();
  for (const part of chunks) {
    part.esm = isEsModule(part.raw, part.source);
    const name = fileFor(`chunk-${part.chunk.chunk_ids.join('~')}`, chunkNames);
    part.treeFile = `chunks/${part.esm ? name.replace(/\.js$/, '.mjs') : name}`;
  }
  const header = [
    `// generated by unbundle.js from ${mainName} and ${chunks.length} chunk file(s) (webpack):`,
    "// the files' own code, unchanged, with every module factory moved verbatim to ./modules/",
    '// The chunks were <script> tags the bundle attached while it ran. They are registered here',
    '// first, before the bundle starts: both webpacks count a chunk that is on the page by then as',
    '// loaded, so nothing is fetched — the runtime does what the whole set did.',
  ];
  if (missingChunks.length) {
    header.push(`// NOT the whole set: the code asks for ${missingChunks.length} chunk(s) that are not among the files given (${missingChunks.map((id) => JSON.stringify(id)).join(', ')}). The tree fails, with a reason, when one is needed`);
  }
  header.push('');

  const files = {};
  // written as an ES module, the runtime is one too (`runtime.mjs`), with `require` made for it
  const esm = isEsModule(main.raw, main.source);
  const runtimeFile = esm ? 'runtime.mjs' : 'runtime.js';
  files[runtimeFile] = [
    esm ? `${ESM_REQUIRE_HEAD}${header.join('\n')}` : header.join('\n'),
    'require("./page.js");',
    // every other chunk first, the entry chunks last: an entry chunk's start-up code runs the
    // moment its registration is processed, and what it asks for has to be on the page by then
    ...[...chunks.filter((part) => !part.chunk.start_up), ...chunks.filter((part) => part.chunk.start_up)]
      .map((part) => `require("./${part.treeFile}");`),
    textWithStubs(main.raw, mainCut.modules, (m) => stubFor(m, refFor('.')(m), 'webpack')),
    '',
  ].join('\n');
  files['page.js'] = PAGE_FILE;
  for (let i = 0; i < chunks.length; i += 1) {
    const part = chunks[i];
    files[part.treeFile] = `${part.esm ? ESM_REQUIRE_HEAD : ''}// generated by unbundle.js from ${part.name} (webpack chunk ${part.chunk.chunk_ids.join(', ')}):\n// the file's own code, unchanged, with every module factory moved verbatim to ../modules/\n${textWithStubs(part.raw, chunkCuts[i].modules, (m) => stubFor(m, refFor('..')(m), 'webpack'))}`;
  }
  for (const x of byId.values()) {
    files[`modules/${x.file}`] = moduleFileText(
      { ...x, chunk: x.places.some((place) => place.chunk !== null) }, 'webpack', x.places.map((place) => place.file).join(' and '));
  }
  let { entry, startup } = startupOf(main.raw, bootstrap.map, bootstrap, 'webpack');
  if (startup !== null) files[esm ? 'startup.mjs' : 'startup.js'] = startupText(entry, startup);
  // the bootstrap on its own (webpack's runtime chunk): the file has no entry of its own — the
  // entry stands in an entry chunk file, started by the code registered with it
  if (bootstrap.module_count === 0) entry = { kind: 'entry-chunk-start-up', files: entryChunks.map((c) => c.file) };
  if (startup !== null && entry && entry.kind === 'entry-chunk-start-up') files[esm ? 'startup.mjs' : 'startup.js'] = `${startUpNote()}\n// A copy for reading — the runtime carries the same text in place.\n${startup}\n`;

  const checked = parseCheck(files);
  if (checked.error) return checked;
  const modules = [...byId.values()].map((x) => ({
    id: x.id,
    file: `modules/${x.file}`,
    // every file this factory stands in
    in: x.places,
    requires: x.deps,
    // what each require is among the files given: the module's file — or null, in none of them
    resolves: x.deps.map((id) => ({ id, file: byId.has(id) ? `modules/${byId.get(id).file}` : null })),
    // the other copies do not read the same (a module minified once per chunk file — see above)
    copies_differ: x.places.some((place) => place.same_text === false),
    parameters: x.params,
    bytes: Buffer.byteLength(x.body),
  }));
  return {
    kind: 'bundle',
    bundler: 'webpack',
    source: main.source,
    format: esm ? 'es-module' : 'commonjs',
    runtime: runtimeFile,
    module_map: bootstrap.module_map,
    module_count: modules.length,
    // how many of the modules stand in the bundle itself (the rest only in chunk files)
    modules_in_bundle: [...byId.values()].filter((x) => x.places.some((place) => place.chunk === null)).length,
    chunk_files: chunks.length,
    chunks: chunks.map((part, i) => ({
      file: part.treeFile, source: part.source, name: part.name, ids: part.chunk.chunk_ids, global: part.chunk.global,
      modules: chunkCuts[i].modules.map((m) => m.id),
    })),
    chunk_requests: [...typed.values()],
    missing_chunks: missingChunks,
    unrequested_chunks: unrequestedChunks,
    entry_chunks: entryChunks,
    entry,
    startup: startup !== null,
    modules,
    self_check: {
      ranges_in_order: true,
      bundle_bytes: [main, ...chunks].reduce((n, file) => n + Buffer.byteLength(file.raw), 0),
      module_bytes: modules.reduce((n, m) => n + m.bytes, 0),
      parsed: checked.parsed,
    },
    files,
  };
}

// the chunk files a bundle's code asks for, for a message
const askedText = (bootstrap) => (bootstrap.chunk_calls.length
  ? bootstrap.chunk_calls.map((id) => `${bootstrap.require_function}.e(${JSON.stringify(id)})`).join(', ')
  : 'its chunk loader is written into the bootstrap');

function unbundle(raw, source, chunkFiles = []) {
  const maps = factoryMaps(raw);
  const bootstrap = webpackBootstrap(raw, maps);
  const given = chunkFiles.map((file) => path.basename(file.source)).join(', ');
  if (bootstrap) {
    if (bootstrap.in_file > 1) {
      return { error: `${bootstrap.in_file} webpack bundles stand in this one file: bundles that were bundled again (${/\b__commonJS\s*=\s*\(/.test(raw) ? 'esbuild' : 'another bundler'} around webpack output). This tool cuts a file with one bundle; cutting the first and saying "done" was what it did before v1.9.3 — nothing was written` };
    }
    if (!bootstrap.map) return { error: 'a webpack bootstrap was found, but its module map was not recognised as a whole — nothing was written' };
    if (bootstrap.chunk_loading) {
      // from the bundle alone no tree could run: its modules are only part of the build
      if (!chunkFiles.length) {
        const where = bootstrap.module_count === 0
          ? 'it holds the bootstrap and no module: every module, the entry\'s too, is in a chunk file'
          : `${bootstrap.module_map} holds ${bootstrap.module_count} of its modules, the rest are in the chunk files it loads`;
        return {
          error: `a bundle that loads chunks at run time (${askedText(bootstrap)}): ${where}. Cut together with them, all of them go into one tree — node scripts/unbundle.js ${path.basename(source)} <chunk file>… --out <dir> — nothing was written`,
        };
      }
      return buildSet({ raw, source }, bootstrap, chunkFiles);
    }
    if (chunkFiles.length) return { error: `this bundle does not load any chunk: ${given} — nothing was written` };
    return buildSingle(raw, source, 'webpack', bootstrap.map, bootstrap, 'bundle');
  }
  if (chunkFiles.length) {
    return { error: `${path.basename(source)} is not a bundle that loads chunks (${given} given with it): a bundle is the first argument, its chunk files after it — nothing was written` };
  }
  const chunk = webpackChunkFile(raw);
  if (chunk) return buildSingle(raw, source, 'webpack', chunk, null, 'chunk');
  const browserify = maps.filter((m) => m.kind === 'browserify')[0];
  if (browserify) return buildSingle(raw, source, 'browserify', browserify, null, 'bundle');
  return { error: 'no webpack or browserify module map was found (inspect_obfuscation_family.js says what the file is) — nothing was written' };
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const OPTIONS = ['--out', '--json'];
  const inputs = [];
  let out = null;
  let report = null;
  const usage = () => {
    say('Usage: unbundle.js <bundle.js> [<chunk.js> ...] --out <dir> [--json <report.json>]');
    finish(2);
  };
  for (let i = 0; i < argv.length; i += 1) {
    if (OPTIONS.includes(argv[i])) {
      if (!argv[i + 1] || OPTIONS.includes(argv[i + 1])) usage();
      if (argv[i] === '--out') out = argv[i + 1];
      else report = argv[i + 1];
      i += 1;
    } else if (argv[i].startsWith('--')) usage();
    else inputs.push(argv[i]);
  }
  if (!inputs.length || !out) usage();

  const read = (file) => {
    try {
      return { raw: fs.readFileSync(file, 'utf8'), source: file };
    } catch (err) {
      say(`unbundle: cannot read ${file} — ${err.message}`);
      return finish(2);
    }
  };
  if (fs.existsSync(out)) {
    let stat = null;
    try { stat = fs.statSync(out); } catch (_error) { /* reported below as a file */ }
    if (!stat || !stat.isDirectory()) {
      say(`unbundle: --out ${out} is a file, not a directory — nothing was written`);
      finish(1);
    }
    let names = null;
    try { names = fs.readdirSync(out); } catch (error) {
      say(`unbundle: cannot look into ${out} — ${error.message}; nothing was written`);
      finish(1);
    }
    if (names.length) {
      say(`unbundle: ${out} is not empty — pick an empty directory, nothing was written`);
      finish(1);
    }
  }
  // a file named twice is one file: taken once, and said
  const [main, ...chunkFiles] = [inputs[0], ...inputs.slice(1).filter((file, i, all) => {
    const again = all.indexOf(file) !== i;
    if (again) say(`unbundle: ${file} is given twice — taken once`);
    return !again;
  })].map(read);
  const result = unbundle(main.raw, main.source, chunkFiles);
  if (result.error) {
    say(`unbundle: ${result.error}`);
    finish(1);
  }
  const { files, ...record } = result;
  // written whole or not at all: what could not be written takes the rest back off the disk
  const written = [];
  try {
    for (const name of [...Object.keys(files), 'graph.json']) {
      fs.mkdirSync(path.join(out, path.dirname(name)), { recursive: true });
      fs.writeFileSync(path.join(out, name), name === 'graph.json' ? `${JSON.stringify(record, null, 2)}\n` : files[name]);
      written.push(path.join(out, name));
    }
    if (report) fs.writeFileSync(report, `${JSON.stringify(record, null, 2)}\n`);
  } catch (error) {
    for (const file of written.reverse()) { try { fs.unlinkSync(file); } catch (_error) { /* left as it is */ } }
    say(`unbundle: cannot write under ${out} — ${error.message}; what had been written there was taken back off the disk`);
    finish(1);
  }
  if (result.kind === 'chunk') {
    say(`unbundle: webpack chunk ${result.chunk.ids.join(', ')} (registered on ${result.chunk.global}), ${result.module_count} modules → ${out}. A chunk file does nothing on its own, and neither does runtime.js: read modules/`);
  } else if (result.chunks) {
    say(`unbundle: webpack bundle + ${result.chunk_files} chunk file(s), ${result.module_count} modules (${result.modules_in_bundle} in the bundle) → ${out}; run with: node ${path.join(out, result.runtime)}`);
    if (result.missing_chunks.length) {
      say(`unbundle: the code asks for ${result.missing_chunks.length} chunk(s) that are not among the files given — ${result.missing_chunks.map((id) => JSON.stringify(id)).join(', ')}: the tree fails, with a reason, when one of them is needed (graph.json: missing_chunks)`);
    }
    if (result.unrequested_chunks.length) {
      say(`unbundle: ${result.unrequested_chunks.length} chunk file(s) given that no code here asks for: ${result.unrequested_chunks.map((c) => c.file).join(', ')}`);
    }
    for (const c of result.entry_chunks || []) {
      say(`unbundle: ${c.file} is an entry chunk — it carries start-up code of its own (chunk ${c.ids.map((id) => JSON.stringify(id)).join(', ')}); the tree starts there`);
    }
    const differ = result.modules.filter((m) => m.copies_differ);
    for (const m of differ) {
      say(`unbundle: module ${JSON.stringify(m.id)} stands in ${m.in.length} files and the copies differ in text (${m.in.map((place) => place.file).join(', ')}): the copy in ${m.in[0].file} is kept. One module minified once per chunk file reads like this; so does a chunk file from another build`);
    }
  } else {
    say(`unbundle: ${result.bundler}, ${result.module_count} modules → ${out} (${result.self_check.module_bytes} of ${result.self_check.bundle_bytes} bytes are module text; run with: node ${path.join(out, result.runtime)})`);
  }
  fs.writeSync(1, `${JSON.stringify(record, null, 2)}\n`);
  finish(0);
}

module.exports = { unbundle, cutMember };
