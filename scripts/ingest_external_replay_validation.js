#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function usage() {
  console.error(
    'Usage: ingest_external_replay_validation.js --bundle-dir <dir> --validation-json <file> [--validation-json <file> ...]'
  );
  process.exit(1);
}

const args = process.argv.slice(2);
if (!args.length) usage();

const options = {
  bundleDir: '',
  validationJsons: [],
};

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  const next = args[i + 1] || '';
  if (arg === '--bundle-dir') {
    options.bundleDir = path.resolve(next);
    i += 1;
  } else if (arg === '--validation-json') {
    options.validationJsons.push(path.resolve(next));
    i += 1;
  } else {
    usage();
  }
}

if (!options.bundleDir || options.validationJsons.length === 0) usage();

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}
function readJson(filePath, fallback = {}) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : fallback;
}
function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}
function writeText(filePath, content) {
  fs.writeFileSync(filePath, `${content}\n`, 'utf8');
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
function appendUnique(list, value) {
  if (!list.includes(value)) list.push(value);
}

const validationRoot = path.join(options.bundleDir, 'artifacts', 'evidence', 'replay-validation');
ensureDir(validationRoot);

const imported = options.validationJsons.map((src) => {
  if (!fs.existsSync(src)) {
    console.error(`Replay validation artifact not found: ${src}`);
    process.exit(1);
  }
  const dest = path.join(validationRoot, path.basename(src));
  fs.copyFileSync(src, dest);
  return {
    source: src,
    destination: dest,
    data: readJson(src),
  };
});

const latest = imported[imported.length - 1].data;
const evidencePath = path.join(options.bundleDir, 'evidence.json');
const claimsPath = path.join(options.bundleDir, 'claim-set.json');
const risksPath = path.join(options.bundleDir, 'risk-summary.json');
const provenancePath = path.join(options.bundleDir, 'provenance-graph.json');
const provenanceSummaryPath = path.join(options.bundleDir, 'provenance-summary.md');
const operatorReviewPath = path.join(options.bundleDir, 'operator-review.md');
const artifactIndexPath = path.join(options.bundleDir, 'artifact-index.json');

const evidence = readJson(evidencePath, {});
evidence.replay_validation = {
  source: 'external-replay-validation-ingest',
  executed_at: latest.executed_at || new Date().toISOString(),
  synthetic: Boolean(latest.synthetic),
  local_harness: Boolean(latest.local_harness),
  accepted: Boolean(latest.accepted),
  parity_confirmed: Boolean(latest.parity_confirmed),
  notes: latest.notes || [],
  artifact_count: imported.length,
};
if (!evidence.runtime_evidence) evidence.runtime_evidence = {};
if (latest.accepted && latest.parity_confirmed && !latest.synthetic && !latest.local_harness) {
  evidence.runtime_evidence.replay_status = 'verified';
  evidence.status = 'replay-verified';
} else {
  evidence.runtime_evidence.replay_status = 'attempted';
  if (evidence.status !== 'replay-verified') evidence.status = 'replay-scaffolded';
}
evidence.notes = Array.isArray(evidence.notes) ? evidence.notes : [];
appendUnique(evidence.notes, 'Replay validation artifacts have been imported into artifacts/evidence/replay-validation.');
writeJson(evidencePath, evidence);

const claims = readJson(claimsPath, { claims: [] });
if (!Array.isArray(claims.claims)) claims.claims = [];
if (!claims.claims.some((item) => item.id === 'external-replay-validation-imported')) {
  claims.claims.push({
    id: 'external-replay-validation-imported',
    status: 'verified',
    strength: 'medium',
    statement: `Replay validation artifacts imported (${imported.length} artifact${imported.length === 1 ? '' : 's'}).`,
    evidence_sources: ['artifacts/evidence/replay-validation'],
  });
}
if (latest.accepted && latest.parity_confirmed && !latest.synthetic && !claims.claims.some((item) => item.id === 'external-replay-verified')) {
  claims.claims.push({
    id: 'external-replay-verified',
    status: 'verified',
    strength: 'high',
    statement: 'Replay parity and acceptance were verified with non-synthetic evidence.',
    evidence_sources: ['artifacts/evidence/replay-validation'],
  });
}
writeJson(claimsPath, claims);

const risks = readJson(risksPath, { labels: [], items: [] });
if (!Array.isArray(risks.labels)) risks.labels = [];
appendUnique(risks.labels, 'replay-validation-available');
if (!Array.isArray(risks.items)) risks.items = [];
if (latest.synthetic && !risks.items.some((item) => item.id === 'synthetic-replay-validation')) {
  risks.items.push({
    id: 'synthetic-replay-validation',
    severity: 'medium',
    summary: 'Replay validation evidence is synthetic and cannot prove real replay parity.',
    mitigation: 'Replace synthetic replay validation with a real replay run before promoting to replay-verified.',
  });
}
if (latest.local_harness && !risks.items.some((item) => item.id === 'local-harness-replay-validation')) {
  risks.items.push({
    id: 'local-harness-replay-validation',
    severity: 'low',
    summary: 'Replay validation executed against a local fixture rather than the original remote target.',
    mitigation: 'Use local-harness validation to verify transforms and request shape, then seek remote parity before promoting to replay-verified.',
  });
}
writeJson(risksPath, risks);

const provenance = readJson(provenancePath, { nodes: [], edges: [] });
if (!Array.isArray(provenance.nodes)) provenance.nodes = [];
if (!Array.isArray(provenance.edges)) provenance.edges = [];
if (!provenance.nodes.some((node) => node.id === 'replay-validation')) {
  provenance.nodes.push({
    id: 'replay-validation',
    type: 'replay-validation',
    label: 'Replay validation',
    data: {
      synthetic: Boolean(latest.synthetic),
      local_harness: Boolean(latest.local_harness),
      accepted: Boolean(latest.accepted),
      parity_confirmed: Boolean(latest.parity_confirmed),
    },
  });
  provenance.edges.push({
    from: 'replay-validation',
    to: 'runtime-capture',
    type: 'evaluates',
    confidence: latest.synthetic ? 'medium' : 'high',
  });
}
writeJson(provenancePath, provenance);

writeText(provenanceSummaryPath, [
  `# Provenance Summary: ${path.basename(path.dirname(path.dirname(options.bundleDir)))}`,
  '',
  `- status: ${evidence.status}`,
  `- replay_validation_available: true`,
  `- replay_validation_synthetic: ${Boolean(latest.synthetic)}`,
  `- replay_validation_local_harness: ${Boolean(latest.local_harness)}`,
  `- replay_validation_accepted: ${Boolean(latest.accepted)}`,
  `- replay_validation_parity_confirmed: ${Boolean(latest.parity_confirmed)}`,
  '',
  'Only non-synthetic accepted replay validation should promote the bundle to replay-verified.',
].join('\n'));

if (fs.existsSync(operatorReviewPath)) {
  writeText(operatorReviewPath, [
    `# Operator Review: ${path.basename(path.dirname(path.dirname(options.bundleDir)))}`,
    '',
    '## Current State',
    '',
    '- replay validation artifacts are present',
    `- replay validation is ${latest.synthetic ? 'synthetic' : 'non-synthetic'}`,
    `- accepted: ${Boolean(latest.accepted)}`,
    `- parity_confirmed: ${Boolean(latest.parity_confirmed)}`,
    '',
    '## Next Actions',
    '',
    '- if this validation is synthetic, replace it with a real replay run',
    '- if accepted and parity are both true with non-synthetic evidence, promote to replay-verified',
    '- keep replay request, response, and divergence notes in the replay-validation artifact set',
  ].join('\n'));
}

const artifactIndex = readJson(artifactIndexPath, { output_dir: options.bundleDir, root_files: [], groups: { original: [], derived: [], evidence: [] } });
if (!artifactIndex.groups) artifactIndex.groups = { original: [], derived: [], evidence: [] };
if (!Array.isArray(artifactIndex.groups.evidence)) artifactIndex.groups.evidence = [];
for (const filePath of walkFiles(validationRoot)) {
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
  bundle_dir: options.bundleDir,
  imported_validation_artifacts: imported.length,
  accepted: Boolean(latest.accepted),
  parity_confirmed: Boolean(latest.parity_confirmed),
  synthetic: Boolean(latest.synthetic),
  status: evidence.status,
}, null, 2));
