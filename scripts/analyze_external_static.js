#!/usr/bin/env node
const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

function usage() {
  console.error(
    'Usage: analyze_external_static.js --sample-dir <dir> --bundle-dir <dir> [--source-root <dir>]'
  );
  process.exit(1);
}

const args = process.argv.slice(2);
if (!args.length) usage();

const options = {
  sampleDir: '',
  bundleDir: '',
  sourceRoot: '',
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
  } else if (arg === '--source-root') {
    options.sourceRoot = path.resolve(next);
    i += 1;
  } else {
    usage();
  }
}

if (!options.sampleDir || !options.bundleDir) usage();

const sourceRoot = options.sourceRoot || path.join(options.sampleDir, 'artifacts', 'original', 'source-snapshot');
if (!fs.existsSync(sourceRoot)) {
  console.error(`Source snapshot directory not found: ${sourceRoot}`);
  process.exit(1);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath, fallback = null) {
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

function archivalRiskProfile(publicWriteupFacts, staticSummary = null) {
  const facts = publicWriteupFacts || {};
  const stack = (facts.stack || []).map((item) => String(item).toLowerCase());
  const criticalPaths = (facts.critical_paths || []).map((item) => String(item).toLowerCase());
  const publicSignals = facts.public_signals || {};
  const writeupKeywords = (publicSignals.writeup_keywords || []).map((item) => String(item).toLowerCase());
  const inferred = (staticSummary || {}).inferred || {};
  const helperMarkers = (inferred.helper_markers || []).map((item) => String(item).toLowerCase());
  const moduleHints = (inferred.module_hints || []).map((item) => String(item).toLowerCase());
  const staticSignalText = [...helperMarkers, ...moduleHints].join(' ');
  const isWasm = stack.includes('webassembly');
  const solverLike = criticalPaths.some((item) => item.includes('checkflag') || item.includes('aes'));
  const challengeReconstruction = criticalPaths.some((item) => item.includes('challenge-success') || item.includes('browser challenge ui'));
  const antiDebugUnlock =
    criticalPaths.some((item) => item.includes('anti-debug') || item.includes('unlock') || item.includes('localstorage')) ||
    writeupKeywords.some((item) => item.includes('anti-debug') || item.includes('unlock') || item.includes('localstorage') || item.includes('devtools')) ||
    staticSignalText.includes('anti-debug') ||
    staticSignalText.includes('unlock') ||
    staticSignalText.includes('localstorage') ||
    staticSignalText.includes('devtools');
  const emscriptenEntrypoint =
    criticalPaths.some((item) => item.includes('module.ccall') || item.includes('module.cwrap') || item.includes('validate') || item.includes('checkauth') || item.includes('checkflag')) ||
    writeupKeywords.some((item) => item.includes('module.ccall') || item.includes('module.cwrap') || item.includes('validate') || item.includes('checkauth') || item.includes('checkflag')) ||
    staticSignalText.includes('module.ccall') ||
    staticSignalText.includes('module.cwrap') ||
    staticSignalText.includes('validate') ||
    staticSignalText.includes('checkauth') ||
    staticSignalText.includes('checkflag');
  const runtimeInternals =
    stack.includes('v8') ||
    stack.some((item) => item.includes('engine') || item.includes('runtime')) ||
    criticalPaths.some((item) => item.includes('promise') || item.includes('runtime'));

  if (isWasm && solverLike) {
    return {
      labels: ['archival-backed', 'archival-wasm-solver-candidate', 'live-parity-missing'],
      items: [
        {
          id: 'archival-wasm-solver-route',
          severity: 'medium',
          summary: 'This archival bundle is anchored by WASM plus checkFlag/AES-style public facts, so replay-first routing is likely misleading.',
          mitigation: 'Preserve checkFlag, loader, symbol-map, AES, and memory-oriented reasoning before widening into live replay or generic runtime capture.',
        },
      ],
    };
  }

  if (runtimeInternals) {
    return {
      labels: ['archival-backed', 'runtime-internals-reference', 'live-parity-missing'],
      items: [
        {
          id: 'archival-runtime-internals-route',
          severity: 'medium',
          summary: 'This archival bundle is primarily a runtime-internals or engine-reference case, not a normal replay target.',
          mitigation: 'Preserve patch targets, builtins, Promise-job paths, and POC anchors before attempting any replay-style promotion.',
        },
      ],
    };
  }

  if (antiDebugUnlock) {
    return {
      labels: ['archival-backed', 'archival-antidebug-html', 'unlock-route-preservation', 'live-parity-missing'],
      items: [
        {
          id: 'archival-antidebug-html-route',
          severity: 'medium',
          summary: 'This archival HTML bundle is centered on anti-debug or unlock-route reconstruction rather than request replay.',
          mitigation: 'Preserve anti-debug checks, unlock gates, and localStorage or devtools-dependent branches before inventing accepted-runtime or replay claims.',
        },
      ],
    };
  }

  if (isWasm && challengeReconstruction) {
    return {
      labels: [
        'archival-backed',
        'challenge-success-reconstruction',
        'live-parity-missing',
        ...(emscriptenEntrypoint ? ['emscripten-entrypoint-candidate', 'minimal-local-harness-preferred'] : []),
      ],
      items: [
        {
          id: 'archival-challenge-reconstruction-route',
          severity: 'medium',
          summary: 'This archival WASM bundle is better treated as a challenge-success reconstruction target than a request-replay target.',
          mitigation: 'Prefer challenge-success reconstruction or a minimal local harness before attempting request-centric runtime capture.',
        },
        ...(emscriptenEntrypoint ? [{
          id: 'archival-emscripten-entrypoint-route',
          severity: 'medium',
          summary: 'Static evidence preserves an Emscripten-style Module.ccall/cwrap challenge entrypoint, so minimal local harness reconstruction is a better next step than replay-first routing.',
          mitigation: 'Preserve the validate/checkAuth/checkFlag entrypoint and build a minimal harness around it before attempting live request-centric promotion.',
        }] : []),
      ],
    };
  }

  return null;
}

function runJsonScript(scriptName, inputPath, outputPath) {
  const scriptPath = path.resolve(__dirname, scriptName);
  const result = childProcess.spawnSync(process.execPath, [scriptPath, inputPath], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `failed: ${scriptName}`);
  }
  const parsed = JSON.parse(result.stdout);
  writeJson(outputPath, parsed);
  return parsed;
}

function walkFiles(root) {
  const out = [];
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    const filePath = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(filePath));
    else out.push(filePath);
  }
  return out.sort();
}

const derivedRoot = path.join(options.bundleDir, 'artifacts', 'derived', 'static-analysis');
ensureDir(derivedRoot);

const allFiles = walkFiles(sourceRoot);
const fileInventory = allFiles.map((filePath) => ({
  path: filePath,
  relative_path: path.relative(sourceRoot, filePath),
  ext: path.extname(filePath).toLowerCase() || '(none)',
  size_bytes: fs.statSync(filePath).size,
}));

const analyses = [];
const familySignals = new Set();
const endpoints = new Set();
const tokenFields = new Set();
const helperMarkers = new Set();
const moduleHints = new Set();

for (const file of fileInventory) {
  const relSafe = file.relative_path.replace(/[\\/]/g, '__');
  const entry = {
    file: file.path,
    relative_path: file.relative_path,
    ext: file.ext,
    outputs: {},
  };

  try {
    if (file.ext === '.html' || file.ext === '.htm') {
      const profileOut = path.join(derivedRoot, `${relSafe}.profile-page-family.json`);
      const contractOut = path.join(derivedRoot, `${relSafe}.page-contract.json`);
      const moduleOut = path.join(derivedRoot, `${relSafe}.module-hybrid.json`);
      const profile = runJsonScript('profile_page_family.js', file.path, profileOut);
      const contract = runJsonScript('extract_page_contract.js', file.path, contractOut);
      const moduleHybrid = runJsonScript('inspect_module_hybrid.js', file.path, moduleOut);
      entry.outputs.profile_page_family = path.relative(options.bundleDir, profileOut);
      entry.outputs.extract_page_contract = path.relative(options.bundleDir, contractOut);
      entry.outputs.inspect_module_hybrid = path.relative(options.bundleDir, moduleOut);
      for (const family of profile.families || []) familySignals.add(family);
      if (contract.inferred && contract.inferred.endpoint) endpoints.add(contract.inferred.endpoint);
      for (const hint of moduleHybrid.inferred && moduleHybrid.inferred.wasm_hints || []) moduleHints.add(hint);
      for (const hint of moduleHybrid.inferred && moduleHybrid.inferred.app_bundle_hints || []) moduleHints.add(hint);
    }

    if (file.ext === '.js' || file.ext === '.mjs' || file.ext === '.cjs') {
      const iocsOut = path.join(derivedRoot, `${relSafe}.iocs.json`);
      const requestOut = path.join(derivedRoot, `${relSafe}.request-contract.json`);
      const moduleOut = path.join(derivedRoot, `${relSafe}.module-hybrid.json`);
      const iocs = runJsonScript('extract_iocs.js', file.path, iocsOut);
      const requestContract = runJsonScript('extract_request_contract.js', file.path, requestOut);
      const moduleHybrid = runJsonScript('inspect_module_hybrid.js', file.path, moduleOut);
      entry.outputs.extract_iocs = path.relative(options.bundleDir, iocsOut);
      entry.outputs.extract_request_contract = path.relative(options.bundleDir, requestOut);
      entry.outputs.inspect_module_hybrid = path.relative(options.bundleDir, moduleOut);
      if (requestContract.inferred && requestContract.inferred.endpoint) endpoints.add(requestContract.inferred.endpoint);
      for (const field of requestContract.inferred && requestContract.inferred.token_fields || []) tokenFields.add(field);
      for (const marker of requestContract.inferred && requestContract.inferred.crypto_or_helper_markers || []) {
        if (marker && marker !== 'unknown') helperMarkers.add(marker);
      }
      for (const url of iocs.urls || []) {
        if (/\/api\//.test(url)) endpoints.add(url);
      }
      if (moduleHybrid.inferred && moduleHybrid.inferred.is_module_hybrid) familySignals.add('module-or-wasm-hybrid');
      for (const hint of moduleHybrid.inferred && moduleHybrid.inferred.wasm_hints || []) moduleHints.add(hint);
      for (const hint of moduleHybrid.inferred && moduleHybrid.inferred.framework_hints || []) moduleHints.add(hint);
    }
  } catch (error) {
    entry.error = String(error.message || error);
  }

  analyses.push(entry);
}

const summary = {
  sample_dir: options.sampleDir,
  bundle_dir: options.bundleDir,
  source_root: sourceRoot,
  analyzed_at: new Date().toISOString(),
  file_inventory: fileInventory,
  analyses,
  inferred: {
    families: [...familySignals].sort(),
    endpoint_candidates: [...endpoints].sort(),
    token_fields: [...tokenFields].sort(),
    helper_markers: [...helperMarkers].sort(),
    module_hints: [...moduleHints].sort(),
  },
};

const summaryPath = path.join(derivedRoot, 'static-analysis-summary.json');
const summaryMdPath = path.join(derivedRoot, 'static-analysis-summary.md');
writeJson(summaryPath, summary);
writeText(summaryMdPath, [
  `# External Static Analysis Summary`,
  '',
  `- analyzed_files: ${fileInventory.length}`,
  `- families: ${summary.inferred.families.join(', ') || 'none'}`,
  `- endpoint_candidates: ${summary.inferred.endpoint_candidates.join(', ') || 'none'}`,
  `- token_fields: ${summary.inferred.token_fields.join(', ') || 'none'}`,
  `- helper_markers: ${summary.inferred.helper_markers.join(', ') || 'none'}`,
  `- module_hints: ${summary.inferred.module_hints.join(', ') || 'none'}`,
].join('\n'));

const evidencePath = path.join(options.bundleDir, 'evidence.json');
const claimSetPath = path.join(options.bundleDir, 'claim-set.json');
const riskSummaryPath = path.join(options.bundleDir, 'risk-summary.json');
const provenanceGraphPath = path.join(options.bundleDir, 'provenance-graph.json');
const provenanceSummaryPath = path.join(options.bundleDir, 'provenance-summary.md');
const operatorReviewPath = path.join(options.bundleDir, 'operator-review.md');
const notesPath = path.join(options.bundleDir, 'notes.md');
const artifactIndexPath = path.join(options.bundleDir, 'artifact-index.json');

const evidence = readJson(evidencePath, {});
evidence.status = 'static-analysis-generated';
evidence.static_analysis = {
  summary: path.relative(options.bundleDir, summaryPath),
  analyzed_files: fileInventory.length,
  families: summary.inferred.families,
  endpoint_candidates: summary.inferred.endpoint_candidates,
  token_fields: summary.inferred.token_fields,
};
evidence.notes = Array.isArray(evidence.notes) ? evidence.notes : [];
appendUniqueString(evidence.notes, 'Static analysis has been generated from imported source snapshot artifacts.');
writeJson(evidencePath, evidence);

const claimSet = readJson(claimSetPath, { claims: [] });
if (!Array.isArray(claimSet.claims)) claimSet.claims = [];
claimSet.overall_status = 'static-analysis-generated';
if (!claimSet.claims.some((item) => item.id === 'external-static-analysis-generated')) {
  claimSet.claims.push({
    id: 'external-static-analysis-generated',
    status: 'verified',
    strength: 'high',
    statement: `Static analysis generated from ${fileInventory.length} imported source snapshot file${fileInventory.length === 1 ? '' : 's'}.`,
    evidence_sources: ['artifacts/derived/static-analysis/static-analysis-summary.json', 'artifact-index.json'],
  });
}
if (summary.inferred.families.length && !claimSet.claims.some((item) => item.id === 'external-static-family-signals')) {
  claimSet.claims.push({
    id: 'external-static-family-signals',
    status: 'inferred',
    strength: 'medium',
    statement: `Static analysis suggests family signals: ${summary.inferred.families.join(', ')}.`,
    evidence_sources: ['artifacts/derived/static-analysis/static-analysis-summary.json'],
  });
}
const staticSignalText = [...summary.inferred.helper_markers, ...summary.inferred.module_hints]
  .map((item) => String(item).toLowerCase())
  .join(' ');
const publicFacts = ((evidence.public_writeup_facts || {}).facts) || evidence.public_writeup_facts || {};
const publicCriticalPaths = (publicFacts.critical_paths || []).map((item) => String(item).toLowerCase());
const publicKeywords = ((((publicFacts.public_signals || {}).writeup_keywords) || [])).map((item) => String(item).toLowerCase());
const hasEmscriptenEntrypoint =
  publicCriticalPaths.some((item) => item.includes('module.ccall') || item.includes('module.cwrap') || item.includes('validate') || item.includes('checkauth') || item.includes('checkflag')) ||
  publicKeywords.some((item) => item.includes('module.ccall') || item.includes('module.cwrap') || item.includes('validate') || item.includes('checkauth') || item.includes('checkflag')) ||
  staticSignalText.includes('module.ccall') ||
  staticSignalText.includes('module.cwrap') ||
  staticSignalText.includes('validate') ||
  staticSignalText.includes('checkauth') ||
  staticSignalText.includes('checkflag');
if (hasEmscriptenEntrypoint && !claimSet.claims.some((item) => item.id === 'external-challenge-entrypoint-preserved')) {
  claimSet.claims.push({
    id: 'external-challenge-entrypoint-preserved',
    status: 'verified',
    strength: 'high',
    statement: 'Static evidence preserves a browser challenge entrypoint such as Module.ccall/cwrap(validate/checkAuth/checkFlag).',
    evidence_sources: ['artifacts/derived/static-analysis/static-analysis-summary.json'],
  });
}
if (hasEmscriptenEntrypoint && !claimSet.claims.some((item) => item.id === 'external-emscripten-entrypoint-candidate')) {
  claimSet.claims.push({
    id: 'external-emscripten-entrypoint-candidate',
    status: 'inferred',
    strength: 'medium',
    statement: 'This archival bundle appears better suited for a minimal local-harness proof route than a replay-first request workflow.',
    evidence_sources: ['artifacts/derived/static-analysis/static-analysis-summary.json'],
  });
}
const hasAntiDebugUnlockRoute =
  publicCriticalPaths.some((item) => item.includes('anti-debug') || item.includes('unlock') || item.includes('localstorage')) ||
  publicKeywords.some((item) => item.includes('anti-debug') || item.includes('unlock') || item.includes('localstorage') || item.includes('devtools')) ||
  staticSignalText.includes('anti-debug') ||
  staticSignalText.includes('unlock') ||
  staticSignalText.includes('localstorage') ||
  staticSignalText.includes('devtools');
if (hasAntiDebugUnlockRoute && !claimSet.claims.some((item) => item.id === 'external-antidebug-unlock-route')) {
  claimSet.claims.push({
    id: 'external-antidebug-unlock-route',
    status: 'verified',
    strength: 'high',
    statement: 'Static and archival evidence preserve an anti-debug or unlock route that should be treated as a browser-side challenge path, not a replay-first request workflow.',
    evidence_sources: ['artifacts/derived/static-analysis/static-analysis-summary.json'],
  });
}
if (hasAntiDebugUnlockRoute && !claimSet.claims.some((item) => item.id === 'external-localstorage-gate-candidate')) {
  claimSet.claims.push({
    id: 'external-localstorage-gate-candidate',
    status: 'inferred',
    strength: 'medium',
    statement: 'This archival safe appears to preserve localStorage or devtools-gated unlock state that belongs in an anti-debug reconstruction route.',
    evidence_sources: ['artifacts/derived/static-analysis/static-analysis-summary.json'],
  });
}
writeJson(claimSetPath, claimSet);

const riskSummary = readJson(riskSummaryPath, { labels: [], items: [] });
if (!Array.isArray(riskSummary.labels)) riskSummary.labels = [];
appendUniqueString(riskSummary.labels, 'static-analysis-available');
if (!Array.isArray(riskSummary.items)) riskSummary.items = [];
const archivalProfile = archivalRiskProfile(evidence.public_writeup_facts, summary);
if (archivalProfile) {
  riskSummary.labels = riskSummary.labels.filter((label) => !['bootstrap-only', 'runtime-evidence-missing'].includes(label));
  for (const label of archivalProfile.labels) appendUniqueString(riskSummary.labels, label);
  riskSummary.items = riskSummary.items.filter((item) => ![
    'runtime-evidence-missing',
    'static-only-inference-risk',
  ].includes(item.id));
  for (const item of archivalProfile.items) {
    if (!riskSummary.items.some((existing) => existing.id === item.id)) riskSummary.items.push(item);
  }
} else if (!riskSummary.items.some((item) => item.id === 'static-only-inference-risk')) {
  riskSummary.items.push({
    id: 'static-only-inference-risk',
    severity: 'medium',
    summary: 'Static analysis is now available, but family and endpoint signals still need runtime confirmation.',
    mitigation: 'Use static outputs to guide runtime hooks, request capture, or replay work instead of promoting inferred endpoints directly.',
  });
}
writeJson(riskSummaryPath, riskSummary);

const provenanceGraph = readJson(provenanceGraphPath, { nodes: [], edges: [] });
if (!Array.isArray(provenanceGraph.nodes)) provenanceGraph.nodes = [];
if (!Array.isArray(provenanceGraph.edges)) provenanceGraph.edges = [];
provenanceGraph.status = 'static-analysis-generated';
if (!provenanceGraph.nodes.some((node) => node.id === 'static-analysis')) {
  provenanceGraph.nodes.push({
    id: 'static-analysis',
    type: 'static-analysis',
    label: 'External static analysis',
    data: {
      analyzed_files: fileInventory.length,
      summary: path.relative(options.bundleDir, summaryPath),
      endpoint_candidates: summary.inferred.endpoint_candidates,
      token_fields: summary.inferred.token_fields,
    },
  });
  provenanceGraph.edges.push({
    from: 'static-analysis',
    to: 'task',
    type: 'supports',
    confidence: 'medium',
  });
}
writeJson(provenanceGraphPath, provenanceGraph);

writeText(provenanceSummaryPath, [
  `# Provenance Summary: ${path.basename(path.dirname(path.dirname(options.bundleDir)))}`,
  '',
  '- status: static-analysis-generated',
  '- static analysis derived from imported source snapshot',
  `- analyzed_files: ${fileInventory.length}`,
  `- endpoint_candidates: ${summary.inferred.endpoint_candidates.join(', ') || 'none'}`,
  `- token_fields: ${summary.inferred.token_fields.join(', ') || 'none'}`,
  '',
  'Runtime provenance is still required for accepted request replay, cookie generation chains, and timing-sensitive signing flows.',
].join('\n'));

if (fs.existsSync(operatorReviewPath)) {
  writeText(operatorReviewPath, [
    `# Operator Review: ${path.basename(path.dirname(path.dirname(options.bundleDir)))}`,
    '',
    '## Current State',
    '',
    '- sample has imported source snapshot artifacts',
    '- baseline bundle now includes machine-generated static analysis',
    '- runtime proof is still missing for protected requests and signing chains',
    '',
    '## Next Actions',
    '',
    '- inspect `artifacts/derived/static-analysis/static-analysis-summary.json`',
    '- prioritize runtime capture for the strongest endpoint and token-field candidates',
    '- replace inferred family or endpoint signals with verified runtime evidence',
  ].join('\n'));
}

if (fs.existsSync(notesPath)) {
  writeText(notesPath, [
    `# Notes: ${path.basename(path.dirname(path.dirname(options.bundleDir)))}`,
    '',
    '- baseline bundle created from external sample scaffold',
    '- local source snapshot imported',
    '- static analysis generated from source snapshot artifacts',
  ].join('\n'));
}

const artifactIndex = readJson(artifactIndexPath, {
  output_dir: options.bundleDir,
  root_files: [],
  groups: { original: [], derived: [], evidence: [] },
});
if (!artifactIndex.groups) artifactIndex.groups = { original: [], derived: [], evidence: [] };
if (!Array.isArray(artifactIndex.groups.derived)) artifactIndex.groups.derived = [];
const derivedFiles = walkFiles(derivedRoot);
for (const filePath of derivedFiles) {
  if (!artifactIndex.groups.derived.some((entry) => entry.destination === filePath)) {
    artifactIndex.groups.derived.push({
      status: 'generated',
      source: filePath,
      destination: filePath,
    });
  }
}
writeJson(artifactIndexPath, artifactIndex);

console.log(JSON.stringify({
  sample_dir: options.sampleDir,
  bundle_dir: options.bundleDir,
  source_root: sourceRoot,
  analyzed_files: fileInventory.length,
  summary: summaryPath,
}, null, 2));
