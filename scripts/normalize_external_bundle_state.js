#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function usage() {
  console.error('Usage: normalize_external_bundle_state.js --bundle-dir <dir>');
  process.exit(1);
}

const args = process.argv.slice(2);
if (!args.length) usage();

let bundleDir = '';
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--bundle-dir') {
    bundleDir = path.resolve(args[++i] || '');
  } else {
    usage();
  }
}
if (!bundleDir) usage();

function readJson(name, fallback = {}) {
  const file = path.join(bundleDir, name);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback;
}
function writeJson(name, data) {
  fs.writeFileSync(path.join(bundleDir, name), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}
function uniqStrings(items) {
  return [...new Set((items || []).filter(Boolean))];
}
function dedupeByDestination(entries) {
  const seen = new Set();
  const out = [];
  for (const entry of entries || []) {
    const key = entry.destination || `${entry.source || ''}:${entry.status || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out;
}

const evidence = readJson('evidence.json');
const claims = readJson('claim-set.json', { claims: [] });
const risks = readJson('risk-summary.json', { labels: [], items: [] });
const provenance = readJson('provenance-graph.json', { status: 'unknown' });
const artifactIndex = readJson('artifact-index.json', { output_dir: bundleDir, root_files: [], groups: { original: [], derived: [], evidence: [] } });

const hasSourceSnapshot = Boolean(evidence.source_snapshot && (evidence.source_snapshot.imported_count || 0) > 0);
const hasStaticAnalysis = Boolean(evidence.static_analysis);
const runtime = evidence.runtime_evidence || {};
const runtimeRequest = runtime.request || {};
const challengeSuccess = evidence.challenge_success || {};
const hasRuntimeCapture = Boolean(runtimeRequest.url || runtimeRequest.fields || runtimeRequest.body);
const runtimeAccepted = Number(runtimeRequest.status || 0) === 200 && !runtimeRequest.asset_only && !runtime.local_harness;
const hasReplayScaffold = Boolean((evidence.replay_scaffold || {}).generated || (evidence.form_replay || {}).generated);
const hasReplayValidation = Boolean((evidence.replay_validation || {}).executed_at);
const replayAttempted = runtime.replay_status === 'attempted' || hasReplayValidation;
const replayVerified = runtime.replay_status === 'verified';
const hasChallengeSuccess = Boolean(challengeSuccess.executed_at);
const hasStrongRuntimeEvidence = hasRuntimeCapture || hasChallengeSuccess;

let normalizedStatus = 'bootstrap-only';
if (replayVerified) normalizedStatus = 'replay-verified';
else if (replayAttempted) normalizedStatus = 'replay-attempted';
else if (hasReplayScaffold) normalizedStatus = 'replay-scaffolded';
else if (runtimeAccepted) normalizedStatus = 'runtime-accepted';
else if (hasRuntimeCapture) normalizedStatus = 'runtime-captured';
else if (hasChallengeSuccess) normalizedStatus = 'runtime-captured';
else if (hasStaticAnalysis) normalizedStatus = 'static-analysis-generated';
else if (hasSourceSnapshot) normalizedStatus = 'source-snapshot-imported';

evidence.status = normalizedStatus;
evidence.notes = uniqStrings(evidence.notes || []);
writeJson('evidence.json', evidence);

if (!Array.isArray(claims.claims)) claims.claims = [];
claims.overall_status = normalizedStatus;
claims.claims = claims.claims.filter((claim) => {
  if (claim.id === 'external-bundle-not-yet-verified' && hasStrongRuntimeEvidence) return false;
  return true;
});
if (!hasStrongRuntimeEvidence && !claims.claims.some((claim) => claim.id === 'external-bundle-not-yet-verified')) {
  claims.claims.push({
    id: 'external-bundle-not-yet-verified',
    status: 'verified',
    strength: 'high',
    statement: 'No live runtime evidence has been captured for this external sample bundle yet.',
    evidence_sources: ['task.json', 'evidence.json'],
  });
}
writeJson('claim-set.json', claims);

risks.labels = uniqStrings(risks.labels || []).filter((label) => {
  if (label === 'bootstrap-only' && normalizedStatus !== 'bootstrap-only') return false;
  if (label === 'runtime-evidence-missing' && hasStrongRuntimeEvidence) return false;
  return true;
});
if (!Array.isArray(risks.items)) risks.items = [];
risks.items = risks.items.filter((item) => {
  if (item.id === 'runtime-evidence-missing' && hasStrongRuntimeEvidence) return false;
  return true;
});
writeJson('risk-summary.json', risks);

provenance.status = normalizedStatus === 'replay-scaffolded' ? 'runtime-captured' : normalizedStatus;
if (normalizedStatus === 'replay-attempted') provenance.status = 'runtime-captured';
writeJson('provenance-graph.json', provenance);

artifactIndex.root_files = dedupeByDestination(artifactIndex.root_files || []);
artifactIndex.groups = artifactIndex.groups || { original: [], derived: [], evidence: [] };
artifactIndex.groups.original = dedupeByDestination(artifactIndex.groups.original || []);
artifactIndex.groups.derived = dedupeByDestination(artifactIndex.groups.derived || []);
artifactIndex.groups.evidence = dedupeByDestination(artifactIndex.groups.evidence || []);
writeJson('artifact-index.json', artifactIndex);

console.log(JSON.stringify({
  bundle_dir: bundleDir,
  normalized_status: normalizedStatus,
  has_source_snapshot: hasSourceSnapshot,
  has_static_analysis: hasStaticAnalysis,
  has_runtime_capture: hasRuntimeCapture,
  has_challenge_success: hasChallengeSuccess,
  has_strong_runtime_evidence: hasStrongRuntimeEvidence,
  runtime_accepted: runtimeAccepted,
  has_replay_scaffold: hasReplayScaffold,
  has_replay_validation: hasReplayValidation,
  replay_attempted: replayAttempted,
  replay_verified: replayVerified,
}, null, 2));
