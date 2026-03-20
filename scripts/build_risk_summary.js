#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function usage() {
  console.error('Usage: build_risk_summary.js <evidence.json> [--output <risk-summary.json>]');
  process.exit(1);
}

const args = process.argv.slice(2);
if (!args.length) usage();

const inputPath = args[0];
let outputPath = '';
for (let i = 1; i < args.length; i += 1) {
  if (args[i] === '--output') outputPath = args[++i] || '';
  else usage();
}

const evidence = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const runtime = evidence.runtime_evidence || {};
const staticEvidence = evidence.static_evidence || {};
const hookEvidence = evidence.hook_evidence || {};
const mcpExecution = evidence.mcp_execution || {};
const challengeSuccess = evidence.challenge_success || {};
const familyDecision = staticEvidence.family_decision || {};
const request = runtime.request || {};
const risks = [];

function addRisk(id, severity, category, reason, nextAction) {
  risks.push({ id, severity, category, reason, next_action: nextAction });
}

for (const risk of familyDecision.detected_risks || []) {
  if (risk === 'helper-endpoint-risk') {
    addRisk(risk, 'high', 'routing', 'HTML or page contract likely exposes a helper endpoint instead of the protected request.', 'Trust runtime capture first and keep helper endpoints as hints only.');
  } else if (risk === 'launcher-page-handoff') {
    addRisk(risk, 'high', 'routing', 'The visible page is likely only a launcher and the protected request belongs to a secondary app shell.', 'Capture launcher and data pages separately and preserve both as artifacts.');
  } else if (risk === 'runtime-first-required') {
    addRisk(risk, 'medium', 'evidence', 'Static extraction did not directly recover the protected endpoint.', 'Use network capture, hooks, or paused frames before extending static grep.');
  } else if (risk === 'fresh-runtime-non-200') {
    addRisk(risk, 'high', 'trigger', 'The observed runtime contract still produced a rejected sample.', 'Validate trigger path, timing, and prerequisite state before assuming the algorithm is wrong.');
  }
}

if ((request.status || 0) === 200 && !request.asset_only && !runtime.local_harness) {
  addRisk('accepted-sample-present', 'low', 'validation', 'At least one accepted runtime sample exists.', 'Use it as the canonical source-of-truth for replay and provenance work.');
}

if (challengeSuccess.executed_at && challengeSuccess.local_harness) {
  addRisk(
    'challenge-success-local-proof-only',
    'low',
    'validation',
    'Challenge success currently comes from a minimal local harness rather than a surviving accepted remote path.',
    'Keep local proof as a first-class route, but do not promote it to live parity or replay verification.'
  );

  if (!(challengeSuccess.evidence || {}).harness_entrypoint) {
    addRisk(
      'challenge-success-harness-entrypoint-missing',
      'medium',
      'evidence',
      'A local harness result exists, but the harness entrypoint was not preserved as first-class evidence.',
      'Record the exercised harness entrypoint so local proof remains reproducible.'
    );
  } else {
    addRisk(
      'challenge-success-harness-entrypoint-preserved',
      'low',
      'evidence',
      'The local harness entrypoint was preserved alongside challenge-success evidence.',
      'Reuse the preserved entrypoint when rebuilding or extending the local harness.'
    );
  }
}

if ((evidence.unknowns || []).length) {
  addRisk('open-unknowns', 'medium', 'analysis', 'There are unresolved unknowns in the evidence bundle.', 'Resolve unknowns before promoting inferred findings into replay code.');
}

if ((hookEvidence.observations || []).length) {
  const matched = (hookEvidence.observations || []).filter((item) => item.matches_target || (item.cookies || []).length || (item.fields || []).length);
  addRisk(
    'hook-evidence-present',
    matched.length ? 'low' : 'medium',
    'runtime',
    matched.length
      ? 'Hook evidence captured target-relevant runtime observations.'
      : 'Hook evidence exists but did not yet isolate target-relevant observations.',
    matched.length
      ? 'Promote matched hook observations into provenance and replay assumptions.'
      : 'Narrow hook presets or capture mode before collecting more raw hook data.'
  );
}

if (mcpExecution.run_status) {
  const policyStatus = ((mcpExecution.policy_summary || {}).status) || 'none';
  if (mcpExecution.run_status === 'completed') {
    addRisk(
      'mcp-execution-completed',
      'low',
      'workflow',
      `MCP execution workflow ${mcpExecution.workflow_id || 'unknown'} completed ${mcpExecution.completed_steps || 0}/${mcpExecution.step_count || 0} step(s).`,
      'Use the execution record as a durable reference when reviewing hooks, reloads, and runtime capture sequencing.'
    );
  } else if (mcpExecution.run_status === 'failed') {
    addRisk(
      'mcp-execution-failed',
      'high',
      'workflow',
      `MCP execution workflow ${mcpExecution.workflow_id || 'unknown'} recorded failed steps.`,
      'Inspect the execution record before trusting any downstream runtime conclusions.'
    );
  } else if (mcpExecution.run_status === 'not-started' && policyStatus === 'action-suppressed-by-capability-focus') {
    addRisk(
      'mcp-execution-policy-suppressed',
      'low',
      'workflow',
      `MCP execution workflow ${mcpExecution.workflow_id || 'unknown'} was intentionally suppressed by bundle policy.`,
      mcpExecution.action_generation_summary || (mcpExecution.policy_summary || {}).reason || 'Treat this as a policy decision, not as missing execution hygiene.'
    );
  } else {
    addRisk(
      'mcp-execution-incomplete',
      'medium',
      'workflow',
      `MCP execution workflow ${mcpExecution.workflow_id || 'unknown'} is only partially completed.`,
      'Finish or rerun the remaining MCP steps before promoting execution-derived findings.'
    );
  }
}

const severityOrder = { high: 3, medium: 2, low: 1 };
risks.sort((a, b) => severityOrder[b.severity] - severityOrder[a.severity] || a.id.localeCompare(b.id));

const result = {
  source: path.resolve(inputPath),
  topic: runtime.topic || null,
  generated_at: new Date().toISOString(),
  risks,
  summary: {
    high: risks.filter((item) => item.severity === 'high').length,
    medium: risks.filter((item) => item.severity === 'medium').length,
    low: risks.filter((item) => item.severity === 'low').length,
  },
};

const json = JSON.stringify(result, null, 2);
if (outputPath) fs.writeFileSync(outputPath, `${json}\n`, 'utf8');
console.log(json);
