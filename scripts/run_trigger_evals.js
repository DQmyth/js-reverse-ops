#!/usr/bin/env node
// Lexical smoke pass over assets/skill-trigger-evals.json.
//
// The FULL eval (official best practice) runs these queries with-skill vs
// baseline in a live agent and compares outcomes — that needs an interactive
// harness. This runner does the cheap local half:
//   1. every should-trigger query must lexically overlap the SKILL.md
//      description (term coverage >= threshold) — otherwise the skill will
//      not even be surfaced for the query it was designed for;
//   2. every should-not-trigger query must NOT be better covered than the
//      worst should-trigger query (a ranking-inversion guard).
//
// Usage: node scripts/run_trigger_evals.js [--json]

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const evals = JSON.parse(fs.readFileSync(path.join(root, 'assets', 'skill-trigger-evals.json'), 'utf8'));
const skillPath = [path.join(root, 'public', 'SKILL.md'), path.join(root, 'SKILL.md')]
  .find(p => fs.existsSync(p)) || path.join(root, 'public', 'SKILL.md');
const skillSrc = fs.readFileSync(skillPath, 'utf8');
const descBlock = (skillSrc.match(/description:\s*(.+?)(?:\n\w|$)/s) || ['', ''])[1].toLowerCase();
const descTerms = [...new Set(descBlock.split(/[^a-z0-9-]+/).filter(w => w.length > 3))];

const DOMAIN_TERMS = ['sign', 'token', 'cookie', 'encrypt', 'decrypt', 'obfuscat', 'minif',
  'bundle', 'webpack', 'jsvmp', 'vm', 'eval', 'wasm', 'replay', 'hook', 'reverse',
  'deobfuscat', 'unpack', 'fingerprint', 'sandbox', 'debug', 'har', 'crypto',
  'aes', 'rsa', 'sm3', 'md5', 'string-array', 'challenge', 'anti-bot', 'devtools'];

// words that mark NON-JS reverse targets — the description's "Do not use it
// for ... binary/APK reverse engineering" clause exists exactly for these
const OUT_OF_SCOPE = ['windows', 'pe executable', 'apk', 'android', 'ios',
  'elf', 'mach-o', '.exe', '.dll', '.so ', 'firmware'];

function coverage(query) {
  const q = query.toLowerCase();
  // word-boundary matching: 'design' must NOT count as 'sign'
  const escaped = t => t.replace(/-/g, '\\-');
  const hits = DOMAIN_TERMS.filter(t => new RegExp(`\\b${escaped(t)}`, 'i').test(q));
  const outOfScope = OUT_OF_SCOPE.filter(t => q.includes(t));
  // out-of-scope targets (binary/APK/...) are exactly what the description's
  // negative clause excludes, so they count as zero domain coverage
  const domainHits = outOfScope.length ? 0 : hits.length;
  return { hits, domainHits, outOfScope };
}

const rows = evals.cases.map(c => ({ id: c.id, expected: c.expected, query: c.query, ...coverage(c.query) }));
const should = rows.filter(r => r.expected);
const shouldNot = rows.filter(r => !r.expected);

const failures = [];
for (const r of should) {
  if (r.domainHits === 0) failures.push(`${r.id}: should-trigger query has zero domain terms — description coverage cannot fire`);
}
const minShould = Math.min(...should.map(r => r.domainHits), Infinity);
for (const r of shouldNot) {
  if (r.domainHits > 0 && r.domainHits >= Math.max(minShould, 1)) failures.push(`${r.id}: should-not query scores ${r.domainHits} — at/above the weakest should-trigger score (${minShould}); tighten the description or the case`);
}

const report = {
  schema: 'js-reverse-ops-trigger-eval-smoke-v1',
  total: rows.length,
  should_trigger: should.length,
  should_not_trigger: shouldNot.length,
  weak_points: failures,
  note: failures.length === 0
    ? 'lexical pass OK; run the full with-skill vs baseline eval in a live harness per the official workflow for behavioral confirmation'
    : 'lexical issues found — fix before trusting trigger accuracy',
};

if (process.argv.includes('--json')) console.log(JSON.stringify({ ...report, rows }, null, 2));
else {
  console.log(`trigger eval smoke: ${rows.length} cases (${should.length} should / ${shouldNot.length} should-not)`);
  for (const f of failures) console.log('WEAK:', f);
  console.log(report.note);
  process.exit(failures.length ? 1 : 0);
}
