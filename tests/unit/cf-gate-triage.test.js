'use strict';
// cf_gate_triage: classification correctness against a local mock server
// that impersonates each Cloudflare level (L0/L1/L2/L2b) plus the timeout
// path. No network access; the marker logic under test is the same the tool
// runs against live targets.
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const path = require('path');
const { execFile } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const TOOL = path.join(ROOT, 'scripts', 'cf_gate_triage.js');

function onceServer(handler) {
  return new Promise((resolve) => {
    const srv = http.createServer(handler);
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}

function runTool(url, extra = []) {
  return new Promise((resolve, reject) => {
    execFile('node', [TOOL, url, '--json', ...extra], { encoding: 'utf8' }, (err, stdout, stderr) => {
      if (err) return reject(err);
      try { resolve(JSON.parse(stdout)); } catch (e) { reject(new Error('bad json: ' + stdout.slice(0, 120) + stderr.slice(0, 120))); }
    });
  });
}

test('L0: clean 200 verdict', async () => {
  const { srv, port } = await onceServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<html>ok</html>'); });
  try {
    const r = await runTool(`http://127.0.0.1:${port}/`);
    assert.strictEqual(r.verdict, 'L0');
    assert.match(r.note, /passes/);
  } finally { srv.close(); }
});

test('L1: 403 with no challenge markers', async () => {
  const { srv, port } = await onceServer((req, res) => { res.writeHead(403, { 'content-type': 'text/plain' }); res.end('forbidden'); });
  try {
    const r = await runTool(`http://127.0.0.1:${port}/`);
    assert.strictEqual(r.verdict, 'L1');
    assert.match(r.route, /curl_cffi|impersonat/i);
  } finally { srv.close(); }
});

test('L2: cf-mitigated: challenge header is the authoritative marker', async () => {
  const { srv, port } = await onceServer((req, res) => {
    res.writeHead(503, { 'cf-mitigated': 'challenge', 'content-type': 'text/html' });
    res.end('<html><title>Just a moment...</title><script>__cf_chl_opt={}</script></html>');
  });
  try {
    const r = await runTool(`http://127.0.0.1:${port}/`);
    assert.strictEqual(r.verdict, 'L2');
    assert.strictEqual(r.full_probe.markers.cf_mitigated, 'challenge');
    assert.ok(r.full_probe.markers.challenge.length >= 2);
    assert.match(r.route, /cf_clearance/);
  } finally { srv.close(); }
});

test('L2b: turnstile markers outrank plain challenge markers', async () => {
  const { srv, port } = await onceServer((req, res) => {
    res.writeHead(403, { 'content-type': 'text/html' });
    res.end('<form><div class="cf-turnstile" data-sitekey="x"></div><input name="cf-turnstile-response"></form>');
  });
  try {
    const r = await runTool(`http://127.0.0.1:${port}/`);
    assert.strictEqual(r.verdict, 'L2b');
    assert.ok(r.full_probe.markers.turnstile.length >= 2);
  } finally { srv.close(); }
});

test('UNKNOWN: unreachable target reports cleanly', async () => {
  const r = await runTool('http://127.0.0.1:9/x', ['--timeout', '1200']); // port 9: discard, refused fast
  assert.strictEqual(r.verdict, 'UNKNOWN');
  assert.match(r.note, /probe failed/);
});
