'use strict';
// cf_fetch_with_clearance: a harvested clearance is enough to fetch the other
// URLs of the zone over plain HTTP — the cookie and the User-Agent come from
// the harvest file (never typed), bytes are written as read, and a challenge
// page stops the run instead of hammering the site.
//
// The subject must be awaited ASYNC: the HTTP server lives in this same Node
// process, and a synchronous wait (spawnSync) blocks the event loop, so the
// server could never answer the request it is waiting for.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const TOOL = path.join(ROOT, 'scripts', 'cf_fetch_with_clearance.py');
const HAS = spawnSync('python3', ['-c', 'import curl_cffi'], { stdio: 'ignore' }).status === 0;
const OPT = { skip: !HAS && 'needs python3 with curl_cffi', timeout: 60000 };
const BODY = Buffer.alloc(3000, 7);

function startServer(seen) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      seen.push({ url: req.url, ua: req.headers['user-agent'], cookie: req.headers.cookie || '' });
      if (req.url === '/chal') {
        res.writeHead(403, { 'content-type': 'text/html', 'cf-mitigated': 'challenge' });
        res.end('<title>Just a moment...</title>');
        return;
      }
      res.writeHead(200, { 'content-type': 'application/pdf' });
      res.end(BODY);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

function runSubject(args) {
  return new Promise((resolve) => {
    const child = spawn('python3', [TOOL, ...args]);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

function setup(dir, host) {
  const harvest = path.join(dir, 'harvest.json');
  fs.writeFileSync(harvest, JSON.stringify({ url: 'http://' + host + '/x', user_agent: 'UA-from-harvest', clearance: 'fake-clearance', proxy: null }));
  const out = path.join(dir, 'out');
  return { harvest, out };
}

test('cf_fetch_with_clearance: sends the harvested cookie + UA and writes the bytes as read', OPT, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfetch-'));
  const seen = [];
  const server = await startServer(seen);
  const { harvest, out } = setup(dir, '127.0.0.1');
  const port = server.address().port;
  try {
    const r = await runSubject(['--harvest', harvest, '--out-dir', out, 'http://127.0.0.1:' + port + '/doc.pdf']);
    assert.strictEqual(r.status, 0, r.stderr || r.stdout);
    const saved = fs.readFileSync(path.join(out, 'doc.pdf'));
    assert.ok(BODY.equals(saved), 'byte-exact body');
    assert.match(r.stdout, /fetched 1\/1/);
    assert.strictEqual(seen[0].ua, 'UA-from-harvest', 'the UA comes from the harvest file');
    assert.match(seen[0].cookie, /cf_clearance=fake-clearance/);
    assert.ok(!/fake-clearance/.test(r.stdout), 'the clearance itself is never echoed');
  } finally { server.closeAllConnections(); server.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('cf_fetch_with_clearance: a challenge page stops the run with exit 3', OPT, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfetch-'));
  const seen = [];
  const server = await startServer(seen);
  const { harvest, out } = setup(dir, '127.0.0.1');
  const port = server.address().port;
  try {
    const urls = ['/doc.pdf', '/chal', '/never-reached.pdf'].map((u) => 'http://127.0.0.1:' + port + u);
    const r = await runSubject(['--harvest', harvest, '--out-dir', out, ...urls]);
    assert.strictEqual(r.status, 3);
    assert.match(r.stderr, /challenge page/);
    assert.match(r.stdout, /OK\s+doc\.pdf\s+200/);
    assert.ok(!seen.some((s) => s.url === '/never-reached.pdf'), 'nothing is fetched after a re-challenge');
  } finally { server.closeAllConnections(); server.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('cf_fetch_with_clearance: a URL from another host is refused — a clearance is issued per zone', OPT, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfetch-'));
  const seen = [];
  const server = await startServer(seen);
  const { harvest } = setup(dir, '127.0.0.1');
  const port = server.address().port;
  try {
    // "localhost" is not the harvest host, so it must be refused without a request
    const r = await runSubject(['--json', '--harvest', harvest, 'http://localhost:' + port + '/doc.pdf']);
    assert.strictEqual(r.status, 1);
    assert.match(r.stdout, /different host/);
    assert.strictEqual(seen.length, 0);
  } finally { server.closeAllConnections(); server.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
