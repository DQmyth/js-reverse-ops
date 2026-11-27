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

test('captcha family: reCAPTCHA widget on a loadable page (200, verdict stays L0 + family recaptcha)', async () => {
  const { srv, port } = await onceServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<html><body><form><div class="g-recaptcha" data-sitekey="6LeIxAcT"></div><script src="https://www.google.com/recaptcha/api.js"></script></form></body></html>');
  });
  try {
    const r = await runTool(`http://127.0.0.1:${port}/`);
    assert.strictEqual(r.verdict, 'L0');
    assert.ok(r.captcha_family.includes('recaptcha'));
    assert.match(r.family_route, /perception gate|CV solver|recaptcha_ia_solver/);
  } finally { srv.close(); }
});

test('captcha family: hCaptcha and geetest markers detected; slider family stays conservative', async () => {
  const cases = [
    ['<html><script src="https://js.hcaptcha.com/1/api.js"></script><div class="h-captcha"></div></html>', 'hcaptcha'],
    ['<html><script src="https://static.geetest.com/static/js/gt.js"></script><div id="geetest"></div></html>', 'geetest'],
  ];
  for (const [body, want] of cases) {
    const { srv, port } = await onceServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(body); });
    try {
      const r = await runTool(`http://127.0.0.1:${port}/`);
      assert.ok(r.captcha_family.includes(want), `${want} markers must be detected`);
    } finally { srv.close(); }
  }
  // a plain carousel slider must NOT trip the family detector
  const { srv, port } = await onceServer((req, res) => { res.writeHead(200); res.end('<div class="slider carousel"><img src="a.jpg"></div>'); });
  try {
    const r = await runTool(`http://127.0.0.1:${port}/`);
    assert.deepStrictEqual(r.captcha_family, [], 'generic slider classes must not report a captcha family');
  } finally { srv.close(); }
});

test('NON-GATE: 404 / origin errors are not misreported as a pass ("L0") or a block', async () => {
  for (const [status, body] of [[404, 'not found'], [502, 'bad gateway']]) {
    const { srv, port } = await onceServer((req, res) => { res.writeHead(status, { 'content-type': 'text/plain' }); res.end(body); });
    try {
      const r = await runTool(`http://127.0.0.1:${port}/`);
      assert.strictEqual(r.verdict, 'NON-GATE', `HTTP ${status} must not be reported as L0/L1`);
      assert.match(r.note, new RegExp(`HTTP ${status} without any CF signature`));
    } finally { srv.close(); }
  }
});
