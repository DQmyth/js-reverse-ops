#!/usr/bin/env node
const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

function usage() {
  console.error(
    'Usage:\n' +
    '  manage_external_corpus.js list [--manifest <external-corpus-manifest.json>]\n' +
    '  manage_external_corpus.js show --id <sample-id> [--manifest <external-corpus-manifest.json>]\n' +
    '  manage_external_corpus.js update-status --id <sample-id> --status <candidate|queued|imported|validated|blocked|archived> [--reason <text>] [--manifest <external-corpus-manifest.json>]\n' +
    '  manage_external_corpus.js record-import --id <sample-id> --local-dir <path> [--bundle-dir <path>] [--notes <text>] [--manifest <external-corpus-manifest.json>]\n' +
    '  manage_external_corpus.js init-sample --id <sample-id> [--output-root <dir>] [--manifest <external-corpus-manifest.json>]\n' +
    '  manage_external_corpus.js bootstrap-bundle --id <sample-id> [--bundle-name <name>] [--manifest <external-corpus-manifest.json>]\n' +
    '  manage_external_corpus.js ingest-source --id <sample-id> --source-path <path> [--source-path <path> ...] [--bundle-name <name>] [--manifest <external-corpus-manifest.json>]\n' +
    '  manage_external_corpus.js ingest-public-facts --id <sample-id> --facts-json <file> [--bundle-name <name>] [--manifest <external-corpus-manifest.json>]\n' +
    '  manage_external_corpus.js ingest-runtime --id <sample-id> --runtime-json <file> [--runtime-json <file> ...] [--bundle-name <name>] [--manifest <external-corpus-manifest.json>]\n' +
    '  manage_external_corpus.js ingest-mcp-execution --id <sample-id> --execution-record <file> [--bundle-name <name>] [--manifest <external-corpus-manifest.json>]\n' +
    '  manage_external_corpus.js prepare-local-harness --id <sample-id> [--bundle-name <name>] [--manifest <external-corpus-manifest.json>]\n' +
    '  manage_external_corpus.js record-local-harness --id <sample-id> --result-json <file> [--bundle-name <name>] [--manifest <external-corpus-manifest.json>]\n' +
    '  manage_external_corpus.js ingest-local-harness --id <sample-id> --result-json <file> [--bundle-name <name>] [--manifest <external-corpus-manifest.json>]\n' +
    '  manage_external_corpus.js ingest-challenge-success --id <sample-id> --success-json <file> [--success-json <file> ...] [--bundle-name <name>] [--manifest <external-corpus-manifest.json>]\n' +
    '  manage_external_corpus.js analyze-static --id <sample-id> [--bundle-name <name>] [--manifest <external-corpus-manifest.json>]\n' +
    '  manage_external_corpus.js scaffold-form-replay --id <sample-id> --source-html <path> --page-contract <path> [--bundle-name <name>] [--manifest <external-corpus-manifest.json>]\n' +
    '  manage_external_corpus.js scaffold-replay --id <sample-id> [--bundle-name <name>] [--manifest <external-corpus-manifest.json>]\n' +
    '  manage_external_corpus.js prepare-replay-validation --id <sample-id> [--bundle-name <name>] [--manifest <external-corpus-manifest.json>]\n' +
    '  manage_external_corpus.js compare-replay-validation --id <sample-id> --validation-json <file> [--bundle-name <name>] [--manifest <external-corpus-manifest.json>]\n' +
    '  manage_external_corpus.js ingest-replay-validation --id <sample-id> --validation-json <file> [--validation-json <file> ...] [--bundle-name <name>] [--manifest <external-corpus-manifest.json>]\n' +
    '  manage_external_corpus.js reconcile-replay-verification --id <sample-id> [--bundle-name <name>] [--manifest <external-corpus-manifest.json>]\n' +
    '  manage_external_corpus.js assess-sample --id <sample-id> [--bundle-name <name>] [--manifest <external-corpus-manifest.json>]\n' +
    '  manage_external_corpus.js validate-sample --id <sample-id> [--manifest <external-corpus-manifest.json>]\n'
  );
  process.exit(1);
}

const args = process.argv.slice(2);
if (!args.length) usage();

const command = args[0];
const options = {
  manifest: path.resolve(__dirname, '..', 'references', 'external-corpus-manifest.json'),
  id: '',
  status: '',
  reason: '',
  localDir: '',
  bundleDir: '',
  notes: '',
  outputRoot: path.resolve(__dirname, '..', 'tmp_cases', 'external'),
  bundleName: 'baseline',
  sourcePaths: [],
  runtimeJsons: [],
  factsJson: '',
  executionRecord: '',
  resultJson: '',
  successJsons: [],
  validationJsons: [],
  sourceHtml: '',
  pageContract: '',
};

for (let i = 1; i < args.length; i += 1) {
  const arg = args[i];
  const next = args[i + 1] || '';
  if (arg === '--manifest') {
    options.manifest = path.resolve(next);
    i += 1;
  } else if (arg === '--id') {
    options.id = next;
    i += 1;
  } else if (arg === '--status') {
    options.status = next;
    i += 1;
  } else if (arg === '--reason') {
    options.reason = next;
    i += 1;
  } else if (arg === '--local-dir') {
    options.localDir = next;
    i += 1;
  } else if (arg === '--bundle-dir') {
    options.bundleDir = next;
    i += 1;
  } else if (arg === '--notes') {
    options.notes = next;
    i += 1;
  } else if (arg === '--output-root') {
    options.outputRoot = path.resolve(next);
    i += 1;
  } else if (arg === '--bundle-name') {
    options.bundleName = next;
    i += 1;
  } else if (arg === '--source-path') {
    options.sourcePaths.push(path.resolve(next));
    i += 1;
  } else if (arg === '--runtime-json') {
    options.runtimeJsons.push(path.resolve(next));
    i += 1;
  } else if (arg === '--facts-json') {
    options.factsJson = path.resolve(next);
    i += 1;
  } else if (arg === '--execution-record') {
    options.executionRecord = path.resolve(next);
    i += 1;
  } else if (arg === '--result-json') {
    options.resultJson = path.resolve(next);
    i += 1;
  } else if (arg === '--success-json') {
    options.successJsons.push(path.resolve(next));
    i += 1;
  } else if (arg === '--validation-json') {
    options.validationJsons.push(path.resolve(next));
    i += 1;
  } else if (arg === '--source-html') {
    options.sourceHtml = path.resolve(next);
    i += 1;
  } else if (arg === '--page-contract') {
    options.pageContract = path.resolve(next);
    i += 1;
  } else {
    usage();
  }
}

const validStatuses = new Set(['candidate', 'queued', 'imported', 'validated', 'blocked', 'archived']);

function readManifest() {
  return JSON.parse(fs.readFileSync(options.manifest, 'utf8'));
}

function writeManifest(data) {
  data.generated_at = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(options.manifest, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function findSample(manifest) {
  const sample = (manifest.samples || []).find((item) => item.id === options.id);
  if (!sample) {
    console.error(`Sample not found: ${options.id}`);
    process.exit(1);
  }
  return sample;
}

function ensureLifecycle(sample) {
  if (!sample.lifecycle) {
    sample.lifecycle = {
      status_history: [],
      import_records: [],
    };
  }
  if (!Array.isArray(sample.lifecycle.status_history)) sample.lifecycle.status_history = [];
  if (!Array.isArray(sample.lifecycle.import_records)) sample.lifecycle.import_records = [];
}

function updateStatus(sample, status, reason) {
  if (!validStatuses.has(status)) {
    console.error(`Invalid status: ${status}`);
    process.exit(1);
  }
  ensureLifecycle(sample);
  const before = sample.status || 'unknown';
  sample.status = status;
  sample.lifecycle.status_history.push({
    at: new Date().toISOString(),
    from: before,
    to: status,
    reason: reason || '',
  });
}

function resolveSampleDir(sample) {
  const importDir = sample.local_artifacts && sample.local_artifacts.import_dir;
  if (importDir) {
    return path.resolve(process.cwd(), importDir);
  }
  return path.join(options.outputRoot, sample.id);
}

function resolveBundleDir(sample) {
  const bundleDir = sample.local_artifacts && sample.local_artifacts.bundle_dir;
  if (bundleDir) {
    return path.resolve(process.cwd(), bundleDir);
  }
  return path.join(resolveSampleDir(sample), 'bundles', options.bundleName);
}

function validateSampleDir(sampleDir) {
  const requiredFiles = ['task.json', 'external-source.json', 'import-notes.md', 'artifact-index.json'];
  const requiredDirs = [
    path.join('artifacts', 'original'),
    path.join('artifacts', 'derived'),
    path.join('artifacts', 'evidence'),
  ];
  const files = requiredFiles.map((name) => ({
    path: path.join(sampleDir, name),
    exists: fs.existsSync(path.join(sampleDir, name)),
  }));
  const dirs = requiredDirs.map((name) => ({
    path: path.join(sampleDir, name),
    exists: fs.existsSync(path.join(sampleDir, name)) && fs.statSync(path.join(sampleDir, name)).isDirectory(),
  }));
  return {
    sample_dir: sampleDir,
    ok: files.every((entry) => entry.exists) && dirs.every((entry) => entry.exists),
    required_files: files,
    required_dirs: dirs,
  };
}

function validateBundleDir(bundleDir) {
  const requiredFiles = [
    'task.json',
    'evidence.json',
    'family-decision.json',
    'claim-set.json',
    'risk-summary.json',
    'provenance-graph.json',
    'provenance-summary.md',
    'operator-review.md',
    'report.md',
    'notes.md',
    'artifact-index.json',
  ];
  const files = requiredFiles.map((name) => ({
    path: path.join(bundleDir, name),
    exists: fs.existsSync(path.join(bundleDir, name)),
  }));
  return {
    bundle_dir: bundleDir,
    ok: files.every((entry) => entry.exists),
    required_files: files,
  };
}

function assessBundle(bundleDir) {
  const assessScript = path.resolve(__dirname, 'assess_external_bundle.js');
  const outputJson = path.join(bundleDir, 'maturity-summary.json');
  const outputMd = path.join(bundleDir, 'maturity-summary.md');
  const result = childProcess.spawnSync(
    process.execPath,
    [assessScript, '--bundle-dir', bundleDir, '--output-json', outputJson, '--output-md', outputMd],
    { encoding: 'utf8' }
  );
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || 'assess bundle failed\n');
    process.exit(result.status || 1);
  }
  return JSON.parse(result.stdout);
}

function normalizeBundle(bundleDir) {
  const normalizeScript = path.resolve(__dirname, 'normalize_external_bundle_state.js');
  const result = childProcess.spawnSync(process.execPath, [normalizeScript, '--bundle-dir', bundleDir], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || 'normalize bundle failed\n');
    process.exit(result.status || 1);
  }
  return JSON.parse(result.stdout);
}

function registerRootArtifacts(bundleDir, filePaths) {
  const indexPath = path.join(bundleDir, 'artifact-index.json');
  const index = fs.existsSync(indexPath)
    ? JSON.parse(fs.readFileSync(indexPath, 'utf8'))
    : { output_dir: bundleDir, root_files: [], groups: { original: [], derived: [], evidence: [] } };
  index.output_dir = bundleDir;
  if (!Array.isArray(index.root_files)) index.root_files = [];
  if (!index.groups) index.groups = { original: [], derived: [], evidence: [] };

  for (const filePath of filePaths) {
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) continue;
    const exists = index.root_files.some((entry) => entry.destination === resolved);
    if (!exists) {
      index.root_files.push({
        status: 'copied',
        source: resolved,
        destination: resolved,
      });
    }
  }

  fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  return index;
}

if (command === 'list') {
  const manifest = readManifest();
  const rows = (manifest.samples || [])
    .sort((a, b) => (a.priority || 999) - (b.priority || 999))
    .map((sample) => ({
      id: sample.id,
      priority: sample.priority || null,
      status: sample.status || 'unknown',
      family: sample.family || null,
      subfamily: sample.subfamily || null,
      source_url: sample.source_url || null,
    }));
  console.log(JSON.stringify({ manifest: options.manifest, sample_count: rows.length, samples: rows }, null, 2));
  process.exit(0);
}

if (command === 'show') {
  if (!options.id) usage();
  const manifest = readManifest();
  const sample = findSample(manifest);
  console.log(JSON.stringify(sample, null, 2));
  process.exit(0);
}

if (command === 'update-status') {
  if (!options.id || !options.status) usage();
  const manifest = readManifest();
  const sample = findSample(manifest);
  const before = sample.status || 'unknown';
  updateStatus(sample, options.status, options.reason || '');
  writeManifest(manifest);
  console.log(JSON.stringify({ id: sample.id, from: before, to: options.status, reason: options.reason || '' }, null, 2));
  process.exit(0);
}

if (command === 'record-import') {
  if (!options.id || !options.localDir) usage();
  const manifest = readManifest();
  const sample = findSample(manifest);
  ensureLifecycle(sample);
  sample.local_artifacts = sample.local_artifacts || {};
  sample.local_artifacts.import_dir = options.localDir;
  if (options.bundleDir) sample.local_artifacts.bundle_dir = options.bundleDir;
  sample.lifecycle.import_records.push({
    at: new Date().toISOString(),
    local_dir: options.localDir,
    bundle_dir: options.bundleDir || '',
    notes: options.notes || '',
  });
  if (sample.status === 'candidate' || sample.status === 'queued') {
    updateStatus(sample, 'imported', 'local import recorded');
  }
  writeManifest(manifest);
  console.log(JSON.stringify({
    id: sample.id,
    status: sample.status,
    local_artifacts: sample.local_artifacts,
    import_count: sample.lifecycle.import_records.length,
  }, null, 2));
  process.exit(0);
}

if (command === 'init-sample') {
  if (!options.id) usage();
  const initScript = path.resolve(__dirname, 'init_external_sample.js');
  const initArgs = [
    initScript,
    '--id',
    options.id,
    '--manifest',
    options.manifest,
    '--output-root',
    options.outputRoot,
  ];
  const result = childProcess.spawnSync(process.execPath, initArgs, { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || 'init-sample failed\n');
    process.exit(result.status || 1);
  }
  const manifest = readManifest();
  const sample = findSample(manifest);
  const sampleDir = path.join(options.outputRoot, sample.id);
  sample.local_artifacts = sample.local_artifacts || {};
  sample.local_artifacts.import_dir = path.relative(process.cwd(), sampleDir);
  if (sample.status === 'candidate' || sample.status === 'queued') {
    updateStatus(sample, 'imported', 'sample scaffold initialized');
  }
  writeManifest(manifest);
  const validation = validateSampleDir(sampleDir);
  console.log(JSON.stringify({
    command: 'init-sample',
    sample: sample.id,
    sample_dir: sampleDir,
    validation,
  }, null, 2));
  process.exit(0);
}

if (command === 'bootstrap-bundle') {
  if (!options.id) usage();
  const manifest = readManifest();
  const sample = findSample(manifest);
  const sampleDir = resolveSampleDir(sample);
  const bootstrapScript = path.resolve(__dirname, 'bootstrap_external_bundle.js');
  const bootstrapArgs = [
    bootstrapScript,
    '--sample-dir',
    sampleDir,
    '--bundle-name',
    options.bundleName,
  ];
  const result = childProcess.spawnSync(process.execPath, bootstrapArgs, { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || 'bootstrap-bundle failed\n');
    process.exit(result.status || 1);
  }
  sample.local_artifacts = sample.local_artifacts || {};
  sample.local_artifacts.import_dir = path.relative(process.cwd(), sampleDir);
  sample.local_artifacts.bundle_dir = path.relative(process.cwd(), path.join(sampleDir, 'bundles', options.bundleName));
  if (sample.status === 'candidate' || sample.status === 'queued') {
    updateStatus(sample, 'imported', 'sample scaffold and baseline bundle created');
  }
  writeManifest(manifest);
  const validation = validateBundleDir(resolveBundleDir(sample));
  console.log(JSON.stringify({
    command: 'bootstrap-bundle',
    id: sample.id,
    bundle_name: options.bundleName,
    validation,
  }, null, 2));
  process.exit(0);
}

if (command === 'ingest-source') {
  if (!options.id || options.sourcePaths.length === 0) usage();
  const manifest = readManifest();
  const sample = findSample(manifest);
  const sampleDir = resolveSampleDir(sample);
  const bundleDir = resolveBundleDir(sample);
  const ingestScript = path.resolve(__dirname, 'ingest_external_source_snapshot.js');
  const ingestArgs = [
    ingestScript,
    '--sample-dir',
    sampleDir,
    '--bundle-dir',
    bundleDir,
  ];
  for (const sourcePath of options.sourcePaths) {
    ingestArgs.push('--source-path', sourcePath);
  }
  const result = childProcess.spawnSync(process.execPath, ingestArgs, { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || 'ingest-source failed\n');
    process.exit(result.status || 1);
  }
  sample.local_artifacts = sample.local_artifacts || {};
  sample.local_artifacts.import_dir = path.relative(process.cwd(), sampleDir);
  sample.local_artifacts.bundle_dir = path.relative(process.cwd(), bundleDir);
  writeManifest(manifest);
  console.log(result.stdout.trim());
  process.exit(0);
}

if (command === 'ingest-runtime') {
  if (!options.id || options.runtimeJsons.length === 0) usage();
  const manifest = readManifest();
  const sample = findSample(manifest);
  const sampleDir = resolveSampleDir(sample);
  const bundleDir = resolveBundleDir(sample);
  const ingestScript = path.resolve(__dirname, 'ingest_external_runtime_evidence.js');
  const ingestArgs = [
    ingestScript,
    '--sample-dir',
    sampleDir,
    '--bundle-dir',
    bundleDir,
  ];
  for (const runtimeJson of options.runtimeJsons) {
    ingestArgs.push('--runtime-json', runtimeJson);
  }
  const result = childProcess.spawnSync(process.execPath, ingestArgs, { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || 'ingest-runtime failed\n');
    process.exit(result.status || 1);
  }
  sample.local_artifacts = sample.local_artifacts || {};
  sample.local_artifacts.import_dir = path.relative(process.cwd(), sampleDir);
  sample.local_artifacts.bundle_dir = path.relative(process.cwd(), bundleDir);
  normalizeBundle(bundleDir);
  sample.local_artifacts.maturity = assessBundle(bundleDir);
  writeManifest(manifest);
  console.log(result.stdout.trim());
  process.exit(0);
}

if (command === 'ingest-public-facts') {
  if (!options.id || !options.factsJson) usage();
  const manifest = readManifest();
  const sample = findSample(manifest);
  const bundleDir = resolveBundleDir(sample);
  const ingestScript = path.resolve(__dirname, 'ingest_external_public_facts.js');
  const result = childProcess.spawnSync(process.execPath, [
    ingestScript,
    '--bundle-dir',
    bundleDir,
    '--facts-json',
    options.factsJson,
  ], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || 'ingest-public-facts failed\n');
    process.exit(result.status || 1);
  }
  sample.local_artifacts = sample.local_artifacts || {};
  sample.local_artifacts.bundle_dir = path.relative(process.cwd(), bundleDir);
  normalizeBundle(bundleDir);
  sample.local_artifacts.maturity = assessBundle(bundleDir);
  writeManifest(manifest);
  console.log(result.stdout.trim());
  process.exit(0);
}

if (command === 'ingest-mcp-execution') {
  if (!options.id || !options.executionRecord) usage();
  const manifest = readManifest();
  const sample = findSample(manifest);
  const bundleDir = resolveBundleDir(sample);
  const ingestScript = path.resolve(__dirname, 'ingest_mcp_execution_record.js');
  const evidencePath = path.join(bundleDir, 'evidence.json');
  const result = childProcess.spawnSync(process.execPath, [
    ingestScript,
    evidencePath,
    options.executionRecord,
    '--output',
    evidencePath,
  ], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || 'ingest-mcp-execution failed\n');
    process.exit(result.status || 1);
  }
  sample.local_artifacts = sample.local_artifacts || {};
  sample.local_artifacts.bundle_dir = path.relative(process.cwd(), bundleDir);
  sample.local_artifacts.maturity = assessBundle(bundleDir);
  writeManifest(manifest);
  console.log(result.stdout.trim());
  process.exit(0);
}

if (command === 'prepare-local-harness') {
  if (!options.id) usage();
  const manifest = readManifest();
  const sample = findSample(manifest);
  const bundleDir = resolveBundleDir(sample);
  const prepareScript = path.resolve(__dirname, 'prepare_local_harness_plan.js');
  const result = childProcess.spawnSync(process.execPath, [
    prepareScript,
    bundleDir,
    '--output-json',
    path.join(bundleDir, 'local-harness-plan.json'),
    '--output-md',
    path.join(bundleDir, 'local-harness-plan.md'),
    '--result-template',
    path.join(bundleDir, 'local-harness-result-template.json'),
  ], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || 'prepare-local-harness failed\n');
    process.exit(result.status || 1);
  }
  sample.local_artifacts = sample.local_artifacts || {};
  sample.local_artifacts.bundle_dir = path.relative(process.cwd(), bundleDir);
  registerRootArtifacts(bundleDir, [
    path.join(bundleDir, 'local-harness-plan.json'),
    path.join(bundleDir, 'local-harness-plan.md'),
    path.join(bundleDir, 'local-harness-result-template.json'),
  ]);
  normalizeBundle(bundleDir);
  sample.local_artifacts.maturity = assessBundle(bundleDir);
  writeManifest(manifest);
  console.log(result.stdout.trim());
  process.exit(0);
}

if (command === 'record-local-harness') {
  if (!options.id || !options.resultJson) usage();
  const manifest = readManifest();
  const sample = findSample(manifest);
  const bundleDir = resolveBundleDir(sample);
  const recordScript = path.resolve(__dirname, 'record_local_harness_result.js');
  const result = childProcess.spawnSync(process.execPath, [
    recordScript,
    path.join(bundleDir, 'local-harness-plan.json'),
    options.resultJson,
    '--output-json',
    path.join(bundleDir, 'local-harness-result.json'),
    '--output-md',
    path.join(bundleDir, 'local-harness-result.md'),
  ], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || 'record-local-harness failed\n');
    process.exit(result.status || 1);
  }
  sample.local_artifacts = sample.local_artifacts || {};
  sample.local_artifacts.bundle_dir = path.relative(process.cwd(), bundleDir);
  registerRootArtifacts(bundleDir, [
    path.join(bundleDir, 'local-harness-result.json'),
    path.join(bundleDir, 'local-harness-result.md'),
  ]);
  normalizeBundle(bundleDir);
  sample.local_artifacts.maturity = assessBundle(bundleDir);
  writeManifest(manifest);
  console.log(result.stdout.trim());
  process.exit(0);
}

if (command === 'ingest-local-harness') {
  if (!options.id || !options.resultJson) usage();
  const manifest = readManifest();
  const sample = findSample(manifest);
  const bundleDir = resolveBundleDir(sample);
  const ingestScript = path.resolve(__dirname, 'ingest_local_harness_result.js');
  const result = childProcess.spawnSync(process.execPath, [
    ingestScript,
    '--bundle-dir',
    bundleDir,
    '--result-json',
    options.resultJson,
  ], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || 'ingest-local-harness failed\n');
    process.exit(result.status || 1);
  }
  sample.local_artifacts = sample.local_artifacts || {};
  sample.local_artifacts.bundle_dir = path.relative(process.cwd(), bundleDir);
  normalizeBundle(bundleDir);
  sample.local_artifacts.maturity = assessBundle(bundleDir);
  writeManifest(manifest);
  console.log(result.stdout.trim());
  process.exit(0);
}

if (command === 'ingest-challenge-success') {
  if (!options.id || options.successJsons.length === 0) usage();
  const manifest = readManifest();
  const sample = findSample(manifest);
  const bundleDir = resolveBundleDir(sample);
  const ingestScript = path.resolve(__dirname, 'ingest_external_challenge_success.js');
  const ingestArgs = [ingestScript, '--bundle-dir', bundleDir];
  for (const successJson of options.successJsons) {
    ingestArgs.push('--success-json', successJson);
  }
  const result = childProcess.spawnSync(process.execPath, ingestArgs, { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || 'ingest-challenge-success failed\n');
    process.exit(result.status || 1);
  }
  sample.local_artifacts = sample.local_artifacts || {};
  sample.local_artifacts.bundle_dir = path.relative(process.cwd(), bundleDir);
  normalizeBundle(bundleDir);
  sample.local_artifacts.maturity = assessBundle(bundleDir);
  writeManifest(manifest);
  console.log(result.stdout.trim());
  process.exit(0);
}

if (command === 'analyze-static') {
  if (!options.id) usage();
  const manifest = readManifest();
  const sample = findSample(manifest);
  const sampleDir = resolveSampleDir(sample);
  const bundleDir = resolveBundleDir(sample);
  const analyzeScript = path.resolve(__dirname, 'analyze_external_static.js');
  const analyzeArgs = [
    analyzeScript,
    '--sample-dir',
    sampleDir,
    '--bundle-dir',
    bundleDir,
  ];
  const result = childProcess.spawnSync(process.execPath, analyzeArgs, { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || 'analyze-static failed\n');
    process.exit(result.status || 1);
  }
  sample.local_artifacts = sample.local_artifacts || {};
  sample.local_artifacts.import_dir = path.relative(process.cwd(), sampleDir);
  sample.local_artifacts.bundle_dir = path.relative(process.cwd(), bundleDir);
  normalizeBundle(bundleDir);
  sample.local_artifacts.maturity = assessBundle(bundleDir);
  writeManifest(manifest);
  console.log(result.stdout.trim());
  process.exit(0);
}

if (command === 'scaffold-form-replay') {
  if (!options.id || !options.sourceHtml || !options.pageContract) usage();
  const manifest = readManifest();
  const sample = findSample(manifest);
  const bundleDir = resolveBundleDir(sample);
  const scaffoldScript = path.resolve(__dirname, 'scaffold_form_obfuscation_replay.js');
  const result = childProcess.spawnSync(process.execPath, [
    scaffoldScript,
    '--source-html',
    options.sourceHtml,
    '--page-contract',
    options.pageContract,
    '--bundle-dir',
    bundleDir,
  ], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || 'scaffold-form-replay failed\n');
    process.exit(result.status || 1);
  }
  sample.local_artifacts = sample.local_artifacts || {};
  sample.local_artifacts.bundle_dir = path.relative(process.cwd(), bundleDir);
  normalizeBundle(bundleDir);
  sample.local_artifacts.maturity = assessBundle(bundleDir);
  writeManifest(manifest);
  console.log(result.stdout.trim());
  process.exit(0);
}

if (command === 'scaffold-replay') {
  if (!options.id) usage();
  const manifest = readManifest();
  const sample = findSample(manifest);
  const bundleDir = resolveBundleDir(sample);
  const scaffoldScript = path.resolve(__dirname, 'scaffold_external_replay.js');
  const result = childProcess.spawnSync(process.execPath, [scaffoldScript, '--bundle-dir', bundleDir], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || 'scaffold-replay failed\n');
    process.exit(result.status || 1);
  }
  sample.local_artifacts = sample.local_artifacts || {};
  sample.local_artifacts.bundle_dir = path.relative(process.cwd(), bundleDir);
  normalizeBundle(bundleDir);
  sample.local_artifacts.maturity = assessBundle(bundleDir);
  writeManifest(manifest);
  console.log(result.stdout.trim());
  process.exit(0);
}

if (command === 'prepare-replay-validation') {
  if (!options.id) usage();
  const manifest = readManifest();
  const sample = findSample(manifest);
  const bundleDir = resolveBundleDir(sample);
  const prepareScript = path.resolve(__dirname, 'prepare_external_replay_validation.js');
  const result = childProcess.spawnSync(process.execPath, [prepareScript, '--bundle-dir', bundleDir], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || 'prepare-replay-validation failed\n');
    process.exit(result.status || 1);
  }
  console.log(result.stdout.trim());
  process.exit(0);
}

if (command === 'compare-replay-validation') {
  if (!options.id || options.validationJsons.length !== 1) usage();
  const manifest = readManifest();
  const sample = findSample(manifest);
  const bundleDir = resolveBundleDir(sample);
  const compareScript = path.resolve(__dirname, 'compare_external_replay_to_runtime.js');
  const outputPath = path.join(bundleDir, 'replay-validation-compare.json');
  const result = childProcess.spawnSync(process.execPath, [
    compareScript,
    '--bundle-dir',
    bundleDir,
    '--validation-json',
    options.validationJsons[0],
    '--output',
    outputPath,
  ], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || 'compare-replay-validation failed\n');
    process.exit(result.status || 1);
  }
  console.log(result.stdout.trim());
  process.exit(0);
}

if (command === 'ingest-replay-validation') {
  if (!options.id || options.validationJsons.length === 0) usage();
  const manifest = readManifest();
  const sample = findSample(manifest);
  const bundleDir = resolveBundleDir(sample);
  const ingestScript = path.resolve(__dirname, 'ingest_external_replay_validation.js');
  const ingestArgs = [ingestScript, '--bundle-dir', bundleDir];
  for (const file of options.validationJsons) ingestArgs.push('--validation-json', file);
  const result = childProcess.spawnSync(process.execPath, ingestArgs, { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || 'ingest-replay-validation failed\n');
    process.exit(result.status || 1);
  }
  normalizeBundle(bundleDir);
  sample.local_artifacts = sample.local_artifacts || {};
  sample.local_artifacts.bundle_dir = path.relative(process.cwd(), bundleDir);
  sample.local_artifacts.maturity = assessBundle(bundleDir);
  writeManifest(manifest);
  console.log(result.stdout.trim());
  process.exit(0);
}

if (command === 'reconcile-replay-verification') {
  if (!options.id) usage();
  const manifest = readManifest();
  const sample = findSample(manifest);
  const bundleDir = resolveBundleDir(sample);
  const reconcileScript = path.resolve(__dirname, 'reconcile_external_replay_verification.js');
  const result = childProcess.spawnSync(process.execPath, [reconcileScript, '--bundle-dir', bundleDir], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || 'reconcile-replay-verification failed\n');
    process.exit(result.status || 1);
  }
  normalizeBundle(bundleDir);
  sample.local_artifacts = sample.local_artifacts || {};
  sample.local_artifacts.bundle_dir = path.relative(process.cwd(), bundleDir);
  sample.local_artifacts.maturity = assessBundle(bundleDir);
  writeManifest(manifest);
  console.log(result.stdout.trim());
  process.exit(0);
}

if (command === 'assess-sample') {
  if (!options.id) usage();
  const manifest = readManifest();
  const sample = findSample(manifest);
  const bundleDir = resolveBundleDir(sample);
  const maturity = assessBundle(bundleDir);
  sample.local_artifacts = sample.local_artifacts || {};
  sample.local_artifacts.bundle_dir = path.relative(process.cwd(), bundleDir);
  sample.local_artifacts.maturity = maturity;
  writeManifest(manifest);
  console.log(JSON.stringify({ id: sample.id, maturity }, null, 2));
  process.exit(0);
}

if (command === 'validate-sample') {
  if (!options.id) usage();
  const manifest = readManifest();
  const sample = findSample(manifest);
  const sampleDir = resolveSampleDir(sample);
  const validation = validateSampleDir(sampleDir);
  const bundleValidation = validateBundleDir(resolveBundleDir(sample));
  const maturity = bundleValidation.ok ? assessBundle(resolveBundleDir(sample)) : null;
  if (validation.ok && bundleValidation.ok && sample.status === 'imported') {
    updateStatus(sample, 'validated', 'sample scaffold and baseline bundle validation passed');
  }
  sample.local_artifacts = sample.local_artifacts || {};
  sample.local_artifacts.import_dir = path.relative(process.cwd(), sampleDir);
  sample.local_artifacts.bundle_dir = path.relative(process.cwd(), resolveBundleDir(sample));
  if (maturity) sample.local_artifacts.maturity = maturity;
  writeManifest(manifest);
  console.log(JSON.stringify({
    id: sample.id,
    status: sample.status,
    validation,
    bundle_validation: bundleValidation,
    maturity,
  }, null, 2));
  process.exit(validation.ok && bundleValidation.ok ? 0 : 1);
}

usage();
