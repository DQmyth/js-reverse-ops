#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function usage() {
  console.error(
    'Usage: ingest_mcp_execution_record.js <evidence.json> <workflow-mcp-execution-record.json> [--output <evidence.json>]'
  );
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.length < 2) usage();

const evidencePath = path.resolve(args[0]);
const recordPath = path.resolve(args[1]);
let outputPath = evidencePath;

for (let i = 2; i < args.length; i += 1) {
  if (args[i] === '--output') outputPath = path.resolve(args[++i] || '');
  else usage();
}

const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
const stepResults = Array.isArray(record.step_results) ? record.step_results : [];
const completedSteps = stepResults.filter((step) => step.status === 'completed');
const failedSteps = stepResults.filter((step) => step.status === 'failed');

evidence.mcp_execution = {
  source: 'mcp-execution-record-ingest',
  recorded_at: record.generated_at || new Date().toISOString(),
  workflow_id: record.workflow_id || null,
  target: record.target || null,
  current_maturity: record.current_maturity || null,
  capability_dimensions: record.capability_dimensions || {},
  capability_focus: record.capability_focus || '',
  action_generation_summary: record.action_generation_summary || '',
  policy_summary: record.policy_summary || { status: 'none', reason: 'No policy summary available.' },
  run_status: record.run_status || 'unknown',
  step_count: stepResults.length,
  completed_steps: completedSteps.length,
  failed_steps: failedSteps.length,
  artifact: path.relative(path.dirname(outputPath), recordPath),
  steps: stepResults.map((step) => ({
    step: step.step,
    group_id: step.group_id,
    adapter: step.adapter,
    status: step.status,
    notes: step.notes || '',
    observed_outputs: step.observed_outputs || [],
  })),
};

const notes = Array.isArray(evidence.notes) ? evidence.notes.slice() : [];
const summary = `MCP execution record ingested for workflow ${evidence.mcp_execution.workflow_id || 'unknown'} with status ${evidence.mcp_execution.run_status}; completed ${completedSteps.length}/${stepResults.length} step(s).`;
if (!notes.includes(summary)) notes.push(summary);
if (evidence.mcp_execution.policy_summary && evidence.mcp_execution.policy_summary.status !== 'none') {
  const policyNote = `MCP execution policy: ${evidence.mcp_execution.policy_summary.status} - ${evidence.mcp_execution.policy_summary.reason || 'no reason provided'}.`;
  if (!notes.includes(policyNote)) notes.push(policyNote);
}
evidence.notes = notes;

fs.writeFileSync(outputPath, JSON.stringify(evidence, null, 2) + '\n', 'utf8');

const bundleDir = path.dirname(outputPath);
const artifactIndexPath = path.join(bundleDir, 'artifact-index.json');
if (fs.existsSync(artifactIndexPath)) {
  const artifactIndex = JSON.parse(fs.readFileSync(artifactIndexPath, 'utf8'));
  artifactIndex.groups = artifactIndex.groups || { original: [], derived: [], evidence: [] };
  artifactIndex.groups.evidence = artifactIndex.groups.evidence || [];
  artifactIndex.groups.evidence.push({
    status: 'copied',
    source: recordPath,
    destination: path.resolve(bundleDir, path.basename(recordPath)),
  });
  const seen = new Set();
  artifactIndex.groups.evidence = (artifactIndex.groups.evidence || []).filter((entry) => {
    const key = entry.destination || `${entry.source || ''}:${entry.status || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  fs.writeFileSync(artifactIndexPath, JSON.stringify(artifactIndex, null, 2) + '\n', 'utf8');
}

console.log(JSON.stringify({
  output: outputPath,
  workflow_id: evidence.mcp_execution.workflow_id,
  run_status: evidence.mcp_execution.run_status,
  completed_steps: completedSteps.length,
  failed_steps: failedSteps.length,
}, null, 2));
