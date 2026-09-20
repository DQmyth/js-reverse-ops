'use strict';
// Performance regression layer: threshold assertions on the hot paths that
// interactive use actually feels. Thresholds are generous ceilings (catch
// 10x regressions, not micro-optimizing).
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { execFileSync } = require('child_process');
const fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const FIXTURE = path.join(__dirname, 'fixtures', 'perf-target.js');

const BUDGETS = [
  { script: 'run_trigger_evals.js', ms: 5000, args: [] },
  { script: 'map_case_to_pattern.js', ms: 3000, args: ['--text', 'token sign sandbox differs'] },
  { script: 'detect_obfuscation_family.js', ms: 4000, args: [FIXTURE] },
  { script: 'detect_indirect_eval_scope.js', ms: 4000, args: [FIXTURE] },
];

test('perf smoke: hot-path scripts stay within budget', { timeout: 60000 }, () => {
  fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
  if (!fs.existsSync(FIXTURE)) {
    const chunk = 'var a' + Math.random().toString(36).slice(2, 8) + '=function(x){return x*2+eval;};\n';
    fs.writeFileSync(FIXTURE, chunk.repeat(2000));
  }
  for (const b of BUDGETS) {
    const t0 = Date.now();
    execFileSync('node', [path.join(ROOT, 'scripts', b.script), ...b.args], { stdio: 'pipe', cwd: ROOT });
    const dt = Date.now() - t0;
    assert.ok(dt <= b.ms, `${b.script} took ${dt}ms (budget ${b.ms}ms)`);
  }
});
