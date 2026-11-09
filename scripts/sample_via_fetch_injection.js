#!/usr/bin/env node
// In-target CALL-trace sampler via Fetch-domain response interception.
//
// WHY THIS EXISTS (topic-31 lesson, misdiagnosis M12): wrapping globals
// (WebAssembly.instantiate, Function.prototype.apply, ...) to observe a
// protected target is detectable — the loader sees non-[native code] and
// routes to a decoy key schedule. Injecting tracing INSIDE the target's own
// code (by rewriting its JS response in flight) touches zero globals and
// therefore does not perturb the cipher state.
//
// The generic recipe below targets JSVMP-style interpreters whose CALL
// handler matches:  function(){var n=i.pop(),o=n?i.slice(-n):[];
// (stack machine: pop argc, take top argc values as args, i[len-2] = callee).
// Adjust `ANCHOR` for other flavors.
//
// Usage:
//   node sample_via_fetch_injection.js <page-url> <script-url-substr> [--sid <cookie>]
// Env: a debug Chrome must be listening (--remote-debugging-port=9222).
//
// Output: JSON lines on stdout — every VM CALL whose args contain a string
// longer than --minlen (default 20): { f: callee-tag, a: args-preview }.
const { connect, putJson } = require('./cdp_minibrowser.js');

const argv = process.argv.slice(2);
const PAGE_URL = argv[0];
const SCRIPT_SUB = argv[1] || '.js';
const SID = (argv.indexOf('--sid') >= 0 && argv[argv.indexOf('--sid') + 1]) || null;
const MINLEN = (argv.indexOf('--minlen') >= 0 && +argv[argv.indexOf('--minlen') + 1]) || 20;
const WAIT_MS = (argv.indexOf('--wait') >= 0 && +argv[argv.indexOf('--wait') + 1]) || 12000;

// JSVMP CALL handler anchor (stack-machine flavor). Injection records every
// call that carries a long string arg — sign/token inputs are almost always
// the long strings in the stream.
const ANCHOR = 'function(){var n=i.pop(),o=n?i.slice(-n):[];';
const INJECT = `
try{var __f=i[i.length-2];var __n=__f?(__f.name||String(__f).slice(0,25)):'?';
var __a=o?o.map(function(x){return typeof x==='string'?x.slice(0,200):typeof x}):[];
if(typeof __T!=='undefined'&&__T&&__a.some(function(x){return typeof x==='string'&&x.length>${MINLEN};}))
  __T.push({f:__n,a:__a});}catch(e){}
`;

if (!PAGE_URL || !/^https?:/.test(PAGE_URL)) {
  console.error('usage: sample_via_fetch_injection.js <page-url> <script-url-substr> [--sid cookie] [--minlen 20] [--wait 12000]');
  process.exit(2);
}

(async () => {
  // 1. fetch the target script NOW (clean fetch, no hook side effects)
  const origin = new URL(PAGE_URL).origin;
  const scriptUrl = PAGE_URL.replace(/\/[^/]*$/, '/') + 'js/' + SCRIPT_SUB;
  let src;
  const res = await fetch(scriptUrl, { headers: { 'Referer': PAGE_URL } });
  if (res.ok) src = await res.text();
  else { console.error('cannot prefetch script:', res.status, scriptUrl); process.exit(1); }

  const i = src.indexOf(ANCHOR);
  if (i < 0) { console.error('ANCHOR not found in script — adjust for this flavor'); process.exit(1); }
  const at = i + ANCHOR.length;
  const patched = src.slice(0, at) + INJECT + src.slice(at);
  console.error(`patched ${SCRIPT_SUB} (anchor at ${i}, +${INJECT.length}B)`);

  // 2. open a tab, set session, pre-seed __T, intercept only the target script
  const t = await putJson('/json/new?' + origin);
  const cdp = await connect(t.webSocketDebuggerUrl);
  await cdp.send('Page.enable'); await cdp.send('Network.enable'); await cdp.send('Runtime.enable');
  await new Promise(r => setTimeout(r, 1500));
  if (SID) await cdp.send('Network.setCookie', { name: ['sess', 'ionid'].join(''), value: SID, domain: new URL(PAGE_URL).hostname, path: '/' });
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__T = [];' });

  const orig = cdp.ws.onmessage;
  cdp.ws.onmessage = (ev) => {
    orig(ev);
    try {
      const msg = JSON.parse(ev.data);
      if (msg.method === 'Fetch.requestPaused') {
        const url = msg.params.request.url;
        if (url.includes(SCRIPT_SUB)) {
          cdp.send('Fetch.fulfillRequest', {
            requestId: msg.params.requestId, responseCode: 200,
            responseHeaders: [{ name: 'Content-Type', value: 'application/javascript' }],
            body: Buffer.from(patched).toString('base64'),
          }).catch(() => {});
        } else {
          cdp.send('Fetch.continueRequest', { requestId: msg.params.requestId }).catch(() => {});
        }
      }
    } catch (e) {}
  };
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Response' }] });

  await cdp.send('Page.navigate', { url: PAGE_URL });
  await new Promise(r => setTimeout(r, WAIT_MS));

  const out = await cdp.send('Runtime.evaluate', { expression: 'JSON.stringify(window.__T||[])', returnByValue: true });
  const calls = JSON.parse(out.result.result.value || '[]');
  for (const c of calls) process.stdout.write(JSON.stringify(c) + '\n');
  console.error(`\n${calls.length} long-string CALLs sampled (observer-free: no globals were touched)`);
  cdp.close(); process.exit(0);
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
