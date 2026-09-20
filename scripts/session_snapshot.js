#!/usr/bin/env node
// Session snapshot: dump/restore cookies + localStorage + sessionStorage from
// a debug Chrome tab (via the built-in cdp_minibrowser). Keeps login state
// reusable across harness runs without re-doing auth flows.
//
// Usage:
//   node scripts/session_snapshot.js dump  --label <name> [--target <url-substr>] [--port 9222]
//   node scripts/session_snapshot.js restore --label <name> [--target <url-substr>] [--port 9222]
//   node scripts/session_snapshot.js list
// Snapshots live under ${SKILL_ROOT}/session-snapshots/<label>.json (gitignored).
const fs = require('fs');
const path = require('path');
const { connect, getJson, pickTarget } = require('./cdp_minibrowser.js');

const SNAP_DIR = path.join(__dirname, '..', 'session-snapshots');
const argv = process.argv.slice(2);
const cmd = argv[0];
const argOf = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };

async function withPage(fn) {
  const target = await pickTarget(argOf('--target', '') || '');
  const cdp = await connect(target.webSocketDebuggerUrl);
  try { return await fn(cdp, target); } finally { cdp.close(); }
}

async function dump() {
  const label = argOf('--label');
  if (!label) { console.error('--label required'); process.exit(2); }
  const snap = await withPage(async (cdp, target) => {
    const cookies = (await cdp.send('Network.getCookies', { urls: [target.url] })).cookies || [];
    const storage = await cdp.send('Runtime.evaluate', {
      expression: 'JSON.stringify({ localStorage: Object.fromEntries(Object.entries(localStorage)), sessionStorage: Object.fromEntries(Object.entries(sessionStorage)), origin: location.origin })',
      returnByValue: true,
    });
    const parsed = JSON.parse((storage.result && storage.result.result && storage.result.result.value) || '{}');
    return { url: target.url, at: new Date().toISOString(), cookies, localStorage: parsed.localStorage || {}, sessionStorage: parsed.sessionStorage || {}, origin: parsed.origin };
  });
  fs.mkdirSync(SNAP_DIR, { recursive: true });
  const file = path.join(SNAP_DIR, `${label}.json`);
  fs.writeFileSync(file, JSON.stringify(snap, null, 2) + '\n');
  console.log(JSON.stringify({ dumped: file, cookies: snap.cookies.length, lsKeys: Object.keys(snap.localStorage).length, ssKeys: Object.keys(snap.sessionStorage).length }));
}

async function restore() {
  const label = argOf('--label');
  if (!label) { console.error('--label required'); process.exit(2); }
  const file = path.join(SNAP_DIR, `${label}.json`);
  if (!fs.existsSync(file)) { console.error('no snapshot:', file); process.exit(1); }
  const snap = JSON.parse(fs.readFileSync(file, 'utf8'));
  const r = await withPage(async (cdp) => {
    let restored = 0;
    for (const c of snap.cookies || []) {
      await cdp.send('Network.setCookie', { name: c.name, value: c.value, domain: c.domain, path: c.path || '/', secure: !!c.secure, httpOnly: !!c.httpOnly, sameSite: c.sameSite || undefined, expires: c.expires || undefined });
      restored++;
    }
    const ls = Object.entries(snap.localStorage || {});
    const ss = Object.entries(snap.sessionStorage || {});
    await cdp.send('Runtime.evaluate', {
      expression: `(function(){ ${ls.map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join('')} ${ss.map(([k, v]) => `sessionStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join('')} return true; })()`,
      returnByValue: true,
    });
    return { cookies: restored, lsKeys: ls.length, ssKeys: ss.length };
  });
  console.log(JSON.stringify({ restored_from: file, ...r, note: 'verify acceptance end-to-end (M2 discipline) before relying on the session' }));
}

function list() {
  if (!fs.existsSync(SNAP_DIR)) return console.log('no snapshots yet');
  for (const f of fs.readdirSync(SNAP_DIR).filter(f => f.endsWith('.json'))) {
    const s = JSON.parse(fs.readFileSync(path.join(SNAP_DIR, f), 'utf8'));
    console.log(`${f.replace('.json', '')}  ${s.at}  cookies=${(s.cookies || []).length}  url=${(s.url || '').slice(0, 60)}`);
  }
}

(async () => {
  if (cmd === 'dump') await dump();
  else if (cmd === 'restore') await restore();
  else if (cmd === 'list') list();
  else { console.error('usage: session_snapshot.js dump|restore|list --label <name> [--target substr]'); process.exit(2); }
  process.exit(0);
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
