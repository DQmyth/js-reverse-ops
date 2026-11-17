#!/usr/bin/env node
// cf_gate_triage: which Cloudflare level is blocking this URL?
// The diagnosis layer of the skill's CF capability — verdict + routing, not
// guessing. Escalating probe with a plain-Node client:
//
//   stage 1  thin headers (UA only)          — what a naive script sends
//   stage 2  full Chrome header set          — passes L0 and most of L1-header
//
// Then classify from status + the reliable markers (cf-mitigated header,
// challenge-page body markers, turnstile markers). L1 verdicts from THIS
// tool mean "plain TLS failed" — confirm with an impersonating client
// (curl_cffi) before escalating to L2 tooling, because Node's TLS stack is
// its own fingerprint.
//
// Usage: node scripts/cf_gate_triage.js <url> [--json] [--timeout 15000]
// Exit code 0 always; the verdict is the data (JSON) or the human table.
const CH_VER = '"Not:A-Brand";v="8.0.0.0", "Chromium";v="156.0.8078.80", "Google Chrome";v="156.0.8078.80"';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36';

const argv = process.argv.slice(2);
const url = argv[0];
const WANT_JSON = argv.includes('--json');
const tIdx = argv.indexOf('--timeout');
const TIMEOUT = tIdx >= 0 ? parseInt(argv[tIdx + 1], 10) : 15000;
if (!url || !/^https?:\/\//.test(url)) {
  console.error('usage: cf_gate_triage.js <url> [--json] [--timeout ms]');
  process.exit(2);
}

const THIN = { 'User-Agent': UA, 'Accept': '*/*' };
const FULL = {
  'User-Agent': UA,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'Sec-Fetch-Dest': 'document', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Site': 'none', 'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
  'sec-ch-ua': '"Not:A-Brand";v="8", "Chromium";v="156", "Google Chrome";v="156"',
  'sec-ch-ua-full-version-list': CH_VER,
  'sec-ch-ua-mobile': '?0', 'sec-ch-ua-platform': '"macOS"',
  'Priority': 'u=0, i',
};

const CHALLENGE_MARKERS = ['__cf_chl_opt', '_cf_chl_opt', '/cdn-cgi/challenge-platform/', 'cf-chl-bypass', 'cf_chl_prog', 'Just a moment'];
const TURNSTILE_MARKERS = ['challenges.cloudflare.com/turnstile', 'cf-turnstile-response', 'cf-turnstile'];

function classify(status, headers, body) {
  // headers may be a plain object OR a fetch Headers instance (Object.entries
  // on the latter is empty) — normalize to lowercase keys
  const h = typeof headers.get === 'function'
    ? new Map([...headers.entries()].map(([k, v]) => [k.toLowerCase(), v]))
    : Object.fromEntries(Object.entries(headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
  const get = (k) => (typeof h.get === 'function' ? h.get(k) : h[k]);
  const head = body.slice(0, 8192);
  const markers = {
    cf_mitigated: get('cf-mitigated') || null,
    challenge: CHALLENGE_MARKERS.filter(m => head.includes(m)),
    turnstile: TURNSTILE_MARKERS.filter(m => head.includes(m)),
    cf_bm_cookie_hint: /set-cookie:\s*__cf_bm/i.test(String(get('set-cookie') || '')) || head.includes('__cf_bm'),
  };
  // order matters: a challenge INTERCEPT state outranks everything; a 200
  // page with an embedded turnstile widget is still L2b (the form gates the
  // submission, not the page load) — live-tested against a turnstile demo
  // that a naive 200-shortcut misjudged as L0
  let level;
  if (markers.cf_mitigated === 'challenge' || status === 503 || (status !== 200 && markers.challenge.length)) level = 'L2';
  else if (markers.turnstile.length) level = 'L2b';
  else if (status === 200) level = 'L0';
  else if (status === 403 || status === 429) level = 'L1';
  else level = 'L0';
  const route = {
    L0: 'no gate — straight into the pipeline (full header set costs nothing)',
    L1: 'upgrade client: full-header impersonation (curl_cffi chrome) + clean residential IP; re-triage before assuming more',
    L2: 'acquire cf_clearance once (request-level solver or single browser session), then deliver pure-HTTP; pool by (host, proxy), invalidate on cf-mitigated',
    L2b: 'request-level turnstile solve (sitekey/action/cData) or one interactive pass; reuse cf_clearance with pinned (IP, UA)',
    L3: 'suspect bot management — verify manually from a clean IP; route around (app API / public API) or commercial scraping API',
  }[level];
  return { status, markers, level, route };
}

async function probe(headers) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { headers, redirect: 'manual', signal: ctl.signal });
    const body = await res.text().catch(() => '');
    return classify(res.status, res.headers, body);
  } finally { clearTimeout(timer); }
}

(async () => {
  let thin, full, error = null;
  try {
    thin = await probe(THIN);
    full = (thin.status === 200) ? thin : await probe(FULL);
  } catch (e) { error = e.name === 'AbortError' ? `timeout after ${TIMEOUT}ms` : e.message; }

  let level, note;
  if (error) { level = 'UNKNOWN'; note = `probe failed: ${error} (network? DNS? TLS?)`; }
  else if (full.status === 200) { level = full.level; note = 'full header set passes'; }
  else { level = full.level; note = `full header set still blocked (${full.status})`; }

  const report = {
    url, verdict: level, note,
    thin_probe: thin ? { status: thin.status, level: thin.level } : null,
    full_probe: full ? { status: full.status, markers: full.markers } : null,
    route: error ? 'fix connectivity first' : full.route,
    caveat: 'L1 verdicts come from plain-Node TLS — confirm with an impersonating client (curl_cffi) before escalating to L2 tooling',
    reference: 'references/cf-gate-triage.md',
  };
  if (WANT_JSON) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`verdict: ${level} — ${note}`);
    if (full && full.markers.cf_mitigated) console.log(`  cf-mitigated: ${full.markers.cf_mitigated}`);
    if (full && full.markers.challenge.length) console.log(`  challenge markers: ${full.markers.challenge.join(', ')}`);
    if (full && full.markers.turnstile.length) console.log(`  turnstile markers: ${full.markers.turnstile.join(', ')}`);
    console.log(`route: ${report.route}`);
    console.log(`(${report.caveat})`);
  }
})();
