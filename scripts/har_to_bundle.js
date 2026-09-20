#!/usr/bin/env node
// Import a browser HAR capture into a runtime-summary bundle the skill's
// evidence pipeline can consume — lowers the friction of "I have a HAR from
// devtools/burp" to one command. No network, pure parsing.
//
// Usage: node scripts/har_to_bundle.js <capture.har> [--out bundle-dir] [--json]
// Output bundle:
//   runtime-summary.json  (requests: method/url/status + initiator when present,
//                          cookie writes ordered, candidate protected requests)
//   requests.jsonl        (one request per line, full headers preserved)
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const harPath = argv[0];
if (!harPath || !fs.existsSync(harPath)) { console.error('usage: har_to_bundle.js <capture.har> [--out dir] [--json]'); process.exit(2); }
const outIdx = argv.indexOf('--out');
const outDir = outIdx >= 0 ? path.resolve(argv[outIdx + 1]) : path.join(path.dirname(harPath), 'bundle');
const WANT_JSON = argv.includes('--json');

const har = JSON.parse(fs.readFileSync(harPath, 'utf8'));
const entries = (har.log && har.log.entries) || [];

const requests = [];
const cookieWrites = [];
for (const e of entries) {
  const req = e.request || {}, res = e.response || {};
  const url = req.url || '';
  const rec = {
    method: req.method || 'GET',
    url,
    status: res.status,
    mimeType: (res.content && res.content.mimeType) || '',
    requestHeaders: (req.headers || []).reduce((a, h) => ((a[h.name.toLowerCase()] = h.value), a), {}),
    startedAt: e.startedDateTime || '',
  };
  // initiator when devtools-style har (pageref/_initiator extensions)
  if (e._initiator) rec.initiator = e._initiator;
  if (e._resourceType) rec.resourceType = e._resourceType;
  requests.push(rec);
  for (const h of res.headers || []) {
    if (/^set-cookie$/i.test(h.name)) cookieWrites.push({ url, cookie: h.value });
  }
}

// candidate protected requests: xhr/fetch-ish, non-2xx included, signish params/headers
const SIGNISH = /(sign|token|nonce|sig|auth|checksum|digest|encrypt)/i;
const candidates = requests.filter(r =>
  (r.resourceType === 'xhr' || r.resourceType === 'fetch' ||
   /json|text\/plain/.test(r.mimeType) || /\/api\/|\/graphql/.test(r.url)) &&
  (SIGNISH.test(r.url) || Object.keys(r.requestHeaders).some(k => SIGNISH.test(k)))
).map(r => ({ method: r.method, url: r.url.slice(0, 220), status: r.status, why: SIGNISH.test(r.url) ? 'url-param' : 'header' }));

const summary = {
  schema: 'js-reverse-ops-runtime-summary-har-v1',
  source: path.basename(harPath),
  generated_at: new Date().toISOString(),
  counts: { requests: requests.length, cookieWrites: cookieWrites.length, candidates: candidates.length },
  candidates,
  cookieWrites,
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'runtime-summary.json'), JSON.stringify(summary, null, 2) + '\n');
fs.writeFileSync(path.join(outDir, 'requests.jsonl'), requests.map(r => JSON.stringify(r)).join('\n') + '\n');
if (WANT_JSON) console.log(JSON.stringify(summary, null, 2));
else console.log(`bundle: ${outDir} | requests ${requests.length}, cookie writes ${cookieWrites.length}, candidate protected ${candidates.length}`);
