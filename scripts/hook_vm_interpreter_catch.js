#!/usr/bin/env node
// Runtime-patch a JSVMP/interpreter-style bundle so its own catch clause logs
// every bytecode-swallowed exception (verified on jsvmpzl-style shells,
// practice topics 24/28). Static, single string-replacement — no AST needed.
//
// Default pattern (jsvmpzl v1.5.x, both bracket variants):
//   !c;)try{h[n[o++]]()}catch(e){if(!s.length)throw e;   // or h[n[o++]])()
// The patch inserts a global log call right after `catch(e){`:
//   ...catch(e){(globalThis.__VMERR=globalThis.__VMERR||[]).push(String(e&&e.message||e));if(!s.length)throw e;
//
// Usage:
//   node scripts/hook_vm_interpreter_catch.js <input.js> --output <out.js> [--log-global __VMERR] [--pattern '<exact>'] [--replacement '<with {LOG}>']
// After running the patched file in your harness, read:
//   globalThis.__VMERR  (array of swallowed exception messages, capture order)

const fs = require('fs');

function main() {
  const argv = process.argv.slice(2);
  const input = argv[0] && !argv[0].startsWith('--') ? argv[0] : null;
  const get = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
  const output = get('--output');
  const logGlobal = get('--log-global', '__VMERR');
  if (!input || !output) {
    console.error('usage: hook_vm_interpreter_catch.js <input.js> --output <out.js> [--log-global __VMERR] [--pattern <exact>] [--replacement <uses {LOG}>]');
    process.exit(2);
  }
  let src = fs.readFileSync(input, 'utf8');
  let pattern = get('--pattern', null);
  let replacement = get('--replacement', null);
  // canonical variant, then fast fallback across bracket shapes
  const candidates = [
    { p: '!c;)try{h[n[o++]]()}catch(e){if(!s.length)throw e;', r: (lg) => `!c;)try{h[n[o++]]()}catch(e){(globalThis.${lg}=globalThis.${lg}||[]).push(String(e&&e.message||e));if(!s.length)throw e;` },
    { p: '!c;)try{h[n[o++]])()}catch(e){if(!s.length)throw e;', r: (lg) => `!c;)try{h[n[o++]])()}catch(e){(globalThis.${lg}=globalThis.${lg}||[]).push(String(e&&e.message||e));if(!s.length)throw e;` },
    { p: 'catch(e){if(!s.length)throw e;', r: (lg) => `catch(e){(globalThis.${lg}=globalThis.${lg}||[]).push(String(e&&e.message||e));if(!s.length)throw e;` },
  ];
  if (pattern) {
    candidates.unshift({ p: pattern, r: (lg) => replacement ? replacement.replace('{LOG}', logGlobal) : '' });
  }
  let hit = null;
  for (const c of candidates) {
    if (src.includes(c.p)) { hit = { p: c.p, r: c }; break; }
  }
  if (!hit) {
    console.error('interpreter catch pattern not found; inspect the dispatcher loop manually');
    process.exit(1);
  }
  src = src.split(hit.p).join(hit.r.r(logGlobal));
  fs.writeFileSync(output, src);
  const count = 1;
  console.error(`patched: ${count} catch site(s) now log to globalThis.${logGlobal}`);
  console.error(`read-back hint: in your harness, dump sandbox.${logGlobal} after the failing call`);
}

main();
