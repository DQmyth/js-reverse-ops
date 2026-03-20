#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function usage() {
  console.error(
    'Usage: reconcile_external_replay_verification.js --bundle-dir <dir> [--compare-json <file>]'
  );
  process.exit(1);
}

const args = process.argv.slice(2);
if (!args.length) usage();

const options = {
  bundleDir: '',
  compareJson: '',
};

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  const next = args[i + 1] || '';
  if (arg === '--bundle-dir') {
    options.bundleDir = path.resolve(next);
    i += 1;
  } else if (arg === '--compare-json') {
    options.compareJson = path.resolve(next);
    i += 1;
  } else {
    usage();
  }
}

if (!options.bundleDir) usage();

function readJson(filePath, fallback = {}) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : fallback;
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function appendUnique(list, value) {
  if (!list.includes(value)) list.push(value);
}

const bundleDir = options.bundleDir;
const evidencePath = path.join(bundleDir, 'evidence.json');
const claimsPath = path.join(bundleDir, 'claim-set.json');
const risksPath = path.join(bundleDir, 'risk-summary.json');
const comparePath = options.compareJson || path.join(bundleDir, 'replay-validation-compare.json');
const evidence = readJson(evidencePath);
const claims = readJson(claimsPath, { claims: [] });
const risks = readJson(risksPath, { labels: [], items: [] });
const compare = readJson(comparePath, null);

if (!compare) {
  console.error(`Replay compare artifact not found: ${comparePath}`);
  process.exit(1);
}

const replayValidation = evidence.replay_validation || {};
const nonSynthetic = replayValidation.synthetic === false;
const localHarness = replayValidation.local_harness === true;
const accepted = replayValidation.accepted === true;
const parityConfirmed = replayValidation.parity_confirmed === true;
const parityCandidate = compare.parity_candidate === true;

const promotable = Boolean(nonSynthetic && !localHarness && accepted && parityConfirmed && parityCandidate);

if (!evidence.runtime_evidence) evidence.runtime_evidence = {};
if (promotable) {
  evidence.runtime_evidence.replay_status = 'verified';
  evidence.status = 'replay-verified';
} else if (replayValidation.executed_at) {
  evidence.runtime_evidence.replay_status = 'attempted';
  evidence.status = 'replay-attempted';
}
evidence.notes = Array.isArray(evidence.notes) ? evidence.notes : [];
appendUnique(
  evidence.notes,
  promotable
    ? 'Replay verification was promoted automatically from non-synthetic accepted parity evidence.'
    : 'Replay verification remains below verified because acceptance, parity, or non-synthetic evidence is missing.'
);
writeJson(evidencePath, evidence);

if (!Array.isArray(claims.claims)) claims.claims = [];
claims.claims = claims.claims.filter((claim) => claim.id !== 'external-replay-verified');
if (promotable) {
  claims.claims.push({
    id: 'external-replay-verified',
    status: 'verified',
    strength: 'high',
    statement: 'Replay parity and server acceptance were verified with non-synthetic evidence.',
    evidence_sources: ['artifacts/evidence/replay-validation', path.relative(bundleDir, comparePath)],
  });
}
claims.overall_status = evidence.status || claims.overall_status;
writeJson(claimsPath, claims);

if (!Array.isArray(risks.labels)) risks.labels = [];
if (!Array.isArray(risks.items)) risks.items = [];
if (promotable) {
  risks.labels = risks.labels.filter((label) => label !== 'replay-validation-available');
  risks.items = risks.items.filter((item) => item.id !== 'synthetic-replay-validation');
} else {
  appendUnique(risks.labels, 'replay-validation-available');
}
writeJson(risksPath, risks);

console.log(JSON.stringify({
  bundle_dir: bundleDir,
  compare_json: comparePath,
  promotable,
  non_synthetic: nonSynthetic,
  local_harness: localHarness,
  accepted,
  parity_confirmed: parityConfirmed,
  parity_candidate: parityCandidate,
  resulting_status: evidence.status,
}, null, 2));
