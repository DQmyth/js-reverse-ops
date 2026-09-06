#!/usr/bin/env node
// Scaffold a verbatim-execution harness for a practice/replay target.
//
//   node scripts/scaffold_verbatim_harness.js <topic-or-name> \
//     --sandbox vm|jsdom            # vm: minimal context (signer-only targets)
//                                   # jsdom: full page (DOM-dependent targets)
//     --pagination call|handler|click  # how to flip pages
//          call    -> global call(N) entry, re-invoked per page (topic 28)
//          handler -> recorded $(...).on("click",".pgx-page",fn) invoked with a fake element (topic 29)
//          click   -> real DOM button click by text (topic 24/27, jsdom only)
//     --output-dir <dir>            # default scaffold-<name>/
//
// The generated collector encodes the verified rules from
// references/env-rebuild-recipes.md: no host builtins in vm contexts, real
// timers, per-page fresh clock, inline-proxy forwarding, calibration hook,
// and explicit process.exit.

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) args[a.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    else args._.push(a);
  }
  return args;
}

function fail(msg) {
  console.error('scaffold_verbatim_harness: ' + msg);
  process.exit(1);
}

const VM_TEMPLATE = (name, pagination, topicId) => `#!/usr/bin/env node
// Verbatim-execution collector for ${name} (vm minimal sandbox).
// Rules encoded here (see references/env-rebuild-recipes.md):
//  - only BOM/DOM stubs enter the sandbox; ECMAScript builtins come from the context
//    (host eval/Function would bind indirect-eval scope to the host global)
//  - the page computes every token itself; captured request URLs are forwarded for real
//  - real timers + uncaughtException no-ops (timer-driven environment self-checks)
//  - fresh clock per page (token-embedded now has a short TTL window)
// Usage: node collect.js <sessionid> [--pages=5]
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const https = require('https');

process.on('uncaughtException', () => {});
process.on('unhandledRejection', () => {});
const SESSIONID = process.argv[2] || '';
const PAGES = parseInt((process.argv.find(a => a.startsWith('--pages=')) || '--pages=5').split('=')[1], 10);
const BASE = 'match.example.com';           // TODO: target host
const TOPIC = '${topicId}';                      // TODO: topic/endpoint id
const PAGE_PATH = '/match/' + TOPIC;        // TODO: referer path
const UA_CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

let FRESH_NOW = String(Date.now()); // refreshed before every page
const captured = [];                // page-assembled protected-request URLs, in order
const results = {};                 // page -> {status, body}

function httpsGet(qs, headers = {}) {
  return new Promise((resolve) => {
    const req = https.request({ host: BASE, path: qs, headers, timeout: 20000 }, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', e => resolve({ status: 0, body: String(e) })); req.end();
  });
}

function nativeFn(name) {
  const f = { [name]: function () {} }[name];
  f.toString = function () { return 'function ' + name + '() { [native code] }'; };
  return f;
}
function makeEl(tag, id) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(), style: {}, children: [], textContent: '', innerHTML: '', value: '',
    className: '', id: id || '', dataset: {}, content: '',
    setAttribute(k, v) { el[k] = v; }, getAttribute(k) { return el[k] == null ? null : el[k]; }, removeAttribute() {},
    addEventListener() {}, removeEventListener() {}, appendChild(c) { el.children.push(c); return c; }, remove() {}, replaceChildren() { el.children = []; },
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }, getContext: () => null,
  };
  return el;
}
const HTMLDoc = nativeFn('HTMLDocument');
const sandbox = {
  console: { log() {}, warn() {}, error() {}, info() {}, trace() {}, debug() {} },
  setTimeout: (fn, ms) => setTimeout(() => { try { fn(); } catch (e) {} }, ms),
  clearTimeout: t => clearTimeout(t),
  setInterval: (fn, ms) => setInterval(() => { try { fn(); } catch (e) {} }, ms),
  clearInterval: t => clearInterval(t),
  requestAnimationFrame() { return 0; }, cancelAnimationFrame() {},
  document: Object.assign(Object.create(null), {
    [Symbol.toStringTag]: 'HTMLDocument',
    cookie: 'sessionid=' + SESSIONID, readyState: 'complete', hidden: false, visibilityState: 'visible',
    head: makeEl('head'), body: makeEl('body'), documentElement: makeEl('html'),
    getElementById: id => makeEl('div', id),
    querySelector: sel => (/match_num/.test(sel) ? Object.assign(makeEl('meta'), { content: TOPIC }) : makeEl('div')),
    querySelectorAll: () => [],
    createElement: tag => makeEl(tag),
    addEventListener() {}, removeEventListener() {},
  }),
  navigator: {
    [Symbol.toStringTag]: 'Navigator',
    userAgent: UA_CHROME, platform: 'MacIntel', language: 'zh-CN', languages: ['zh-CN', 'zh'],
    webdriver: false, hardwareConcurrency: 12, maxTouchPoints: 0, vendor: 'Google Inc.', cookieEnabled: true, onLine: true,
    plugins: { length: 5 }, mimeTypes: { length: 2 }, pdfViewerEnabled: true, deviceMemory: 8, doNotTrack: null,
  },
  location: { href: 'https://' + BASE + PAGE_PATH, protocol: 'https:', host: BASE, hostname: BASE, port: '', pathname: PAGE_PATH, search: '', hash: '', origin: 'https://' + BASE },
  history: { length: 1, pushState() {}, replaceState() {} },
  screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1055, colorDepth: 24, pixelDepth: 24 },
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  performance: { now: () => Date.now(), timing: {} },
  crypto: { getRandomValues: a => require('crypto').randomFillSync(a), subtle: {} },
  fetch: nativeFn('fetch'), Worker: nativeFn('Worker'),
  URL, URLSearchParams, TextEncoder, TextDecoder,
  alert() {}, failedAlert() {}, successAlert() {}, expUpAlert() {},
  Document: nativeFn('Document'), Window: nativeFn('Window'), Navigation: nativeFn('Navigation'), Location: nativeFn('Location'),
  FocusEvent: nativeFn('FocusEvent'), Node: nativeFn('Node'), HTMLDocument, HTMLElement: nativeFn('HTMLElement'),
  Element: nativeFn('Element'), Event: nativeFn('Event'), Storage: nativeFn('Storage'), Screen: nativeFn('Screen'),
  print: nativeFn('print'),
};
sandbox.window = sandbox; sandbox.self = sandbox; sandbox.top = sandbox; sandbox.parent = sandbox;
sandbox.XMLHttpRequest = function () {
  const s = this;
  s.open = (m, u) => { s._url = String(u); };
  s.setRequestHeader = () => {}; s.getAllResponseHeaders = () => '';
  s.send = () => {
    if (/getTime/.test(s._url)) { s.status = 200; s.readyState = 4; s.responseText = FRESH_NOW; s.response = FRESH_NOW; }
    else if (new RegExp('/api/question/' + TOPIC).test(s._url)) { captured.push(s._url); s.status = 200; s.readyState = 4; s.responseText = '{}'; s.response = '{}'; }
    else { s.status = 200; s.readyState = 4; s.responseText = '{}'; s.response = '{}'; }
    if (typeof s.onreadystatechange === 'function') s.onreadystatechange();
    if (typeof s.onload === 'function') s.onload();
  };
  s.addEventListener = (ev, fn) => { if (ev === 'load') s.onload = fn; if (ev === 'readystatechange') s.onreadystatechange = fn; };
};
// jQuery stub: record click handlers for pagination; chainable otherwise.
const clickHandlers = {};
function wrap(arg) {
  const target = arg && typeof arg === 'object' && arg.__page !== undefined ? arg : null;
  const api = function () { return api; };
  api.data = k => (target ? target.__props[k] : 1);
  api.val = () => (target && target.__props.value) || '';
  for (const m of ['each', 'text', 'html', 'css', 'prop', 'toggleClass', 'addClass', 'removeClass', 'add', 'find', 'attr']) api[m] = () => api;
  api.on = function (evt, a, b) {
    const fn = b || a, sel = b ? a : null;
    if (typeof fn === 'function') clickHandlers[sel ? evt + ' ' + sel : evt] = fn;
    return api;
  };
  return api;
}
const jq = function (arg) {
  if (typeof arg === 'function') { try { arg(jq); } catch (e) {} return wrap(null); }
  return wrap(arg && typeof arg === 'object' ? arg : null);
};
jq.trim = v => String(v == null ? '' : v).trim();
jq.param = o => Object.keys(o).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(o[k] == null ? '' : o[k])).join('&');
jq.each = () => {}; jq.extend = Object.assign; jq.type = v => typeof v;
jq.ajax = function (opt) {
  const url = String(opt.url || '');
  if (/getTime/.test(url)) { if (opt.success) opt.success(FRESH_NOW); return; }
  if (new RegExp('/api/question/' + TOPIC).test(url)) {
    captured.push(url + (url.includes('?') ? '&' : '?') + (typeof opt.data === 'string' ? opt.data : jq.param(opt.data || {})));
    return;
  }
  if (opt.success) opt.success({});
};
sandbox.$ = jq; sandbox.jQuery = jq;

vm.createContext(sandbox);
// NOTE: pass the page script verbatim. No host eval/Function/builtins in the sandbox.
const pageScript = fs.readFileSync(path.join(__dirname, 'page.js'), 'utf8');
try { vm.runInContext(pageScript, sandbox, { timeout: 30000, filename: 'page.js' }); }
catch (e) { console.error('RUN ERR:', String(e.stack).split('\\n').slice(0, 4).join(' | ')); process.exit(1); }

(async () => {
  const out = {};
  const waitCaptured = async n => {
    for (let t = 0; t < 120; t++) { if (captured[n]) return captured[n]; await new Promise(r => setTimeout(r, 250)); }
    throw new Error('no captured request for page ' + n);
  };
  for (let page = 1; page <= PAGES; page++) {
    FRESH_NOW = String(Date.now()); // per-page fresh clock (token TTL window)
    if (page > 1) {
      // PAGINATION (call style): re-invoke the global entry for the next page.
      try { sandbox.call(page); } catch (e) { throw new Error('call(' + page + ') failed: ' + e.message); }
    }
    const qs = await waitCaptured(page - 1);
    const r = await httpsGet(qs, {
      Cookie: 'sessionid=' + SESSIONID, Referer: 'https://' + BASE + PAGE_PATH,
      'x-requested-with': 'XMLHttpRequest', 'Accept-Time': FRESH_NOW,
      'User-Agent': page === 5 ? 'yuanrenxue' : UA_CHROME,
    });
    console.error('page ' + page + ': ' + r.status + ' ' + r.body.slice(0, 70));
    if (r.status === 200) { try { out[page] = JSON.parse(r.body).data; } catch (e) {} }
    await new Promise(s => setTimeout(s, 700));
  }
  console.log('RESULT_JSON<<<' + JSON.stringify(out) + '>>>');
  process.exit(0); // real timers keep the loop alive; exit explicitly
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
`;

const JSDOM_TEMPLATE = (name, topicId) => `#!/usr/bin/env node
// Verbatim-execution collector for ${name} (jsdom full page).
// Rules encoded here (see references/env-rebuild-recipes.md):
//  - full page html + resource interceptor; the page computes every token itself
//  - protected requests are forwarded for real the instant they are assembled (inline proxy)
//  - per-page fresh clock before pagination (token-embedded now TTL window)
//  - pagination by real DOM click (topic 24/27 style)
// Usage: node collect.js <sessionid> [--pages=5]
const fs = require('fs');
const path = require('path');
const https = require('https');
const { JSDOM, VirtualConsole, requestInterceptor } = require('jsdom'); // TODO: pin your jsdom require path

const SESSIONID = process.argv[2] || '';
const PAGES = parseInt((process.argv.find(a => a.startsWith('--pages=')) || '--pages=5').split('=')[1], 10);
const RAW = path.join(__dirname, 'raw');
let NOW = String(Date.now());
const results = {};
const BASE = 'match.example.com';           // TODO: target host
const TOPIC = '${topicId}';                      // TODO: topic/endpoint id
const UA_CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

const PAGE = (() => {
  const real = fs.readFileSync(path.join(RAW, 'page.html'), 'utf8');
  const inject = [
    '<script>',
    'window.__SESSIONID__ = __SESSIONID_PLACEHOLDER__;',
    'window.alert = function () {}; window.failedAlert = function () {}; window.successAlert = function () {};',
    // environment alignment prelude: add getters/objects the VM actually reads.
    'try { Object.defineProperty(document, "cookie", { configurable: true, get() { return "sessionid=" + window.__SESSIONID__; }, set() {} }); } catch (e) {}',
    '</script>',
  ].join('\\n');
  return real.replace(/<head[^>]*>/i, m => m + inject);
})();

const interceptor = requestInterceptor((request) => {
  const u = new URL(request.url);
  if (u.pathname === '/api/getTime') return new Response(NOW, { headers: { 'Content-Type': 'text/plain' } });
  if (u.pathname.startsWith('/api/question/')) {
    const qs = decodeURIComponent(u.pathname + u.search);
    const m = /[?&]page=(\\d+)/.exec(qs);
    const pageNum = m ? m[1] : '1';
    const ua = pageNum === '5' ? 'yuanrenxue' : UA_CHROME;
    return new Promise((resolve) => {
      const req = https.request('https://' + BASE + u.pathname + u.search, {
        headers: { cookie: 'sessionid=' + SESSIONID, referer: 'https://' + BASE + PAGE_PATH, 'x-requested-with': 'XMLHttpRequest', 'user-agent': ua, 'accept-time': NOW },
        timeout: 20000,
      }, (res) => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => {
          results[pageNum] = { status: res.statusCode, body: d };
          console.error('page ' + pageNum + ': ' + res.statusCode + ' ' + d.slice(0, 70));
          resolve(new Response(d, { headers: { 'Content-Type': 'application/json' } }));
        });
      });
      req.on('error', () => resolve(new Response('{}', { headers: { 'Content-Type': 'application/json' } })));
      req.end();
    });
  }
  if (u.pathname.startsWith('/api/')) return new Response('{}', { headers: { 'Content-Type': 'application/json' } });
  if (u.pathname === '/static/new_match/jquery/jquery.js') return new Response(fs.readFileSync(path.join(RAW, 'jquery.js')), { headers: { 'Content-Type': 'application/javascript' } });
  if (u.pathname.endsWith('.js')) return new Response(fs.readFileSync(path.join(RAW, 'challenge.js')), { headers: { 'Content-Type': 'application/javascript' } });
  if (u.pathname.endsWith('.css')) return new Response('', { headers: { 'Content-Type': 'text/css' } });
  return new Response('', { headers: { 'Content-Type': 'text/plain' } });
});

const vc = new VirtualConsole(); vc.on('jsdomError', () => {});
const dom = new JSDOM(PAGE.replace('__SESSIONID_PLACEHOLDER__', JSON.stringify(SESSIONID)).replace('__UA_PLACEHOLDER__', JSON.stringify(UA_CHROME)), {
  url: 'https://' + BASE + PAGE_PATH,
  runScripts: 'dangerously',
  resources: { interceptors: [interceptor] },
  virtualConsole: vc,
  pretendToBeVisual: true,
});

setTimeout(() => {
  let pg = 2;
  const t0 = Date.now();
  const step = () => {
    if (pg > PAGES || Date.now() - t0 > 60000) {
      const out = {};
      for (let p = 1; p <= PAGES; p++) {
        if (results[p] && results[p].status === 200) { try { out[p] = JSON.parse(results[p].body).data; } catch (e) {} }
      }
      console.log('RESULT_JSON<<<' + JSON.stringify(out) + '>>>');
      process.exit(0); // jsdom timers keep the loop alive; exit explicitly
    }
    if (results[pg] && results[pg].status === 200) { pg++; step(); return; } // skip completed pages
    NOW = String(Date.now()); // fresh clock per page
    const btn = [...dom.window.document.querySelectorAll('button')].find(x => x.textContent.trim() === String(pg));
    if (btn) { try { btn.click(); } catch (e) { console.error('click ' + pg + ' ERR: ' + e.message); } }
    else console.error('button ' + pg + ' not found');
    setTimeout(step, 2500);
  };
  step();
}, 4000);
`;

function main() {
  const args = parseArgs(process.argv.slice(2));
  const name = args._[0];
  if (!name) fail('usage: scaffold_verbatim_harness.js <topic-or-name> --sandbox vm|jsdom --pagination call|handler|click [--output-dir dir]');
  const sandboxMode = args.sandbox === 'jsdom' ? 'jsdom' : args.sandbox === 'vm' ? 'vm' : null;
  if (!sandboxMode) fail('--sandbox is required: vm or jsdom');
  const pagination = args.pagination === 'call' || args.pagination === 'handler' || args.pagination === 'click' ? args.pagination : null;
  if (!pagination) fail('--pagination is required: call, handler, or click');
  if (sandboxMode === 'vm' && pagination === 'click') fail('click pagination needs jsdom (real DOM); use --pagination call or handler');
  const outDir = path.resolve(args['output-dir'] || path.join('scaffold-' + String(name).replace(/[^\w.-]+/g, '-')));
  const topicId = String(name).replace(/[^\w.-]+/g, '');
  const template = sandboxMode === 'vm' ? VM_TEMPLATE(name, pagination, topicId) : JSDOM_TEMPLATE(name, topicId);
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, 'collect.js');
  fs.writeFileSync(file, template);
  fs.writeFileSync(path.join(outDir, 'TODO.md'), [
    '# Scaffold TODO',
    '',
    '- [ ] replace `match.example.com`, `PAGE_PATH`, `TOPIC` with the real target',
    '- [ ] ' + (sandboxMode === 'vm'
      ? 'drop `page.js` (unpacked challenge script) next to collect.js; re-unpack on identifier drift'
      : 'drop `raw/page.html`, `raw/jquery.js`, `raw/challenge.js`; re-download on identifier drift'),
    '- [ ] run once; calibrate any in-process oracle the playbook requires before trusting 200s',
    '- [ ] remember: a 200 can be fake data (maze) — require a cross-run stable total before submitting',
    '',
    'Rules reference: `references/env-rebuild-recipes.md`, `references/misdiagnosis-patterns.md`.',
  ].join('\n'));
  console.log(JSON.stringify({ scaffolded: file, sandbox: sandboxMode, pagination, files: ['collect.js', 'TODO.md'] }, null, 2));
}

main();
