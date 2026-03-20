#!/usr/bin/env node
const fs = require('fs');

function usage() {
  console.error('Usage: extract_request_contract.js <input.js> [--tail N] [--output result.json]');
  process.exit(1);
}

if (process.argv.length < 3) usage();

const inputPath = process.argv[2];
const tailIndex = process.argv.indexOf('--tail');
const tailSize = tailIndex !== -1 ? Number(process.argv[tailIndex + 1] || '12000') : 12000;
const outIndex = process.argv.indexOf('--output');
const outPath = outIndex !== -1 ? process.argv[outIndex + 1] : null;
const code = fs.readFileSync(inputPath, 'utf8');
const tail = code.slice(Math.max(0, code.length - tailSize));

function uniq(items) {
  return [...new Set(items)].sort();
}

function decodeNumericAscii(text) {
  const raw = text.match(/\d{1,3}/g) || [];
  const nums = raw.map((n) => Number(n));
  const out = [];
  let current = [];
  function flush() {
    if (current.length >= 4) out.push(String.fromCharCode(...current));
    current = [];
  }
  for (const num of nums) {
    if (num >= 32 && num <= 126) current.push(num);
    else flush();
  }
  flush();
  return out;
}

function collectQuotedStrings(text) {
  const found = [];
  for (const m of text.matchAll(/(["'])([^"'\\\n]{3,160})\1/g)) found.push(m[2]);
  return found;
}

function resolveStringConcats(text) {
  const literals = new Map();
  for (const m of text.matchAll(/(?:var\s+|,)([_$A-Za-z][_$A-Za-z0-9]*)=(["'])([^"'\n]{1,160})\2/g)) {
    literals.set(m[1], m[3]);
  }
  for (let round = 0; round < 8; round += 1) {
    let changed = false;
    for (const m of text.matchAll(/([_$A-Za-z][_$A-Za-z0-9]*)=([_$A-Za-z][_$A-Za-z0-9]*(?:\+[_$A-Za-z][_$A-Za-z0-9]*){1,12});/g)) {
      const name = m[1];
      const parts = m[2].split('+');
      if (parts.includes(name)) continue;
      if (parts.every((part) => literals.has(part))) {
        const value = parts.map((part) => literals.get(part)).join('');
        if (value.length > 240) continue;
        if (literals.get(name) !== value) {
          literals.set(name, value);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return [...literals.values()];
}

function normalizeCandidates(items) {
  return uniq(items
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !/^\d+$/.test(s))
    .filter((s) => s.length >= 2)
    .filter((s) => /[A-Za-z/_-]/.test(s)));
}

function expandEndpointVariants(items) {
  const out = [];
  for (const item of items) {
    out.push(item);
    const m = item.match(/(\/api\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*\/)(\d{2,})$/);
    if (m) {
      for (let i = 1; i <= m[2].length; i += 1) out.push(m[1] + m[2].slice(0, i));
    }
  }
  return uniq(out);
}

function extractEndpoints(items) {
  const out = [];
  for (const item of items) {
    for (const m of item.matchAll(/\/api\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*(?:\/\d+)?/g)) out.push(m[0]);
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
      if (long.startsWith(short) && /^\d+$/.test(long.slice(short.length))) dropped.add(long);
    }
  }
  return sorted.filter((item) => !dropped.has(item));
}

function collectChannel(text) {
  return normalizeCandidates([
    ...collectQuotedStrings(text),
    ...decodeNumericAscii(text),
    ...resolveStringConcats(text),
  ]);
}

function scoreEndpoint(item) {
  let score = item.length;
  if (/\/api\/[A-Za-z0-9_-]+\/\d+/.test(item)) score += 1000;
  if (/\/api\/answer/.test(item)) score += 900;
  if (/\/api\/loginInfo/.test(item)) score -= 300;
  if (/\.(png|jpg|jpeg|gif|svg|css|js|woff2?)$/i.test(item)) score -= 700;
  if (/background\.png/i.test(item)) score -= 800;
  return score;
}

function bestEndpoint(items) {
  const best = items
    .filter((s) => /^\/api\//.test(s))
    .sort((a, b) => scoreEndpoint(b) - scoreEndpoint(a))[0] || null;
  if (best && /\.(png|jpg|jpeg|gif|svg|css|js|woff2?)$/i.test(best)) return null;
  if (best && /background\.png/i.test(best)) return null;
  return best;
}

function findSnippet(haystack, needle) {
  if (!needle) return null;
  const idx = haystack.indexOf(needle);
  if (idx === -1) return null;
  return haystack.slice(Math.max(0, idx - 180), Math.min(haystack.length, idx + needle.length + 220));
}

const fullCandidates = collectChannel(code);
const tailCandidates = collectChannel(tail);
const mergedCandidates = uniq([...fullCandidates, ...tailCandidates]);
const endpointCandidates = collapseDigitSuffixVariants(extractEndpoints(expandEndpointVariants(mergedCandidates)));
const methodCandidates = mergedCandidates.filter((s) => /^(GET|POST|PUT|DELETE|PATCH)$/i.test(s));
const keyCandidates = mergedCandidates.filter((s) => /^(page|token|sign|signature|nonce|timestamp|yt\d+|data|url|type|async|headers?|now|answer|serial)$/i.test(s));
const headerCandidates = mergedCandidates.filter((s) => /^(Accept-Time|Authorization|Cookie|Content-Type|X-[A-Za-z-]+)$/i.test(s));
const helperCandidates = mergedCandidates.filter((s) => /(sm3Digest|CryptoJS|MD5|SHA\d*|AES|RSA|ABC|parseInt|Date|now|ajax|open|getTimezoneOffset|WebAssembly|Worker|fonteditor|canvas|yew|wasm)/i.test(s));

const inferred = {
  endpoint: bestEndpoint(endpointCandidates),
  method: methodCandidates.find((s) => /^POST$/i.test(s)) || methodCandidates[0] || null,
  body_keys: keyCandidates.filter((s) => /^(page|token|sign|signature|nonce|timestamp|yt\d+|data|now|answer|serial)$/i.test(s)),
  header_keys: headerCandidates,
  token_fields: keyCandidates.filter((s) => /^(token|sign|signature|yt\d+)$/i.test(s)),
  crypto_or_helper_markers: uniq(helperCandidates),
};

const result = {
  file: inputPath,
  size_bytes: code.length,
  inferred,
  sources: {
    full_file_candidates: fullCandidates.filter((s) => /^\/api\//.test(s) || /^(POST|GET)$/i.test(s) || /^(page|token|sign|signature|nonce|timestamp|yt\d+|now|answer|serial)$/i.test(s) || /(CryptoJS|MD5|SHA\d*|AES|RSA|ABC|sm3Digest|ajax|WebAssembly|yew|wasm)/i.test(s)),
    tail_candidates: tailCandidates.filter((s) => /^\/api\//.test(s) || /^(POST|GET)$/i.test(s) || /^(page|token|sign|signature|nonce|timestamp|yt\d+|now|answer|serial)$/i.test(s) || /(CryptoJS|MD5|SHA\d*|AES|RSA|ABC|sm3Digest|ajax|WebAssembly|yew|wasm)/i.test(s)),
  },
  snippets: {
    endpoint: findSnippet(code, inferred.endpoint),
    token_field: findSnippet(code, inferred.token_fields[0] || null),
    helper: findSnippet(code, inferred.crypto_or_helper_markers[0] || null),
  },
};

const json = JSON.stringify(result, null, 2);
if (outPath) fs.writeFileSync(outPath, json + '\n', 'utf8');
else console.log(json);
