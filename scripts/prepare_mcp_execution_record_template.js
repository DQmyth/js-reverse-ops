#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function usage() {
  console.error(
    'Usage: prepare_mcp_execution_record_template.js <workflow-mcp-execution-guide.json> [--output <file>]'
  );
  process.exit(1);
}

const args = process.argv.slice(2);
if (!args.length) usage();

const options = {
  guideJson: '',
  output: '',
};

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  const next = args[i + 1] || '';
  if (!options.guideJson) {
    options.guideJson = path.resolve(arg);
  } else if (arg === '--output') {
    options.output = path.resolve(next);
    i += 1;
  } else {
    usage();
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

const guide = readJson(options.guideJson);
const steps = Array.isArray(guide.steps) ? guide.steps : [];

const template = {
  generated_at: new Date().toISOString(),
  guide_json: options.guideJson,
  workflow_id: guide.workflow_id || null,
  target: guide.target || null,
  bundle_dir: guide.bundle_dir || null,
  current_maturity: guide.current_maturity || null,
  capability_dimensions: guide.capability_dimensions || {},
  capability_focus: guide.capability_focus || '',
  action_generation_summary: guide.action_generation_summary || '',
  policy_summary: guide.policy_summary || { status: 'none', reason: 'No policy summary available.' },
  run_status: 'not-started',
  step_results: steps.map((step) => ({
    step: step.step,
    group_id: step.group_id,
    adapter: step.invocation?.adapter || null,
    status: 'pending',
    started_at: null,
    finished_at: null,
    notes: '',
    observed_outputs: [],
  })),
};

if (options.output) {
  fs.writeFileSync(options.output, JSON.stringify(template, null, 2) + '\n', 'utf8');
}

console.log(JSON.stringify(template, null, 2));
