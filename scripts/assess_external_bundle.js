#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function usage() {
  console.error(
    'Usage: assess_external_bundle.js --bundle-dir <dir> [--output-json <file>] [--output-md <file>]'
  );
  process.exit(1);
}

const args = process.argv.slice(2);
if (!args.length) usage();

const options = {
  bundleDir: '',
  outputJson: '',
  outputMd: '',
};

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  const next = args[i + 1] || '';
  if (arg === '--bundle-dir') {
    options.bundleDir = path.resolve(next);
    i += 1;
  } else if (arg === '--output-json') {
    options.outputJson = path.resolve(next);
    i += 1;
  } else if (arg === '--output-md') {
    options.outputMd = path.resolve(next);
    i += 1;
  } else {
    usage();
  }
}

if (!options.bundleDir) usage();

if (!options.outputJson) options.outputJson = path.join(options.bundleDir, 'maturity-summary.json');
if (!options.outputMd) options.outputMd = path.join(options.bundleDir, 'maturity-summary.md');

function readJson(fileName, fallback = {}) {
  const filePath = path.join(options.bundleDir, fileName);
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

const evidence = readJson('evidence.json');
const claims = readJson('claim-set.json', { claims: [] });
const risks = readJson('risk-summary.json', { labels: [], items: [] });
const provenance = readJson('provenance-graph.json', { status: 'unknown' });
const artifactIndex = readJson('artifact-index.json', { groups: {} });

const runtimeEvidence = evidence.runtime_evidence || {};
const runtimeRequest = runtimeEvidence.request || {};
const replayValidation = evidence.replay_validation || {};
const challengeSuccess = evidence.challenge_success || {};
const publicWriteupFacts = evidence.public_writeup_facts || {};
const mcpExecution = evidence.mcp_execution || {};
const publicFacts = publicWriteupFacts.facts || publicWriteupFacts || {};
const publicFactStack = (publicFacts.stack || []).map((item) => String(item).toLowerCase());
const publicCriticalPaths = (publicFacts.critical_paths || []).map((item) => String(item).toLowerCase());
const publicKeywords = (((publicFacts.public_signals || {}).writeup_keywords) || []).map((item) => String(item).toLowerCase());
const staticEvidence = evidence.static_analysis || {};
const staticDerived = staticEvidence.inferred || {};
const staticSignalText = [
  ...((staticDerived.helper_markers || []).map((item) => String(item).toLowerCase())),
  ...((staticDerived.module_hints || []).map((item) => String(item).toLowerCase())),
  ...((staticDerived.families || []).map((item) => String(item).toLowerCase())),
].join(' ');
const runtimeAccepted = Number(runtimeRequest.status || 0) === 200 && !runtimeRequest.asset_only && !runtimeEvidence.local_harness;
const archivalChallengeSuccess = Boolean(challengeSuccess.executed_at && challengeSuccess.archival_public);
const localChallengeSuccess = Boolean(challengeSuccess.executed_at && challengeSuccess.local_harness && !challengeSuccess.archival_public);
const liveChallengeSuccess = Boolean(challengeSuccess.executed_at && !challengeSuccess.local_harness && !challengeSuccess.archival_public);
const status = evidence.status || 'unknown';
const riskItems = Array.isArray(risks.items) ? risks.items : Array.isArray(risks.risks) ? risks.risks : [];
const labels = new Set([...(risks.labels || [])]);
const sourceSnapshot = evidence.source_snapshot || {};
const sourceSnapshotPaths = []
  .concat(Array.isArray(sourceSnapshot.imported_files) ? sourceSnapshot.imported_files : [])
  .concat(Array.isArray(sourceSnapshot.paths) ? sourceSnapshot.paths : []);
const hookEvidence = evidence.hook_evidence || {};
const mcpPolicyStatus = (((mcpExecution.policy_summary || {}).status) || 'none');

let maturity = 'unknown';
if (runtimeEvidence.replay_status === 'verified') maturity = 'replay-verified';
else if (replayValidation.executed_at) maturity = 'replay-attempted';
else if ((evidence.replay_scaffold || {}).generated || (evidence.form_replay || {}).generated) maturity = 'replay-scaffolded';
else if (runtimeAccepted) maturity = 'runtime-accepted';
else if (runtimeRequest.url || runtimeEvidence.topic || runtimeEvidence.request) maturity = 'runtime-captured';
else if (challengeSuccess.executed_at) maturity = 'runtime-captured';
else if (status === 'static-analysis-generated') maturity = 'static-analysis-generated';
else if (status === 'source-snapshot-imported') maturity = 'source-snapshot-imported';
else if (status === 'bootstrap-only') maturity = 'bootstrap-only';

const signals = {
  source_snapshot_available: Boolean(evidence.source_snapshot && (evidence.source_snapshot.imported_count || 0) > 0),
  static_analysis_available: Boolean(evidence.static_analysis),
  runtime_request_captured: Boolean(runtimeRequest.url || runtimeRequest.body || runtimeRequest.fields),
  runtime_request_accepted: runtimeAccepted,
  challenge_success_available: Boolean(challengeSuccess.executed_at),
  evidence_grade_live: Boolean(runtimeAccepted || liveChallengeSuccess || runtimeEvidence.replay_status === 'verified'),
  evidence_grade_archival: archivalChallengeSuccess,
  evidence_grade_local: localChallengeSuccess || Boolean(runtimeEvidence.local_harness),
  runtime_asset_only: Boolean(runtimeRequest.asset_only),
  runtime_local_harness: Boolean(runtimeEvidence.local_harness),
  replay_scaffold_generated: Boolean((evidence.replay_scaffold || {}).generated || (evidence.form_replay || {}).generated),
  replay_validation_available: Boolean(replayValidation.executed_at),
  replay_verified: runtimeEvidence.replay_status === 'verified',
  mcp_execution_available: Boolean(mcpExecution.run_status),
  mcp_execution_completed: mcpExecution.run_status === 'completed',
  mcp_execution_failed: mcpExecution.run_status === 'failed',
  mcp_policy_suppressed: mcpPolicyStatus === 'action-suppressed-by-capability-focus',
  mcp_policy_depth_first: mcpPolicyStatus === 'depth-first-runtime-policy',
  provenance_status: provenance.status || 'unknown',
  derived_artifact_count: ((artifactIndex.groups || {}).derived || []).length,
  evidence_artifact_count: ((artifactIndex.groups || {}).evidence || []).length,
};

const verifiedClaims = (claims.claims || []).filter((claim) => claim.status === 'verified' || claim.strength === 'verified').length;
const inferredClaims = (claims.claims || []).filter((claim) => claim.status === 'inferred' || claim.strength === 'inferred').length;
const capabilityDimensions = {
  solver_backed: Boolean(
    (challengeSuccess.details || {}).solver ||
      (challengeSuccess.details || {}).symbol_map ||
      (challengeSuccess.details || {}).solver_result ||
      (claims.claims || []).some((claim) => String(claim.claim_id || claim.id || '').includes('solver'))
  ),
  hook_backed: Boolean(
    (Array.isArray(hookEvidence.records) && hookEvidence.records.length > 0) ||
      (Array.isArray(hookEvidence.observations) && hookEvidence.observations.length > 0) ||
      Number(hookEvidence.observation_count || 0) > 0
  ),
  pcap_backed: Boolean(
    sourceSnapshotPaths.some((file) => String(file).toLowerCase().endsWith('.pcap'))
  ),
  local_harness_backed: Boolean(
    localChallengeSuccess ||
      fs.existsSync(path.join(options.bundleDir, 'local-harness-plan.json')) ||
      fs.existsSync(path.join(options.bundleDir, 'local-harness-result.json'))
  ),
  antidebug_backed: Boolean(
    labels.has('archival-antidebug-html') ||
      labels.has('unlock-route-preservation') ||
      fs.existsSync(path.join(options.bundleDir, 'archival-antidebug-report.json')) ||
      publicCriticalPaths.some((item) => item.includes('anti-debug') || item.includes('unlock') || item.includes('localstorage')) ||
      publicKeywords.some((item) => item.includes('anti-debug') || item.includes('unlock') || item.includes('localstorage') || item.includes('devtools'))
  ),
  archival_backed: Boolean(
    archivalChallengeSuccess ||
      publicWriteupFacts.artifact ||
      (challengeSuccess.details || {}).writeup_facts ||
      labels.has('challenge-success-archival-public')
  ),
};

function recommendationForState() {
  if (mcpPolicyStatus === 'action-suppressed-by-capability-focus') {
    return mcpExecution.action_generation_summary || (mcpExecution.policy_summary || {}).reason || 'Treat the current MCP state as intentionally suppressed by bundle policy.';
  }
  if (mcpPolicyStatus === 'depth-first-runtime-policy') {
    return mcpExecution.action_generation_summary || (mcpExecution.policy_summary || {}).reason || 'Use the current runtime truth to deepen one accepted path before widening browser actions.';
  }
  if (localChallengeSuccess || runtimeEvidence.local_harness) {
    return 'Treat the bundle as verified-local proof only, preserve harness provenance, and only promote further if a surviving accepted remote path is later recovered.';
  }
  if (archivalChallengeSuccess) {
    return 'Preserve archival challenge-success as strong archival proof and do not treat it as live parity or replay verification unless surviving remote behavior is later recovered.';
  }
  if (maturity === 'bootstrap-only') {
    return 'Import a source snapshot before attempting deeper reverse work.';
  }
  if (maturity === 'source-snapshot-imported') {
    return 'Generate static analysis from the imported source snapshot.';
  }
  if (maturity === 'static-analysis-generated') {
    const isWasmHardCase = publicFactStack.includes('webassembly') || publicKeywords.includes('webassembly');
    const isSolverLike = publicCriticalPaths.some((item) => item.includes('checkflag') || item.includes('aes'));
    const isEngineInternals =
      publicFactStack.includes('v8') ||
      publicFactStack.some((item) => item.includes('engine') || item.includes('runtime')) ||
      publicKeywords.some((item) => item.includes('engine') || item.includes('runtime')) ||
      publicCriticalPaths.some((item) => item.includes('promise') || item.includes('runtime'));
    const isChallengeSuccessCandidate = publicCriticalPaths.some((item) => item.includes('challenge-success') || item.includes('browser challenge ui'));
    const isEmscriptenEntrypointCase =
      staticSignalText.includes('module.ccall') ||
      staticSignalText.includes('module.cwrap') ||
      staticSignalText.includes('checkauth') ||
      staticSignalText.includes('validate') ||
      staticSignalText.includes('checkflag');
    const isArchivalAntiDebugCase =
      publicCriticalPaths.some((item) => item.includes('anti-debug') || item.includes('unlock') || item.includes('localstorage')) ||
      publicKeywords.some((item) => item.includes('anti-debug') || item.includes('devtools') || item.includes('unlock')) ||
      staticSignalText.includes('anti-debug') ||
      staticSignalText.includes('antidebug') ||
      staticSignalText.includes('unlock(') ||
      staticSignalText.includes('localstorage') ||
      staticSignalText.includes('devtools');

    if (capabilityDimensions.archival_backed && (capabilityDimensions.local_harness_backed || isEmscriptenEntrypointCase)) {
      return 'Prefer a minimal local harness around preserved Module.ccall/cwrap entrypoints before widening into replay-style workflows.';
    }
    if (capabilityDimensions.archival_backed && isWasmHardCase && isSolverLike) {
      return 'Prefer an archival solver or memory-oriented WASM route around checkFlag/AES/loader anchors before widening into replay-centric workflows.';
    }
    if (capabilityDimensions.archival_backed && isEngineInternals) {
      return 'Treat this bundle as a runtime-internals archival reference and preserve patch or POC provenance before attempting replay-style workflows.';
    }
    if (capabilityDimensions.archival_backed && isArchivalAntiDebugCase) {
      return 'Treat this bundle as an archival anti-debug HTML case and preserve the unlock or bypass route before inventing replay or accepted-runtime work.';
    }
    if (capabilityDimensions.archival_backed && isChallengeSuccessCandidate) {
      return 'Prefer challenge-success reconstruction or a minimal local harness before any request-centric runtime capture plan.';
    }
    return 'Use static signals to drive runtime capture or replay scaffolding.';
  }
  if (maturity === 'replay-attempted') {
    return 'Replace synthetic or failed replay validation with an accepted non-synthetic replay run.';
  }
  if (maturity === 'replay-scaffolded') {
    return 'Fill in the replay scaffold with real signature, header, or cookie logic and validate against accepted responses.';
  }
  if (maturity === 'runtime-captured') {
    return 'Validate against accepted server responses or compare against browser truth.';
  }
  if (maturity === 'runtime-accepted') {
    return 'Export replay artifacts and deepen provenance or paused-frame coverage.';
  }
  if (maturity === 'replay-verified') {
    return 'Track drift and add this sample to benchmark regression suites.';
  }
  return 'Inspect the bundle manually to determine missing evidence layers.';
}

const result = {
  bundle_dir: options.bundleDir,
  assessed_at: new Date().toISOString(),
  maturity,
  signals,
  capability_dimensions: capabilityDimensions,
  claim_counts: {
    verified: verifiedClaims,
    inferred: inferredClaims,
    total: (claims.claims || []).length,
  },
  risk_counts: {
    total: riskItems.length,
    labels: [...labels].sort(),
  },
  evidence_grade:
    runtimeEvidence.replay_status === 'verified' || runtimeAccepted || liveChallengeSuccess
      ? 'verified-live'
      : archivalChallengeSuccess
        ? 'verified-archival'
        : (localChallengeSuccess || runtimeEvidence.local_harness)
          ? 'verified-local'
          : 'inferred',
  recommendation: recommendationForState(),
};

const md = [
  '# External Bundle Maturity',
  '',
  `- maturity: ${result.maturity}`,
  `- source_snapshot_available: ${signals.source_snapshot_available}`,
  `- static_analysis_available: ${signals.static_analysis_available}`,
  `- runtime_request_captured: ${signals.runtime_request_captured}`,
  `- runtime_request_accepted: ${signals.runtime_request_accepted}`,
  `- challenge_success_available: ${signals.challenge_success_available}`,
  `- evidence_grade_live: ${signals.evidence_grade_live}`,
  `- evidence_grade_archival: ${signals.evidence_grade_archival}`,
  `- evidence_grade_local: ${signals.evidence_grade_local}`,
  `- runtime_asset_only: ${signals.runtime_asset_only}`,
  `- runtime_local_harness: ${signals.runtime_local_harness}`,
  `- replay_scaffold_generated: ${signals.replay_scaffold_generated}`,
  `- replay_validation_available: ${signals.replay_validation_available}`,
  `- replay_verified: ${signals.replay_verified}`,
  `- mcp_execution_available: ${signals.mcp_execution_available}`,
  `- mcp_execution_completed: ${signals.mcp_execution_completed}`,
  `- mcp_execution_failed: ${signals.mcp_execution_failed}`,
  `- mcp_policy_status: ${mcpPolicyStatus}`,
  `- mcp_policy_suppressed: ${signals.mcp_policy_suppressed}`,
  `- mcp_policy_depth_first: ${signals.mcp_policy_depth_first}`,
  `- solver_backed: ${capabilityDimensions.solver_backed}`,
  `- hook_backed: ${capabilityDimensions.hook_backed}`,
  `- pcap_backed: ${capabilityDimensions.pcap_backed}`,
  `- local_harness_backed: ${capabilityDimensions.local_harness_backed}`,
  `- antidebug_backed: ${capabilityDimensions.antidebug_backed}`,
  `- archival_backed: ${capabilityDimensions.archival_backed}`,
  `- provenance_status: ${signals.provenance_status}`,
  `- verified_claims: ${result.claim_counts.verified}`,
  `- inferred_claims: ${result.claim_counts.inferred}`,
  `- evidence_grade: ${result.evidence_grade}`,
  `- risk_labels: ${result.risk_counts.labels.join(', ') || 'none'}`,
  '',
  `Recommendation: ${result.recommendation}`,
].join('\n');

fs.writeFileSync(options.outputJson, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
fs.writeFileSync(options.outputMd, `${md}\n`, 'utf8');
console.log(JSON.stringify(result, null, 2));
