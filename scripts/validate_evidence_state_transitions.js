#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const modelPath = path.join(rootDir, 'assets/evidence-state-machine.json');

function usage() {
  console.error('Usage: validate_evidence_state_transitions.js <run-dir|evidence.json> [--json]');
  process.exit(1);
}

const args = process.argv.slice(2);
const options = { input: '', json: false };
for (const arg of args) {
  if (arg === '--json') options.json = true;
  else if (!options.input) options.input = path.resolve(arg);
  else usage();
}
if (!options.input) usage();

function readJsonIfExists(file) {
  if (!file || !fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function isDir(input) {
  try {
    return fs.statSync(input).isDirectory();
  } catch {
    return false;
  }
}

function loadArtifacts(input) {
  if (isDir(input)) {
    return {
      input,
      evidence: readJsonIfExists(path.join(input, 'evidence.json')),
      replayStatus: readJsonIfExists(path.join(input, 'replay-status.json')),
      claimSet: readJsonIfExists(path.join(input, 'claim-set.json')),
      provenanceGraph: readJsonIfExists(path.join(input, 'provenance-graph.json')),
    };
  }
  const evidence = readJsonIfExists(input);
  return {
    input,
    evidence,
    replayStatus: null,
    claimSet: null,
    provenanceGraph: null,
  };
}

function countMatchedHook(evidence) {
  return Number(evidence?.hook_evidence?.matched_observation_count || 0);
}

function replaySummary(evidence, replayStatus) {
  const replay = evidence?.replay_evidence || {};
  const status = replayStatus || {};
  return {
    evidence_acceptance: replay.acceptance_status || null,
    status_acceptance: status.acceptance_status || null,
    status: replay.status || status.status || null,
    accepted_sample_count: Number(replay.accepted_sample_count ?? status.accepted_sample_count ?? 0),
    divergence_count: Number(replay.divergence_count ?? status.divergence_count ?? 0),
    quality_accepted: replay.quality?.accepted ?? status.quality?.accepted ?? null,
    has_replay_evidence: !!evidence?.replay_evidence || !!replayStatus,
  };
}

function validateClaims(claimSet, errors, warnings) {
  if (!claimSet) return;
  const claims = Array.isArray(claimSet.claims) ? claimSet.claims : [];
  for (const claim of claims) {
    const sources = Array.isArray(claim.evidence_sources) ? claim.evidence_sources : [];
    if (claim.strength === 'verified' && sources.length === 0) {
      errors.push(`verified claim ${claim.claim_id || 'unknown'} has no evidence_sources`);
    }
    if (claim.strength === 'verified' && sources.every((item) => ['runner', 'router', 'static'].includes(item))) {
      warnings.push(`verified claim ${claim.claim_id || 'unknown'} is supported only by ${sources.join(', ')}`);
    }
    if (claim.claim_id === 'replay-accepted' && claim.strength !== 'verified') {
      errors.push('replay-accepted claim must be verified');
    }
    if (claim.claim_id === 'replay-not-accepted' && claim.strength === 'verified') {
      errors.push('replay-not-accepted claim must not be verified');
    }
  }
}

function validate(input) {
  const model = readJsonIfExists(modelPath);
  const artifacts = loadArtifacts(input);
  const errors = [];
  const warnings = [];
  const evidence = artifacts.evidence || {};
  const runtimeStatus = evidence.runtime_evidence?.status || null;
  const matchedHookCount = countMatchedHook(evidence);
  const replay = replaySummary(evidence, artifacts.replayStatus);
  const mcpRunStatus = evidence.mcp_execution?.run_status || null;

  if (!artifacts.evidence) errors.push('missing evidence.json or evidence artifact');

  if (runtimeStatus === 'runtime-captured' && matchedHookCount === 0 && !evidence.runtime_evidence?.request?.url) {
    errors.push('runtime-captured requires matched hook evidence or an observed runtime request');
  }

  if (runtimeStatus === 'runtime-accepted') {
    const acceptedReplay =
      replay.evidence_acceptance === 'accepted' ||
      replay.status_acceptance === 'accepted' ||
      evidence.challenge_success?.accepted === true ||
      evidence.challenge_success?.executed_at;
    if (!acceptedReplay) {
      errors.push('runtime-accepted requires accepted replay, server acceptance, or challenge-success evidence');
    }
  }

  const replayRejected = replay.evidence_acceptance === 'rejected' || replay.status_acceptance === 'rejected';
  if (replayRejected && runtimeStatus === 'runtime-accepted') {
    errors.push('rejected replay must not promote runtime_evidence.status to runtime-accepted');
  }

  const replayAccepted = replay.evidence_acceptance === 'accepted' || replay.status_acceptance === 'accepted';
  if (replayAccepted) {
    if (replay.accepted_sample_count <= 0) errors.push('accepted replay requires accepted_sample_count > 0');
    if (replay.divergence_count !== 0) errors.push('accepted replay requires divergence_count == 0');
    if (replay.quality_accepted === false) errors.push('accepted replay cannot have quality.accepted == false');
  }

  if (replay.has_replay_evidence && replay.status === 'verified' && replay.evidence_acceptance === 'rejected') {
    errors.push('replay_evidence.status verified conflicts with acceptance_status rejected');
  }

  if (mcpRunStatus === 'completed' && runtimeStatus === 'runtime-accepted' && !replayAccepted && !evidence.challenge_success?.executed_at) {
    errors.push('completed MCP execution alone must not promote runtime-accepted');
  }

  validateClaims(artifacts.claimSet, errors, warnings);

  return {
    schema: 'js-reverse-ops-evidence-state-validation-v1',
    model_schema: model?.schema || null,
    input,
    ok: errors.length === 0,
    errors,
    warnings,
    observed_state: {
      runtime_status: runtimeStatus,
      matched_hook_count: matchedHookCount,
      mcp_run_status: mcpRunStatus,
      replay_acceptance_status: replay.evidence_acceptance || replay.status_acceptance || null,
      replay_status: replay.status,
      replay_accepted_sample_count: replay.accepted_sample_count,
      replay_divergence_count: replay.divergence_count,
    },
  };
}

function renderText(result) {
  const lines = [];
  lines.push(`evidence state validation: ${result.ok ? 'ok' : 'failed'}`);
  lines.push(`runtime_status: ${result.observed_state.runtime_status || 'unknown'}`);
  lines.push(`replay_acceptance_status: ${result.observed_state.replay_acceptance_status || 'unknown'}`);
  for (const error of result.errors) lines.push(`ERROR ${error}`);
  for (const warning of result.warnings) lines.push(`WARN ${warning}`);
  return `${lines.join('\n')}\n`;
}

const result = validate(options.input);
process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : renderText(result));
if (!result.ok) process.exit(1);
