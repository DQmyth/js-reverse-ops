#!/usr/bin/env node
// sample-verbatim-harness.js — runs sample-env-gated-signer.js the way the
// target's browser would, and PROVES the difference a wrong sandbox makes.
//
//   node sample-verbatim-harness.js
//
// Expected: browser-like sandbox -> IV 2f9d17c1, bytes masked &254.
//           host-flavored sandbox -> different IV/bytes (the bug that costs
//           sessions). This is the mini version of practice-set topics 26/28.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const signerSrc = fs.readFileSync(path.join(__dirname, 'sample-env-gated-signer.js'), 'utf8');

function nativeFn(name) {
  const f = { [name]: function () {} }[name];
  f.toString = function () { return 'function ' + name + '() { [native code] }'; };
  return f;
}

// --- browser-like sandbox: ONLY BOM stubs; no host globals leak in ---
function makeBrowserLike() {
  const sandbox = { console };
  sandbox.print = nativeFn('print');          // Chrome always has a native print
  // note: no __dirname, no require, no host Function/Object — context builtins apply
  vm.createContext(sandbox);
  vm.runInContext(signerSrc, sandbox);
  return sandbox;
}

// --- wrong sandbox: host flavor leaks in (what a naive harness does) ---
function makeHostFlavored() {
  const sandbox = { console, __dirname: '/host/leaks/in', print: function mockPrint() {} };
  vm.createContext(sandbox);
  vm.runInContext(signerSrc, sandbox);
  return sandbox;
}

const good = makeBrowserLike();
const bad = makeHostFlavored();

console.log('browser-like env :', JSON.stringify(good.SIGNER_ENV), 'IV =', good.IV.map(v => v.toString(16)).join(','), 'sign("abc") =', good.sign('abc'));
console.log('host-flavored env:', JSON.stringify(bad.SIGNER_ENV), 'IV =', bad.IV.map(v => v.toString(16)).join(','), 'sign("abc") =', bad.sign('abc'));

// calibration assertions (the fast oracle before any server round-trip)
const assert = require('assert');
// map(Number): arrays created inside the vm context have a different Array prototype
assert.deepStrictEqual(Array.from(good.IV, Number), [0x2f9d, 0x17c1], 'IV calibration failed');
assert.strictEqual(good.sign('abc'), good.sign('abc'), 'signer not deterministic');
assert.notStrictEqual(good.sign('abc'), bad.sign('abc'), 'environments should diverge — that is the lesson');
console.log('\ncalibration OK: browser-like sandbox selects the gated IV/encoder; the host-flavored one diverges.');
console.log('lesson: run the target verbatim with precise stubs — never hand-port a gated signer.');
