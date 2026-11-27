'use strict';
// audit_browser_free: the zero-browser claim is evidence from the OS (process
// tree + TCP table), not a promise. A pure computation must pass, and both
// kinds of browser evidence the tool looks for must fail it.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const TOOL = path.join(ROOT, 'scripts', 'audit_browser_free.py');
const HAS = ['ps', 'lsof', 'python3'].every((t) => spawnSync('sh', ['-c', 'command -v ' + t]).status === 0);
const HAS_PYTHON = spawnSync('sh', ['-c', 'command -v python3']).status === 0;
const OPT = { skip: !HAS && 'needs ps, lsof and python3', timeout: 60000 };

// the report is the tool's own (stderr); the subject's stdout stays untouched
function audit(dir, source) {
  const subject = path.join(dir, 'subject.py');
  fs.writeFileSync(subject, source);
  const result = path.join(dir, 'report.json');
  const r = spawnSync('python3', [TOOL, '--json', '--report', result, '--', 'python3', subject], { encoding: 'utf8' });
  const report = JSON.parse(fs.readFileSync(result, 'utf8'));
  assert.deepStrictEqual(JSON.parse(r.stderr), report, 'stderr and --report must carry the same report');
  return { code: r.status, report, stdout: r.stdout };
}

test('audit_browser_free: a pure computation passes; subject stdout is left alone', OPT, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'abf-'));
  try {
    const { code, report, stdout } = audit(dir, "import time\nprint('subject-out')\ntime.sleep(1.6)\n");
    assert.strictEqual(stdout, 'subject-out\n', 'the subject owns stdout');
    assert.strictEqual(report.verdict, 'PASS');
    assert.strictEqual(code, 0);
    assert.strictEqual(report.command_exit_code, 0);
    assert.ok(report.samples >= 3, 'enough samples to call it');
    assert.deepStrictEqual(report.loopback_peers, []);
    assert.deepStrictEqual(report.automation_flags, []);
    assert.ok(report.processes_in_tree.length >= 1);
    assert.ok(!report.processes_in_tree.includes('?'), 'no placeholder names for vanished processes');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('audit_browser_free: a child carrying a browser-automation flag on its command line fails the audit', OPT, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'abf-'));
  try {
    const { code, report } = audit(dir, [
      'import subprocess, sys, time',
      "p = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(2.0)', '--remote-debugging-port=9222'])",
      'time.sleep(1.6)',
      'p.wait()',
      '',
    ].join('\n'));
    assert.strictEqual(report.verdict, 'FAIL');
    assert.strictEqual(code, 1);
    assert.ok(report.automation_flags.includes('--remote-debugging-port'));
    assert.ok(report.reasons.some((r) => /automation flags/.test(r)));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('audit_browser_free: a loopback TCP connection (where debug ports live) fails the audit', OPT, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'abf-'));
  try {
    const { code, report } = audit(dir, [
      'import socket, threading, time',
      "srv = socket.socket(); srv.bind(('127.0.0.1', 0)); srv.listen(1)",
      'port = srv.getsockname()[1]',
      'threading.Thread(target=lambda: srv.accept(), daemon=True).start()',
      "c = socket.create_connection(('127.0.0.1', port))",
      'time.sleep(1.8)',
      'c.close()',
      '',
    ].join('\n'));
    assert.strictEqual(report.verdict, 'FAIL');
    assert.strictEqual(code, 1);
    assert.ok(report.loopback_peers.some((p) => p.startsWith('127.0.0.1:')));
    assert.ok(report.reasons.some((r) => /loopback TCP/.test(r)));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('audit_browser_free: a failing subject is INCONCLUSIVE, never a pass', OPT, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'abf-'));
  try {
    const { code, report } = audit(dir, 'import sys, time\ntime.sleep(1.6)\nsys.exit(3)\n');
    assert.strictEqual(report.verdict, 'INCONCLUSIVE');
    assert.strictEqual(code, 2);
    assert.strictEqual(report.command_exit_code, 3);
    assert.ok(report.reasons.some((r) => /exited with code 3/.test(r)));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// the strongest control: a REAL browser engine (exe name containing a space on
// macOS) started by the subject must be recognised — about:blank only, throwaway profile
const CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find((c) => fs.existsSync(c));

test('audit_browser_free: a real browser engine started by the subject fails the audit', { skip: (!CHROME || !HAS) && 'needs Chrome, ps, lsof and python3', timeout: 90000 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'abf-'));
  try {
    const subject = path.join(dir, 'subject.py');
    const result = path.join(dir, 'report.json');
    const profile = JSON.stringify(path.join(dir, 'throwaway-profile'));
    fs.writeFileSync(subject, [
      'import subprocess, sys, time',
      `p = subprocess.Popen([${JSON.stringify(CHROME)}, '--headless=new', '--user-data-dir=' + ${profile}, '--no-first-run', '--disable-gpu', '--use-mock-keychain', 'about:blank'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)`,
      'time.sleep(4)',
      'p.terminate()',
      'try: p.wait(timeout=15)',
      'except Exception: p.kill()',
      '',
    ].join('\n'));
    const r = spawnSync('python3', [TOOL, '--json', '--report', result, '--', 'python3', subject], { encoding: 'utf8' });
    const report = JSON.parse(fs.readFileSync(result, 'utf8'));
    assert.strictEqual(report.verdict, 'FAIL', 'a real browser must be caught');
    assert.strictEqual(r.status, 1);
    assert.ok(report.browser_engines.length >= 1, 'engine recognised by executable name: ' + report.processes_in_tree.join(', '));
    assert.ok(report.reasons.some((x) => /browser engine process/.test(x)));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('audit_browser_free: no command is a usage error, not a pass', { skip: !HAS_PYTHON && 'needs python3' }, () => {
  const r = spawnSync('python3', [TOOL, '--json'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /usage|INCONCLUSIVE/);
});
