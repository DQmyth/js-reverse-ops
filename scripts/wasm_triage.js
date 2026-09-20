#!/usr/bin/env node
// WASM reconnaissance: structural triage of a .wasm module without needing
// wabt installed. Parses the module sections natively (zero deps) to answer
// the first three questions a wasm signer raises:
//   1. what does it import (env face: crypto? time? random? DOM-adjacent?)
//   2. what does it export (signer entry candidates)
//   3. size/fingerprint signals (custom sections, name section presence)
// When wabt IS available (wasm2wat on PATH), also emits the wat path hint.
//
// Usage: node scripts/wasm_triage.js <module.wasm> [--json]
const fs = require('fs');
const { execFileSync } = require('child_process');

const file = process.argv[2];
if (!file || !fs.existsSync(file)) { console.error('usage: wasm_triage.js <module.wasm> [--json]'); process.exit(2); }
const buf = fs.readFileSync(file);

// --- minimal wasm binary parser (section walk + import/export names) ---
function readULEB(b, off) { let result = 0, shift = 0, pos = off; for (;;) { const byte = b[pos++]; result |= (byte & 0x7f) << shift; if (!(byte & 0x80)) break; shift += 7; } return [result, pos]; }
function readName(b, off) { const [len, p] = readULEB(b, off); return [b.slice(p, p + len).toString('utf8'), p + len]; }

const SECTIONS = { 0: 'custom', 1: 'type', 2: 'import', 3: 'function', 4: 'table', 5: 'memory', 6: 'global', 7: 'export', 8: 'start', 9: 'element', 10: 'code', 11: 'data', 12: 'datacount' };
const magic = buf.slice(0, 4).toString('hex');
if (magic !== '0061736d') { console.error('not a wasm module (bad magic)'); process.exit(1); }

let pos = 8; // magic + version
const imports = [], exportedFuncs = [], customs = [];
let codeBytes = 0;
while (pos < buf.length) {
  const secId = buf[pos]; const [secLen, p2] = readULEB(buf, pos + 1);
  const end = p2 + secLen;
  if (secId === 0) {
    let q = p2; const [name, q2] = readName(buf, q);
    customs.push({ name, size: secLen });
  } else if (secId === 2) {
    let q = p2; const [count, q2] = readULEB(buf, q); q = q2;
    for (let i = 0; i < count && q < end; i++) {
      const [mod, q3] = readName(buf, q); const [field, q4] = readName(buf, q3);
      const kind = buf[q4]; q = q4 + 1;
      // skip kind-specific payload crudely: vec names / limits (max 6 bytes here)
      q += 4; // heuristic skip — names are what we need
      imports.push({ module: mod, field, kind: ['func', 'table', 'memory', 'global'][kind] });
    }
  } else if (secId === 7) {
    let q = p2; const [count, q2] = readULEB(buf, q); q = q2;
    for (let i = 0; i < count && q < end; i++) {
      const [name, q3] = readName(buf, q); const kind = buf[q3]; const [idx, q5] = readULEB(buf, q3 + 1); q = q5;
      exportedFuncs.push({ name, kind: ['func', 'table', 'memory', 'global'][kind], index: idx });
    }
  } else if (secId === 10) codeBytes = secLen;
  pos = end;
}

// --- signal classification ---
const CRYPTO_HINTS = /aes|rsa|sha|md5|digest|hmac|crypt|sign|seed|random|key|hash/i;
const cryptoImports = imports.filter(i => CRYPTO_HINTS.test(i.field));
const timeImports = imports.filter(i => /time|clock|date|now/i.test(i.field));
const randomImports = imports.filter(i => /random|rand|entropy/i.test(i.field));
const envModules = [...new Set(imports.map(i => i.module))];
const signerExports = exportedFuncs.filter(e => e.kind === 'func' && /sign|token|encrypt|digest|gen|calc|compute/i.test(e.name));
const hasNameSection = customs.some(c => c.name === 'name');

let watHint = null;
try { execFileSync('wasm2wat', ['--version'], { stdio: 'pipe' }); watHint = 'wabt detected: wasm2wat ' + file + ' -o ' + file + '.wat for readable text'; } catch (e) { watHint = 'wabt not installed (optional): brew install wabt for wat output'; }

const verdictBits = [];
if (cryptoImports.length) verdictBits.push('crypto-ish imports');
if (timeImports.length) verdictBits.push('time-dependent (server-time feeding likely)');
if (randomImports.length) verdictBits.push('randomness inside wasm');
if (signerExports.length) verdictBits.push('signer-shaped exports');
const verdict = verdictBits.length
  ? 'WASM SIGNER LIKELY: ' + verdictBits.join(', ') + ' — route to playbooks/server-time-gated-wasm-signer.md; verbatim execution still preferred over full decompilation'
  : 'no strong signer markers; treat as support module and keep looking in JS';

const report = {
  file, sizeBytes: buf.length, codeBytes,
  imports: imports.length, exports: exportedFuncs.length,
  envModules, cryptoImports, timeImports, randomImports,
  signerExports, customs, hasNameSection, watHint, verdict,
};
if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
else {
  console.log(verdict);
  console.log(`size=${buf.length}B code=${codeBytes}B imports=${imports.length} exports=${exports.length} name-section=${hasNameSection}`);
  if (envModules.length) console.log('env modules:', envModules.join(', '));
  for (const c of [...cryptoImports, ...timeImports, ...randomImports].slice(0, 8)) console.log(`  import ${c.module}.${c.field} (${c.kind})`);
  for (const e of signerExports.slice(0, 6)) console.log(`  export ${e.name} (func #${e.index})`);
  console.log(watHint);
}
