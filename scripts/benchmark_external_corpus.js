#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function usage() {
  console.error(
    'Usage: benchmark_external_corpus.js --manifest <external-corpus-manifest.json> [--output <external-benchmark-summary.json>] [--summary <external-benchmark-summary.md>]'
  );
  process.exit(1);
}

const args = process.argv.slice(2);
if (!args.length) usage();

const options = {
  manifest: '',
  output: '',
  summary: '',
};

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  const next = args[i + 1] || '';
  if (arg === '--manifest') {
    options.manifest = path.resolve(next);
    i += 1;
  } else if (arg === '--output') {
    options.output = path.resolve(next);
    i += 1;
  } else if (arg === '--summary') {
    options.summary = path.resolve(next);
    i += 1;
  } else {
    usage();
  }
}

if (!options.manifest) usage();

const manifest = JSON.parse(fs.readFileSync(options.manifest, 'utf8'));
const samples = manifest.samples || [];

function readJsonIfExists(filePath, fallback = null) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : fallback;
}

function resolveLiveMaturity(sample) {
  const fromManifest = (((sample.local_artifacts || {}).maturity) || {});
  const bundleDir = ((sample.local_artifacts || {}).bundle_dir) || '';
  if (!bundleDir) return fromManifest;
  const resolvedBundleDir = path.resolve(process.cwd(), bundleDir);
  const liveSummary = readJsonIfExists(path.join(resolvedBundleDir, 'maturity-summary.json'), null);
  return liveSummary || fromManifest;
}

function resolveBundleEvidence(sample) {
  const bundleDir = ((sample.local_artifacts || {}).bundle_dir) || '';
  if (!bundleDir) return {};
  const resolvedBundleDir = path.resolve(process.cwd(), bundleDir);
  return readJsonIfExists(path.join(resolvedBundleDir, 'evidence.json'), {}) || {};
}

function resolveWorkflowDispatch(sample) {
  const bundleDir = ((sample.local_artifacts || {}).bundle_dir) || '';
  if (!bundleDir) return null;
  const resolvedBundleDir = path.resolve(process.cwd(), bundleDir);
  return readJsonIfExists(path.join(resolvedBundleDir, 'workflow-dispatch.json'), null);
}

function resolveArchivalEvidencePackage(sample) {
  const bundleDir = ((sample.local_artifacts || {}).bundle_dir) || '';
  if (!bundleDir) return null;
  const resolvedBundleDir = path.resolve(process.cwd(), bundleDir);
  return readJsonIfExists(path.join(resolvedBundleDir, 'archival-evidence-package.json'), null);
}

function isSpecializedWorkflow(workflowId) {
  return Boolean(workflowId) && workflowId !== 'search-first-runtime-escalation';
}

function recommendationWorkflowMismatch(row) {
  if (!row.workflow_id) return false;
  if (row.workflow_id === 'search-first-runtime-escalation' && row.archival_backed) return true;
  if (row.workflow_id === 'archival-wasm-solver' && !row.archival_backed) return true;
  if (row.workflow_id === 'archival-runtime-internals-reference' && !row.archival_backed) return true;
  if (row.workflow_id === 'minimal-local-harness' && !row.archival_backed) return true;
  if (row.workflow_id === 'archival-antidebug-html' && !row.archival_backed) return true;
  if (row.workflow_id === 'pcap-guided-form-replay' && !row.pcap_backed) return true;
  if (row.workflow_id === 'hook-to-provenance-loop' && !row.hook_backed) return true;
  return false;
}

function countBy(items, keyFn) {
  const out = {};
  for (const item of items) {
    const key = keyFn(item);
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

const rows = samples.map((sample) => {
  const maturity = resolveLiveMaturity(sample);
  const evidence = resolveBundleEvidence(sample);
  const dispatch = resolveWorkflowDispatch(sample);
  const archivalPackage = resolveArchivalEvidencePackage(sample);
  const signals = maturity.signals || {};
  const mcpPolicyStatus = (((evidence.mcp_execution || {}).policy_summary || {}).status) || 'none';
  const row = {
    id: sample.id,
    priority: sample.priority || null,
    status: sample.status || 'unknown',
    family: sample.family || 'unknown',
    subfamily: sample.subfamily || 'unknown',
    maturity: maturity.maturity || 'unknown',
    runtime_request_captured: Boolean(signals.runtime_request_captured),
    runtime_request_accepted: Boolean(signals.runtime_request_accepted),
    challenge_success_available: Boolean(signals.challenge_success_available),
    replay_scaffold_generated: Boolean(signals.replay_scaffold_generated),
    replay_validation_available: Boolean(signals.replay_validation_available),
    replay_verified: Boolean(signals.replay_verified),
    evidence_grade: maturity.evidence_grade || 'inferred',
    evidence_grade_live: Boolean(signals.evidence_grade_live),
    evidence_grade_archival: Boolean(signals.evidence_grade_archival),
    evidence_grade_local: Boolean(signals.evidence_grade_local),
    mcp_execution_available: Boolean(signals.mcp_execution_available),
    mcp_execution_completed: Boolean(signals.mcp_execution_completed),
    mcp_execution_failed: Boolean(signals.mcp_execution_failed),
    source_snapshot_available: Boolean(signals.source_snapshot_available),
    static_analysis_available: Boolean(signals.static_analysis_available),
    solver_backed: Boolean((maturity.capability_dimensions || {}).solver_backed),
    hook_backed: Boolean((maturity.capability_dimensions || {}).hook_backed),
    pcap_backed: Boolean((maturity.capability_dimensions || {}).pcap_backed),
    local_harness_backed: Boolean((maturity.capability_dimensions || {}).local_harness_backed),
    antidebug_backed: Boolean((maturity.capability_dimensions || {}).antidebug_backed),
    archival_backed: Boolean((maturity.capability_dimensions || {}).archival_backed),
    archival_evidence_package_available: Boolean(archivalPackage),
    mcp_policy_status: mcpPolicyStatus,
    workflow_id: dispatch ? dispatch.workflow_id : null,
  };
  row.specialized_workflow = isSpecializedWorkflow(row.workflow_id);
  row.recommendation_workflow_mismatch = recommendationWorkflowMismatch(row);
  return row;
});

const result = {
  manifest: options.manifest,
  generated_at: new Date().toISOString(),
  summary: {
    sample_count: rows.length,
    status_counts: countBy(rows, (row) => row.status),
    maturity_counts: countBy(rows, (row) => row.maturity),
    family_counts: countBy(rows, (row) => row.family),
    evidence_grade_counts: countBy(rows, (row) => row.evidence_grade),
    runtime_captured_count: rows.filter((row) => row.runtime_request_captured).length,
    runtime_accepted_count: rows.filter((row) => row.runtime_request_accepted).length,
    challenge_success_count: rows.filter((row) => row.challenge_success_available).length,
    verified_live_count: rows.filter((row) => row.evidence_grade_live).length,
    verified_archival_count: rows.filter((row) => row.evidence_grade_archival).length,
    verified_local_count: rows.filter((row) => row.evidence_grade_local).length,
    replay_scaffold_count: rows.filter((row) => row.replay_scaffold_generated || row.maturity === 'replay-scaffolded').length,
    replay_validation_count: rows.filter((row) => row.replay_validation_available || row.maturity === 'replay-attempted' || row.maturity === 'replay-verified').length,
    replay_verified_count: rows.filter((row) => row.replay_verified).length,
    mcp_execution_count: rows.filter((row) => row.mcp_execution_available).length,
    mcp_execution_completed_count: rows.filter((row) => row.mcp_execution_completed).length,
    mcp_execution_failed_count: rows.filter((row) => row.mcp_execution_failed).length,
    mcp_policy_counts: countBy(rows.filter((row) => row.mcp_policy_status && row.mcp_policy_status !== 'none'), (row) => row.mcp_policy_status),
    source_snapshot_count: rows.filter((row) => row.source_snapshot_available).length,
    static_analysis_count: rows.filter((row) => row.static_analysis_available).length,
    solver_backed_count: rows.filter((row) => row.solver_backed).length,
    hook_backed_count: rows.filter((row) => row.hook_backed).length,
    pcap_backed_count: rows.filter((row) => row.pcap_backed).length,
    local_harness_backed_count: rows.filter((row) => row.local_harness_backed).length,
    antidebug_backed_count: rows.filter((row) => row.antidebug_backed).length,
    archival_backed_count: rows.filter((row) => row.archival_backed).length,
    archival_evidence_package_count: rows.filter((row) => row.archival_evidence_package_available).length,
    archival_evidence_package_missing_count: rows.filter((row) => row.archival_backed && !row.archival_evidence_package_available).length,
    workflow_counts: countBy(rows.filter((row) => row.workflow_id), (row) => row.workflow_id),
    specialized_workflow_count: rows.filter((row) => row.specialized_workflow).length,
    generic_workflow_count: rows.filter((row) => row.workflow_id === 'search-first-runtime-escalation').length,
    recommendation_workflow_mismatch_count: rows.filter((row) => row.recommendation_workflow_mismatch).length,
  },
  samples: rows.sort((a, b) => (a.priority || 999) - (b.priority || 999)),
};

const summaryMd = [
  '# External Benchmark Summary',
  '',
  `- sample_count: ${result.summary.sample_count}`,
  `- runtime_captured_count: ${result.summary.runtime_captured_count}`,
  `- runtime_accepted_count: ${result.summary.runtime_accepted_count}`,
  `- challenge_success_count: ${result.summary.challenge_success_count}`,
  `- verified_live_count: ${result.summary.verified_live_count}`,
  `- verified_archival_count: ${result.summary.verified_archival_count}`,
  `- verified_local_count: ${result.summary.verified_local_count}`,
  `- replay_scaffold_count: ${result.summary.replay_scaffold_count}`,
  `- replay_validation_count: ${result.summary.replay_validation_count}`,
  `- replay_verified_count: ${result.summary.replay_verified_count}`,
  `- mcp_execution_count: ${result.summary.mcp_execution_count}`,
  `- mcp_execution_completed_count: ${result.summary.mcp_execution_completed_count}`,
  `- mcp_execution_failed_count: ${result.summary.mcp_execution_failed_count}`,
  `- mcp_policy_sample_count: ${Object.values(result.summary.mcp_policy_counts).reduce((acc, value) => acc + value, 0)}`,
  `- source_snapshot_count: ${result.summary.source_snapshot_count}`,
  `- static_analysis_count: ${result.summary.static_analysis_count}`,
  `- solver_backed_count: ${result.summary.solver_backed_count}`,
  `- hook_backed_count: ${result.summary.hook_backed_count}`,
  `- pcap_backed_count: ${result.summary.pcap_backed_count}`,
  `- local_harness_backed_count: ${result.summary.local_harness_backed_count}`,
  `- antidebug_backed_count: ${result.summary.antidebug_backed_count}`,
  `- archival_backed_count: ${result.summary.archival_backed_count}`,
  `- archival_evidence_package_count: ${result.summary.archival_evidence_package_count}`,
  `- archival_evidence_package_missing_count: ${result.summary.archival_evidence_package_missing_count}`,
  `- specialized_workflow_count: ${result.summary.specialized_workflow_count}`,
  `- generic_workflow_count: ${result.summary.generic_workflow_count}`,
  `- recommendation_workflow_mismatch_count: ${result.summary.recommendation_workflow_mismatch_count}`,
  '',
  '## Status Counts',
  '',
  ...Object.entries(result.summary.status_counts).sort().map(([key, value]) => `- ${key}: ${value}`),
  '',
  '## Maturity Counts',
  '',
  ...Object.entries(result.summary.maturity_counts).sort().map(([key, value]) => `- ${key}: ${value}`),
  '',
  '## Evidence Grades',
  '',
  ...Object.entries(result.summary.evidence_grade_counts).sort().map(([key, value]) => `- ${key}: ${value}`),
  '',
  '## MCP Policies',
  '',
  ...(Object.keys(result.summary.mcp_policy_counts).length
    ? Object.entries(result.summary.mcp_policy_counts).sort().map(([key, value]) => `- ${key}: ${value}`)
    : ['- none']),
  '',
  '## Workflow Coverage',
  '',
  ...(Object.keys(result.summary.workflow_counts).length
    ? Object.entries(result.summary.workflow_counts).sort().map(([key, value]) => `- ${key}: ${value}`)
    : ['- none']),
  '',
  '## Samples',
  '',
  ...result.samples.map((row) => `- ${row.id}: status=${row.status}, maturity=${row.maturity}, evidence_grade=${row.evidence_grade}, family=${row.family}, runtime_captured=${row.runtime_request_captured}, runtime_accepted=${row.runtime_request_accepted}, challenge_success=${row.challenge_success_available}, replay_scaffold=${row.replay_scaffold_generated}, replay_validation=${row.replay_validation_available}, mcp_execution=${row.mcp_execution_available}, mcp_policy=${row.mcp_policy_status}, solver_backed=${row.solver_backed}, hook_backed=${row.hook_backed}, pcap_backed=${row.pcap_backed}, local_harness_backed=${row.local_harness_backed}, antidebug_backed=${row.antidebug_backed}, archival_backed=${row.archival_backed}, archival_package=${row.archival_evidence_package_available}, workflow=${row.workflow_id || 'none'}, specialized_workflow=${row.specialized_workflow}, recommendation_workflow_mismatch=${row.recommendation_workflow_mismatch}`),
].join('\n');

const json = JSON.stringify(result, null, 2);
if (options.output) fs.writeFileSync(options.output, `${json}\n`, 'utf8');
if (options.summary) fs.writeFileSync(options.summary, `${summaryMd}\n`, 'utf8');
console.log(json);
