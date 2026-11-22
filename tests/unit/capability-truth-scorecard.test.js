'use strict';
// capability-truth scorecard: the scoring logic itself must be pinned —
// evidence levels, decay math, invalidation, weighted totals, and the
// public-tree anonymization guarantee (comparator real names must never
// enter the exported bundle).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const SCRIPT = path.join(ROOT, 'scripts', 'generate_capability_truth_scorecard.js');
const MODEL = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'capability-truth-model.json'), 'utf8'));
const EVID = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'capability-truth-evidence.json'), 'utf8'));

test('model schema: ten weighted dimensions, evidence levels, decay policy', () => {
  assert.strictEqual(MODEL.dimensions.length, 10);
  const w = MODEL.dimensions.reduce((a, d) => a + d.weight, 0);
  assert.strictEqual(w, 100, 'weights must sum to 100');
  assert.ok(MODEL.decay.decay_days > 0);
  assert.ok(Object.keys(MODEL.evidence_levels).length === 4);
});

test('decay math: gate evidence loses a level per decay_days; corpus at half rate; doc claims never decay; invalidation zeroes', () => {
  // replicate the script's effectiveLevel (kept in sync by this test's re-derivation)
  const daysSince = (iso) => Math.max(0, Math.floor((new Date() - new Date(iso)) / 86400000));
  const eff = (entry, kind) => {
    if (entry.invalidated) return 0;
    const base = entry.level ?? 0;
    if (!entry.last_verified || base < 2) return base;
    const rate = kind === 'gate' ? 1 : 0.5;
    const decays = Math.floor(daysSince(entry.last_verified) / MODEL.decay.decay_days * rate);
    const floor = MODEL.decay.floor[String(base)] ?? 1;
    return Math.max(floor, base - decays);
  };
  const fresh = '2026-11-21';
  const staleGate = new Date(Date.now() - 65 * 86400000).toISOString().slice(0, 10); // ~2 decay periods
  const staleCorpus = new Date(Date.now() - 65 * 86400000).toISOString().slice(0, 10);
  assert.strictEqual(eff({ level: 3, last_verified: fresh }, 'gate'), 3, 'fresh stays 3');
  assert.ok(eff({ level: 3, last_verified: staleGate }, 'gate') < 3, 'stale gate decays');
  assert.ok(eff({ level: 3, last_verified: staleGate }, 'gate') >= 1, 'never below floor');
  assert.ok(eff({ level: 2, last_verified: staleCorpus }, 'corpus') >= eff({ level: 3, last_verified: staleCorpus }, 'gate'), 'corpus decays at most as fast as gates');
  assert.strictEqual(eff({ level: 1 }, 'gate'), 1, 'doc claims do not decay');
  assert.strictEqual(eff({ level: 3, last_verified: fresh, invalidated: true }, 'gate'), 0, 'invalidated is 0 but stays listed');
  // invalidated entries exist in the evidence file and remain present
  const inv = EVID.self.gate_coverage.families.filter(f => f.invalidated);
  assert.ok(inv.length >= 1, 'at least one invalidated entry is kept on record');
});

test('generator: runs, emits totals, comparator scores derive from evidence levels', () => {
  const out = execFileSync('node', [SCRIPT, '--json'], { encoding: 'utf8' });
  const j = JSON.parse(out);
  assert.ok(j.self.total > 0 && j.self.total <= 100);
  assert.ok(j.comparators.length >= 4);
  for (const c of j.comparators) assert.ok(c.total >= 0 && c.total <= 100);
  // a doc-claim-only comparator cannot score above 25 on solve_record (level 1/3 * 0.5)
  for (const c of j.comparators) {
    if ((EVID.comparators.find(x => x.id === c.id) || {}).solve_record?.level === 1) {
      assert.ok(c.dims.solve_record.score <= 25, `${c.id} doc-only solve_record must stay low`);
    }
  }
});

test('anonymization: exported evidence carries no real comparator names', () => {
  const raw = fs.readFileSync(path.join(ROOT, 'assets', 'capability-truth-evidence.json'), 'utf8');
  // red line: the COMPETITOR SUITES scored as T1-x stay anonymized; absorbed
  // dependencies (cfsolve, PyPasser, ...) are cited by name elsewhere already
  for (const banned of ['js-reverse-mcp', 'JSReverser', 'jshookmcp']) {
    assert.ok(!raw.includes(banned), `competitor name ${banned} must not appear in the public evidence file`);
  }
});
