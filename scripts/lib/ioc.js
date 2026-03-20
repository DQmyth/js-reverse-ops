const fs = require('fs');
const MAX_MARKER_SAMPLES = 120;

function uniq(items) {
  return [...new Set(items)].sort();
}

function cap(items) {
  return uniq(items).slice(0, MAX_MARKER_SAMPLES);
}

function collect(code, re) {
  const matches = [];
  for (const m of code.matchAll(re)) {
    const value = m[1] || m[0];
    if (value) matches.push(value);
  }
  return uniq(matches);
}

function decodeNumericAscii(text) {
  const raw = text.match(/\d{1,3}/g) || [];
  const nums = raw.map((n) => Number(n));
  const out = [];
  let current = [];

  function flush() {
    if (current.length >= 4) {
      out.push(String.fromCharCode(...current));
    }
    current = [];
  }

  for (const num of nums) {
    if (num >= 32 && num <= 126) {
      current.push(num);
    } else {
      flush();
    }
  }
  flush();
  return uniq(out);
}

function collectFromDecodedStrings(strings, re) {
  const matches = [];
  for (const text of strings) {
    for (const m of text.matchAll(re)) {
      const value = m[1] || m[0];
      if (value) matches.push(value);
    }
  }
  return uniq(matches);
}

function resolveStringConcats(text) {
  const literals = new Map();
  for (const m of text.matchAll(/(?:var\s+|,)([_$A-Za-z][_$A-Za-z0-9]*)=(["'])([^"'\n]{1,120})\2/g)) {
    literals.set(m[1], m[3]);
  }

  for (let round = 0; round < 6; round += 1) {
    let changed = false;
    for (const m of text.matchAll(/([_$A-Za-z][_$A-Za-z0-9]*)=([_$A-Za-z][_$A-Za-z0-9]*(?:\+[_$A-Za-z][_$A-Za-z0-9]*){1,8});/g)) {
      const name = m[1];
      const parts = m[2].split('+');
      if (parts.includes(name)) continue;
      if (parts.every((part) => literals.has(part))) {
        const value = parts.map((part) => literals.get(part)).join('');
        if (value.length > 160) continue;
        if (!literals.has(name) || literals.get(name) !== value) {
          literals.set(name, value);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  return uniq([...literals.values()]);
}

function expandTrailingNumberPrefixes(items) {
  const out = [];
  for (const item of items) {
    out.push(item);
    const m = item.match(/^(\/api\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*\/)(\d{2,})$/);
    if (!m) continue;
    for (let i = 1; i <= m[2].length; i += 1) {
      out.push(m[1] + m[2].slice(0, i));
    }
  }
  return uniq(out);
}

function collapseDigitSuffixVariants(items) {
  const sorted = uniq(items).sort((a, b) => a.length - b.length);
  const dropped = new Set();
  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) {
      const short = sorted[i];
      const long = sorted[j];
      if (long.startsWith(short) && /^\d+$/.test(long.slice(short.length))) {
        dropped.add(long);
      }
    }
  }
  return sorted.filter((item) => !dropped.has(item));
}

function extractIocsFromCode(code, file = '<memory>') {
  const decoded = decodeNumericAscii(code);
  const resolved = resolveStringConcats(code);
  const routeCandidates = expandTrailingNumberPrefixes([
    ...collect(code, /["'`](\/[A-Za-z0-9_./?&=%:-]{3,})["'`]/g),
    ...collectFromDecodedStrings(decoded, /(\/api\/[A-Za-z0-9_./?&=%:-]{3,})/g),
    ...collectFromDecodedStrings(resolved, /(\/api\/[A-Za-z0-9_./?&=%:-]{3,})/g),
  ]);
  return {
    file,
    urls: collect(code, /https?:\/\/[^\s'"`<>\\]+/g),
    route_fragments: collapseDigitSuffixVariants(routeCandidates),
    header_keys: uniq([
      ...collect(code, /["'`](authorization|accept-time|content-type|x-[a-z0-9-]+|sign|signature|token|nonce|timestamp|cookie)["'`]/gi),
      ...collectFromDecodedStrings(decoded, /\b(authorization|accept-time|content-type|x-[a-z0-9-]+|sign|signature|token|nonce|timestamp|cookie)\b/gi),
    ]),
    crypto_terms: uniq([
      ...collect(code, /\b(CryptoJS|crypto\.subtle|md5|sha1|sha256|sha512|hmac|aes|rsa|TextEncoder|TextDecoder|getRandomValues|importKey|digest|sm3Digest)\b/gi),
      ...collectFromDecodedStrings(decoded, /\b(CryptoJS|crypto\.subtle|md5|sha1|sha256|sha512|hmac|aes|rsa|TextEncoder|TextDecoder|getRandomValues|importKey|digest|sm3Digest)\b/gi),
    ]),
    suspicious_apis: uniq([
      ...collect(code, /\b(eval|Function|WebAssembly|Worker|SharedWorker|WebSocket|localStorage|sessionStorage|indexedDB|document\.cookie|postMessage|ajax|XMLHttpRequest)\b/g),
      ...collectFromDecodedStrings(decoded, /\b(eval|Function|WebAssembly|Worker|SharedWorker|WebSocket|localStorage|sessionStorage|indexedDB|document\.cookie|postMessage|ajax|XMLHttpRequest)\b/g),
    ]),
    bundler_markers: collect(code, /\b(__webpack_require__|__webpack_modules__|webpackJsonp|parcelRequire)\b/g),
    obfuscation_marker_count: collect(code, /\b(_0x[0-9a-f]+|atob|btoa)\b/g).length,
    obfuscation_markers: cap(collect(code, /\b(_0x[0-9a-f]+|atob|btoa)\b/g)),
  };
}

function extractIocsFromFile(file) {
  return extractIocsFromCode(fs.readFileSync(file, 'utf8'), file);
}

module.exports = {
  extractIocsFromCode,
  extractIocsFromFile,
};
