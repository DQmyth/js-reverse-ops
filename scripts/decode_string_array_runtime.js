#!/usr/bin/env node
// decode_string_array_runtime — runs the sample's own table code (string array + rotation
// IIFE + lookup) in a stubbed Node vm and prints index -> value. Dependency-free, any Node.
//   OK  tables with no per-call key: plain strings, base64. Verified on real javascript-obfuscator
//       output 0.27.4 (array at the top level) and 2.19.1 / 4.1.1 / 5.10.1 (array wrapped in a
//       table function) — tests/unit/decode-string-array-runtime.test.js, samples included.
//   NO  rc4 tables: the key sits at each call site, not in the table, so an index-only dump
//       would be plausible garbage. Detected by behaviour (two fresh sandboxes answer the same
//       index differently under two keys — one sandbox would not, the lookup caches by index)
//       and refused with exit 1; use scripts/recover_string_table.js (webcrack) there.
//   NO  a table that cannot be isolated from the program (one wrapper IIFE around everything,
//       as in the live 127 KB bundle tried): running the table would run the program, so this tool
//       refuses with exit 1; scripts/recover_string_table.js (webcrack) handles that one.
//   NO  packed / eval / proxy-function layouts: the lookup must be a plain two-argument function
//       with an `index = index - base` assignment.
// Until v1.8.5 this header claimed immunity to every string-table variant. The tool then decoded
// nothing on any real obfuscator output tried (v2.19 / v4.1 / v5.10 and that live bundle): its
// lookup pattern demanded a doubled "(" and so matched only `NAME = function (a, b)`, never the
// `function NAME(a, b)` every release from 2.x on emits; it ran everything up to the lookup, i.e.
// the program's own top-level code; and it dumped from index 0, where real tables (base 0x132 and
// up) throw. Its tests used hand-written samples only.
// SECURITY: table code from the sample is EXECUTED in Node's `vm`, which is not a security
// boundary. Point it at a sample you trust, or inside a container.
// Usage:
//   node scripts/decode_string_array_runtime.js <input.js> --indexes 0xd,0x26
//   node scripts/decode_string_array_runtime.js <input.js> --dump [--max 512]
//   node scripts/decode_string_array_runtime.js <input.js> --known 0x4e=slug  (assert)
// Output: one `0xNN = value` line per index (values base64-decoded when the raw lookup result
// still looks like base64), or JSON with --json. Exit 0 decoded; 1 not decoded, the reason on
// stderr; 2 usage.
//
// Method (recorded case: a gated API whose POST field was the deliberately
// misspelled `signture` and whose md5 separator was `spiderbuf` — recoverable
// only from the table, never by guessing):
//   1. locate the string array: one array literal holding >=15 string literals
//   2. note the function that wraps it, if any: from 2.x on the lookup calls that
//      function instead of naming the array
//   3. locate the lookup: a two-argument function that names the array or its wrapper
//      and assigns `index = index - base`
//   4. run ONLY the top-level statements that name the array, the wrapper or the lookup
//      — and stop unless what is left, minus the array itself, is small: the table
//      machinery, not the program — in a vm sandbox with DOM/timers stubbed and
//      anti-debug neutered, calling the lookup in the SAME scope
//   5. find where the table starts (the first index the lookup answers for), refuse the
//      table if a second key changes that answer in a second sandbox, then dump from
//      there; the rotation already ran for real, so no calibration beyond that
const fs = require('fs');
const vm = require('vm');

const argv = process.argv.slice(2);
const file = argv[0];
const argOf = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const WANT_JSON = argv.includes('--json');
const DUMP = argv.includes('--dump');
const MAX = Number(argOf('--max', '512'));   // NaN for a typo like `--max abc`: must not read as "nothing decoded"
const IDX = argOf('--indexes', '');
const KNOWN = argOf('--known', '');
const KEY = argOf('--key', 'k');   // the second lookup argument: the per-call key of rc4 tables, "k" by default

const say = (text) => fs.writeSync(2, `${text}\n`);
const finish = (code) => process.exit(code);   // explicit: code the sample ran may leave handles behind

if (!file || (!IDX && !DUMP && !KNOWN)) {
  say('usage: decode_string_array_runtime.js <input.js> (--indexes 0xd,0x26 | --dump [--max N]) [--known 0xNN=value] [--key TEXT] [--json]');
  finish(2);
}
for (let i = 1; i < argv.length; i += 1) {
  const flag = argv[i];
  const takesValue = ['--max', '--known', '--indexes', '--key'].includes(flag);
  if (takesValue && argv[i + 1] !== undefined) { i += 1; continue; }
  if (takesValue || !['--json', '--dump'].includes(flag)) {
    say(`unknown or incomplete option: ${flag}`);
    finish(2);
  }
}
if (!Number.isInteger(MAX) || MAX < 1) { say('--max needs a positive integer'); finish(2); }
if (!fs.existsSync(file)) { say('no such file: ' + file); finish(1); }
const src = fs.readFileSync(file, 'utf8');

// --- 1. find the string array declaration: an array literal of >=15 string literals ---
const STR = "(?:'(?:[^'\\\\\\n]|\\\\.)*'|\"(?:[^\"\\\\\\n]|\\\\.)*\")";
const arrRe = new RegExp(`(?:const|var|let)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*\\[(?:\\s*${STR}\\s*,){14,}`);
const arrM = src.match(arrRe);
if (!arrM) { say('string array not found (need an array literal with >=15 string literals)'); finish(1); }
const ARR = arrM[1];

// string-aware scan from `i`: returns the next position that is code — it steps over quoted
// strings, escapes and comments, so a "{" inside a string does not count
function skipNonCode(i) {
  let quote = '';
  let escaped = false;
  let inLine = false;
  let inBlock = false;
  for (; i < src.length; i += 1) {
    const ch = src[i];
    const next = src[i + 1];
    if (inLine) { if (ch === '\n') inLine = false; continue; }
    if (inBlock) { if (ch === '*' && next === '/') { inBlock = false; i += 1; } continue; }
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '/' && next === '/') { inLine = true; i += 1; continue; }
    if (ch === '/' && next === '*') { inBlock = true; i += 1; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    break;
  }
  return i;
}

// index of the `}` that closes the `{` at `from`, or -1
function endOfBody(from) {
  let depth = 0;
  for (let i = from; i < src.length; i += 1) {
    i = skipNonCode(i);
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') { depth -= 1; if (depth === 0) return i; }
  }
  return -1;
}

// the top-level statements of the source: cut after every ";" at brace depth 0, and after the
// "}" that closes a `function NAME(…) {…}` declaration (those carry no ";")
function topLevelStatements() {
  const out = [];
  let start = 0;
  let depth = 0;
  let declaration = false;
  for (let i = 0; i < src.length; i += 1) {
    i = skipNonCode(i);
    const ch = src[i];
    if (ch === '{') {
      if (depth === 0) declaration = /^\s*function\b/.test(src.slice(start, i));
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth <= 0) {
        depth = 0;
        if (declaration) { out.push({ text: src.slice(start, i + 1), start, end: i + 1 }); start = i + 1; declaration = false; }
      }
    } else if (ch === ';') {
      if (depth === 0) { out.push({ text: src.slice(start, i + 1), start, end: i + 1 }); start = i + 1; declaration = false; }
    }
  }
  if (start < src.length) out.push({ text: src.slice(start), start, end: src.length });
  return out.filter((piece) => piece.text.trim());
}

// --- 2. the function the array sits in, if it is not at the top level: the nearest
// `function NAME(…) {…}` whose braces contain the array ---
function enclosingFunction(pos) {
  let at = src.lastIndexOf('function', pos);
  while (at !== -1) {
    const named = /^function\s+([A-Za-z_$][\w$]*)\s*\(/.exec(src.slice(at, at + 120));
    if (named) {
      const open = src.indexOf('{', at + named[0].length);
      const end = open === -1 ? -1 : endOfBody(open);
      if (open !== -1 && end !== -1 && end > pos) return { name: named[1] };
    }
    at = src.lastIndexOf('function', at - 1);
  }
  return null;
}
const WRAP = enclosingFunction(arrM.index);

// --- 3. find the lookup: a two-argument function that names the array or its wrapper and
// assigns `index = index - base` (the assignment every javascript-obfuscator lookup carries; a
// plain helper that merely indexes the array does not have it) ---
const LOOKUP_NAME = '(?:function\\s+([A-Za-z_$][\\w$]*)\\s*|([A-Za-z_$][\\w$]*)\\s*=\\s*function\\s*)\\(\\s*[A-Za-z_$][\\w$]*\\s*,\\s*[A-Za-z_$][\\w$]*\\s*\\)';
const BASE_ASSIGNED = /\b([A-Za-z_$][\w$]*)\s*=\s*\1\s*-/;
const anyLookup = new RegExp(LOOKUP_NAME, 'g');
const word = (id) => new RegExp(`\\b${id}\\b`);
const namesTable = (body) => word(ARR).test(body) || Boolean(WRAP && word(WRAP.name).test(body));
let lookupName = null;
let candidates = 0;
let m;
while ((m = anyLookup.exec(src))) {
  const open = src.indexOf('{', m.index + m[0].length - 1);
  const close = open < 0 ? -1 : endOfBody(open);
  if (close === -1) continue;
  const body = src.slice(open, close + 1);
  if (!namesTable(body)) continue;
  candidates += 1;
  if (BASE_ASSIGNED.test(body)) {
    // prefer the EARLIEST such function (the primary lookup)
    lookupName = m[1] || m[2];
    break;
  }
}
if (!lookupName) {
  const found = candidates ? `${candidates} two-arg function(s) name it, none assigns "index = index - base"` : 'no two-arg function names it';
  say(`no lookup found for array ${ARR}${WRAP ? ` (or its wrapper ${WRAP.name})` : ''}: ${found}`);
  finish(1);
}

// --- 4. only the top-level statements that name the array, the wrapper or the lookup ---
// "Everything up to the lookup" would run the program's own top-level code on the way
// (`module[...] = {...}` sits before the lookup in current builds). And when the program is
// nested in one wrapper statement with the table, what is left IS the program: refuse that.
const machinery = new RegExp(`\\b(?:${[ARR, WRAP && WRAP.name, lookupName].filter(Boolean).join('|')})\\b`);
const kept = topLevelStatements().filter((piece) => machinery.test(piece.text));
const head = kept.map((piece) => piece.text).join('\n');
// the array itself can be tens of KB; what must stay small is everything else that was kept
const ARRAY_START = src.indexOf('[', arrM.index + ARR.length);
let ARRAY_END = -1;
for (let i = ARRAY_START, depth = 0; i >= 0 && i < src.length; i += 1) {
  i = skipNonCode(i);
  if (src[i] === '[') depth += 1;
  else if (src[i] === ']') { depth -= 1; if (depth === 0) { ARRAY_END = i + 1; break; } }
}
const bulk = head.length - Math.max(0, ARRAY_END - ARRAY_START);
if (bulk > 32768) {
  say(`not run: the table cannot be isolated from the rest of the file. ${Math.round(bulk / 1024)} KB of other code share top-level statements with it (a wrapper IIFE around the program?), so running the table would run the program inside Node's vm. scripts/recover_string_table.js (webcrack) evaluates the sample inside isolated-vm; use that.`);
  finish(1);
}

// --- 5. the probe ---
const wanted = IDX ? IDX.split(',').map((s) => s.trim()).filter(Boolean) : null;

// every run gets a fresh sandbox: the lookup caches answers by index, so "does a second key
// change the answer?" can only be asked of a run that has not seen the first key
function sandbox() {
  const noop = () => {};
  const stubModule = { exports: {} };
  const box = {
    console: { log: noop, warn: noop, error: noop, info: noop, debug: noop, trace: noop, table: noop, dir: noop, exception: noop, clear: noop },
    atob: (s) => Buffer.from(String(s), 'base64').toString('binary'),
    btoa: (s) => Buffer.from(String(s), 'binary').toString('base64'),
    decodeURIComponent, encodeURIComponent,
    parseInt, parseFloat, isNaN, String, Number, Boolean, Array, Object, JSON, Math, Date, RegExp, Function, Error, TypeError,
    setTimeout: () => 0, setInterval: () => 0, clearTimeout: noop, clearInterval: noop,
    process: { exit: noop },
    module: stubModule, exports: stubModule.exports, require: Object.assign(() => ({}), { main: {} }),
    navigator: { userAgent: 'decode_string_array_runtime' },
    document: { addEventListener: noop, getElementById: () => null, querySelector: () => null, cookie: '', createElement: () => ({ style: {}, appendChild: noop, setAttribute: noop }) },
    location: { href: 'https://example.test/' },
    performance: { now: () => 0 },
  };
  box.window = box; box.self = box; box.globalThis = box; box.top = box; box.parent = box;
  return vm.createContext(box);
}

// mode 'ask' : the answer for ONE index under KEY (string or null)
// mode 'dump': the requested indexes, else from the first index that answers, up to MAX entries
function run(mode, key, index) {
  // source text: one call of the lookup under KEY, answering a string or null
  const CALL = `(k) => { try { const v = ${lookupName}(k, KEY); return (typeof v === 'string' && v !== '') ? v : null; } catch (e) { return null; } }`;
  const callAt = (indexSource) => `(${CALL})(${indexSource})`;
  const body = mode === 'ask'
    ? `return ${callAt(JSON.stringify(index))};`
    : `
    const idxs = ${JSON.stringify(wanted)};
    if (idxs) {
      const out = {}; let first = null;
      for (const k of idxs) { const v = ${callAt('k')}; if (v !== null) { out[k] = v; if (!first) first = k; } }
      return { out, first };
    }
    // the first index the lookup answers for is where the table starts
    let base = -1;
    for (let i = 0; i < 0x10000 && base === -1; i += 1) { if (${callAt(`'0x' + i.toString(16)`)} !== null) base = i; }
    if (base === -1) return { out: {}, first: null };
    const out = {}; let misses = 0;
    for (let i = base; i < 0x100000 && Object.keys(out).length < ${MAX}; i += 1) {
      const v = ${callAt(`'0x' + i.toString(16)`)};
      if (v === null) { misses += 1; if (misses >= 0x40) break; } else { out['0x' + i.toString(16)] = v; misses = 0; }
    }
    return { out, first: '0x' + base.toString(16) };`;
  // head and probe share one script, so the head's top-level declarations are in the probe's scope
  const script = `const KEY = ${JSON.stringify(key)};\n${head}\n;(function () {${body}})()`;
  return vm.runInContext(script, sandbox(), { timeout: 8000, filename: 'string-array-head' });
}

let dump;
try {
  dump = run('dump', KEY);
} catch (e) {
  say(`vm execution failed: ${String(e && e.message).slice(0, 160)}`);
  finish(1);
}
if (!dump || !dump.first) {
  say(`nothing decoded: lookup ${lookupName} answered no index${wanted ? ` among ${wanted.join(',')}` : ' below 0x10000'}${KEY === 'k' ? '' : ` under key ${JSON.stringify(KEY)}`}`);
  finish(1);
}
let second;
try {
  // the second key must not be a repetition of the first: RC4 cycles the key bytes, so "k" and
  // "kk" are ONE key (observed: a rc4 table passed a "k" / "kk" comparison and dumped garbage)
  second = run('ask', `z${KEY}w`, dump.first);
} catch (e) {
  say(`vm execution failed on the second run: ${String(e && e.message).slice(0, 160)}`);
  finish(1);
}
if (second !== dump.out[dump.first]) {
  say('rc4 string table: the key is passed at each call site and is not part of the table, so an index-only dump would be garbage — use scripts/recover_string_table.js (webcrack)');
  finish(1);
}
const table = dump.out;

// values that still look like pure base64 get a decoded companion
const maybeDecode = (v) => {
  if (/^[A-Za-z0-9+/]{4,}={0,2}$/.test(v)) {
    try {
      const d = Buffer.from(v, 'base64').toString('utf8');
      if (d && /^[\x20-\x7e\u4e00-\u9fff]{2,}$/.test(d)) return d;
    } catch (e) {}
  }
  return null;
};
const rows = {};
for (const [k, v] of Object.entries(table)) {
  const d = maybeDecode(v);
  rows[k] = d !== null ? `${d}   (raw: ${v})` : v;
}

// --- 6. optional assertion against a known mapping ---
if (KNOWN) {
  const [k, want] = KNOWN.split('=');
  const got = (rows[k] || '').split('   (raw:')[0];
  if (got !== want) {
    say(`--known assertion failed: ${k} = ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);
    finish(1);
  }
}

if (WANT_JSON) {
  fs.writeSync(1, JSON.stringify({ file, array: ARR, wrapper: WRAP ? WRAP.name : null, lookup: lookupName, values: rows }, null, 2) + '\n');
} else {
  say(`array=${ARR} wrapper=${WRAP ? WRAP.name : '-'} lookup=${lookupName} headBytes=${head.length}`);
  const keys = Object.keys(rows).sort((a, b) => parseInt(a) - parseInt(b));
  const lines = keys.map((k) => `${k} = ${rows[k]}`);
  fs.writeSync(1, lines.join('\n') + (lines.length ? '\n' : ''));
  say(`${keys.length} entries decoded`);
}
finish(0);
