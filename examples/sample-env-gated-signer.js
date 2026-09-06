// sample-env-gated-signer.js — a MINI practice target (safe to run anywhere).
//
// Demonstrates the two most common environment gates in one tiny signer:
//   1. an init-vector constant selected by a native-shape probe:
//        typeof print === "function" && String(print) has "[native code]"
//   2. a per-character encoder branch selected by a Node-only global:
//        typeof __dirname === "undefined"  -> mask 254, else mask 255
// A hand-written port that assumes `&255` will silently corrupt every byte.
//
// Verbatim usage (browser-like environment): global function `sign(s)`.
// Calibration hook: global `IV` holds the active init vector pair.

const NATIVE_PRINT = typeof print === 'function' && /native code/.test(String(print));
const IN_BROWSER_LIKE = typeof __dirname === 'undefined';

const IV = NATIVE_PRINT ? [0x2f9d, 0x17c1] : [0x1234, 0x5678];

function sign(str) {
  let h1 = IV[0], h2 = IV[1];
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    bytes.push(IN_BROWSER_LIKE ? (code & 254) : (code & 255));
  }
  for (const b of bytes) {
    h1 = ((h1 ^ b) * 0x0111) & 0xffff;
    h2 = ((h2 + b) ^ (h1 << 1)) & 0xffff;
  }
  const out = ((h1 << 8) | h2) >>> 0;
  return out.toString(16).padStart(4, '0') + bytes.map(b => b.toString(16).padStart(2, '0')).join('');
}

globalThis.IV = IV;
globalThis.sign = sign;
globalThis.SIGNER_ENV = { nativePrint: NATIVE_PRINT, lowBitMaskOn: IN_BROWSER_LIKE };
