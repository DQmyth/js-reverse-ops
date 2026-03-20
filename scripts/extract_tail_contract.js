#!/usr/bin/env node
const fs = require('fs');

function usage() {
  console.error('Usage: extract_tail_contract.js <input.js> [--tail N] [--output result.json]');
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
    if (current.length >= 4) {
      const s = String.fromCharCode(...current);
      out.push(s);
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
  return out;
}

function collectQuotedStrings(text) {
  const found = [];
  for (const m of text.matchAll(/(["'])([^"'\\\n]{3,80})\1/g)) {
    found.push(m[2]);
  }
  return found;
}

function normalizeCandidates(items) {
  return uniq(items
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !/^\d+$/.test(s))
    .filter((s) => s.length >= 3)
    .filter((s) => /[A-Za-z/_-]/.test(s))
  );
}

function resolveTailStrings(text) {
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

  return [...literals.values()];
}

function expandEndpointVariants(items) {
  const out = [];
  for (const item of items) {
    out.push(item);
    const m = item.match(/(\/api\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\/)(\d{2,})$/);
    if (m) {
      for (let i = 1; i <= m[2].length; i += 1) {
        out.push(m[1] + m[2].slice(0, i));
      }
    }
  }
  return uniq(out);
}

function extractEndpoints(items) {
  const found = [];
  for (const item of items) {
    for (const m of item.matchAll(/\/api\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*(?:\/\d+)?/g)) {
      found.push(m[0]);
    }
  }
  return uniq(found);
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

const quoted = normalizeCandidates(collectQuotedStrings(tail));
const decoded = normalizeCandidates(decodeNumericAscii(tail));
const resolved = normalizeCandidates(resolveTailStrings(tail));
const candidates = uniq([...quoted, ...decoded, ...resolved]);
const endpointPool = collapseDigitSuffixVariants(extractEndpoints(expandEndpointVariants(candidates)));

const endpointCandidates = endpointPool.filter((s) => /^\/api\//.test(s));
const methodCandidates = candidates.filter((s) => /^(GET|POST|PUT|DELETE|PATCH)$/.test(s.toUpperCase()) || ['ajax', 'beforeSend', 'success', 'error'].includes(s));
const keyCandidates = candidates.filter((s) => /^(page|token|sign|signature|nonce|timestamp|yt\d+|data|url|type|async|headers?)$/i.test(s));
const headerCandidates = candidates.filter((s) => /^(Accept-Time|Authorization|Cookie|X-[A-Za-z-]+|Content-Type)$/i.test(s));
const cryptoCandidates = candidates.filter((s) => /(sm3|md5|sha\d*|hmac|aes|rsa|digest)/i.test(s));
const helperCandidates = candidates.filter((s) => /^(ABC|sm3Digest|parseInt|Date|now|timezoneOffset|getTimezoneOffset|z|open|ajax|beforeSend)$/.test(s));

function findFirst(regexes) {
  for (const re of regexes) {
    const hit = candidates.find((s) => re.test(s));
    if (hit) return hit;
  }
  return null;
}

function bestEndpoint(items) {
  const ranked = items
    .filter((s) => /^\/api\//.test(s))
    .sort((a, b) => b.length - a.length);
  return ranked[0] || null;
}

const inferred = {
  endpoint: bestEndpoint(endpointCandidates),
  method: findFirst([/^POST$/i, /^GET$/i]),
  body_keys: keyCandidates.filter((s) => /^(page|token|sign|signature|nonce|timestamp|yt\d+|data)$/i.test(s)),
  header_keys: headerCandidates,
  token_fields: keyCandidates.filter((s) => /^(token|sign|signature|yt\d+)$/i.test(s)),
  crypto_or_helper_markers: uniq([...cryptoCandidates, ...helperCandidates]),
};

const highSignal = candidates.filter((s) =>
  /\/api\//.test(s) ||
  /^(POST|GET)$/i.test(s) ||
  /^(page|token|sign|signature|nonce|timestamp|yt\d+)$/i.test(s) ||
  /Accept-Time/i.test(s) ||
  /(sm3|md5|sha\d*|digest)/i.test(s) ||
  /^(ABC|z|ajax|beforeSend|success|error)$/.test(s)
);

const result = {
  file: inputPath,
  tail_size: tail.length,
  inferred,
  high_signal_strings: uniq(highSignal),
  direct_quoted_hits: quoted.filter((s) => highSignal.includes(s)),
  decoded_ascii_hits: decoded.filter((s) => highSignal.includes(s)),
  resolved_concat_hits: resolved.filter((s) => highSignal.includes(s) || /\/api\//.test(s)),
  tail_excerpt: tail.slice(-2000),
};

const json = JSON.stringify(result, null, 2);
if (outPath) {
  fs.writeFileSync(outPath, json + '\n', 'utf8');
} else {
  console.log(json);
}
