#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function usage() {
  console.error(
    'Usage: ingest_external_source_snapshot.js --sample-dir <dir> --source-path <path> [--source-path <path> ...] [--bundle-dir <dir>]'
  );
  process.exit(1);
}

const args = process.argv.slice(2);
if (!args.length) usage();

const options = {
  sampleDir: '',
  bundleDir: '',
  sourcePaths: [],
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
  } else if (arg === '--source-path') {
    options.sourcePaths.push(path.resolve(next));
    i += 1;
  } else {
    usage();
  }
}

if (!options.sampleDir || options.sourcePaths.length === 0) usage();

const sampleDir = options.sampleDir;
const bundleDir = options.bundleDir;
const sampleArtifactIndexPath = path.join(sampleDir, 'artifact-index.json');
const sourceIndexPath = path.join(sampleDir, 'source-snapshot-index.json');
const sampleOriginalRoot = path.join(sampleDir, 'artifacts', 'original', 'source-snapshot');

if (!fs.existsSync(sampleDir)) {
  console.error(`Sample directory not found: ${sampleDir}`);
  process.exit(1);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyEntry(src, destRoot) {
  const baseName = path.basename(src);
  const dest = path.join(destRoot, baseName);
  ensureDir(path.dirname(dest));
  fs.cpSync(src, dest, { recursive: true, force: true });
  const stat = fs.statSync(dest);
  return {
    source: src,
    destination: dest,
    type: stat.isDirectory() ? 'directory' : 'file',
  };
}

function readJsonIfExists(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function appendUniqueString(list, value) {
  if (!list.includes(value)) list.push(value);
}

function archivalSourceRisk(publicWriteupFacts) {
  const facts = publicWriteupFacts || {};
  const stack = (facts.stack || []).map((item) => String(item).toLowerCase());
  const criticalPaths = (facts.critical_paths || []).map((item) => String(item).toLowerCase());
  const isWasm = stack.includes('webassembly');
  const solverLike = criticalPaths.some((item) => item.includes('checkflag') || item.includes('aes'));
  const challengeReconstruction = criticalPaths.some((item) => item.includes('challenge-success') || item.includes('browser challenge ui'));
  const runtimeInternals =
    stack.includes('v8') ||
    stack.some((item) => item.includes('engine') || item.includes('runtime')) ||
    criticalPaths.some((item) => item.includes('promise') || item.includes('runtime'));

  if (isWasm && solverLike) {
    return {
      id: 'archival-wasm-source-only',
      summary: 'The preserved source snapshot is archival and solver-oriented, but the WASM reverse path is not yet materialized.',
      mitigation: 'Use the imported source to preserve loader, checkFlag, and AES or memory-oriented anchors before any replay-oriented work.',
    };
  }
  if (runtimeInternals) {
    return {
      id: 'archival-runtime-reference-source-only',
      summary: 'The preserved source snapshot is archival and runtime-internals-heavy, but the patch or POC route is not yet materialized.',
      mitigation: 'Use the imported source to preserve patch targets, builtins, and POC entrypoints before any replay-style promotion.',
    };
  }
  if (isWasm && challengeReconstruction) {
    return {
      id: 'archival-challenge-reconstruction-source-only',
      summary: 'The preserved source snapshot is archival and points to challenge-success reconstruction, but that route is not yet materialized.',
      mitigation: 'Use the imported source to preserve loader and challenge-success anchors before attempting request-centric runtime capture.',
    };
  }
  return null;
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

ensureDir(sampleOriginalRoot);
const imported = options.sourcePaths.map((src) => {
  if (!fs.existsSync(src)) {
    console.error(`Source path not found: ${src}`);
    process.exit(1);
  }
  return copyEntry(src, sampleOriginalRoot);
});

const sourceIndex = readJsonIfExists(sourceIndexPath, { sample_dir: sampleDir, entries: [] });
for (const entry of imported) {
  sourceIndex.entries.push({
    imported_at: new Date().toISOString(),
    source: entry.source,
    destination: entry.destination,
    type: entry.type,
  });
}
writeJson(sourceIndexPath, sourceIndex);

const sampleArtifactIndex = readJsonIfExists(sampleArtifactIndexPath, {
  output_dir: sampleDir,
  root_files: [],
  groups: { original: [], derived: [], evidence: [] },
});
if (!Array.isArray(sampleArtifactIndex.root_files)) sampleArtifactIndex.root_files = [];
if (!sampleArtifactIndex.groups) sampleArtifactIndex.groups = { original: [], derived: [], evidence: [] };
if (!Array.isArray(sampleArtifactIndex.groups.original)) sampleArtifactIndex.groups.original = [];

for (const entry of imported) {
  sampleArtifactIndex.groups.original.push({
    status: 'copied',
    source: entry.source,
    destination: entry.destination,
  });
}
writeJson(sampleArtifactIndexPath, sampleArtifactIndex);

let bundleUpdates = null;
if (bundleDir) {
  const bundleArtifactIndexPath = path.join(bundleDir, 'artifact-index.json');
  const bundleEvidencePath = path.join(bundleDir, 'evidence.json');
  const bundleClaimSetPath = path.join(bundleDir, 'claim-set.json');
  const bundleRiskSummaryPath = path.join(bundleDir, 'risk-summary.json');
  const bundleProvenanceGraphPath = path.join(bundleDir, 'provenance-graph.json');
  const bundleProvenanceSummaryPath = path.join(bundleDir, 'provenance-summary.md');
  const bundleOriginalRoot = path.join(bundleDir, 'artifacts', 'original', 'source-snapshot');
  ensureDir(bundleOriginalRoot);

  const bundleCopies = imported.map((entry) => copyEntry(entry.source, bundleOriginalRoot));
  const snapshotFiles = walkFiles(bundleOriginalRoot);

  const bundleArtifactIndex = readJsonIfExists(bundleArtifactIndexPath, {
    output_dir: bundleDir,
    root_files: [],
    groups: { original: [], derived: [], evidence: [] },
  });
  if (!bundleArtifactIndex.groups) bundleArtifactIndex.groups = { original: [], derived: [], evidence: [] };
  if (!Array.isArray(bundleArtifactIndex.groups.original)) bundleArtifactIndex.groups.original = [];
  for (const entry of bundleCopies) {
    bundleArtifactIndex.groups.original.push({
      status: 'copied',
      source: entry.source,
      destination: entry.destination,
    });
  }
  writeJson(bundleArtifactIndexPath, bundleArtifactIndex);

  const evidence = readJsonIfExists(bundleEvidencePath, {});
  evidence.status = evidence.status === 'bootstrap-only' ? 'source-snapshot-imported' : evidence.status || 'source-snapshot-imported';
  evidence.source_snapshot = {
    imported_count: snapshotFiles.length,
    paths: snapshotFiles.map((filePath) => path.relative(bundleDir, filePath)),
  };
  evidence.notes = Array.isArray(evidence.notes) ? evidence.notes : [];
  appendUniqueString(evidence.notes, 'Local source snapshot has been imported into artifacts/original/source-snapshot.');
  writeJson(bundleEvidencePath, evidence);

  const claimSet = readJsonIfExists(bundleClaimSetPath, { claims: [] });
  if (!Array.isArray(claimSet.claims)) claimSet.claims = [];
  if (!claimSet.claims.some((item) => item.id === 'external-source-snapshot-imported')) {
    claimSet.claims.push({
      id: 'external-source-snapshot-imported',
      status: 'verified',
      strength: 'high',
      statement: `Local source snapshot imported (${bundleCopies.length} item${bundleCopies.length === 1 ? '' : 's'}).`,
      evidence_sources: ['source-snapshot-index.json', 'artifact-index.json'],
    });
  }
  if (claimSet.overall_status === 'bootstrap-only') {
    claimSet.overall_status = 'source-snapshot-imported';
  }
  writeJson(bundleClaimSetPath, claimSet);

  const riskSummary = readJsonIfExists(bundleRiskSummaryPath, { labels: [], items: [] });
  if (!Array.isArray(riskSummary.labels)) riskSummary.labels = [];
  appendUniqueString(riskSummary.labels, 'source-snapshot-available');
  if (!Array.isArray(riskSummary.items)) riskSummary.items = [];
  const sourceRisk = archivalSourceRisk(evidence.public_writeup_facts);
  if (sourceRisk) {
    appendUniqueString(riskSummary.labels, 'archival-backed');
    riskSummary.items = riskSummary.items.filter((item) => item.id !== 'static-evidence-still-partial');
    if (!riskSummary.items.some((item) => item.id === sourceRisk.id)) {
      riskSummary.items.push({
        id: sourceRisk.id,
        severity: 'low',
        summary: sourceRisk.summary,
        mitigation: sourceRisk.mitigation,
      });
    }
  } else if (!riskSummary.items.some((item) => item.id === 'static-evidence-still-partial')) {
    riskSummary.items.push({
      id: 'static-evidence-still-partial',
      severity: 'low',
      summary: 'Source snapshot is available, but runtime evidence may still be missing.',
      mitigation: 'Use imported source to drive static analysis, then capture runtime evidence if signatures or cookies remain unresolved.',
    });
  }
  writeJson(bundleRiskSummaryPath, riskSummary);

  const provenanceGraph = readJsonIfExists(bundleProvenanceGraphPath, { nodes: [], edges: [] });
  if (!Array.isArray(provenanceGraph.nodes)) provenanceGraph.nodes = [];
  if (!Array.isArray(provenanceGraph.edges)) provenanceGraph.edges = [];
  if (provenanceGraph.status === 'bootstrap-only' || !provenanceGraph.status) {
    provenanceGraph.status = 'source-snapshot-imported';
  }
  if (!provenanceGraph.nodes.some((node) => node.id === 'source-snapshot')) {
    provenanceGraph.nodes.push({
      id: 'source-snapshot',
      type: 'source-snapshot',
      label: 'Local source snapshot',
      data: {
        imported_count: bundleCopies.length,
        paths: bundleCopies.map((entry) => path.relative(bundleDir, entry.destination)),
      },
    });
    provenanceGraph.edges.push({
      from: 'source-snapshot',
      to: 'task',
      type: 'supports',
      confidence: 'high',
    });
  }
  writeJson(bundleProvenanceGraphPath, provenanceGraph);

  if (fs.existsSync(bundleProvenanceSummaryPath)) {
    const sampleLabel = path.basename(path.dirname(path.dirname(bundleDir)));
    const summary = [
      `# Provenance Summary: ${sampleLabel}`,
      '',
      '- status: source-snapshot-imported',
      '- local source snapshot imported into artifacts/original/source-snapshot',
      `- imported_count: ${bundleCopies.length}`,
      '',
      'Runtime provenance is still incomplete until live request, hook, paused-frame, or replay evidence is added.',
    ].join('\n');
    fs.writeFileSync(bundleProvenanceSummaryPath, `${summary}\n`, 'utf8');
  }

  bundleUpdates = {
    bundle_dir: bundleDir,
    imported_count: bundleCopies.length,
  };
}

console.log(JSON.stringify({
  sample_dir: sampleDir,
  imported_count: imported.length,
  source_paths: imported.map((entry) => entry.source),
  bundle_updates: bundleUpdates,
}, null, 2));
