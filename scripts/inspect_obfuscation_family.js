#!/usr/bin/env node
// inspect_obfuscation_family — says WHAT stands between a file and its logic, by shape.
// Decided by structures each tool actually emits, not by magnitude thresholds (until v1.9.0 the
// litmus was "more than 500 hex identifiers", so every small obfuscator.io file read "unknown",
// and the self-defending counter looked for the word "debugger", which that option never emits).
//   string-table-obfuscation  javascript-obfuscator: a table function that rewrites itself into
//                              `return <array>`, or a top-level string array that is rotated or read
//                              by a lookup with `index = index - base`. Details: layout, key scheme
//   webpack-bundle             a map of module factories plus its bootstrap — webpack 4
//                              (`map[id].call(module.exports, module, module.exports, require)`, the
//                              map handed to the enclosing function as its argument) or webpack 5
//                              (`map[id](module, exports, require)`, a named map) — minified or not.
//                              details.webpack.entry_layout: in the map, or inlined after the
//                              bootstrap (webpack 5.9x+). chunk_loading: other modules are in chunk
//                              files this one loads at run time; chunk_calls names those asked for
//   webpack-chunk              such a file: `(self.webpackChunk=…).push([[245],{829(e){…}}])` — the
//                              modules of one chunk, no bootstrap, does nothing on its own
//   browserify-bundle          its bootstrap, or a map of `[function(require, module, exports)…, deps]`
//   eval-packer                the `eval(function(p,a,c,k,e,d){…})` shell (base 36 or 62)
//   numeric-ascii-vm-or-table, control-flow-flattening — kept from the old tool
//   unknown                    with what was checked, so "unknown" is a finding and not a blank
// Verified on real output (tests/unit/inspect-obfuscation-family.test.js): javascript-obfuscator
// 0.27.4 / 2.19.1 / 4.1.1 / 5.10.1 — plain, base64, and rc4 + flattening + dead code +
// self-defending — webpack 4.47 (production, development, a build with one dynamic import) and
// webpack 5.113 (production, development, ESM multi-module, a build with one dynamic import), one
// chunk file from each, browserify 17, a classic-packer payload, terser 5, plain source.
// NOT verified: parcel, rollup, esbuild; a chunk file holding several chunks or `[factory,
// deps]` pairs; output of webpack's `devtool: eval` (factories wrapped in eval). The
// self-defending marker was seen on 5.10.1 only.
// Usage: node scripts/inspect_obfuscation_family.js <input.js>
// Output: JSON — family; families (every match, most enabling first); details; signals (the old
// keys kept: plan_static_toolchain.js reads them); samples; next_tools; recommendations.
// Exit 0 for any readable file: "unknown" is an answer, not an error. 2 is usage.
// The scanning helpers are exported for scripts/unbundle.js.
const fs = require('fs');

function unescapeForMatching(code) {
  // so that markers written with \xNN / \uNNNN are seen; string contents themselves are not decoded
  return code.replace(/\\x([0-9a-fA-F]{2})/g, (m, h) => (parseInt(h, 16) === 10 ? '\\n' : String.fromCharCode(parseInt(h, 16))))
    .replace(/\\u([0-9a-fA-F]{4})/g, (m, h) => (parseInt(h, 16) === 10 ? '\\n' : String.fromCharCode(parseInt(h, 16))));
}
const count = (text, re) => (text.match(re) || []).length;
const uniq = (items) => [...new Set(items)];
const unquote = (id) => String(id).replace(/^['"]|['"]$/g, '');
const STR = '(?:"(?:[^"\\\\\\n]|\\\\.)*"|\'(?:[^\'\\\\\\n]|\\\\.)*\')';
const KEY = `(?:${STR}|[A-Za-z_$][\\w$]*|\\d+)`;
const IDENT = '[A-Za-z_$][\\w$]*';

// A `/` opens a regex literal unless the last significant character before it can end an
// expression (identifier, number, `]`, `}`) — or closes a control-flow head, after which a regex may.
function regexAllowed(text, i) {
  let j = i - 1;
  while (j >= 0 && /\s/.test(text[j])) j -= 1;
  if (j < 0) return true;
  const ch = text[j];
  if (ch === ')') return /\b(?:if|while|for|with)\s*\([^()]*\)\s*$/.test(text.slice(Math.max(0, j - 400), j + 1));
  if (ch === '}' || ch === ']') return false;
  if (/[\w$]/.test(ch)) return /\b(?:return|typeof|case|in|of|instanceof|delete|void|do|else|yield|await|throw|new)\s*$/.test(text.slice(Math.max(0, j - 12), j + 1));
  return true;
}

// what starts at text[i]: 'string' (quotes or backtick), 'line-comment', 'block-comment',
// 'regex' — or null when the character is ordinary code
function tokenAt(text, i) {
  const ch = text[i];
  const next = text[i + 1];
  if (ch === '"' || ch === '\'' || ch === '`') return 'string';
  if (ch === '/') {
    if (next === '/') return 'line-comment';
    if (next === '*') return 'block-comment';
    if (regexAllowed(text, i)) return 'regex';
  }
  return null;
}

// index just after the token starting at i
function skipToken(text, i) {
  const kind = tokenAt(text, i);
  const ch = text[i];
  if (kind === 'line-comment') { const e = text.indexOf('\n', i); return e === -1 ? text.length : e; }
  if (kind === 'block-comment') { const e = text.indexOf('*/', i + 2); return e === -1 ? text.length : e + 2; }
  if (kind === 'string') {
    for (let j = i + 1; j < text.length; j += 1) {
      if (text[j] === '\\') j += 1;
      else if (text[j] === ch) return j + 1;
    }
    return text.length;
  }
  for (let j = i + 1; j < text.length; j += 1) {
    if (text[j] === '\\') { j += 1; continue; }
    if (text[j] === '[') { j = text.indexOf(']', j); if (j === -1) return text.length; continue; }
    if (text[j] === '/') {
      j += 1;
      while (j < text.length && /[a-z]/.test(text[j])) j += 1;
      return j;
    }
  }
  return text.length;
}

// index of the bracket closing the one at `openAt`, or -1
function endOf(text, openAt, open, close) {
  let depth = 0;
  for (let i = openAt; i < text.length; i += 1) {
    if (tokenAt(text, i)) { i = skipToken(text, i) - 1; continue; }
    const ch = text[i];
    if (ch === open) depth += 1;
    else if (ch === close) { depth -= 1; if (depth === 0) return i; }
  }
  return -1;
}

// the members of a literal body (braces already removed), cut at the commas that are not nested;
// comments dropped, nothing blank left
function splitMembers(body) {
  const out = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < body.length; i += 1) {
    const kind = tokenAt(body, i);
    if (!kind) {
      const ch = body[i];
      if (ch === '(' || ch === '[' || ch === '{') depth += 1;
      else if (ch === ')' || ch === ']' || ch === '}') depth -= 1;
      else if (ch === ',' && depth === 0) { out.push(current); current = ''; continue; }
      current += ch;
      continue;
    }
    const after = skipToken(body, i);
    if (kind === 'string' || kind === 'regex') current += body.slice(i, after);
    i = after - 1;
  }
  out.push(current);
  return out.map((piece) => piece.trim()).filter(Boolean);
}

function stripComments(text) {
  let out = '';
  for (let i = 0; i < text.length; i += 1) {
    const kind = tokenAt(text, i);
    if (!kind) { out += text[i]; continue; }
    const after = skipToken(text, i);
    if (kind === 'string' || kind === 'regex') out += text.slice(i, after);
    i = after - 1;
  }
  return out;
}

// the same text with comments replaced by blanks of equal length: a pattern that has to hold
// across a comment can be run on it, and what it finds is at the same index in the original.
// webpack 4's development output puts a comment line between the bootstrap and its argument
function blankComments(text) {
  let out = '';
  for (let i = 0; i < text.length; i += 1) {
    const kind = tokenAt(text, i);
    if (!kind) { out += text[i]; continue; }
    const after = skipToken(text, i);
    if (kind === 'string' || kind === 'regex') out += text.slice(i, after);
    else out += text.slice(i, after).replace(/[^\n]/g, ' ');
    i = after - 1;
  }
  return out;
}

// [start, end) of every top-level member between the brackets at openAt / close — offsets into
// the ORIGINAL text, so that a member can be cut out and replaced; comments inside a member
// stay, slices that are blank or comment-only are dropped (same criterion as splitMembers)
function memberRanges(text, openAt, close) {
  const out = [];
  const push = (a, b) => {
    while (a < b && /\s/.test(text[a])) a += 1;
    while (b > a && /\s/.test(text[b - 1])) b -= 1;
    if (a < b && stripComments(text.slice(a, b)).trim()) out.push({ start: a, end: b });
  };
  let depth = 0;
  let start = openAt + 1;
  for (let i = openAt + 1; i < close; i += 1) {
    if (tokenAt(text, i)) { i = skipToken(text, i) - 1; continue; }
    const ch = text[i];
    if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    else if (ch === ')' || ch === ']' || ch === '}') depth -= 1;
    else if (ch === ',' && depth === 0) { push(start, i); start = i + 1; }
  }
  push(start, close);
  return out;
}

// what a function looks like at the start of a value
const FUNCTION_START = '(?:(?:async\\s+)?function\\b|\\([^()]*\\)\\s*=>|[A-Za-z_$][\\w$]*\\s*=>)';

// the parameter list of a function value — bare (`function (a, b) {`, arrow), or wrapped in
// parentheses the way webpack 4 writes its factories (`(function (module, exports, require) {…})`)
const FUNCTION_PARAMS = [
  { re: /^\(\s*(?:async\s+)?function\s*\(([^()]*)\)/, single: false },
  { re: /^\(\s*\(([^()]*)\)\s*=>/, single: false },
  { re: /^\s*(?:async\s+)?function\s*\(([^()]*)\)/, single: false },
  { re: /^\s*\(([^()]*)\)\s*=>/, single: false },
  { re: /^\s*([A-Za-z_$][\w$]*)\s*=>/, single: true },
];
function paramsOf(text) {
  for (const { re, single } of FUNCTION_PARAMS) {
    const hit = re.exec(text);
    if (hit) return single ? [hit[1]] : hit[1].split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

// what a member of a factory map holds
//   object: `id(params){…}` (method) | `id: function (…) {…}` (function; webpack 4 wraps it:
//           `id: (function (…) {…})`) — or something else
//   array:  `function (…) {…}` (function; webpack 4 wraps it: `(function (…) {…})`)
//           | `[function (…) {…}, {…dependencies…}]` (browserify pair)

// `(function (…) {…})` / `((a, b) => {…})`: the function inside its wrapping parentheses
function unwrapParens(text) {
  const inner = text.replace(/^\(\s*/, '');
  return new RegExp(`^${FUNCTION_START}`).test(inner) && /\)$/.test(inner) ? inner.replace(/\)$/, '') : text;
}
function classifyMember(member, literal) {
  const text = stripComments(member).trim();
  if (literal === 'array') {
    if (new RegExp(`^\\[\\s*${FUNCTION_START}`).test(text)) return { type: 'factory-with-map', key: null, params: [] };
    const value = unwrapParens(text);
    if (new RegExp(`^${FUNCTION_START}`).test(value)) return { type: 'function', key: null, params: paramsOf(value) };
    return { type: 'other', key: null };
  }
  const method = new RegExp(`^(${KEY})\\s*\\(([^()]*)\\)\\s*\\{`).exec(text);
  if (method) return { type: 'method', key: method[1], params: method[2].split(',').map((s) => s.trim()).filter(Boolean) };
  const prop = new RegExp(`^(${KEY})\\s*:\\s*`).exec(text);
  if (prop) {
    const rest = text.slice(prop[0].length);
    if (new RegExp(`^\\[\\s*${FUNCTION_START}`).test(rest)) return { type: 'factory-with-map', key: prop[1], params: [] };
    const value = unwrapParens(rest);
    if (new RegExp(`^${FUNCTION_START}`).test(value)) return { type: 'function', key: prop[1], params: paramsOf(value) };
  }
  return { type: 'other', key: (new RegExp(`^${KEY}`).exec(text) || [''])[0] };
}

// module ids are literals — a number or a quoted string; a bare identifier is a variable
const MODULE_ID = `(?:${STR}|\\d+)`;

// the innermost `{…}` block around `pos`
function enclosingBlock(text, pos) {
  const stack = [];
  for (let i = 0; i <= pos && i < text.length; i += 1) {
    if (tokenAt(text, i)) { i = skipToken(text, i) - 1; continue; }
    const ch = text[i];
    if (ch === '{') stack.push(i);
    else if (ch === '}' && stack.length) stack.pop();
  }
  if (!stack.length) return null;
  return { start: stack[stack.length - 1], end: endOf(text, stack[stack.length - 1], '{', '}') };
}

// when the block ending at `blockEnd` is a function body invoked with a literal — `…}([{…`,
// `…}([…)`, `…}({...})` — that literal's opening bracket. webpack 4 puts comment lines between
// the two (`/******/ })\n/****…/\n/******/ ({`), so blanks and comments are stepped over
function argumentLiteralOf(text, blockEnd) {
  let i = blockEnd + 1;
  const skipBlank = () => {
    for (;;) {
      while (i < text.length && /\s/.test(text[i])) i += 1;
      const kind = tokenAt(text, i);
      if (kind !== 'line-comment' && kind !== 'block-comment') return;
      i = skipToken(text, i);
    }
  };
  skipBlank();
  // `})…(` — the function was wrapped in parentheses, as webpack 4's development output does
  if (text[i] === ')') { i += 1; skipBlank(); }
  const m = /^\(\s*\(?[ \t\r\n]*([\[{])/.exec(text.slice(i, i + 80));
  if (!m) return null;
  return { openAt: i + m[0].length - 1, open: m[1] };
}

// `code` without the literals of its factory maps: what is left is the bundler's own code —
// bootstrap, runtime, start-up — so a name matches there only where the bundler wrote it
function outsideMaps(code, maps) {
  let out = '';
  let cursor = 0;
  for (const map of [...maps].sort((a, b) => a.openAt - b.openAt)) {
    if (map.openAt < cursor) continue;
    out += code.slice(cursor, map.openAt);
    cursor = map.close + 1;
  }
  return out + code.slice(cursor);
}

// the code that asks for chunk files at run time. All three are written by the bundler next to
// its bootstrap, never inside a module:
//   webpack 5   `req.e(245)` in the start-up code, and the loader `req.f.j = function (chunkId) {…}`
//   webpack 4   `req.e = function (chunkId) {…}`
function chunkLoading(outside, req) {
  const name = req.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const calls = uniq([...outside.matchAll(new RegExp(`\\b${name}\\s*\\.\\s*e\\s*\\(\\s*(${MODULE_ID})\\s*\\)`, 'g'))].map((hit) => unquote(hit[1])));
  const loader = new RegExp(`\\b${name}\\s*\\.\\s*(?:e\\s*=\\s*function\\b|f\\s*\\.\\s*j\\s*=)`).test(outside);
  return { present: calls.length > 0 || loader, calls, loader };
}

// Maps of module factories:
//   webpack    `var NAME = {…}` / `[…]` and the same without a name: every member is a function —
//              `id(params){…}`, `id: function (…) {…}`, `id: (function (…) {…})`, `function (…) {…}`,
//              `(function (…) {…})` — plus, optionally, a `{ c: "" }` slot
//   browserify a literal handed to a call: `…})()({1:[function(require, module, exports){…}, {…deps}], …}, {}, [entry])`
// A literal is a candidate when it follows `name =`, or `(` — a function invoked with it
function factoryMaps(code) {
  const maps = [];
  const blanked = blankComments(code);
  const re = new RegExp(`(?:\\b(?:const|let|var)\\s+(${IDENT})\\s*=\\s*|\\b(${IDENT})\\s*=\\s*|\\)\\s*\\(\\s*|\\}\\s*\\(\\s*)\\(?\\s*([\\[{])`, 'g');
  let m;
  while ((m = re.exec(blanked))) {
    const open = m[3];
    const openAt = m.index + m[0].length - 1;
    const close = endOf(code, openAt, open, open === '{' ? '}' : ']');
    if (close === -1) continue;
    const literal = open === '{' ? 'object' : 'array';
    const members = splitMembers(code.slice(openAt + 1, close));
    if (!members.length) { re.lastIndex = close + 1; continue; }
    const kinds = members.map((member) => classifyMember(member, literal));
    const factories = kinds.filter((k) => k.type === 'method' || k.type === 'function').length;
    const publicPathSlots = kinds.filter((k) => k.type === 'other' && k.key === 'c').length;
    const kind = kinds.every((k) => k.type === 'factory-with-map') ? 'browserify'
      : factories >= 1 && kinds.length - factories === publicPathSlots ? 'functions' : null;
    if (kind) maps.push({ kind, literal, name: m[1] || m[2] || null, openAt, close, members, kinds, count: factories || kinds.length });
    re.lastIndex = close + 1;   // literals nested inside one factory are not module maps
  }
  return maps;
}

// `function REQ(id){ … MAP[id](module, module.exports, REQ); … }` — webpack 5's bootstrap — or
// `… MAP[id].call(module.exports, module, module.exports, REQ); …`, webpack 4's. MAP is a map found
// above, or the identifier the bootstrap indexes. Two ways to tie them:
//   the map has that name (`var t = {…}` — webpack 5)
//   the map is the literal the enclosing function was invoked with (`!function (e) {…}([…])`:
//   the bootstrap indexes the parameter `e`, the factories are the argument — webpack 4)
function webpackBootstrap(code, maps) {
  const re = new RegExp(`\\bfunction\\s+(${IDENT})\\s*\\(\\s*(${IDENT})\\s*\\)\\s*\\{`, 'g');
  let m;
  while ((m = re.exec(code))) {
    const open = m.index + m[0].length - 1;
    const close = endOf(code, open, '{', '}');
    if (close === -1) continue;
    const body = code.slice(open + 1, close);
    const direct = new RegExp(`\\b(${IDENT})\\s*\\[\\s*${m[2]}\\s*\\]\\s*\\(\\s*${IDENT}\\s*,\\s*${IDENT}\\s*\\.\\s*exports\\s*,\\s*${m[1]}\\s*\\)`).exec(body);
    const called = new RegExp(`\\b(${IDENT})\\s*\\[\\s*${m[2]}\\s*\\]\\s*\\.\\s*call\\s*\\(\\s*${IDENT}\\s*(?:\\.\\s*exports)?\\s*,\\s*${IDENT}\\s*,\\s*${IDENT}\\s*\\.\\s*exports\\s*,\\s*${m[1]}\\s*\\)`).exec(body);
    const call = direct || called;
    if (!call) continue;
    let map = maps.find((candidate) => candidate.kind === 'functions' && candidate.name === call[1] && candidate.close < m.index) || null;
    let mapLayout = map ? 'named' : null;
    if (!map) {
      const block = enclosingBlock(code, m.index);
      const argument = block && block.end !== -1 ? argumentLiteralOf(code, block.end) : null;
      if (argument) {
        map = maps.find((candidate) => candidate.kind === 'functions' && candidate.openAt === argument.openAt) || null;
        if (map) mapLayout = 'iife-argument';
      }
    }
    // the code that runs after the bootstrap. webpack 4 hands the enclosing function its map as
    // the argument, and what the factories require is not start-up; so the map's literal is left
    // out. `req.s = id` names a mapped entry (webpack 4, older webpack 5); calls with a literal id
    // there are what an inlined entry requires (webpack 5.9x+ start-up code)
    const after = stripComments(map && map.openAt > close
      ? code.slice(close + 1, map.openAt) + code.slice(map.close + 1)
      : code.slice(close + 1));
    const marker = new RegExp(`\\b${m[1]}\\s*\\(\\s*${m[1]}\\s*\\.\\s*s\\s*=\\s*(${MODULE_ID})\\s*\\)`).exec(after);
    const startup = uniq([...after.matchAll(new RegExp(`\\b${m[1]}\\s*\\(\\s*(${MODULE_ID})\\s*\\)`, 'g'))].map((hit) => unquote(hit[1])));
    const chunks = chunkLoading(outsideMaps(code, maps), m[1]);
    // a harmony (ES module) factory registers its exports: `require.r(exports)` first, then
    // `require.d(exports, "name", …)`. webpack 4 defines those helpers in every bundle, CommonJS
    // sources or not, so only their calls inside a factory say the module is one
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const harmony = (map ? map.members : []).some((member, i) => {
      const req = map.kinds[i].params[2] || m[1];
      return new RegExp(`(?<![\\w$.])${esc(req)}\\s*\\.\\s*[rd]\\s*\\(`).test(stripComments(member));
    });
    return {
      require_function: m[1],
      parameter: m[2],
      // the name the bootstrap indexes: the map's own, or the parameter the IIFE receives it as
      module_map: (map && map.name) || call[1],
      map_layout: mapLayout,
      map,
      invocation: called && !direct ? 'call' : 'direct',
      module_count: map ? map.count : null,
      entry_marker: marker ? unquote(marker[1]) : null,
      startup_requires: startup.filter((id) => id !== (marker ? unquote(marker[1]) : null)),
      // other modules are in chunk files this bundle loads at run time —
      // details.webpack.chunk_calls and chunk_loader say how it asks for them
      chunk_loading: chunks.present,
      chunk_calls: chunks.calls,
      chunk_loader: chunks.loader,
      esm_modules: harmony,
      start: m.index,
      end: close + 1,
    };
  }
  return null;
}

// a webpack chunk file — the modules a bundle loads at run time, registered on a global array:
//   webpack 5   `(self.webpackChunk=self.webpackChunk||[]).push([[245],{829(e){…}, …}])`, newer
//               builds `(Array.isArray(self.webpackChunk)?self.webpackChunk:self.webpackChunk=[]).push(…)`
//   webpack 4   `(window.webpackJsonp=window.webpackJsonp||[]).push([[0],{3:function(n,o){…}}])`
// No bootstrap: it does nothing on its own. The map is an object of methods, or an array
function webpackChunkFile(code) {
  const push = new RegExp(`\\.push\\s*\\(\\s*\\[\\s*\\[\\s*((?:${MODULE_ID}\\s*,\\s*)*${MODULE_ID})\\s*\\]\\s*,\\s*([\\[{])`).exec(code);
  if (!push) return null;
  // the array `.push` is called on is the global: its name ends shortly before, and only the
  // fallback to `[]` and the closing parenthesis follow it
  const before = code.slice(Math.max(0, push.index - 240), push.index);
  const globalName = /webpack(?:Chunk|Jsonp)[\w$]*/.exec(before);
  if (!globalName || !/[^({]{0,40}\)\s*$/.test(before.slice(globalName.index + globalName[0].length))) return null;
  const open = push[2];
  const openAt = push.index + push[0].length - 1;
  const close = endOf(code, openAt, open, open === '{' ? '}' : ']');
  if (close === -1) return null;
  const literal = open === '{' ? 'object' : 'array';
  const members = splitMembers(code.slice(openAt + 1, close));
  const kinds = members.map((member) => classifyMember(member, literal));
  const factories = kinds.filter((k) => k.type === 'method' || k.type === 'function' || k.type === 'factory-with-map').length;
  if (!factories || factories !== kinds.length) return null;
  return {
    global: globalName[0].startsWith('webpackChunk') ? 'webpackChunk' : 'webpackJsonp',
    // as the file writes them: a number, or a quoted name (chunkIds: "named")
    chunk_ids: push[1].split(',').map((s) => (/^\d+$/.test(s.trim()) ? Number(s.trim()) : unquote(s.trim()))),
    literal, name: null, openAt, close, members, kinds, count: factories,
  };
}

function detectBundles(code) {
  const maps = factoryMaps(code);
  const bootstrap = webpackBootstrap(code, maps);
  const chunkFile = bootstrap ? null : webpackChunkFile(code);
  const browserifyMaps = maps.filter((map) => map.kind === 'browserify');
  const browserifyBootstrap = count(code, new RegExp(`\\(function\\(\\)\\{function ${IDENT}\\(\\s*${IDENT}\\s*,\\s*${IDENT}\\s*,\\s*${IDENT}\\s*\\)\\{function ${IDENT}\\(\\s*${IDENT}\\s*,\\s*${IDENT}\\s*\\)\\{`));
  const out = { factory_maps: maps.map((map) => ({ kind: map.kind, name: map.name, count: map.count })) };
  if (bootstrap) {
    const req = bootstrap.require_function;
    out.webpack = {
      require_function: req,
      module_map: bootstrap.module_map,
      map_layout: bootstrap.map_layout,
      bootstrap: bootstrap.invocation === 'call' ? 'webpack-4 (map[id].call(…))' : 'map[id](…)',
      module_count: bootstrap.module_count,
      entry_layout: bootstrap.entry_marker ? 'in-map' : bootstrap.startup_requires.length ? 'inlined-startup' : 'unknown',
      entry_marker: bootstrap.entry_marker,
      startup_requires: bootstrap.startup_requires,
      // more modules are in chunk files, loaded at run time: `req.e(<id>)` asks for one
      chunk_loading: bootstrap.chunk_loading,
      chunk_calls: bootstrap.chunk_calls,
      chunk_loader: bootstrap.chunk_loader,
      esm_modules: bootstrap.esm_modules,
      webpack_jsonp: /webpackJsonp|webpackChunk\w*/.test(code),
      confidence: bootstrap.module_count ? 'certain' : 'probable',
    };
  }
  if (chunkFile) {
    out.webpack_chunk = { global: chunkFile.global, chunk_ids: chunkFile.chunk_ids, module_count: chunkFile.count };
  }
  if (browserifyMaps.length || browserifyBootstrap > 0) {
    const first = browserifyMaps[0];
    out.browserify = {
      bootstrap: browserifyBootstrap,
      module_map: first ? first.name : null,
      module_count: first ? first.count : null,
    };
  }
  return { bundles: out, maps, bootstrap, chunkFile };
}

// The javascript-obfuscator table, by layout:
//   table function (every 2.x+ build) rewrites itself into `return <array>`
//   top-level array (0.x) — only a table when something rotates it or a lookup reads it by name
// plus a lookup whose body assigns `index = index - base`, and the rotation IIFE.
// The key scheme: rc4 schedules its key as `key[i % key.length]` — not "0xff appears somewhere".
function detectStringTable(raw, code) {
  const tableFunction = code.match(/function\s+([\w$]+)\s*\(\s*\)\s*\{[^{}]{0,120}?\b[\w$]+\s*=\s*\[\s*['"`][\s\S]{0,400000}?\b\1\s*=\s*function\s*\(\s*\)\s*\{[^{}]{0,80}?return\s+[\w$]+\s*;?\s*\}\s*;?\s*return\s+\1\s*\(\s*\)/);
  const topArray = raw.match(new RegExp(`(?:const|var|let)\\s+(${IDENT})\\s*=\\s*\\[\\s*(?:${STR}\\s*,\\s*){5,}`));
  const lookups = uniq([...code.matchAll(new RegExp(`\\bfunction\\s+(${IDENT})\\s*\\(\\s*${IDENT}\\s*,\\s*${IDENT}\\s*\\)\\s*\\{[\\s\\S]{0,400}?\\b(${IDENT})\\s*=\\s*\\2\\s*-\\s*`, 'g'))].map((hit) => hit[1]));
  let rotation = false;
  // the rotation count is a plain hex (`0x8d853`) or, with numbersToExpressions, arithmetic
  // (`0x60583*0x1+0xb92*0x26+-0x1*0x46a3e`): nothing nested, so no parentheses inside it
  for (const m of code.matchAll(/\(\s*function\s*\(\s*[\w$]+\s*,\s*[\w$]+\s*\)\s*\{[\s\S]{0,20000}?\}\s*\(\s*[\w$]+(?:\(\))?\s*,\s*[^()]{1,160}\)\s*\)/g)) {
    if (/[\[.]\s*['"]?(?:push)['"]?\s*\]?\s*\(/.test(m[0]) && /[\[.]\s*['"]?(?:shift)['"]?\s*\]?\s*\(/.test(m[0])) { rotation = true; break; }
  }
  const topArrayIsTable = Boolean(topArray) && (rotation || (lookups.length > 0 && new RegExp(`\\b${topArray[1]}\\s*\\[`).test(code)));
  const present = Boolean(tableFunction || topArrayIsTable);
  const rc4 = new RegExp(`(?:\\[\\s*['"]charCodeAt['"]\\s*\\]|\\.charCodeAt)\\s*\\(\\s*${IDENT}\\s*%\\s*${IDENT}\\s*(?:\\[\\s*['"]length['"]\\s*\\]|\\.length)\\s*\\)`).test(code);
  const base64 = /abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789\+\/=/.test(code);
  return {
    present,
    tool: present ? 'javascript-obfuscator' : null,
    layout: tableFunction ? 'table-function' : topArrayIsTable ? 'top-level-array' : null,
    table_function: tableFunction ? tableFunction[1] : null,
    top_level_array: topArrayIsTable ? topArray[1] : null,
    lookups,
    index_bases: count(code, new RegExp(`\\b(${IDENT})\\s*=\\s*\\1\\s*-\\s*`, 'g')),
    rotation_iife: rotation,
    key_scheme: rc4 ? 'rc4' : base64 ? 'base64' : present ? 'plain' : null,
    global_prefix: /\ba0_0x[0-9a-f]{4,}\b/.test(code) ? 'a0_0x' : /\b_0x[0-9a-f]{4,}\b/.test(code) ? '_0x' : null,
  };
}

// The classic shell, as every copy of that packer writes it:
//   eval(function(p,a,c,k,e,d){…}('<payload>', BASE, COUNT, '<words>'.split('|'),0,{}))
const PACKER_STRING = "('(?:[^'\\\\\\n]|\\\\.)*')";
function classicShell(code) {
  const head = /(?:^|[^\w$])eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*d\s*\)\s*\{/.exec(code);
  if (!head) return null;
  const offset = head.index + head[0].indexOf('eval');
  const pattern = new RegExp(`\\}\\s*\\(\\s*${PACKER_STRING}\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*${PACKER_STRING}\\s*\\.\\s*split\\s*\\(\\s*'\\|'\\s*\\)`);
  const call = pattern.exec(code.slice(offset));
  if (!call) return { offset, base: null, dictionary_size: null };
  return { offset, base: Number(call[2]), dictionary_size: Number(call[3]), payload_literal: call[1], words_literal: call[4] };
}

// Its unpacker is one fixed algorithm: every word goes back where its base-N token stands, from
// the last token to the first. That is arithmetic — the payload is read without running anything
// from the sample (decode_eval_wrapper.js needs its vm route only for other packers).
function classicUnpack(code) {
  const shell = classicShell(code);
  if (!shell || !shell.payload_literal) return null;
  // both operands are single-quoted string literals and nothing else (they were matched as
  // such), so reading their values cannot execute anything
  const value = (literal) => Function(`"use strict"; return (${literal});`)();
  const payload = value(shell.payload_literal);
  const words = String(value(shell.words_literal)).split('|');
  const tokenOf = (n) => (n < shell.base ? '' : tokenOf(Math.floor(n / shell.base))) + (((n %= shell.base) > 35) ? String.fromCharCode(n + 29) : n.toString(36));
  let decoded = payload;
  for (let c = shell.dictionary_size - 1; c >= 0; c -= 1) {
    if (words[c]) decoded = decoded.replace(new RegExp(`\\b${tokenOf(c)}\\b`, 'g'), words[c]);
  }
  return { ...shell, decoded };
}

function inspect(rawCode) {
  const code = unescapeForMatching(rawCode);
  const table = detectStringTable(rawCode, code);
  const { bundles } = detectBundles(code);
  const packer = count(rawCode, /(?:^|[^\w$])eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*d\s*\)\s*\{/g);
  const packerShell = packer > 0 ? classicShell(rawCode) : null;
  const packerBase = packerShell ? [null, String(packerShell.base)] : null;
  const legacySwitch = count(code, /while\s*\(\s*(?:true|!!\[\])\s*\)\s*\{[\s\S]{0,1200}?switch\s*\(/g);
  // javascript-obfuscator's flattening cuts the body into `obj[lookup(0x1, 'k')] = function (…) {…}` pieces
  const flattenedPieces = count(code, /\]\s*=\s*function\s*\(/g);
  const continueLabels = count(code, /\bcontinue\s+['"][A-Za-z]{1,12}['"]\s*;/g);
  const dispatchers = count(code, new RegExp(`\\{\\s*${STR}\\s*:\\s*function\\s*\\(\\s*\\)\\s*\\{`));
  const controlFlow = flattenedPieces >= 2 || legacySwitch > 0 || continueLabels > 0 || dispatchers >= 2;
  // a function reads its own source text and looks for a newline: the anti-beautify check
  const selfDefending = count(code, /\(\s*['"]{2}\s*\+\s*function\s*\(\s*\)\s*\{[^{}]{0,400}\}\s*\)\s*(?:\[\s*['"]indexOf['"]\s*\]|\.indexOf)\s*\(\s*['"]\\n['"]\s*\)/g);
  const numericAscii = count(code, /\d{1,3},\d{1,3},\d{1,3},\d{1,3}/g);
  const lines = rawCode.split('\n').length;

  const families = [];
  if (packer > 0) families.push('eval-packer');
  if (table.present) families.push('string-table-obfuscation');
  if (bundles.browserify) families.push('browserify-bundle');
  if (bundles.webpack) families.push('webpack-bundle');
  if (bundles.webpack_chunk) families.push('webpack-chunk');
  if (controlFlow) families.push('control-flow-flattening');
  else if (numericAscii > 8) families.push('numeric-ascii-vm-or-table');
  const family = families[0] || 'unknown';

  const hexIndexed = count(code, /\b(?:[_$A-Za-z][\w$]*)?_0x[0-9a-f]{4,8}\s*\(\s*(?:['"](?:0x[0-9a-f]+|\d+)['"]|0x[0-9a-f]+|\d+)\s*[,)]/g);
  const callers = table.lookups.length
    ? uniq([...code.matchAll(new RegExp(`\\bfunction\\s+(${IDENT})\\s*\\([^)]*\\)\\s*\\{[\\s\\S]{0,400}?\\b(?:${table.lookups.join('|')})\\s*\\(`, 'g'))].map((hit) => hit[1])).slice(0, 12)
    : [];

  const nextTools = [];
  if (packer > 0) nextTools.push({ script: 'scripts/decode_eval_wrapper.js', why: 'unpack the eval shell first — nothing inside is visible until then' });
  if (table.present) {
    nextTools.push({ script: 'scripts/recover_string_table.js', why: 'string tables through webcrack (Node 22 or 24); exit 1 means the table is still there' });
    if (table.key_scheme === 'plain' || table.key_scheme === 'base64') nextTools.push({ script: 'scripts/decode_string_array_runtime.js', why: `a ${table.key_scheme} table, on any Node, with no install` });
  }
  // unbundle.js writes a tree that runs like the bundle; for one that loads chunks at run time
  // it could not, so it is not offered here — and refuses them itself. A chunk file it splits
  // for reading: no bootstrap, so there is nothing that could "run like" it
  const bundleToSplit = bundles.browserify ? 'browserify' : bundles.webpack && !bundles.webpack.chunk_loading ? 'webpack' : null;
  if (bundleToSplit) nextTools.push({ script: 'scripts/unbundle.js', why: `${bundleToSplit} module map → one file per module, a runnable tree` });
  if (!bundleToSplit && bundles.webpack_chunk) {
    nextTools.push({ script: 'scripts/unbundle.js', why: 'a webpack chunk file → one file per module, to read; it has no bootstrap and does nothing on its own' });
  }
  if (families.length && families.every((f) => f === 'string-table-obfuscation' || f === 'control-flow-flattening')) {
    nextTools.push({ script: 'scripts/run_ast_pipeline.js', why: 'once no lookup is left: recover_string_table.js exited 0' });
  }

  return {
    family,
    families,
    details: {
      eval_packer: packer > 0 ? { shells: packer, base: packerShell ? packerShell.base : null, dictionary_size: packerShell ? packerShell.dictionary_size : null, offset: packerShell ? packerShell.offset : null } : null,
      string_table: table.present ? table : null,
      webpack: bundles.webpack || null,
      webpack_chunk: bundles.webpack_chunk || null,
      browserify: bundles.browserify || null,
      control_flow: controlFlow ? { flattened_pieces: flattenedPieces, while_switch_dispatchers: legacySwitch, continue_labels: continueLabels, dispatch_objects: dispatchers } : null,
      self_defending: selfDefending > 0 ? { markers: selfDefending, marker_verified_on: 'javascript-obfuscator 5.10.1' } : false,
      hex_literals_in_expressions: count(code, /0x[0-9a-f]+\s*[*+-]/g),
      looks_minified: lines <= 4 && rawCode.length / lines >= 120,
      line_length_average: Math.round(rawCode.length / Math.max(1, lines)),
    },
    // the old counters, same keys: plan_static_toolchain.js reads them
    signals: {
      hex_var_count: count(code, /\b(?:a0)?_0x[0-9a-f]+\b/g),
      hex_dispatch_calls: hexIndexed,
      while_switch_dispatchers: legacySwitch,
      self_defending_markers: selfDefending,
      string_array_hints: count(code, /\[[^\]]*['"][^'"]{2,}['"][^\]]*\]/g),
      numeric_ascii_chunks: numericAscii,
      browserify_bootstrap: bundles.browserify ? bundles.browserify.bootstrap : 0,
    },
    samples: {
      hex_vars: uniq([...code.matchAll(/\b((?:a0)?_0x[0-9a-f]{4,})\b/g)].map((hit) => hit[1])).slice(0, 30),
      string_table: table.present ? { table_function: table.table_function, top_level_array: table.top_level_array, lookups: table.lookups, callers } : null,
      factory_maps: bundles.factory_maps,
    },
    next_tools: nextTools,
    recommendations: nextTools.map((tool) => `${tool.script} — ${tool.why}`),
    checked: family === 'unknown'
      ? ['string table: table function, top-level array, lookup with a base, rotation IIFE', 'bundle: webpack / browserify module maps and bootstraps', 'eval packer shell', 'control flow: flattened pieces, dispatch objects, while+switch, labelled continue', 'numeric ASCII runs']
      : undefined,
  };
}

module.exports = {
  inspect, unescapeForMatching, tokenAt, skipToken, endOf, splitMembers, stripComments, blankComments, unwrapParens,
  classifyMember, paramsOf, factoryMaps, webpackBootstrap, webpackChunkFile, detectBundles, detectStringTable,
  memberRanges, KEY, IDENT, STR, MODULE_ID, unquote, enclosingBlock, argumentLiteralOf, outsideMaps,
  classicShell, classicUnpack,
};

if (require.main === module) {
  const file = process.argv[2];
  if (!file || process.argv.length !== 3) {
    console.error('Usage: inspect_obfuscation_family.js <input.js>');
    process.exit(2);
  }
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    console.error(`inspect_obfuscation_family: cannot read ${file} — ${err.message}`);
    process.exit(2);
  }
  console.log(JSON.stringify({ file, ...inspect(raw) }, null, 2));
}
