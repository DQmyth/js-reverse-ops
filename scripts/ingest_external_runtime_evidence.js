#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function usage() {
  console.error(
    'Usage: ingest_external_runtime_evidence.js --sample-dir <dir> --bundle-dir <dir> --runtime-json <file> [--runtime-json <file> ...]'
  );
  process.exit(1);
}

const args = process.argv.slice(2);
if (!args.length) usage();

const options = {
  sampleDir: '',
  bundleDir: '',
  runtimeJsons: [],
};

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  const next = args[i + 1] || '';
  if (arg === '--sample-dir') {
    options.sampleDir = path.resolve(next);
    i += 1;
  } else if (arg === '--bundle-dir') {
    options.bundleDir = path.resolve(next);
    i += 1;
  } else if (arg === '--runtime-json') {
    options.runtimeJsons.push(path.resolve(next));
    i += 1;
  } else {
    usage();
  }
}

if (!options.sampleDir || !options.bundleDir || options.runtimeJsons.length === 0) usage();

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath, fallback = {}) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function writeText(filePath, content) {
  fs.writeFileSync(filePath, `${content}\n`, 'utf8');
}

function appendUniqueString(list, value) {
  if (!list.includes(value)) list.push(value);
}

function walkFiles(root) {
  const out = [];
  if (!fs.existsSync(root)) return out;
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    const filePath = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(filePath));
    else out.push(filePath);
  }
  return out.sort();
}

function copyRuntime(src, destRoot) {
  const dest = path.join(destRoot, path.basename(src));
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
  return dest;
}

const sampleEvidenceRoot = path.join(options.sampleDir, 'artifacts', 'evidence', 'runtime-capture');
const bundleEvidenceRoot = path.join(options.bundleDir, 'artifacts', 'evidence', 'runtime-capture');
ensureDir(sampleEvidenceRoot);
ensureDir(bundleEvidenceRoot);

const imported = options.runtimeJsons.map((src) => {
  if (!fs.existsSync(src)) {
    console.error(`Runtime artifact not found: ${src}`);
    process.exit(1);
  }
  const parsed = readJson(src);
  return {
    source: src,
    sampleDestination: copyRuntime(src, sampleEvidenceRoot),
    bundleDestination: copyRuntime(src, bundleEvidenceRoot),
    data: parsed,
  };
});

const latest = imported[imported.length - 1].data;
const latestRequest = latest.request || {};
const acceptedRuntime = Number(latestRequest.status || 0) === 200 && !latestRequest.asset_only && !latest.local_harness;
const bundleEvidencePath = path.join(options.bundleDir, 'evidence.json');
const bundleClaimSetPath = path.join(options.bundleDir, 'claim-set.json');
const bundleRiskSummaryPath = path.join(options.bundleDir, 'risk-summary.json');
const bundleProvenanceGraphPath = path.join(options.bundleDir, 'provenance-graph.json');
const bundleProvenanceSummaryPath = path.join(options.bundleDir, 'provenance-summary.md');
const bundleOperatorReviewPath = path.join(options.bundleDir, 'operator-review.md');
const bundleArtifactIndexPath = path.join(options.bundleDir, 'artifact-index.json');

const evidence = readJson(bundleEvidencePath, {});
evidence.status = acceptedRuntime ? 'runtime-accepted' : 'runtime-captured';
evidence.runtime_evidence = {
  source: 'external-runtime-ingest',
  captured_at: latest.captured_at || new Date().toISOString(),
  synthetic: Boolean(latest.synthetic),
  local_harness: Boolean(latest.local_harness),
  request: latestRequest,
  notes: latest.notes || [],
};
evidence.notes = Array.isArray(evidence.notes) ? evidence.notes : [];
appendUniqueString(evidence.notes, 'External runtime evidence has been imported into artifacts/evidence/runtime-capture.');
writeJson(bundleEvidencePath, evidence);

const claimSet = readJson(bundleClaimSetPath, { claims: [] });
if (!Array.isArray(claimSet.claims)) claimSet.claims = [];
claimSet.overall_status = acceptedRuntime ? 'runtime-accepted' : 'runtime-captured';
if (!claimSet.claims.some((item) => item.id === 'external-runtime-evidence-imported')) {
  claimSet.claims.push({
    id: 'external-runtime-evidence-imported',
    status: 'verified',
    strength: 'high',
    statement: `External runtime evidence imported (${imported.length} artifact${imported.length === 1 ? '' : 's'}).`,
    evidence_sources: ['artifacts/evidence/runtime-capture', 'artifact-index.json'],
  });
}
if (latestRequest.url && !claimSet.claims.some((item) => item.id === 'external-runtime-request-url')) {
  claimSet.claims.push({
    id: 'external-runtime-request-url',
    status: acceptedRuntime ? 'verified' : 'inferred',
    strength: acceptedRuntime ? 'high' : 'medium',
    statement: `Runtime request observed at ${latestRequest.method || 'UNKNOWN'} ${latestRequest.url}.`,
    evidence_sources: ['artifacts/evidence/runtime-capture'],
  });
}
if (latestRequest.asset_only && !claimSet.claims.some((item) => item.id === 'external-runtime-asset-only')) {
  claimSet.claims.push({
    id: 'external-runtime-asset-only',
    status: 'verified',
    strength: 'high',
    statement: 'Current runtime evidence reflects asset loading or bootstrap requests, not an accepted protected request.',
    evidence_sources: ['artifacts/evidence/runtime-capture'],
  });
}
if (latest.local_harness && !claimSet.claims.some((item) => item.id === 'external-runtime-local-harness')) {
  claimSet.claims.push({
    id: 'external-runtime-local-harness',
    status: 'verified',
    strength: 'high',
    statement: 'Current runtime evidence comes from a local validation harness, not the original remote service.',
    evidence_sources: ['artifacts/evidence/runtime-capture'],
  });
}
writeJson(bundleClaimSetPath, claimSet);

const riskSummary = readJson(bundleRiskSummaryPath, { labels: [], items: [] });
if (!Array.isArray(riskSummary.labels)) riskSummary.labels = [];
appendUniqueString(riskSummary.labels, 'runtime-capture-available');
if (!Array.isArray(riskSummary.items)) riskSummary.items = [];
if (latest.synthetic && !riskSummary.items.some((item) => item.id === 'synthetic-runtime-evidence')) {
  riskSummary.items.push({
    id: 'synthetic-runtime-evidence',
    severity: 'medium',
    summary: 'Current runtime evidence is synthetic or placeholder evidence, not a live browser capture.',
    mitigation: 'Replace synthetic runtime artifacts with live browser capture before treating server behavior as verified.',
  });
}
if (latestRequest.asset_only && !riskSummary.items.some((item) => item.id === 'asset-only-runtime-evidence')) {
  riskSummary.items.push({
    id: 'asset-only-runtime-evidence',
    severity: 'low',
    summary: 'Current runtime evidence confirms asset or bootstrap loading but does not prove accepted protected-request parity.',
    mitigation: 'Use the asset-only runtime capture as a runtime foothold, then continue toward protected request, replay, or deeper browser interaction evidence.',
  });
}
if (latest.local_harness && !riskSummary.items.some((item) => item.id === 'local-harness-runtime-evidence')) {
  riskSummary.items.push({
    id: 'local-harness-runtime-evidence',
    severity: 'low',
    summary: 'Current runtime evidence is real execution against a local fixture, not the original remote target.',
    mitigation: 'Treat local harness acceptance as replay and transform validation, not as proof of remote server parity.',
  });
}
writeJson(bundleRiskSummaryPath, riskSummary);

const provenance = readJson(bundleProvenanceGraphPath, { nodes: [], edges: [] });
if (!Array.isArray(provenance.nodes)) provenance.nodes = [];
if (!Array.isArray(provenance.edges)) provenance.edges = [];
provenance.status = Number(latestRequest.status || 0) === 200 ? 'runtime-accepted' : 'runtime-captured';
provenance.status = acceptedRuntime ? 'runtime-accepted' : 'runtime-captured';
if (!provenance.nodes.some((node) => node.id === 'runtime-capture')) {
  provenance.nodes.push({
    id: 'runtime-capture',
    type: 'runtime-capture',
    label: 'External runtime capture',
    data: {
      synthetic: Boolean(latest.synthetic),
      request_url: latestRequest.url || null,
      request_method: latestRequest.method || null,
      request_status: latestRequest.status || null,
      asset_only: Boolean(latestRequest.asset_only),
      local_harness: Boolean(latest.local_harness),
      fields: latestRequest.fields || [],
    },
  });
  provenance.edges.push({
      from: 'runtime-capture',
      to: 'task',
      type: 'supports',
      confidence: acceptedRuntime ? 'high' : 'medium',
    });
}
writeJson(bundleProvenanceGraphPath, provenance);

writeText(bundleProvenanceSummaryPath, [
  `# Provenance Summary: ${path.basename(path.dirname(path.dirname(options.bundleDir)))}`,
  '',
  `- status: ${provenance.status}`,
  `- runtime_request: ${latestRequest.method || 'UNKNOWN'} ${latestRequest.url || 'unknown'}`,
  `- runtime_status: ${latestRequest.status == null ? 'unknown' : latestRequest.status}`,
  `- asset_only: ${Boolean(latestRequest.asset_only)}`,
  `- local_harness: ${Boolean(latest.local_harness)}`,
  `- runtime_fields: ${(latestRequest.fields || []).join(', ') || 'none'}`,
  `- synthetic: ${Boolean(latest.synthetic)}`,
  '',
  'Replace synthetic runtime evidence with live browser captures before claiming accepted replay parity.',
].join('\n'));

if (fs.existsSync(bundleOperatorReviewPath)) {
  writeText(bundleOperatorReviewPath, [
    `# Operator Review: ${path.basename(path.dirname(path.dirname(options.bundleDir)))}`,
    '',
    '## Current State',
    '',
    '- source snapshot and static analysis are present',
    '- runtime evidence has been imported into the bundle',
    `- current runtime evidence is ${latest.synthetic ? 'synthetic' : 'non-synthetic'}`,
    '',
    '## Next Actions',
    '',
    '- replace synthetic runtime capture with live browser evidence if available',
    '- compare runtime request fields against static endpoint and token hints',
    '- promote to replay verification only after accepted runtime or parity checks',
  ].join('\n'));
}

const artifactIndex = readJson(bundleArtifactIndexPath, {
  output_dir: options.bundleDir,
  root_files: [],
  groups: { original: [], derived: [], evidence: [] },
});
if (!artifactIndex.groups) artifactIndex.groups = { original: [], derived: [], evidence: [] };
if (!Array.isArray(artifactIndex.groups.evidence)) artifactIndex.groups.evidence = [];
for (const filePath of walkFiles(bundleEvidenceRoot)) {
  if (!artifactIndex.groups.evidence.some((entry) => entry.destination === filePath)) {
    artifactIndex.groups.evidence.push({
      status: 'copied',
      source: filePath,
      destination: filePath,
    });
  }
}
writeJson(bundleArtifactIndexPath, artifactIndex);

console.log(JSON.stringify({
  sample_dir: options.sampleDir,
  bundle_dir: options.bundleDir,
  imported_runtime_artifacts: imported.length,
  latest_request: latestRequest,
  status: evidence.status,
}, null, 2));
