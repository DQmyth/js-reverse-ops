#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function usage() {
  console.error(
    'Usage: record_mcp_execution_results.js <workflow-mcp-execution-guide.json> <execution-record-template-or-json> [--output-json <file>] [--output-md <file>]'
  );
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.length < 2) usage();

const options = {
  guideJson: path.resolve(args[0]),
  recordJson: path.resolve(args[1]),
  outputJson: '',
  outputMd: '',
};

for (let i = 2; i < args.length; i += 1) {
  const arg = args[i];
  const next = args[i + 1] || '';
  if (arg === '--output-json') {
    options.outputJson = path.resolve(next);
    i += 1;
  } else if (arg === '--output-md') {
    options.outputMd = path.resolve(next);
    i += 1;
  } else {
    usage();
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

const guide = readJson(options.guideJson);
const record = readJson(options.recordJson);
const steps = Array.isArray(guide.steps) ? guide.steps : [];
const resultByStep = new Map(
  (Array.isArray(record.step_results) ? record.step_results : []).map((item) => [item.step, item])
);

const normalizedSteps = steps.map((step) => {
  const raw = resultByStep.get(step.step) || {};
  return {
    step: step.step,
    group_id: step.group_id,
    adapter: step.invocation?.adapter || null,
    status: raw.status || 'pending',
    started_at: raw.started_at || null,
    finished_at: raw.finished_at || null,
    notes: raw.notes || '',
    observed_outputs: Array.isArray(raw.observed_outputs) ? raw.observed_outputs : [],
  };
});

const statusCounts = normalizedSteps.reduce((acc, step) => {
  acc[step.status] = (acc[step.status] || 0) + 1;
  return acc;
}, {});

let runStatus = 'not-started';
if (!normalizedSteps.length) {
  runStatus = 'not-started';
} else if (normalizedSteps.some((step) => step.status === 'failed')) {
  runStatus = 'failed';
} else if (normalizedSteps.every((step) => step.status === 'completed')) {
  runStatus = 'completed';
} else if (normalizedSteps.some((step) => step.status === 'in-progress' || step.status === 'completed')) {
  runStatus = 'in-progress';
}

const output = {
  generated_at: new Date().toISOString(),
  guide_json: options.guideJson,
  record_json: options.recordJson,
  workflow_id: guide.workflow_id || null,
  target: guide.target || null,
  bundle_dir: guide.bundle_dir || null,
  current_maturity: guide.current_maturity || null,
  capability_dimensions: guide.capability_dimensions || {},
  capability_focus: guide.capability_focus || '',
  action_generation_summary: guide.action_generation_summary || '',
  policy_summary: guide.policy_summary || { status: 'none', reason: 'No policy summary available.' },
  run_status: runStatus,
  status_counts: statusCounts,
  step_results: normalizedSteps,
};

if (options.outputJson) {
  fs.writeFileSync(options.outputJson, JSON.stringify(output, null, 2) + '\n', 'utf8');
}

if (options.outputMd) {
  const lines = [
    '# MCP Execution Record',
    '',
    `- workflow_id: ${output.workflow_id || 'none'}`,
    `- target: ${output.target || 'none'}`,
    `- current_maturity: ${output.current_maturity || 'none'}`,
    `- capability_focus: ${output.capability_focus || 'none'}`,
    `- action_generation_summary: ${output.action_generation_summary || 'none'}`,
    `- policy_summary: ${output.policy_summary.status || 'none'}${output.policy_summary.reason ? ` - ${output.policy_summary.reason}` : ''}`,
    `- run_status: ${output.run_status}`,
    '',
    '## Steps',
    '',
  ];
  if (!normalizedSteps.length) {
    lines.push('- none');
  } else {
    for (const step of normalizedSteps) {
      lines.push(`- Step ${step.step} (${step.group_id}): ${step.status}`);
      if (step.notes) lines.push(`  notes: ${step.notes}`);
    }
  }
  fs.writeFileSync(options.outputMd, lines.join('\n') + '\n', 'utf8');
}

console.log(JSON.stringify(output, null, 2));
