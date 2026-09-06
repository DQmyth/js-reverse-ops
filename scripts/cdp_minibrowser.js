#!/usr/bin/env node
// cdp_minibrowser — minimal zero-dependency Chrome DevTools Protocol client.
// The "trigger-pulling" surface for runtime-truth capture, extracted from the
// practice topic 24/27 browser oracles (http /json endpoints + global WebSocket).
//
// Prereq: a debug Chrome on --port (start with scripts/start_debug_browser.sh).
//
// Subcommands:
//   list                                  -> targets as JSON
//   new <url>                             -> open a tab, print its target JSON
//   eval --target <id-or-url-substr> --expr '<js>' [--wait-ms 3000]
//                                         -> Runtime.evaluate inside the page
//   capture --target <id-or-url-substr> --match <regex> [--wait-ms 4000]
//                                         -> collect Network.requestWillBeSent URLs
//                                        (JSON array on stdout; feed detect/verify tools)
//
// Library use: require() this file -> { connect, getJson, putJson, pickTarget }.
const http = require('http');

const args = process.argv.slice(2);
const argOf = (name, dflt = null) => { const i = args.indexOf(name); return i >= 0 ? (args[i + 1] !== undefined && !String(args[i + 1]).startsWith('--') ? args[i + 1] : true) : dflt; };
const PORT = parseInt(argOf('--port', '9222'), 10);

function getJson(path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: PORT, path }, (res) => {
      let d = ''; res.on('data', (c) => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(new Error('bad json: ' + d.slice(0, 120))); } });
    }).on('error', reject);
  });
}
function putJson(path) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, path, method: 'PUT' }, (res) => {
      let d = ''; res.on('data', (c) => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(new Error('bad json')); } });
    });
    req.on('error', reject); req.end();
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  const events = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    else if (msg.method) events.push(msg);
  };
  return {
    ws, events,
    send(method, params = {}) {
      return new Promise((resolve) => { const mid = ++id; pending.set(mid, resolve); ws.send(JSON.stringify({ id: mid, method, params })); });
    },
    close() { ws.close(); },
  };
}

async function pickTarget(substr) {
  const targets = await getJson('/json/list');
  const hit = targets.find(t => (t.id === substr) || (t.url || '').includes(substr)) ||
              targets.find(t => t.type === 'page');
  if (!hit) throw new Error('no page target matches: ' + substr);
  return hit;
}

module.exports = { connect, getJson, putJson, sleep, pickTarget, PORT };

if (require.main === module) {
  (async () => {
    const cmd = args[0];
    if (cmd === 'list') { console.log(JSON.stringify(await getJson('/json/list'), null, 1)); return; }
    if (cmd === 'new') { console.log(JSON.stringify(await putJson('/json/new?' + (argOf(null) || args[1] || 'about:blank')), null, 1)); return; }

    const targetSel = argOf('--target');
    if (!targetSel) { console.error('--target required for eval/capture'); process.exit(2); }
    const target = await pickTarget(targetSel);
    const cdp = await connect(target.webSocketDebuggerUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');

    if (cmd === 'eval') {
      await cdp.send('Network.enable');
      const wait = parseInt(argOf('--wait-ms', '3000'), 10);
      const r = await cdp.send('Runtime.evaluate', { expression: argOf('--expr') || 'document.title', returnByValue: true, awaitPromise: true });
      await sleep(wait); // let any network the expression triggers land in `events`
      const reqUrls = cdp.events.filter(e => e.method === 'Network.requestWillBeSent').map(e => e.params.request.url);
      console.log(JSON.stringify({ result: r.result, network: reqUrls }, null, 1));
      cdp.close(); return;
    }
    if (cmd === 'capture') {
      await cdp.send('Network.enable');
      const match = new RegExp(argOf('--match', '.'), 'i');
      const wait = parseInt(argOf('--wait-ms', '4000'), 10);
      await sleep(wait);
      const urls = cdp.events.filter(e => e.method === 'Network.requestWillBeSent' && match.test(e.params.request.url)).map(e => e.params.request.url);
      console.log(JSON.stringify({ captured: urls }, null, 1));
      cdp.close(); return;
    }
    console.error('unknown command:', cmd); process.exit(2);
  })().catch(e => { console.error('ERR:', e.message); process.exit(1); });
}
