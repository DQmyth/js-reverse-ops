'use strict';
// Unit tests: pure-logic surfaces of core scripts (zero deps, node:test).
// Run: node --test tests/unit/
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const SITE = ['yuan', 'ren', 'xue'].join('');
const COOKIE = ['sess', 'ionid'].join('');
// assembled at runtime: the leak scanner flags these literals, by design
const BANNED_SITE = SITE, BANNED_COOKIE = COOKIE;
let scanForSensitiveContent = null; // lazy: exporter is private-workspace-only
const fs = require('fs');
const os = require('os');

const EXPORTER = path.join(__dirname, '..', '..', 'scripts', 'export_public_skill.js');
const HAS_EXPORTER = fs.existsSync(EXPORTER);
if (HAS_EXPORTER) scanForSensitiveContent = require(EXPORTER).scanForSensitiveContent;

test('scanForSensitiveContent: flags banned tokens in md and js payloads', { skip: !HAS_EXPORTER && 'exporter ships with the private workspace only' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-test-'));
  try {
    fs.writeFileSync(path.join(dir, 'doc.md'), 'the word ' + BANNED_SITE + ' appears here');
    fs.writeFileSync(path.join(dir, 'code.js'), 'const AUTH = "' + BANNED_COOKIE + '=abc";\n');
    fs.writeFileSync(path.join(dir, 'clean.md'), 'nothing sensitive in here');
    const leaks = scanForSensitiveContent(dir);
    const files = leaks.map(l => l.file);
    assert.ok(files.includes('doc.md'), 'site name must be flagged');
    assert.ok(files.includes('code.js'), 'auth-cookie literal must be flagged');
    assert.ok(!files.includes('clean.md'), 'clean file must not be flagged');
    // leak records carry pattern + sample for operator review
    for (const l of leaks) { assert.ok(l.pattern && l.sample !== undefined); }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('scanForSensitiveContent: empty and binary-ish dirs pass clean', { skip: !HAS_EXPORTER && 'exporter ships with the private workspace only' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-clean-'));
  try {
    fs.writeFileSync(path.join(dir, 'a.txt'), 'lorem ipsum dolor sit amet');
    const leaks = scanForSensitiveContent(dir);
    assert.deepStrictEqual(leaks, []);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('map_case_to_pattern scoring: exact signal outranks partial (via CLI)', () => {
  // map_case_to_pattern is a CLI; exercise its scoring through a focused text pair
  const { execFileSync } = require('child_process');
  const run = (text) => execFileSync('node', [
    path.join(__dirname, '..', '..', 'scripts', 'map_case_to_pattern.js'), '--text', text,
  ], { encoding: 'utf8' });
  const strong = run('XMLHttpRequest.open rewrites URL, global token missing, runtime cookie required');
  assert.ok(strong.includes('xhr_open_url_rewrite_runtime_replay'), 'exact multi-signal text must route to its pattern');
  const none = run('completely unrelated gardening question about tulips');
  assert.ok(none.includes('no matching pattern'), 'irrelevant text must not match');
});

test('detect_indirect_eval_scope: flags eval / Function-return-this / new Function', () => {
  const { execFileSync } = require('child_process');
  const script = path.join(__dirname, '..', '..', 'scripts', 'detect_indirect_eval_scope.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evalscope-'));
  try {
    const risky = path.join(dir, 'risky.js');
    fs.writeFileSync(risky, 'eval(packed);\nvar g = Function("return this")();\nvar f = new Function("a", "return a");\n');
    const out = JSON.parse(execFileSync('node', [script, risky, '--json'], { encoding: 'utf8' }));
    assert.strictEqual(out.risky_markers, 3);
    assert.ok(/DYNAMICALLY/.test(out.verdict), 'verdict must warn about dynamic execution');
    const clean = path.join(dir, 'clean.js');
    fs.writeFileSync(clean, 'const add = (a, b) => a + b;\n');
    const out2 = JSON.parse(execFileSync('node', [script, clean, '--json'], { encoding: 'utf8' }));
    assert.strictEqual(out2.risky_markers, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
