#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function usage() {
  console.error(
    'Usage: build_mcp_execution_context.js [--bundle-dir <dir>] [--context-json <file>] [--selected-page] [--active-target-loaded] [--preload-ready] [--runtime-evidence-present] [--remote-validation-present] [--compare-artifact-present] [--allow-mutating-page-state] [--output <file>]'
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const options = {
  bundleDir: '',
  contextJson: '',
  output: '',
  selectedPage: false,
  activeTargetLoaded: false,
  preloadReady: false,
  runtimeEvidencePresent: false,
  remoteValidationPresent: false,
  compareArtifactPresent: false,
  allowMutatingPageState: false,
};

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  const next = args[i + 1] || '';
  if (arg === '--bundle-dir') {
    options.bundleDir = path.resolve(next);
    i += 1;
  } else if (arg === '--context-json') {
    options.contextJson = path.resolve(next);
    i += 1;
  } else if (arg === '--output') {
    options.output = path.resolve(next);
    i += 1;
  } else if (arg === '--selected-page') {
    options.selectedPage = true;
  } else if (arg === '--active-target-loaded') {
    options.activeTargetLoaded = true;
  } else if (arg === '--preload-ready') {
    options.preloadReady = true;
  } else if (arg === '--runtime-evidence-present') {
    options.runtimeEvidencePresent = true;
  } else if (arg === '--remote-validation-present') {
    options.remoteValidationPresent = true;
  } else if (arg === '--compare-artifact-present') {
    options.compareArtifactPresent = true;
  } else if (arg === '--allow-mutating-page-state') {
    options.allowMutatingPageState = true;
  } else {
    usage();
  }
}

function readJsonIfExists(filePath, fallback = null) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : fallback;
}

function hasFile(filePath) {
  return Boolean(filePath && fs.existsSync(filePath));
}

const seed = options.contextJson ? readJsonIfExists(options.contextJson, {}) : {};
const context = {
  generated_at: new Date().toISOString(),
  bundle_dir: options.bundleDir || seed.bundle_dir || null,
  selected_page: Boolean(seed.selected_page || options.selectedPage),
  active_target_loaded: Boolean(seed.active_target_loaded || options.activeTargetLoaded),
  preload_ready: Boolean(seed.preload_ready || options.preloadReady),
  runtime_evidence_present: Boolean(seed.runtime_evidence_present || options.runtimeEvidencePresent),
  remote_validation_present: Boolean(seed.remote_validation_present || options.remoteValidationPresent),
  compare_artifact_present: Boolean(seed.compare_artifact_present || options.compareArtifactPresent),
  allow_mutating_page_state: Boolean(seed.allow_mutating_page_state || options.allowMutatingPageState),
};

if (context.bundle_dir) {
  const bundleDir = context.bundle_dir;
  context.runtime_evidence_present = Boolean(
    context.runtime_evidence_present ||
      hasFile(path.join(bundleDir, 'evidence.json')) ||
      hasFile(path.join(bundleDir, 'maturity-summary.json'))
  );
  context.compare_artifact_present = Boolean(
    context.compare_artifact_present ||
      hasFile(path.join(bundleDir, 'replay-validation-compare.json'))
  );
  const sampleDir = path.resolve(bundleDir, '..', '..');
  context.remote_validation_present = Boolean(
    context.remote_validation_present ||
      hasFile(path.join(sampleDir, 'remote-replay-validation.json'))
  );
  context.preload_ready = Boolean(
    context.preload_ready ||
      hasFile(path.join(bundleDir, 'hook-preload.js'))
  );
}

if (options.output) {
  fs.writeFileSync(options.output, JSON.stringify(context, null, 2) + '\n', 'utf8');
}

console.log(JSON.stringify(context, null, 2));
