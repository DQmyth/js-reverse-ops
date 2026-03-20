#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function usage() {
  console.error('Usage: node re_loop_bundle.js --bundle-dir <dir> [--output <next-loop.json>]');
  process.exit(1);
}

const args = process.argv.slice(2);
const options = { bundleDir: '', output: '' };
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  const next = args[i + 1] || '';
  if (arg === '--bundle-dir') {
    options.bundleDir = path.resolve(next);
    i += 1;
  } else if (arg === '--output') {
    options.output = path.resolve(next);
    i += 1;
  } else {
    usage();
  }
}
if (!options.bundleDir) usage();

function readJsonIfExists(file) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

function appendLine(file, line) {
  const prefix = fs.existsSync(file) ? '\n' : '';
  fs.appendFileSync(file, `${prefix}${line}\n`, 'utf8');
}

const bundleDir = options.bundleDir;
const maturity = readJsonIfExists(path.join(bundleDir, 'maturity-summary.json'));
const risk = readJsonIfExists(path.join(bundleDir, 'risk-summary.json'));
const claims = readJsonIfExists(path.join(bundleDir, 'claim-set.json'));
const operatorReview = fs.existsSync(path.join(bundleDir, 'operator-review.md'))
  ? fs.readFileSync(path.join(bundleDir, 'operator-review.md'), 'utf8')
  : '';
const nextMdPath = path.join(bundleDir, 'NEXT.md');
const worklogPath = path.join(bundleDir, 'WORKLOG.md');
const deadEndsPath = path.join(bundleDir, 'dead-ends.md');

const currentMaturity = maturity?.maturity || 'unknown';
const risks = risk?.risks || [];
const verifiedClaims = claims?.summary?.verified || 0;
const inferredClaims = claims?.summary?.inferred || 0;

const actions = [];
function pushAction(priority, stage, action, reason) {
  actions.push({ priority, stage, action, reason });
}

if (currentMaturity === 'bootstrap-only') {
  pushAction(1, 'source', 'ingest source snapshot and run static analysis', 'Bundle has not yet progressed beyond bootstrap scaffolding.');
}
if (currentMaturity === 'source-snapshot-imported') {
  pushAction(1, 'recover', 'run static analysis and family routing', 'Source snapshot exists but derived static artifacts are missing.');
}
if (currentMaturity === 'static-analysis-generated') {
  pushAction(1, 'runtime', 'capture a real runtime request or hook sample', 'Static analysis exists but runtime truth is still missing.');
}
if (currentMaturity === 'runtime-captured') {
  pushAction(1, 'replay', 'scaffold replay and compare to runtime truth', 'A runtime sample exists but replay assets are not yet stable.');
}
if (currentMaturity === 'replay-scaffolded') {
  pushAction(1, 'replay', 'collect replay validation and compare parity', 'Replay scaffold exists but has not been tested against runtime truth.');
}
if (currentMaturity === 'replay-attempted') {
  pushAction(1, 'replay', 'replace synthetic or failed replay validation with an accepted non-synthetic run', 'Replay has been attempted but not verified.');
}

for (const item of risks) {
  if (item.id === 'runtime-first-required') {
    pushAction(2, 'runtime', 'prefer live capture, hook evidence, or paused-frame locals over more static endpoint guessing', item.reason);
  } else if (item.id === 'fresh-runtime-non-200') {
    pushAction(2, 'trigger', 'revisit trigger path, timing, cookies, and bootstrap prerequisites', item.reason);
  } else if (item.id === 'open-unknowns') {
    pushAction(3, 'analysis', 'resolve the highest-value unknown before promoting more inferred claims', item.reason);
  } else if (item.id === 'hook-evidence-present') {
    pushAction(3, 'evidence', 'promote matched hook observations into provenance and replay assumptions', item.reason);
  }
}

if (/synthetic/i.test(operatorReview)) {
  pushAction(2, 'review', 'replace synthetic artifacts with live samples where possible', 'Operator review still references synthetic evidence.');
}

if (!actions.length) {
  pushAction(1, 'review', 'manually inspect bundle state and choose the next verification step', 'No default re-loop rule matched the current bundle state.');
}

actions.sort((a, b) => a.priority - b.priority || a.stage.localeCompare(b.stage));

const result = {
  bundle_dir: bundleDir,
  generated_at: new Date().toISOString(),
  current_maturity: currentMaturity,
  claim_summary: claims?.summary || { verified: verifiedClaims, inferred: inferredClaims, weak: 0 },
  risk_summary: risk?.summary || { high: 0, medium: 0, low: 0 },
  next_actions: actions,
};

if (options.output) {
  fs.writeFileSync(options.output, JSON.stringify(result, null, 2) + '\n', 'utf8');
}

const nextLines = [
  '# NEXT',
  '',
  '## Immediate Actions',
  '',
  ...actions.slice(0, 5).map((item) => `- [${item.stage}] ${item.action}`),
];
fs.writeFileSync(nextMdPath, nextLines.join('\n') + '\n', 'utf8');

appendLine(worklogPath, `- re_loop ${new Date().toISOString()} maturity=${currentMaturity} verified=${verifiedClaims} inferred=${inferredClaims}`);
if (actions.some((item) => /synthetic/.test(item.reason))) {
  appendLine(deadEndsPath, `- ${new Date().toISOString()}: synthetic evidence is still blocking final verification; do not treat it as production proof.`);
}

console.log(JSON.stringify(result, null, 2));
