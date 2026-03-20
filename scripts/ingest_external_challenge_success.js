#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function usage() {
  console.error(
    'Usage: ingest_external_challenge_success.js --bundle-dir <dir> --success-json <file> [--success-json <file> ...]'
  );
  process.exit(1);
}

const args = process.argv.slice(2);
if (!args.length) usage();

const options = {
  bundleDir: '',
  successJsons: [],
};

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  const next = args[i + 1] || '';
  if (arg === '--bundle-dir') {
    options.bundleDir = path.resolve(next);
    i += 1;
  } else if (arg === '--success-json') {
    options.successJsons.push(path.resolve(next));
    i += 1;
  } else {
    usage();
  }
}

if (!options.bundleDir || options.successJsons.length === 0) usage();

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}
function readJson(filePath, fallback = {}) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : fallback;
}
function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}
function appendUnique(list, value) {
  if (!list.includes(value)) list.push(value);
}
function walkFiles(root) {
  const out = [];
  if (!fs.existsSync(root)) return out;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const filePath = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(filePath));
    else out.push(filePath);
  }
  return out.sort();
}

const bundleDir = options.bundleDir;
const challengeRoot = path.join(bundleDir, 'artifacts', 'evidence', 'challenge-success');
ensureDir(challengeRoot);

const imported = options.successJsons.map((src) => {
  if (!fs.existsSync(src)) {
    console.error(`Challenge success artifact not found: ${src}`);
    process.exit(1);
  }
  const dest = path.join(challengeRoot, path.basename(src));
  fs.copyFileSync(src, dest);
  return {
    source: src,
    destination: dest,
    data: readJson(src),
  };
});

const latest = imported[imported.length - 1].data;
const archivalPublic = Boolean(latest.archival_public);
const localHarness = Boolean(latest.local_harness);
const evidencePath = path.join(bundleDir, 'evidence.json');
const claimsPath = path.join(bundleDir, 'claim-set.json');
const risksPath = path.join(bundleDir, 'risk-summary.json');
const provenancePath = path.join(bundleDir, 'provenance-graph.json');
const artifactIndexPath = path.join(bundleDir, 'artifact-index.json');

const evidence = readJson(evidencePath, {});
evidence.challenge_success = {
  source: 'external-challenge-success-ingest',
  executed_at: latest.captured_at || new Date().toISOString(),
  synthetic: Boolean(latest.synthetic),
  local_harness: Boolean(latest.local_harness),
  archival_public: Boolean(latest.archival_public),
  challenge: latest.challenge || {},
  evidence: latest.evidence || {},
  notes: latest.notes || [],
  artifact_count: imported.length,
};
if (!evidence.status || evidence.status === 'bootstrap-only' || evidence.status === 'source-snapshot-imported' || evidence.status === 'static-analysis-generated') {
  evidence.status = 'runtime-captured';
}
evidence.notes = Array.isArray(evidence.notes) ? evidence.notes : [];
appendUnique(evidence.notes, 'Challenge-success artifacts have been imported into artifacts/evidence/challenge-success.');
writeJson(evidencePath, evidence);

const claims = readJson(claimsPath, { claims: [] });
if (!Array.isArray(claims.claims)) claims.claims = [];
claims.claims = claims.claims.filter((claim) => !['external-bundle-not-yet-verified', 'external-challenge-solved', 'external-solver-route-preserved', 'external-archival-challenge-success'].includes(claim.id));
if (!claims.claims.some((item) => item.id === 'external-challenge-success-imported')) {
  claims.claims.push({
    id: 'external-challenge-success-imported',
    status: 'verified',
    strength: 'high',
    statement: `Challenge-success artifacts imported (${imported.length} artifact${imported.length === 1 ? '' : 's'}).`,
    evidence_sources: ['artifacts/evidence/challenge-success'],
  });
}
if ((latest.challenge || {}).password && !claims.claims.some((item) => item.id === 'external-challenge-solved')) {
  claims.claims.push({
    id: 'external-challenge-solved',
    status: 'verified',
    strength: 'high',
    statement: archivalPublic
      ? `An archival challenge-success path was reproduced for ${(latest.challenge || {}).type || 'challenge logic'}.`
      : localHarness
        ? `A local-harness challenge success path was reproduced for ${(latest.challenge || {}).type || 'challenge logic'}.`
        : `A browser-executed challenge success path was reproduced for ${(latest.challenge || {}).type || 'challenge logic'}.`,
    evidence_sources: ['artifacts/evidence/challenge-success'],
  });
}
if ((latest.evidence || {}).solver && (latest.evidence || {}).symbol_map && (latest.evidence || {}).writeup_facts) {
  claims.claims.push({
    id: 'external-solver-route-preserved',
    status: 'verified',
    strength: 'high',
    statement: 'A full archival solver route is preserved across writeup facts, symbol mapping, solver logic, and solved output.',
    evidence_sources: [
      (latest.evidence || {}).writeup_facts,
      (latest.evidence || {}).symbol_map,
      (latest.evidence || {}).solver,
      'artifacts/evidence/challenge-success',
    ],
  });
}
if (archivalPublic) {
  claims.claims.push({
    id: 'external-archival-challenge-success',
    status: 'verified',
    strength: 'medium',
    statement: 'Challenge-success evidence is archival and public-writeup-backed rather than live remote parity.',
    evidence_sources: ['artifacts/evidence/challenge-success'],
  });
}
claims.overall_status = evidence.status;
writeJson(claimsPath, claims);

const risks = readJson(risksPath, { labels: [], items: [] });
if (!Array.isArray(risks.labels)) risks.labels = [];
appendUnique(risks.labels, 'challenge-success-available');
if (!Array.isArray(risks.items)) risks.items = [];
risks.items = risks.items.filter((item) => !['challenge-success-local-only', 'challenge-success-archival-public'].includes(item.id));
if (archivalPublic) {
  risks.items.push({
    id: 'challenge-success-archival-public',
    severity: 'low',
    summary: 'Challenge success is supported by archival public evidence and a local solver route, not by a surviving live target.',
    mitigation: 'Treat this as strong logic provenance for archival benchmarks, but keep remote parity and replay verification separate.',
  });
} else if (!risks.items.some((item) => item.id === 'challenge-success-local-only')) {
  risks.items.push({
    id: 'challenge-success-local-only',
    severity: 'low',
    summary: 'Challenge success was reproduced in a local browser execution context rather than through a remote protected request.',
    mitigation: 'Treat this as strong business-logic proof for inline challenges, but keep remote acceptance and replay verification separate.',
  });
}
writeJson(risksPath, risks);

const provenance = readJson(provenancePath, { nodes: [], edges: [] });
if (!Array.isArray(provenance.nodes)) provenance.nodes = [];
if (!Array.isArray(provenance.edges)) provenance.edges = [];
if (!provenance.nodes.some((node) => node.id === 'challenge-success')) {
  provenance.nodes.push({
    id: 'challenge-success',
    type: 'challenge-success',
    label: (latest.challenge || {}).type || 'challenge success',
    data: {
      success_signal: (latest.challenge || {}).success_signal || null,
      password: (latest.challenge || {}).password || null,
      local_harness: Boolean(latest.local_harness),
    },
  });
  provenance.edges.push({
    from: 'challenge-success',
    to: 'task',
    type: 'supports',
    confidence: 'high',
  });
}
if (!provenance.status || provenance.status === 'bootstrap-only' || provenance.status === 'source-snapshot-imported' || provenance.status === 'static-analysis-generated') {
  provenance.status = 'runtime-captured';
}
writeJson(provenancePath, provenance);

const artifactIndex = readJson(artifactIndexPath, { output_dir: bundleDir, root_files: [], groups: { original: [], derived: [], evidence: [] } });
if (!artifactIndex.groups) artifactIndex.groups = { original: [], derived: [], evidence: [] };
if (!Array.isArray(artifactIndex.groups.evidence)) artifactIndex.groups.evidence = [];
for (const filePath of walkFiles(challengeRoot)) {
  if (!artifactIndex.groups.evidence.some((entry) => entry.destination === filePath)) {
    artifactIndex.groups.evidence.push({
      status: 'copied',
      source: filePath,
      destination: filePath,
    });
  }
}
writeJson(artifactIndexPath, artifactIndex);

console.log(JSON.stringify({
  bundle_dir: bundleDir,
  imported_challenge_success_artifacts: imported.length,
  challenge_type: (latest.challenge || {}).type || null,
  status: evidence.status,
}, null, 2));
