#!/usr/bin/env node
// unbundle — splits a webpack (4 / 5) or browserify bundle into one file per module WITHOUT
// rewriting a byte of the bundle's own code: each factory is moved verbatim into modules/<id>.js,
// and its place in the bundle is taken by a stub that forwards to that file.
//   <out>/runtime.js    the bundle with the factories factored out — `node runtime.js` does what
//                       `node <bundle>` did
//   <out>/modules/*.js  each factory's text, unchanged; `module.exports` is that function
//   <out>/startup.js    what follows the bootstrap inside its enclosing function: webpack 5.9x+
//                       runtime helpers, then the entry module's code, which webpack inlines
//                       there; webpack 4 its runtime helpers and the entry's start call. A copy
//                       for reading — runtime.js has it too
//   <out>/graph.json    modules, dependencies, entry, and the self-check's numbers
// Also a webpack chunk file — the modules a bundle loads at run time
// (`(self.webpackChunk=…).push([[245],{829(e){…}}])`): same tree, and runtime.js registers the
// chunk with the same ids and module keys as the file did (graph.json says `kind: "chunk"`).
// Not for a bundle that loads chunks at run time: its map holds only part of its modules, and a
// tree cut from that file alone would not run like the bundle. Refused, nothing written.
// Self-check before anything is written: runtime.js plus every module file must parse, and the
// cut ranges must be in order and lie inside the map literal. The tool never runs the bundle;
// whether the tree behaves like the bundle is for the caller (the test does it).
// Why not webcrack: measured on bundles built for v1.8.7, webcrack 2.16 returned no bundle for
// default webpack 5 output (production, development, ESM) and unpacked a browserify one. This
// tool does both, with no dependency beyond Node.
// Verified on (tests/unit/unbundle.test.js, which also runs each tree next to its file): webpack
// 4.47 production / development, webpack 5.113 production / development / ESM (without module
// concatenation), browserify 17, one chunk file each from webpack 4 and webpack 5.
// NOT verified: parcel / rollup / esbuild bundles, factories wrapped in eval (webpack devtool
// eval), a chunk file holding `[factory, deps]` pairs, module ids that are not plain numbers
// or paths when used as file names.
// Usage: node scripts/unbundle.js <file.js> --out <dir> [--json <report.json>]
// Exit 0 written and self-checked; 1 not a file this tool handles (nothing written); 2 usage.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {
  factoryMaps, webpackBootstrap, webpackChunkFile, memberRanges, stripComments, tokenAt, skipToken,
  KEY, MODULE_ID, unquote, enclosingBlock,
} = require('./inspect_obfuscation_family.js');

const say = (text) => fs.writeSync(2, `${text}\n`);
const finish = (code) => process.exit(code);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const RESERVED = new Set(['runtime.js', 'startup.js', 'graph.json', 'index.js']);

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

function fileFor(id, used) {
  const safe = String(id).replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[._]+/, '') || 'module';
  let name = /\.(js|mjs|cjs)$/.test(safe) ? safe : `${safe}.js`;
  if (RESERVED.has(name)) name = `m-${name}`;
  let candidate = name;
  let n = 2;
  while (used.has(candidate)) { candidate = name.replace(/\.js$/, `-${n}.js`); n += 1; }
  used.add(candidate);
  return candidate;
}

// what the bundle calls a factory with, by bundler — said in the module file's header so that
// the parameter names a bundle chose (`t`, `e`, `n`) can be read for what they are
const PARAM_ROLES = { webpack: '(module, exports, require)', browserify: '(require, module, exports)' };

function build(raw, bundler, map, bootstrap, source, kind) {
  const ranges = memberRanges(raw, map.openAt, map.close);
  if (ranges.length !== map.members.length) return { error: 'member ranges do not line up with the map' };
  const used = new Set();
  const modules = [];
  for (let index = 0; index < ranges.length; index += 1) {
    const range = ranges[index];
    const text = raw.slice(range.start, range.end);
    const cut = cutMember(text, map.literal === 'array' ? 'array-element' : 'object');
    if (!cut) return { error: `member ${index} of the module map has a shape this tool cannot cut` };
    const id = cut.id === null || cut.id === undefined ? String(index) : cut.id;
    const params = (map.kinds[index] && map.kinds[index].params) || [];
    let deps;
    if (bundler === 'webpack') {
      // the factory's require is its third parameter when it declares one (webpack 4 always
      // does; webpack 5 and chunk files when the module uses it), else the bootstrap's own name.
      // Module ids are literals; `n(x)` with a variable is not a dependency this can name
      const requireName = params[2] || (bootstrap ? bootstrap.require_function : null);
      deps = requireName
        ? [...new Set([...stripComments(text).matchAll(new RegExp(`(?<![\\w$.])${escapeRe(requireName)}\\s*\\(\\s*(${MODULE_ID})\\s*\\)`, 'g'))].map((hit) => unquote(hit[1])))]
        : [];
    } else {
      deps = [...new Set([...cut.tail.matchAll(new RegExp(`(${KEY})\\s*:\\s*(${KEY})`, 'g'))].map((hit) => unquote(hit[2])))];
    }
    modules.push({ id, file: fileFor(id, used), index, range, cut, params, deps, bytes: cut.factory[1] - cut.factory[0] });
  }

  // self-check 1: the cut ranges are in order, do not overlap, and lie inside the map literal —
  // so nothing of the file is cut twice or skipped, and nothing outside the map is touched
  let cursor = map.openAt;
  for (const m of modules) {
    if (m.range.start < cursor) return { error: 'self-check failed: overlapping or unordered member ranges' };
    if (m.range.end > map.close + 1) return { error: 'self-check failed: a member range lies outside the map literal' };
    cursor = m.range.end;
  }

  const stubFor = (m) => {
    const ref = `require("./modules/${m.file}")`;
    if (bundler === 'browserify') return `${m.cut.head}${ref}${m.cut.tail}`;
    if (map.literal === 'array') return ref;
    // `id: (…__args)=>require(…)(…__args)` keeps the key a property; `id(…__args){return …}`
    // keeps it a method — as the bundle wrote it
    return m.cut.shape === 'property'
      ? `${m.cut.head}(...__args)=>${ref}(...__args)`
      : `${m.cut.head}(...__args){return ${ref}(...__args)}`;
  };

  let entry = null;
  let startup = null;
  if (kind !== 'chunk') {
    // a chunk file has no entry and no start-up code: it only registers its modules
    if (bundler === 'webpack') {
      if (bootstrap.entry_marker) entry = { kind: 'in-map', id: bootstrap.entry_marker };
      const block = enclosingBlock(raw, bootstrap.end - 1);
      if (block && block.end > bootstrap.end) {
        const tail = raw.slice(bootstrap.end, block.end).trim();
        if (tail) {
          startup = tail;
          if (!entry) entry = { kind: 'inlined-startup', file: 'startup.js', requires: bootstrap.startup_requires };
        }
      }
    } else {
      // browserify ends its call with the entry list: `…({map},{},[1])`
      const tail = new RegExp(`\\[\\s*((?:${KEY}\\s*,?\\s*)+)\\]\\s*\\)\\s*;?\\s*$`).exec(raw.slice(map.close + 1));
      if (tail) entry = { kind: 'in-map', ids: [...tail[1].matchAll(new RegExp(KEY, 'g'))].map((hit) => unquote(hit[0])) };
    }
  }

  let runtime = '';
  cursor = 0;
  for (const m of modules) {
    runtime += raw.slice(cursor, m.range.start) + stubFor(m);
    cursor = m.range.end;
  }
  runtime += raw.slice(cursor);

  const files = {};
  const base = path.basename(source);
  const prelude = raw.startsWith('#!') ? 1 : 0;
  const what = kind === 'chunk' ? `webpack chunk ${map.chunk_ids.join(', ')}` : bundler === 'webpack' ? 'webpack' : 'browserify';
  const header = [
    `// generated by unbundle.js from ${base} (${what}):`,
    "// the file's own code, unchanged, with every module factory moved verbatim to ./modules/",
  ];
  if (kind === 'chunk') header.push('// a chunk file does nothing on its own: this registers the chunk on its global array, as the file did');
  header.push('');
  files['runtime.js'] = prelude ? `${raw.split('\n')[0]}\n${header.join('\n')}${runtime.slice(raw.indexOf('\n') + 1)}` : `${header.join('\n')}${runtime}`;
  for (const m of modules) {
    const body = raw.slice(m.range.start + m.cut.factory[0], m.range.start + m.cut.factory[1]);
    const isMethod = bundler === 'webpack' && m.cut.shape === 'method';
    // a method `id(params){…}` becomes the function `function (params){…}`: the key stays in the
    // bundle (runtime.js), the factory text is kept as it is
    const value = isMethod ? `function ${body}` : `(\n${body}\n)`;
    files[`modules/${m.file}`] = [
      `// ${bundler} module ${JSON.stringify(m.id)} — the factory's text as it stands in ${base}, moved here by unbundle.js`,
      `// the bundle calls it with ${PARAM_ROLES[bundler]}; its parameters read ${m.params.length ? m.params.map((p, i) => `${p} = ${PARAM_ROLES[bundler].slice(1, -1).split(', ')[i] || 'extra'}`).join(', ') : '(declares none)'}`,
      `// requires: ${m.deps.length ? m.deps.map((d) => JSON.stringify(d)).join(', ') : 'no other module'}`,
      `module.exports = ${value};`, '',
    ].join('\n');
  }
  if (startup !== null) {
    // one text, two meanings: with the entry in the map this is webpack 4's helper block and its
    // start call; with the entry inlined it is webpack 5.9x+'s helpers and the entry's code
    const inlined = Boolean(entry && entry.kind === 'inlined-startup');
    const note = inlined
      ? '// what the bundle runs after its bootstrap (webpack 5.9x+): runtime helpers first,\n// then the entry module\'s code, which webpack inlines here instead of putting it in the map.'
      : "// what follows the bootstrap inside its enclosing function (webpack 4): its runtime helpers,\n// then the call that starts the entry module. The entry's own code is in modules/.";
    files['startup.js'] = `${note}\n// A copy for reading — runtime.js carries the same text in place.\n${startup}\n`;
  }

  // self-check 2: everything written parses. Parsing only: nothing is run.
  const parsed = [];
  for (const [name, text] of Object.entries(files)) {
    if (name === 'startup.js' || name.endsWith('.json')) continue;
    try {
      new vm.Script(text, { filename: name });
      parsed.push(name);
    } catch (err) {
      return { error: `self-check failed: ${name} does not parse — ${err.message}` };
    }
  }

  return {
    // "bundle": a file that runs on its own; "chunk": one a bundle loads at run time
    kind,
    ...(kind === 'chunk' ? { chunk: { ids: map.chunk_ids, global: map.global } } : {}),
    bundler,
    source,
    // the name the bootstrap indexes the map by (webpack 4: the parameter the IIFE receives it as)
    module_map: bundler === 'webpack' && bootstrap ? bootstrap.module_map : map.name,
    module_count: modules.length,
    entry,
    startup: startup !== null,
    // source_range: where the factory stood in the bundle, so that "moved verbatim" can be checked
    modules: modules.map((m) => ({ id: m.id, file: `modules/${m.file}`, requires: m.deps, parameters: m.params, bytes: m.bytes, source_range: [m.range.start + m.cut.factory[0], m.range.start + m.cut.factory[1]] })),
    self_check: {
      ranges_in_order: true,
      bundle_bytes: Buffer.byteLength(raw),
      module_bytes: modules.reduce((n, m) => n + m.bytes, 0),
      parsed,
    },
    files,
  };
}

function unbundle(raw, source) {
  const maps = factoryMaps(raw);
  const bootstrap = webpackBootstrap(raw, maps);
  if (bootstrap) {
    // refused before anything else: with modules in other files, no tree cut from this one runs
    // like the bundle, whatever the map looks like
    if (bootstrap.chunk_loading) {
      const asked = bootstrap.chunk_calls.length
        ? bootstrap.chunk_calls.map((id) => `${bootstrap.require_function}.e(${id})`).join(', ')
        : 'its chunk loader is written into the bootstrap';
      return {
        error: `a bundle that loads chunks at run time (${asked}): ${bootstrap.module_map} holds ${bootstrap.module_count === null ? 'part of' : `${bootstrap.module_count} of`} its modules, the rest are in other files, so a tree cut from this one would not run like the bundle. Bundles whose modules are all in the file only; the chunk files this tool can split — nothing was written`,
      };
    }
    if (!bootstrap.map) return { error: 'a webpack bootstrap was found, but its module map was not recognised as a whole' };
    return build(raw, 'webpack', bootstrap.map, bootstrap, source, 'bundle');
  }
  const chunk = webpackChunkFile(raw);
  if (chunk) return build(raw, 'webpack', chunk, null, source, 'chunk');
  const browserify = maps.filter((m) => m.kind === 'browserify')[0];
  if (browserify) return build(raw, 'browserify', browserify, null, source, 'bundle');
  return { error: 'no webpack or browserify module map was found (inspect_obfuscation_family.js says what the file is)' };
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const bundle = argv[0];
  const argOf = (flag) => { const i = argv.indexOf(flag); return i === -1 ? null : argv[i + 1] || null; };
  const out = argOf('--out');
  const report = argOf('--json');
  if (!bundle || !out || argv.includes('--out') && !argv[argv.indexOf('--out') + 1] || argv.includes('--json') && !argv[argv.indexOf('--json') + 1]) {
    say('Usage: unbundle.js <file.js> --out <dir> [--json <report.json>]');
    finish(2);
  }
  let raw;
  try {
    raw = fs.readFileSync(bundle, 'utf8');
  } catch (err) {
    say(`unbundle: cannot read ${bundle} — ${err.message}`);
    finish(2);
  }
  if (fs.existsSync(out) && fs.readdirSync(out).length) {
    say(`unbundle: ${out} is not empty — pick an empty directory, nothing was written`);
    finish(1);
  }
  const result = unbundle(raw, bundle);
  if (result.error) {
    say(`unbundle: ${result.error}`);
    finish(1);
  }
  fs.mkdirSync(path.join(out, 'modules'), { recursive: true });
  for (const [name, text] of Object.entries(result.files)) fs.writeFileSync(path.join(out, name), text);
  const { files, ...report_ } = result;
  fs.writeFileSync(path.join(out, 'graph.json'), `${JSON.stringify(report_, null, 2)}\n`);
  if (report) fs.writeFileSync(report, `${JSON.stringify(report_, null, 2)}\n`);
  if (result.kind === 'chunk') {
    say(`unbundle: webpack chunk ${result.chunk.ids.join(', ')} (registered on ${result.chunk.global}), ${result.module_count} modules → ${out}. A chunk file does nothing on its own, and neither does runtime.js: read modules/`);
  } else {
    say(`unbundle: ${result.bundler}, ${result.module_count} modules → ${out} (${report_.self_check.module_bytes} of ${report_.self_check.bundle_bytes} bytes are module text; run with: node ${path.join(out, 'runtime.js')})`);
  }
  fs.writeSync(1, `${JSON.stringify(report_, null, 2)}\n`);
  finish(0);
}

module.exports = { unbundle, cutMember };
