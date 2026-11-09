#!/usr/bin/env node
// Reverse gym: generate self-contained synthetic challenge targets, one per
// misdiagnosis pattern (M1-M8). Each target is a standalone signer script
// plus a challenge.json contract. Solving them end-to-end (with the skill's
// standard tools, not bespoke code) is the only capability regression suite
// of its kind in the JS-RE tool ecosystem.
//
// Usage:
//   node scripts/gym_generate_targets.js --out <dir> [--flavors m1,m3,all]
//
// Every target carries:
//   target.js     — the challenge signer (self-contained, no deps)
//   challenge.json — { flavor, symptom, wrong_approach, expected_token(input),
//                      oracle_hints }
const fs = require('fs');
const path = require('path');

const FLAVORS = {
  // M1: a "key" that looks environment-derived but actually tracks the clock.
  // Wrong approach: hunt fingerprints. Right: freeze/refresh clock and compare.
  m1: {
    symptom: 'derived key string differs between two runs; everything else identical',
    wrong_approach: 'hunting a missing environment fingerprint',
    build(seedFn) {
      return `
// challenge: the trailing "key" is TIME-DERIVED, not env-derived (pattern M1)
const K = ${seedFn('Date.now()')};
globalThis.derive = (input) => {
  const base = [0x11, 0x22, 0x33, 0x44];
  const tail = String(K).split('').map(Number).filter(n => !isNaN(n)).slice(0, 6);
  return base.concat(tail);
};
`;
    },
    oracle: 'two runs minutes apart differ in tail; identical under a frozen injected clock (globalThis.__FREEZE_CLOCK)',
  },
  // M2: the "server" answers wrong tokens with 200 + plausible fake data.
  m2: {
    symptom: 'every page returns 200 with plausible payloads yet the total is wrong',
    wrong_approach: 'treating a single 200 as acceptance',
    build() {
      return `
// challenge: mock-server maze — WRONG tokens still get 200 + fake data (pattern M2)
const crypto = globalThis.crypto; // realm-injected (no require in the challenge realm)
globalThis.verify = (token, secret) => {
  const good = crypto.createHash('md5').update(String(secret)).digest('hex');
  if (token === good) return { status: 200, data: [111, 222, 333], real: true };
  // plausible fake: deterministic-but-wrong, always 200
  const fake = crypto.createHash('md5').update('fake' + token).digest('hex');
  return { status: 200, data: fake.split('').slice(0, 6).map(c => c.charCodeAt(0) % 900 + 50), real: false };
};
globalThis.SECRET = 'gym-m2';
`;
    },
    oracle: 'only tokens equal md5(secret) carry real:true; everything else is a maze answer — cross-run stable totals are the honest metric',
  },
  // M3: token branch silently degrades unless a timer-driven self-check ran.
  m3: {
    symptom: 'first token valid, later ones empty; no exception; no global change',
    wrong_approach: 'hand-patching the branch',
    build() {
      return `
// challenge: timer-driven self-check gates later tokens (pattern M3)
let armed = false;
globalThis.__boot = () => { setTimeout(() => { try { globalThis.__SELF = [Error, TypeError, RangeError].map(C => String(new C('probe').message)); armed = true; } catch (e) {} }, 30); };
globalThis.sign = (s) => {
  if (!armed) return ''; // silent degradation, exactly like the real case
  let h = 0x811c;
  for (const c of String(s)) h = ((h ^ c.charCodeAt(0)) * 0x01000193) >>> 0;
  return h.toString(16);
};
globalThis.__boot();
`;
    },
    oracle: 'sign() returns empty until the 30ms timer fires (real timers + wait); then deterministic fnv1a',
  },
  // M4: payload executes via indirect eval; host-eval sandboxes break.
  m4: {
    symptom: 'document is not defined from eval frames; probes fail despite stubs',
    wrong_approach: 'adding more stubs',
    build() {
      return `
// challenge: indirect-eval payload resolves against the AMBIENT global (pattern M4)
const payload = 'globalThis.__RESULT = (typeof document !== "undefined" && document.__tag) || "MISSING";';
globalThis.document = { __tag: 'present-in-this-realm' };
(0, eval)(payload); // indirect: scope = the realm this eval belongs to
globalThis.read = () => globalThis.__RESULT;
`;
    },
    oracle: 'in a vm context with its OWN document stub, read() returns the realm-local tag; a host-eval leak returns the host value or MISSING',
  },
  // M5: constructor stringification gates constants (class-source leak).
  m5: {
    symptom: 'constructor stringification leaks class source; class-tag probes fail',
    wrong_approach: 'aligning more visible properties',
    build() {
      return `
// challenge: IV word selected by native-shape probe (pattern M5)
const D = (typeof globalThis.Document !== 'undefined') ? globalThis.Document : (class Document {});
// default: transpiled-style class — String(D) leaks source; inject a
// native-masked function to flip the gate
globalThis.IV = /native code/.test(String(D)) ? [0x2f9d, 0x17c1] : [0x1234, 0x5678];
globalThis.sign = (s) => globalThis.IV[0] ^ s.length;
`;
    },
    oracle: 'replace Document with a native-masked function -> IV flips to the "real browser" word',
  },
  // M6: random IV vs environment gate classification.
  m6: {
    symptom: 'two runs of the same harness produce different tokens',
    wrong_approach: 'chasing the difference as an environment gate (it is a random IV)',
    build() {
      return `
// challenge: same-env divergence is a RANDOM IV, not a gate (pattern M6)
globalThis.sign = (s) => {
  const iv = Math.floor(Math.random() * 0xffff);
  let h = iv;
  for (const c of String(s)) h = ((h ^ c.charCodeAt(0)) * 31) >>> 0;
  return h.toString(16) + '-' + iv.toString(16); // iv travels in the tail: verifiable
};
`;
    },
    oracle: 'token tails differ run-to-run (the IV); heads differ only through IV propagation — freeze Math.random to prove determinism',
  },
  // M7: a visible helper endpoint that must not be mistaken for the protected flow.
  m7: {
    symptom: 'helper endpoint returns data while the challenge script also loads',
    wrong_approach: 'solving the helper and declaring victory',
    build() {
      return `
// challenge: helper answers anyone; the protected flow needs the signer (pattern M7)
globalThis.helper = () => ({ status: 200, data: [1, 2, 3], note: 'helper-only' });
const crypto = globalThis.crypto;
globalThis.protected_ = (payload) => {
  const t = crypto.createHash('sha1').update(payload + '|gym-m7').digest('hex');
  return { status: 200, data: [9, 9, 9], token: t, real: true };
};
`;
    },
    oracle: 'helper() always answers; protected_() is the one whose token binds the payload',
  },
  // M8: the target probes its execution surface and silently degrades under stealth.
  // M13: wrong contract -> 200 + STATIC fallback data; real contract lives in
  // an obfuscator-style string table (misspelled field name), recoverable via
  // the adjacent decode oracle. Wrong approach: more requests / more headers.
  m13: {
    symptom: 'every request answers 200 with plausible rows, but no aggregate over them verifies',
    wrong_approach: 'treating the 200 (and its stable payload) as acceptance',
    build() {
      return `
// challenge: fallback-data gate — wrong field guesses get 200 + static decoy (pattern M13)
// the real field name is recoverable ONLY from the string table (deliberately misspelled)
const _B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const _atob = (s) => { s = String(s).replace(/=+$/, ''); let out = '';
  for (let i = 0, b = 0, bits = 0; i < s.length; i++) { b = (b << 6) | _B64.indexOf(s[i]); bits += 6;
    if (bits >= 8) { bits -= 8; out += String.fromCharCode((b >> bits) & 255); } } return out; };
const _0xt = ['Z3ltLW0xMw==', 'c3Vuperbg==', 'dGltZXN0YW1w', 'cmFuZG9t', 'aHR0cA==', 'c2lnbnR1cmU=', 'ZmV0Y2g=', 'anNvbg==',
  'c2VjcmV0', 'a2V5', 'c2FsdA==', 'bWQ1', 'c2hh', 'c3Vt', 'bWVhbg==', 'dmFsdWU='];
(function (a, b) { const c = function (d) { while (--d) { a.push(a.shift()); } }; c(++b); }(_0xt, 0x3));
const _0xl = function (i, k) { i = i - 0x0; return _atob(_0xt[i]); };
const _FIELD = _0xl('0x2', 'k'); // rotation 3 -> items[5] -> deliberately misspelled 'signture'
globalThis.hint = (i) => _0xl(typeof i === 'number' ? '0x' + i.toString(16) : String(i), 'k');
const _REAL = [41, 42, 43, 44, 45, 46, 47, 48, 49, 50];
const _DECOY = [7, 7, 7, 7, 7, 7, 7, 7, 7, 7];
globalThis.readReport = (fieldGuess) => {
  if (fieldGuess === _FIELD) return { status: 200, data: _REAL.slice(), real: true };
  return { status: 200, data: _DECOY.slice(), real: false }; // static, plausible, always 200
};
`;
    },
    oracle: 'data fingerprint across guesses is byte-identical (7,7,7,...) = decoy; recover the field via the hint oracle / string-table runtime eval; real rows sum to 455',
  },
  m8: {
    symptom: 'works under plain execution, silently degrades under a "stealth" surface',
    wrong_approach: 'blaming the capture tool or the site',
    build() {
      return `
// challenge: the signer fingerprints its own runner and degrades silently (pattern M8)
const runtimeHints = [];
if (typeof globalThis.__STEALTH__ !== 'undefined') runtimeHints.push('stealth');
if (typeof navigator !== 'undefined' && navigator.webdriver === false) runtimeHints.push('plain');
globalThis.__SURFACE = runtimeHints.includes('stealth') ? 'stealth' : 'plain';
globalThis.sign = (s) => {
  if (globalThis.__SURFACE === 'stealth') return ''; // silent degradation under stealth
  let h = 7;
  for (const c of String(s)) h = (h * 33 + c.charCodeAt(0)) >>> 0;
  return 'v' + h.toString(16);
};
`;
    },
    oracle: 'define globalThis.__STEALTH__ = 1 before load -> sign returns empty; plain load -> deterministic hash',
  },
};

// Level-2 composite challenge: one target stacking FOUR patterns the way a
// real commercial shell does (env gate + timer self-check + random IV tail +
// helper decoy). Solving it requires the recipes IN COMBINATION — the honest
// approximation of field difficulty.
const COMBO = {
  combo_all: {
    symptom: 'a single commercial-style target stacking an env-gated IV, a timer self-check, a random-IV tail, and a helper decoy',
    wrong_approach: 'hand-porting the algorithm or trusting the helper endpoint',
    build() {
      return `
// level-2 composite: M5(env-gated IV) + M3(timer self-check) + M6(random tail) + M7(helper decoy)
const crypto = globalThis.crypto;
const D = (typeof globalThis.Document !== 'undefined') ? globalThis.Document : (class Document {});
const IV = /native code/.test(String(D)) ? [0x2f9d, 0x17c1] : [0x1234, 0x5678]; // M5
let armed = false;
setTimeout(() => { try { [Error, TypeError].map(C => String(new C('p'))); armed = true; } catch (e) {} }, 30); // M3
globalThis.helper = () => ({ status: 200, data: [7, 7, 7], note: 'helper-only' }); // M7 decoy
globalThis.protected_ = (payload) => { // M6 tail
  if (!armed) return { status: 200, data: [], token: '', real: false };
  const iv = Math.floor(Math.random() * 0xffff);
  let h = IV[0] ^ payload.length;
  for (const c of String(payload)) h = ((h ^ c.charCodeAt(0)) * 0x01000193) >>> 0;
  const token = h.toString(16) + '-' + iv.toString(16);
  const expect = crypto.createHash('sha1').update(payload + '|' + h.toString(16)).digest('hex');
  return { status: 200, data: [5, 5, 5], token, expect, real: true };
};
`;
    },
    oracle: 'native-mask Document AND wait for the timer AND read the random iv from the token tail when binding the payload; helper() is a decoy',
  },
};

Object.assign(FLAVORS, COMBO);

function main() {
  const argv = process.argv.slice(2);
  const outIdx = argv.indexOf('--out');
  const outDir = outIdx >= 0 ? argv[outIdx + 1] : path.join(process.cwd(), 'gym-targets');
  const fIdx = argv.indexOf('--flavors');
  const wanted = fIdx >= 0 ? argv[fIdx + 1].split(',') : Object.keys(FLAVORS);
  const seed = (expr) => expr; // clock expression kept literal in m1
  fs.mkdirSync(outDir, { recursive: true });
  const made = [];
  for (const f of wanted) {
    const spec = FLAVORS[f];
    if (!spec) { console.error('unknown flavor:', f); process.exit(1); }
    const dir = path.join(outDir, f);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'target.js'), spec.build(seed).trim() + '\n');
    fs.writeFileSync(path.join(dir, 'challenge.json'), JSON.stringify({
      flavor: f, symptom: spec.symptom, wrong_approach: spec.wrong_approach, oracle: spec.oracle,
    }, null, 2) + '\n');
    made.push(f);
  }
  console.log(JSON.stringify({ generated: made, outDir }, null, 1));
}

main();
