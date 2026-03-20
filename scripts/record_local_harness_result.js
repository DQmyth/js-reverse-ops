#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function usage() {
  console.error(
    'Usage: record_local_harness_result.js <local-harness-plan.json> <local-harness-result-template-or-json> [--output-json <file>] [--output-md <file>]'
  );
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.length < 2) usage();

const options = {
  planJson: path.resolve(args[0]),
  resultJson: path.resolve(args[1]),
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

const plan = readJson(options.planJson);
const raw = readJson(options.resultJson);
const rawSteps = Array.isArray(raw.step_results) ? raw.step_results : [];
const stepById = new Map(rawSteps.map((item) => [String(item.id || item.step), item]));

const normalizedSteps = (plan.steps || []).map((step) => {
  const source = stepById.get(String(step.id)) || stepById.get(String(step.step)) || {};
  return {
    step: step.step,
    id: step.id,
    stage: step.stage,
    status: source.status || 'pending',
    notes: source.notes || '',
    observed_outputs: Array.isArray(source.observed_outputs) ? source.observed_outputs : [],
  };
});

let runStatus = raw.run_status || 'not-started';
if (!normalizedSteps.length) {
  runStatus = 'not-started';
} else if (normalizedSteps.some((step) => step.status === 'failed')) {
  runStatus = 'failed';
} else if (normalizedSteps.every((step) => step.status === 'completed')) {
  runStatus = 'completed';
} else if (normalizedSteps.some((step) => step.status === 'completed' || step.status === 'in-progress')) {
  runStatus = 'in-progress';
} else {
  runStatus = 'not-started';
}

const output = {
  captured_at: raw.captured_at || new Date().toISOString(),
  synthetic: false,
  local_harness: true,
  archival_public: false,
  workflow_id: plan.workflow_id || 'minimal-local-harness',
  bundle_dir: plan.bundle_dir || null,
  run_status: runStatus,
  challenge: {
    type: ((raw.challenge || {}).type) || 'challenge-success-reconstruction',
    success_signal: ((raw.challenge || {}).success_signal) || null,
    password: ((raw.challenge || {}).password) || null,
    target_host: ((raw.challenge || {}).target_host) || null,
  },
  evidence: {
    plan_json: options.planJson,
    writeup_facts: ((raw.evidence || {}).writeup_facts) || null,
    source_snapshot: ((raw.evidence || {}).source_snapshot) || null,
    harness_entrypoint: ((raw.evidence || {}).harness_entrypoint) || null,
    local_fixture: ((raw.evidence || {}).local_fixture) || null,
  },
  step_results: normalizedSteps,
  notes: Array.isArray(raw.notes) ? raw.notes : [],
};

if (!output.evidence.writeup_facts && plan && plan.preserved_anchors) {
  output.evidence.writeup_facts = 'public-writeup-facts-preserved';
}

if (options.outputJson) fs.writeFileSync(options.outputJson, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
if (options.outputMd) {
  const lines = [
    '# Local Harness Result',
    '',
    `- workflow_id: ${output.workflow_id}`,
    `- bundle_dir: ${output.bundle_dir || 'none'}`,
    `- run_status: ${output.run_status}`,
    `- local_harness: ${output.local_harness}`,
    `- challenge_type: ${output.challenge.type || 'none'}`,
    `- success_signal: ${output.challenge.success_signal || 'none'}`,
    `- password: ${output.challenge.password || 'none'}`,
    '',
    '## Steps',
    '',
    ...(normalizedSteps.length
      ? normalizedSteps.map((step) => `- Step ${step.step} (${step.id}): ${step.status}${step.notes ? ` - ${step.notes}` : ''}`)
      : ['- none']),
    '',
    '## Notes',
    '',
    ...((output.notes.length ? output.notes : ['- none']).map((item) => item.startsWith('- ') ? item : `- ${item}`)),
  ];
  fs.writeFileSync(options.outputMd, `${lines.join('\n')}\n`, 'utf8');
}

console.log(JSON.stringify(output, null, 2));
