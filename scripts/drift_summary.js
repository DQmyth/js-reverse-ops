#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

function usage() {
  console.error('Usage: drift_summary.js <old-task-dir> <new-task-dir> [--output <drift-summary.json>]');
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.length < 2) usage();
const oldDir = path.resolve(args[0]);
const newDir = path.resolve(args[1]);
let outputPath = '';
for (let i = 2; i < args.length; i += 1) {
  if (args[i] === '--output') outputPath = args[++i] || '';
  else usage();
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const oldEvidence = readJson(path.join(oldDir, 'evidence.json'));
const newEvidence = readJson(path.join(newDir, 'evidence.json'));
const oldClaims = path.join(oldDir, 'claim-set.json');
const newClaims = path.join(newDir, 'claim-set.json');
let claimDiff = null;
if (fs.existsSync(oldClaims) && fs.existsSync(newClaims)) {
  const diffScript = path.join(__dirname, 'diff_claim_sets.js');
  const result = cp.spawnSync(process.execPath, [diffScript, oldClaims, newClaims], { encoding: 'utf8' });
  if (result.status === 0) claimDiff = JSON.parse(result.stdout);
}

const oldReq = ((oldEvidence.runtime_evidence || {}).request) || {};
const newReq = ((newEvidence.runtime_evidence || {}).request) || {};

const result = {
  old_task_dir: oldDir,
  new_task_dir: newDir,
  generated_at: new Date().toISOString(),
  request_diff: {
    status_before: oldReq.status || null,
    status_after: newReq.status || null,
    fields_before: oldReq.fields || [],
    fields_after: newReq.fields || [],
    url_before: oldReq.url || null,
    url_after: newReq.url || null,
  },
  claim_diff: claimDiff,
  risk_regression: {
    before: ((((oldEvidence.static_evidence || {}).family_decision) || {}).detected_risks) || [],
    after: ((((newEvidence.static_evidence || {}).family_decision) || {}).detected_risks) || [],
  },
};

const json = JSON.stringify(result, null, 2);
if (outputPath) fs.writeFileSync(outputPath, `${json}\n`, 'utf8');
console.log(json);
