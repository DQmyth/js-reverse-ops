#!/usr/bin/env node
// Runtime string-array decoder for obfuscator.io v4+ targets (M13 recipe,
// productized). Complements scripts/recover_string_table.js: the AST/static
// path is fast but known-blind to v4 proxy-function variants; THIS tool
// executes the target's own decode machinery (string array + rotation IIFE +
// lookup function) inside a stubbed Node vm, so it is immune to every
// string-table变形 that still runs in a browser.
//
// Usage:
//   node scripts/decode_string_array_runtime.js <input.js> --indexes 0xd,0x26
//   node scripts/decode_string_array_runtime.js <input.js> --dump [--max 512]
//   node scripts/decode_string_array_runtime.js <input.js> --known 0x4e=slug  (assert)
// Output: one `0xNN = value` line per index (values base64-decoded when the
// raw lookup result still looks like base64), or JSON with --json.
//
// Method (recorded case: a gated API whose POST field was the deliberately
// misspelled `signture` and whose md5 separator was `spiderbuf` — recoverable
// only from the table, never by guessing):
//   1. locate the string array (>=15 short string literals, mostly base64ish)
//   2. locate the two-arg lookup function whose body references the array
//   3. truncate the source right after the lookup definition (balanced braces)
//   4. run array + rotation IIFE + lookup in a vm sandbox (DOM/timers stubbed,
//      anti-debug neutered), calling the lookup in the SAME scope (const
//      declarations never leak out of the evaluated string)
//   5. indexes are passed as hex strings ('0xd'), matching deobfuscated
//      call sites; base-offset calibration is NOT needed — the rotation
//      already ran for real
const fs = require('fs');
const vm = require('vm');

const argv = process.argv.slice(2);
const file = argv[0];
const argOf = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const WANT_JSON = argv.includes('--json');
const DUMP = argv.includes('--dump');
const MAX = parseInt(argOf('--max', '512'), 10);
const IDX = argOf('--indexes', '');
const KNOWN = argOf('--known', '');

if (!file || (!IDX && !DUMP && !KNOWN)) {
  console.error('usage: decode_string_array_runtime.js <input.js> (--indexes 0xd,0x26 | --dump [--max N]) [--known 0xNN=value] [--json]');
  process.exit(2);
}
if (!fs.existsSync(file)) { console.error('no such file:', file); process.exit(1); }
const src = fs.readFileSync(file, 'utf8');

// --- 1. find the string array declaration ---
const arrRe = /(?:const|var|let)\s+([A-Za-z_$][\w$]*)\s*=\s*\[((?:\s*['"][A-Za-z0-9+/=]{1,120}['"]\s*,){14,}[\s\S]*?)\]\s*;/;
const arrM = src.match(arrRe);
if (!arrM) { console.error('string array not found (need >=15 short string literals)'); process.exit(1); }
const ARR = arrM[1];

// --- 2. find the lookup: two-param function whose body references ARR ---
let lookupName = null, headEnd = -1;
const fnRe = /(?:function\s+([A-Za-z_$][\w$]*)\s*\(|([A-Za-z_$][\w$]*)\s*=\s*function\s*)\(\s*[A-Za-z_$][\w$]*\s*,\s*[A-Za-z_$][\w$]*\s*\)/g;
let m;
while ((m = fnRe.exec(src))) {
  const name = m[1] || m[2];
  const open = src.indexOf('{', m.index + m[0].length - 1);
  if (open < 0) continue;
  // balanced-brace body
  let depth = 0, j = open;
  for (; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) break; }
  }
  const body = src.slice(open, j + 1);
  if (body.includes(ARR)) {
    // prefer the EARLIEST such function (the primary lookup)
    lookupName = name;
    headEnd = src.indexOf(';', j) + 1 || j + 1;
    break;
  }
}
if (!lookupName) { console.error(`no two-arg lookup referencing array ${ARR} found`); process.exit(1); }
const head = src.slice(0, headEnd);

// --- 3. stubbed sandbox (anti-debug neutered) ---
const noop = () => {};
const sandbox = {
  console: { log: noop, warn: noop, error: noop, info: noop, debug: noop, trace: noop, table: noop, dir: noop, exception: noop, clear: noop },
  atob: (s) => Buffer.from(String(s), 'base64').toString('binary'),
  btoa: (s) => Buffer.from(String(s), 'binary').toString('base64'),
  decodeURIComponent, encodeURIComponent,
  parseInt, parseFloat, isNaN, String, Number, Boolean, Array, Object, JSON, Math, Date, RegExp, Function, Error, TypeError,
  setTimeout: () => 0, setInterval: () => 0, clearTimeout: noop, clearInterval: noop,
  process: { exit: noop },
  navigator: { userAgent: 'decode_string_array_runtime' },
  document: { addEventListener: noop, getElementById: () => null, querySelector: () => null, cookie: '', createElement: () => ({ style: {}, appendChild: noop, setAttribute: noop }) },
  location: { href: 'https://example.test/' },
  performance: { now: () => 0 },
};
sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox; sandbox.top = sandbox; sandbox.parent = sandbox;
vm.createContext(sandbox);

// --- 4. build the probe tail and run head+tail in ONE scope ---
const wanted = IDX ? IDX.split(',').map(s => s.trim()).filter(Boolean) : null;
const probe = `
;(function(){
  const out = {};
  const idxs = ${JSON.stringify(wanted)};
  if (idxs) {
    for (const k of idxs) { try { const v = ${lookupName}(k, 'k'); if (v !== undefined) out[k] = String(v); } catch (e) { out[k] = 'ERR:' + e.message; } }
  } else {
    for (let i = 0; i < ${MAX}; i++) {
      const k = '0x' + i.toString(16);
      try { const v = ${lookupName}(k, 'k'); if (v !== undefined && v !== '') out[k] = String(v); } catch (e) { break; }
    }
  }
  return out;
})()`;

let table;
try {
  table = vm.runInContext(head + probe, sandbox, { timeout: 8000, filename: 'string-array-head' });
} catch (e) {
  console.error('vm execution failed (self-defending variant?):', e.message.slice(0, 120));
  process.exit(1);
}
if (!table || typeof table !== 'object') { console.error('lookup returned no table'); process.exit(1); }

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

// --- 5. optional assertion against a known mapping ---
if (KNOWN) {
  const [k, want] = KNOWN.split('=');
  const got = (rows[k] || '').split('   (raw:')[0];
  if (got !== want) {
    console.error(`--known assertion failed: ${k} = ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);
    process.exit(1);
  }
}

if (WANT_JSON) console.log(JSON.stringify({ file, array: ARR, lookup: lookupName, values: rows }, null, 2));
else {
  console.error(`array=${ARR} lookup=${lookupName} headBytes=${head.length}`);
  const keys = Object.keys(rows).sort((a, b) => parseInt(a) - parseInt(b));
  for (const k of keys) console.log(`${k} = ${rows[k]}`);
  console.error(`${keys.length} entries decoded`);
}
