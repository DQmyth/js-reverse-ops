#!/usr/bin/env node
/**
 * fingerprint_env_gated_crypto.js
 *
 * Fingerprint a bundled crypto library (CryptoJS-style) so environment-gated
 * modifications can be found by differential comparison instead of by reading
 * flattened source.
 *
 * Modes:
 *   snippet                 print the JS snippet to run inside a real browser at
 *                           a paused frame (Debugger.evaluateOnCallFrame) so the
 *                           live module produces a reference fingerprint
 *   sandbox <bundle.js>     run the bundle inside a hardened vm sandbox, capture
 *                           globalThis.__CJS (install it with --capture-pattern /
 *                           --capture-replacement), and emit a fingerprint JSON
 *   compare <a.json> <b.json>
 *                           diff two fingerprint JSONs layer by layer and report
 *                           which layer diverges
 *
 * Sandbox hardening applied by default (see references/local-rebuild.md):
 *   - window/globalThis non-configurable (defeats `delete window` probes)
 *   - $ + window.jQuery chainable stub with the common statics
 *   - crypto.getRandomValues with real randomness
 *   - constructor-class stubs used by environment sniffing
 *
 * Usage:
 *   node scripts/fingerprint_env_gated_crypto.js snippet
 *   node scripts/fingerprint_env_gated_crypto.js sandbox bundle.js \
 *     --capture-pattern '(callSitePattern)' \
 *     --capture-replacement '(callSiteReplacement with globalThis.__CJS=...)' \
 *     [--seed-response 1234567890123] [-o fingerprint.json]
 *   node scripts/fingerprint_env_gated_crypto.js compare browser.json sandbox.json
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const KNOWN_MD5_INPUTS = ['abc', '', '12345678901234'];
const SINGLE_BLOCK_KEY_HEX =
  '099fe83e36387e4aca185a111766eb158eba598e01388f7501e0dfb27af77483';
const SINGLE_BLOCK_PT = 'ABCDEFGHIJKLMNOP';

function usage() {
  console.error(
    [
      'Usage:',
      '  node scripts/fingerprint_env_gated_crypto.js snippet',
      '  node scripts/fingerprint_env_gated_crypto.js sandbox <bundle.js> [--capture-pattern <str>] [--capture-replacement <str>] [--seed-response <str>] [-o out.json]',
      '  node scripts/fingerprint_env_gated_crypto.js compare <a.json> <b.json>',
    ].join('\n')
  );
  process.exit(1);
}

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= process.argv.length) return null;
  return process.argv[idx + 1];
}

function hexWords(words) {
  return (words || []).map((w) => (w >>> 0).toString(16).padStart(8, '0')).join(' ');
}

function fingerprintModule(C, seedResponse) {
  const fp = {
    schema: 'js-reverse-ops-env-crypto-fingerprint-v1',
    layer_base64: {},
    layer_md5: {},
    layer_rng: {},
    layer_aes: {},
  };
  try {
    fp.layer_base64.map = C.enc && C.enc.Base64 ? String(C.enc.Base64._map) : null;
  } catch (err) {
    fp.layer_base64.error = String(err.message);
  }
  try {
    fp.layer_md5.known_vectors = KNOWN_MD5_INPUTS.map((input) => ({
      input,
      digest: C.MD5(input).toString(),
    }));
  } catch (err) {
    fp.layer_md5.error = String(err.message);
  }
  try {
    const sample = C.lib.WordArray.random(2);
    fp.layer_rng.sample = hexWords(sample.words).slice(0, 23);
    const again = C.lib.WordArray.random(2);
    fp.layer_rng.repeat = hexWords(again.words).slice(0, 23);
  } catch (err) {
    fp.layer_rng.error = String(err.message);
  }
  try {
    const keyWA = C.enc.Hex.parse(SINGLE_BLOCK_KEY_HEX);
    const pt = C.enc.Utf8.parse(SINGLE_BLOCK_PT);
    const noPad = { mode: C.mode.ECB, padding: C.pad.NoPadding };
    fp.layer_aes.single_block_ct = C.AES.encrypt(pt, keyWA, noPad).ciphertext.toString();
    const enc = C.algo.AES.createEncryptor(keyWA);
    for (const key of Object.keys(enc)) {
      if (Array.isArray(enc[key]) && enc[key].length >= 40) {
        fp.layer_aes[key] = hexWords(enc[key].slice(0, 4));
      }
    }
    if (seedResponse && C.AES && C.MD5) {
      const V = C.AES.encrypt(String(seedResponse) + '1', 'probe-passphrase', {
        mode: C.mode.ECB,
        padding: C.pad.Pkcs7,
      });
      fp.layer_aes.full_chain_b64 = V.toString();
      fp.layer_md5.full_chain_digest = C.MD5(V.toString()).toString();
    }
  } catch (err) {
    fp.layer_aes.error = String(err.message);
  }
  return fp;
}

function snippetMode() {
  const snippet = `(function () {
  const C = i('crypto-js'); // replace i('crypto-js') with this bundle's module reference
  const KNOWN = ['abc', '', '12345678901234'];
  const KEY = '099fe83e36387e4aca185a111766eb158eba598e01388f7501e0dfb27af77483';
  const hw = (ws) => (ws || []).map((w) => (w >>> 0).toString(16).padStart(8, '0')).join(' ');
  const out = {
    schema: 'js-reverse-ops-env-crypto-fingerprint-v1',
    layer_base64: { map: String(C.enc.Base64._map) },
    layer_md5: { known_vectors: KNOWN.map((s) => ({ input: s, digest: C.MD5(s).toString() })) },
    layer_rng: {
      sample: hw(C.lib.WordArray.random(2).words).slice(0, 23),
      repeat: hw(C.lib.WordArray.random(2).words).slice(0, 23),
    },
    layer_aes: {},
  };
  try {
    const keyWA = C.enc.Hex.parse(KEY);
    const pt = C.enc.Utf8.parse('ABCDEFGHIJKLMNOP');
    out.layer_aes.single_block_ct = C.AES.encrypt(pt, keyWA, { mode: C.mode.ECB, padding: C.pad.NoPadding }).ciphertext.toString();
    const enc = C.algo.AES.createEncryptor(keyWA);
    for (const k of Object.keys(enc)) {
      if (Array.isArray(enc[k]) && enc[k].length >= 40) out.layer_aes[k] = hw(enc[k].slice(0, 4));
    }
  } catch (e) { out.layer_aes.error = e.message; }
  return JSON.stringify(out);
})()`;
  console.log(snippet);
}

function makeChainable() {
  const fn = function () {
    return chainable;
  };
  const chainable = new Proxy(fn, {
    get(target, prop) {
      if (prop === Symbol.toPrimitive) return () => '';
      if (prop === 'toString') return () => '';
      if (prop === 'valueOf') return () => 0;
      return chainable;
    },
    apply() {
      return chainable;
    },
  });
  return chainable;
}

function buildSandbox(seedResponse, locationHref) {
  const chainable = makeChainable();
  const href = locationHref || 'https://example.test/challenge/1';
  const hostMatch = /^[a-z]+:\/\/([^/]+)/i.exec(href);
  const jq = function (arg) {
    if (typeof arg === 'function') {
      try {
        arg();
      } catch (err) {
        /* ignore ready-callback failures */
      }
      return chainable;
    }
    return chainable;
  };
  jq.trim = (v) => String(v == null ? '' : v).trim();
  jq.param = (o) => o;
  jq.each = () => {};
  jq.extend = Object.assign;
  jq.type = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
  jq.ajax = function (opts) {
    const url = String(opts && opts.url);
    if (/getTime|\/api\/time/i.test(url) && opts && typeof opts.success === 'function') {
      opts.success(String(seedResponse));
    }
    return {};
  };
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    setTimeout: () => 0,
    clearTimeout() {},
    setInterval: () => 0,
    clearInterval() {},
    String,
    Number,
    Math,
    Date,
    JSON,
    Array,
    Object,
    RegExp,
    Error,
    parseInt,
    parseFloat,
    isNaN,
    encodeURIComponent,
    decodeURIComponent,
    navigator: { userAgent: 'Mozilla/5.0' },
    location: { href, protocol: 'https:', host: hostMatch ? hostMatch[1] : 'example.test' },
    alert() {},
    failedAlert() {},
    successAlert() {},
    document: new Proxy(
      {},
      {
        get(target, prop) {
          if (prop === 'cookie') return '';
          if (prop === 'readyState') return 'complete';
          return chainable;
        },
      }
    ),
    $: jq,
    jQuery: jq,
    crypto: { getRandomValues: (arr) => require('crypto').randomFillSync(arr) },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  try {
    Object.defineProperty(sandbox, 'window', { get() { return sandbox; }, set() {}, configurable: false });
    Object.defineProperty(sandbox, 'globalThis', { get() { return sandbox; }, set() {}, configurable: false });
  } catch (err) {
    /* contexts that reject defineProperty fall back to plain assignment */
  }
  sandbox.msCrypto = sandbox.crypto;
  sandbox.performance = { now: () => Date.now() };
  for (const cls of [
    'Navigator',
    'Window',
    'Document',
    'HTMLDocument',
    'Element',
    'HTMLElement',
    'Location',
    'Screen',
    'Storage',
    'Event',
    'CustomEvent',
  ]) {
    if (!(cls in sandbox)) sandbox[cls] = function StubCtor() {};
  }
  return sandbox;
}

function sandboxMode() {
  const bundlePath = process.argv[3];
  if (!bundlePath || !fs.existsSync(bundlePath)) {
    console.error(`bundle not found: ${bundlePath}`);
    usage();
  }
  const capturePattern = argValue('--capture-pattern');
  const captureReplacement = argValue('--capture-replacement');
  const seedResponse = argValue('--seed-response') || '1234567890123';
  const locationHref = argValue('--location-href');
  const outPath = argValue('-o') || argValue('--output');

  let src = fs.readFileSync(bundlePath, 'utf8');
  if (capturePattern && captureReplacement) {
    if (!src.includes(capturePattern)) {
      console.error(`capture pattern not found in bundle: ${capturePattern}`);
      process.exit(2);
    }
    src = src.replace(capturePattern, captureReplacement);
  }

  const sandbox = buildSandbox(seedResponse, locationHref);
  vm.createContext(sandbox);
  try {
    vm.runInContext(src, sandbox, { timeout: 60000 });
  } catch (err) {
    console.error(`bundle execution failed: ${err.message}`);
  }
  const CJS = sandbox.__CJS || (sandbox.window && sandbox.window.__CJS);
  if (!CJS) {
    console.error(
      'module capture failed: pass --capture-pattern/--capture-replacement so the bundle stores its crypto module into globalThis.__CJS'
    );
    process.exit(3);
  }
  const fingerprint = fingerprintModule(CJS, seedResponse);
  fingerprint.bundle = path.basename(bundlePath);
  const json = JSON.stringify(fingerprint, null, 2);
  if (outPath) {
    fs.writeFileSync(outPath, json);
    console.error(`fingerprint written: ${outPath}`);
  } else {
    console.log(json);
  }
}

function compareMode() {
  const [, pathA, pathB] = [null, process.argv[3], process.argv[4]];
  if (!pathA || !pathB || !fs.existsSync(pathA) || !fs.existsSync(pathB)) {
    console.error('compare needs two existing fingerprint JSON files');
    usage();
  }
  const a = JSON.parse(fs.readFileSync(pathA, 'utf8'));
  const b = JSON.parse(fs.readFileSync(pathB, 'utf8'));
  const report = { schema: 'js-reverse-ops-env-crypto-fingerprint-diff-v1', layers: [] };
  const layerNames = ['layer_base64', 'layer_md5', 'layer_rng', 'layer_aes'];
  for (const layer of layerNames) {
    const la = a[layer] || {};
    const lb = b[layer] || {};
    const keys = [...new Set([...Object.keys(la), ...Object.keys(lb)])].sort();
    const diffs = [];
    for (const key of keys) {
      const va = JSON.stringify(la[key]);
      const vb = JSON.stringify(lb[key]);
      if (va !== vb) diffs.push({ key, a: la[key], b: lb[key] });
    }
    report.layers.push({ layer, diverged: diffs.length > 0, diffs });
  }
  const firstDiverged = report.layers.find((l) => l.diverged);
  report.summary = firstDiverged
    ? `first diverged layer: ${firstDiverged.layer} — inspect ${firstDiverged.diffs
        .map((d) => d.key)
        .slice(0, 4)
        .join(', ')} for an environment gate`
    : 'no divergence detected across fingerprinted layers';
  console.log(JSON.stringify(report, null, 2));
}

function main() {
  const mode = process.argv[2];
  if (mode === 'snippet') snippetMode();
  else if (mode === 'sandbox') sandboxMode();
  else if (mode === 'compare') compareMode();
  else usage();
}

main();
