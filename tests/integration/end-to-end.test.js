'use strict';
// Integration tests: end-to-end behaviors on isolated copies — never on the
// real workspace tree.
//  1. the export leak gate actually BLOCKS dirty content (security-critical)
//  2. playbook runs produce the complete artifact set
//  3. trigger evals + benchmarks stay green from the workspace root
// Run: node --test tests/integration/*.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', cwd: opts.cwd || ROOT, ...opts });
}

test('integration: export leak gate blocks banned tokens end-to-end', { timeout: 120000 }, () => {
  // isolate: copy the skill tree, plant a dirty reference, run the exporter,
  // expect failure with the planted file named in the report
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'leakgate-'));
  try {
    sh('cp', ['-R', ROOT, path.join(tmp, 'js-reverse-ops')]);
    const copy = path.join(tmp, 'js-reverse-ops');
    const dirty = path.join(copy, 'references', 'env-rebuild-recipes.md');
    fs.appendFileSync(dirty, '\nverified on the ' + ['yuan','ren','xue'].join('') + ' practice set.\n');
    let failed = false;
    let report = '';
    try {
      sh('node', [path.join(copy, 'scripts', 'export_public_skill.js')], { cwd: copy, stdio: 'pipe' });
    } catch (e) {
      failed = true;
      report = String(e.stdout || '') + String(e.stderr || '');
    }
    assert.ok(failed, 'exporter must fail on banned token');
    assert.ok(report.includes('env-rebuild-recipes.md') || report.includes('leaks'), 'report must name the dirty file');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('integration: playbook run emits the complete artifact set', { timeout: 120000 }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pbart-'));
  try {
    sh('node', [path.join(ROOT, 'scripts', 'run_playbook.js'), 'https://example.com/target', '--out', path.join(tmp, 'run')], { stdio: 'pipe' });
    const REQUIRED = ['playbook-run.json', 'evidence.json', 'claim-set.json', 'risk-summary.json',
      'misdiagnosis-checklist.json', 'provenance-graph.json', 'replay-status.json',
      'provenance-summary.md', 'operator-review.md', 'recommended-scripts.json'];
    for (const f of REQUIRED) assert.ok(fs.existsSync(path.join(tmp, 'run', f)), `missing artifact: ${f}`);
    const checklist = JSON.parse(fs.readFileSync(path.join(tmp, 'run', 'misdiagnosis-checklist.json'), 'utf8'));
    assert.ok(checklist.patterns.length >= 8, 'checklist must carry M1-M8');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('integration: benchmark + trigger suites pass from the workspace root', { timeout: 300000 }, () => {
  const bm = sh('node', [path.join(ROOT, 'scripts', 'run_public_benchmarks.js')], { stdio: 'pipe' });
  assert.ok(!bm.includes('FAIL'), 'benchmarks must be green');
  sh('node', [path.join(ROOT, 'scripts', 'run_trigger_evals.js')], { stdio: 'pipe' });
});
