#!/usr/bin/env node
// inspect_obfuscation_family — says WHAT stands between a file and its logic, by shape.
// Decided by structures each tool actually emits, not by magnitude thresholds (until v1.9.0 the
// litmus was "more than 500 hex identifiers", so every small obfuscator.io file read "unknown",
// and the self-defending counter looked for the word "debugger", which that option never emits).
//   string-table-obfuscation  javascript-obfuscator: a table function that rewrites itself into
//                              `return <array>`, or a top-level string array that is rotated or read
//                              by a lookup with `index = index - base`. Details: layout, key scheme
//   webpack-bundle             webpack 4 / 5, single chunk: a map of module factories plus the
//                              `map[id](module, exports, require)` bootstrap — minified or not.
//                              The entry sits in that map, or (webpack 5.9x+) is inlined after the
//                              bootstrap: details.webpack.entry_layout says which
//   browserify-bundle          its bootstrap, or a map of `[function(require, module, exports)…, deps]`
//   eval-packer                the `eval(function(p,a,c,k,e,d){…})` shell (base 36 or 62)
//   numeric-ascii-vm-or-table, control-flow-flattening — kept from the old tool
//   unknown                    with what was checked, so "unknown" is a finding and not a blank
// Verified on real output (tests/unit/inspect-obfuscation-family.test.js): javascript-obfuscator
// 0.27.4 / 2.19.1 / 4.1.1 / 5.10.1 — plain, base64, and rc4 + flattening + dead code +
// self-defending — webpack 5.113 (production, development, ESM multi-module), browserify 17, a
// classic-packer payload, terser 5, plain source. NOT verified: webpack 4, multi-chunk webpack,
// parcel, rollup. The self-defending marker was seen on 5.10.1 only.
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

const FUNCTION_START = '(?:(?:async\\s+)?function\\b|\\([^()]*\\)\\s*=>|[A-Za-z_$][\\w$]*\\s*=>)';

// what a member of a factory map holds
//   object: `id(params){…}` (method) | `id: function (…) {…}` (function) — or something else
//   array:  `function (…) {…}` (function) | `[function (…) {…}, {…dependencies…}]` (browserify pair)
function classifyMember(member, literal) {
  const text = stripComments(member).trim();
  if (literal === 'array') {
    if (new RegExp(`^\\[\\s*${FUNCTION_START}`).test(text)) return { type: 'factory-with-map', key: null, params: [] };
    if (new RegExp(`^${FUNCTION_START}`).test(text)) return { type: 'function', key: null, params: [] };
    return { type: 'other', key: null };
  }
  const method = new RegExp(`^(${KEY})\\s*\\(([^()]*)\\)\\s*\\{`).exec(text);
  if (method) return { type: 'method', key: method[1], params: method[2].split(',').map((s) => s.trim()).filter(Boolean) };
  const prop = new RegExp(`^(${KEY})\\s*:\\s*(\\[\\s*)?${FUNCTION_START}`).exec(text);
  if (prop) return { type: prop[2] ? 'factory-with-map' : 'function', key: prop[1], params: [] };
  return { type: 'other', key: (new RegExp(`^${KEY}`).exec(text) || [''])[0] };
}

// Maps of module factories:
//   webpack    `var NAME = {…}` / `[…]`: every member is a function — `id(params){…}`,
//              `id: function (…) {…}`, `function (…) {…}` — plus, optionally, a `{ c: "" }` slot
//   browserify a literal handed to a call: `…})()({1:[function(require, module, exports){…}, {…deps}], …}, {}, [entry])`
function factoryMaps(code) {
  const maps = [];
  const re = new RegExp(`(?:\\b(?:const|let|var)\\s+(${IDENT})\\s*=\\s*|\\b(${IDENT})\\s*=\\s*|\\)\\s*\\(\\s*)\\(?\\s*([\\[{])`, 'g');
  let m;
  while ((m = re.exec(code))) {
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

// `function REQ(id){ … MAP[id](module, module.exports, REQ); … }` — the one shape the webpack 4
// and 5 bootstraps keep, minified or not. MAP may be a map found above (then the count is known)
// or simply the identifier the bootstrap indexes.
function webpackBootstrap(code, maps) {
  const re = new RegExp(`\\bfunction\\s+(${IDENT})\\s*\\(\\s*(${IDENT})\\s*\\)\\s*\\{`, 'g');
  let m;
  while ((m = re.exec(code))) {
    const open = m.index + m[0].length - 1;
    const close = endOf(code, open, '{', '}');
    if (close === -1) continue;
    const body = code.slice(open + 1, close);
    const call = new RegExp(`\\b(${IDENT})\\s*\\[\\s*${m[2]}\\s*\\]\\s*\\(\\s*${IDENT}\\s*,\\s*${IDENT}\\s*\\.\\s*exports\\s*,\\s*${m[1]}\\s*\\)`).exec(body);
    if (!call) continue;
    const map = maps.find((candidate) => candidate.kind === 'functions' && candidate.name === call[1] && candidate.close < m.index) || null;
    // the code that runs after the bootstrap. `req.s = id` names a mapped entry; calls to
    // mapped ids there are what an inlined entry requires (webpack 5.9x+ start-up code)
    const after = stripComments(code.slice(close + 1));
    const marker = new RegExp(`\\b${m[1]}\\s*\\(\\s*${m[1]}\\s*\\.\\s*s\\s*=\\s*(${KEY})\\s*\\)`).exec(after);
    const startup = uniq([...after.matchAll(new RegExp(`\\b${m[1]}\\s*\\(\\s*(${KEY})\\s*\\)`, 'g'))].map((hit) => unquote(hit[1])));
    return {
      require_function: m[1],
      parameter: m[2],
      module_map: map ? map.name : call[1],
      module_count: map ? map.count : null,
      entry_marker: marker ? unquote(marker[1]) : null,
      startup_requires: startup.filter((id) => id !== (marker ? unquote(marker[1]) : null)),
      cache_shape: /=\s*\{\s*(?:(?:id|loaded|exports)\s*:[^{}]{1,40},?\s*){1,3}\}/.test(body),
      start: m.index,
      end: close + 1,
    };
  }
  return null;
}

function detectBundles(code) {
  const maps = factoryMaps(code);
  const bootstrap = webpackBootstrap(code, maps);
  const browserifyMaps = maps.filter((map) => map.kind === 'browserify');
  const browserifyBootstrap = count(code, new RegExp(`\\(function\\(\\)\\{function ${IDENT}\\(\\s*${IDENT}\\s*,\\s*${IDENT}\\s*,\\s*${IDENT}\\s*\\)\\{function ${IDENT}\\(\\s*${IDENT}\\s*,\\s*${IDENT}\\s*\\)\\{`));
  const out = { factory_maps: maps.map((map) => ({ kind: map.kind, name: map.name, count: map.count })) };
  if (bootstrap) {
    const req = bootstrap.require_function;
    out.webpack = {
      require_function: req,
      module_map: bootstrap.module_map,
      module_count: bootstrap.module_count,
      entry_layout: bootstrap.entry_marker ? 'in-map' : bootstrap.startup_requires.length ? 'inlined-startup' : 'unknown',
      entry_marker: bootstrap.entry_marker,
      startup_requires: bootstrap.startup_requires,
      esm_modules: new RegExp(`\\b${req}\\s*\\.\\s*[dnor]\\s*\\(`).test(code) || new RegExp(`\\.[dnor]\\s*=\\s*(?:\\(?${IDENT}\\)?\\s*=>|function)`).test(code),
      webpack_jsonp: /webpackJsonp|webpackChunk\w*/.test(code),
      confidence: bootstrap.module_count ? 'certain' : 'probable',
    };
  }
  if (browserifyMaps.length || browserifyBootstrap > 0) {
    const first = browserifyMaps[0];
    out.browserify = {
      bootstrap: browserifyBootstrap,
      module_map: first ? first.name : null,
      module_count: first ? first.count : null,
    };
  }
  return { bundles: out, maps, bootstrap };
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
  for (const m of code.matchAll(/\(\s*function\s*\(\s*[\w$]+\s*,\s*[\w$]+\s*\)\s*\{[\s\S]{0,20000}?\}\s*\(\s*[\w$]+(?:\(\))?\s*,\s*(?:0x[0-9a-f]+|\d+)\s*\)\s*\)/g)) {
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
  if (bundles.webpack || bundles.browserify) nextTools.push({ script: 'scripts/unbundle.js', why: `${bundles.webpack ? 'webpack' : 'browserify'} module map → one file per module, a runnable tree` });
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
  inspect, unescapeForMatching, tokenAt, skipToken, endOf, splitMembers, stripComments,
  classifyMember, factoryMaps, webpackBootstrap, detectBundles, detectStringTable, memberRanges, KEY, IDENT, unquote,
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
