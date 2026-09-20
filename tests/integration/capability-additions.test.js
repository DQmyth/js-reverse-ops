'use strict';
// Tests for the capability additions: signer service, HAR importer, wasm triage.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawn } = require('child_process');
const http = require('http');

const ROOT = path.join(__dirname, '..', '..');
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', ...opts });

test('signer service: scaffold -> load a gym-style signer -> serve /sign end-to-end', { timeout: 60000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'signsvc-'));
  try {
    sh('node', [path.join(ROOT, 'scripts', 'scaffold_signer_service.js'), 'demo', '--port', '0', '--out', dir], { stdio: 'pipe' });
    assert.ok(fs.existsSync(path.join(dir, 'service.js')));
    fs.writeFileSync(path.join(dir, 'signer.js'), `globalThis.sign = (s) => { let h = 0x811c; for (const c of String(s)) h = ((h ^ c.charCodeAt(0)) * 0x01000193) >>> 0; return 'v' + h.toString(16); };`);
    const PORT = 18999;
    const child = spawn('node', [path.join(dir, 'service.js')], { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'ignore', 'pipe'] });
    try {
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      await wait(700); // boot
      const post = (p, body) => new Promise((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port: PORT, path: p, method: 'POST', headers: { 'content-type': 'application/json' } }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ code: res.statusCode, body: d })); });
        req.on('error', reject); req.end(body);
      });
      const get = (p) => new Promise((resolve, reject) => {
        http.get({ host: '127.0.0.1', port: PORT, path: p }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ code: res.statusCode, body: d })); }).on('error', reject);
      });
      const h = await get('/health');
      assert.strictEqual(h.code, 200);
      assert.strictEqual(JSON.parse(h.body).ok, true);
      const s1 = await post('/sign', JSON.stringify({ input: 'alpha' }));
      assert.strictEqual(s1.code, 200);
      const tok = JSON.parse(s1.body).token;
      assert.match(tok, /^v[0-9a-f]+$/);
      const s2 = await post('/sign', JSON.stringify({ input: 'alpha' }));
      assert.strictEqual(JSON.parse(s2.body).token, tok, 'signer must be deterministic for identical input');
      const stats = await get('/stats');
      assert.ok(JSON.parse(stats.body).served >= 2);
      const bad = await post('/nope', '{}');
      assert.strictEqual(bad.code, 404);
    } finally { child.kill(); }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('har_to_bundle: synthetic HAR -> candidates + cookie writes + jsonl', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harimp-'));
  try {
    const har = {
      log: { entries: [
        { request: { method: 'GET', url: 'https://t.example/static/app.js', headers: [] }, response: { status: 200, content: { mimeType: 'application/javascript' }, headers: [] }, _resourceType: 'script' },
        { request: { method: 'GET', url: 'https://t.example/api/list', headers: [{ name: 'x-sign', value: 'abc' }] }, response: { status: 200, content: { mimeType: 'application/json' }, headers: [{ name: 'Set-Cookie', value: 'sid=1; Path=/' }] }, _resourceType: 'xhr' },
        { request: { method: 'POST', url: 'https://t.example/api/submit?token=xyz', headers: [] }, response: { status: 403, content: { mimeType: 'text/plain' }, headers: [] }, _resourceType: 'fetch' },
      ] },
    };
    const harFile = path.join(dir, 'cap.har');
    fs.writeFileSync(harFile, JSON.stringify(har));
    const out = sh('node', [path.join(ROOT, 'scripts', 'har_to_bundle.js'), harFile, '--out', path.join(dir, 'bundle')]);
    assert.match(out, /candidate protected 2/);
    const summary = JSON.parse(fs.readFileSync(path.join(dir, 'bundle', 'runtime-summary.json'), 'utf8'));
    assert.strictEqual(summary.counts.requests, 3);
    assert.strictEqual(summary.counts.cookieWrites, 1);
    assert.ok(summary.candidates.some(c => c.why === 'header') && summary.candidates.some(c => c.why === 'url-param'));
    const lines = fs.readFileSync(path.join(dir, 'bundle', 'requests.jsonl'), 'utf8').trim().split('\n');
    assert.strictEqual(lines.length, 3);
    assert.strictEqual(JSON.parse(lines[1]).requestHeaders['x-sign'], 'abc');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('wasm_triage: synthetic module with env.time_now import + sign export', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wasmtri-'));
  try {
    const uleb = (n) => { const out = []; do { let b = n & 0x7f; n >>>= 7; if (n) b |= 0x80; out.push(b); } while (n); return Buffer.from(out); };
    const name = (s) => Buffer.concat([uleb(s.length), Buffer.from(s)]);
    const sec = (id, payload) => Buffer.concat([Buffer.from([id]), uleb(payload.length), payload]);
    // type section: () -> () ; import section: 1 import env.time_now func type 0 ; export: sign func 0
    const types = Buffer.concat([uleb(1), Buffer.from([0x60, 0x00, 0x00])]);
    const imp = Buffer.concat([uleb(1), name('env'), name('time_now'), Buffer.from([0x00]), uleb(0)]);
    const exp = Buffer.concat([uleb(1), name('sign'), Buffer.from([0x00]), uleb(0)]);
    const mod = Buffer.concat([Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]), sec(1, types), sec(2, imp), sec(7, exp)]);
    const f = path.join(dir, 'm.wasm');
    fs.writeFileSync(f, mod);
    const out = JSON.parse(sh('node', [path.join(ROOT, 'scripts', 'wasm_triage.js'), f, '--json']));
    assert.strictEqual(out.imports, 1);
    assert.strictEqual(out.exports, 1);
    assert.ok(out.timeImports.some(i => i.field === 'time_now'), 'time import must be classified');
    assert.ok(out.signerExports.some(e => e.name === 'sign'), 'sign export must be flagged');
    assert.match(out.verdict, /time-dependent/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
