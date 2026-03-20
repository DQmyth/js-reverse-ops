#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function usage() {
  console.error(
    'Usage: prepare_local_harness_plan.js <bundle-dir> [--output-json <file>] [--output-md <file>] [--result-template <file>]'
  );
  process.exit(1);
}

const args = process.argv.slice(2);
if (!args.length) usage();

const options = {
  bundleDir: '',
  outputJson: '',
  outputMd: '',
  resultTemplate: '',
};

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  const next = args[i + 1] || '';
  if (!options.bundleDir) {
    options.bundleDir = path.resolve(arg);
  } else if (arg === '--output-json') {
    options.outputJson = path.resolve(next);
    i += 1;
  } else if (arg === '--output-md') {
    options.outputMd = path.resolve(next);
    i += 1;
  } else if (arg === '--result-template') {
    options.resultTemplate = path.resolve(next);
    i += 1;
  } else {
    usage();
  }
}

if (!options.bundleDir) usage();

function readJsonIfExists(filePath, fallback = {}) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : fallback;
}

const bundleDir = options.bundleDir;
const evidence = readJsonIfExists(path.join(bundleDir, 'evidence.json'));
const maturity = readJsonIfExists(path.join(bundleDir, 'maturity-summary.json'));
const task = readJsonIfExists(path.join(bundleDir, 'task.json'));
const publicFacts = evidence.public_writeup_facts || {};
const staticAnalysis = evidence.static_analysis || {};
const stack = (publicFacts.stack || []).map((item) => String(item));
const criticalPaths = (publicFacts.critical_paths || []).map((item) => String(item));

const harnessType =
  stack.map((item) => item.toLowerCase()).includes('webassembly')
    ? 'browser-wasm-local-harness'
    : 'browser-local-harness';
const successSignalHint = criticalPaths.find((item) => /challenge-success|checkflag|success/i.test(item)) || null;

const steps = [
  {
    step: 1,
    id: 'preserve-entry-surface',
    stage: 'source',
    status: 'pending',
    description: 'Preserve the minimal entry HTML, loader, or inline script surface needed to exercise the challenge locally.',
  },
  {
    step: 2,
    id: 'define-input-surface',
    stage: 'recover',
    status: 'pending',
    description: 'Define the smallest local input surface that can reach the preserved challenge logic.',
  },
  {
    step: 3,
    id: 'define-success-signal',
    stage: 'recover',
    status: 'pending',
    description: 'Define an explicit local-only success signal before executing the harness.',
  },
  {
    step: 4,
    id: 'execute-local-harness',
    stage: 'evidence',
    status: 'pending',
    description: 'Execute the harness and capture the observed success signal or failure mode.',
  },
  {
    step: 5,
    id: 'record-proof-boundary',
    stage: 'verify',
    status: 'pending',
    description: 'Record the result as local-only proof and keep it separate from live parity or replay verification.',
  },
];

const plan = {
  generated_at: new Date().toISOString(),
  workflow_id: 'minimal-local-harness',
  bundle_dir: bundleDir,
  target: task.target_url || null,
  current_maturity: maturity.maturity || evidence.status || 'unknown',
  capability_dimensions: maturity.capability_dimensions || {},
  harness_type: harnessType,
  source_kind: publicFacts.source || null,
  preserved_anchors: {
    stack,
    critical_paths: criticalPaths,
    static_families: staticAnalysis.families || [],
    static_module_hints: staticAnalysis.module_hints || [],
  },
  success_signal_hint: successSignalHint,
  recommendation:
    'Use the smallest possible local harness to exercise preserved challenge logic, then ingest the result as local_harness challenge-success if it succeeds.',
  steps,
  result_template: options.resultTemplate || null,
};

const resultTemplate = {
  generated_at: new Date().toISOString(),
  plan_json: options.outputJson || null,
  workflow_id: 'minimal-local-harness',
  bundle_dir: bundleDir,
  run_status: 'not-started',
  synthetic: false,
  local_harness: true,
  archival_public: false,
  challenge: {
    type: successSignalHint ? 'challenge-success-reconstruction' : 'local-harness-check',
    success_signal: null,
    password: null,
    target_host: null,
  },
  evidence: {
    plan_json: options.outputJson || null,
    writeup_facts: publicFacts.artifact || null,
    source_snapshot: (evidence.source_snapshot || {}).imported_count ? 'source-snapshot-available' : null,
    harness_entrypoint: null,
    local_fixture: null,
  },
  step_results: steps.map((step) => ({
    step: step.step,
    id: step.id,
    stage: step.stage,
    status: 'pending',
    notes: '',
    observed_outputs: [],
  })),
  notes: [
    'This template is for local-harness proof only.',
    'Do not promote local harness output to live parity or replay verification without a surviving accepted remote path.',
  ],
};

if (options.outputJson) fs.writeFileSync(options.outputJson, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
if (options.outputMd) {
  const lines = [
    '# Local Harness Plan',
    '',
    `- workflow_id: ${plan.workflow_id}`,
    `- bundle_dir: ${plan.bundle_dir}`,
    `- target: ${plan.target || 'none'}`,
    `- current_maturity: ${plan.current_maturity}`,
    `- harness_type: ${plan.harness_type}`,
    `- success_signal_hint: ${plan.success_signal_hint || 'none'}`,
    '',
    '## Preserved Anchors',
    '',
    `- stack: ${plan.preserved_anchors.stack.join(', ') || 'none'}`,
    `- critical_paths: ${plan.preserved_anchors.critical_paths.join(', ') || 'none'}`,
    `- static_families: ${plan.preserved_anchors.static_families.join(', ') || 'none'}`,
    `- static_module_hints: ${plan.preserved_anchors.static_module_hints.join(', ') || 'none'}`,
    '',
    '## Steps',
    '',
    ...steps.map((step) => `- [${step.stage}] ${step.description}`),
    '',
    `Recommendation: ${plan.recommendation}`,
  ];
  fs.writeFileSync(options.outputMd, `${lines.join('\n')}\n`, 'utf8');
}
if (options.resultTemplate) {
  fs.writeFileSync(options.resultTemplate, `${JSON.stringify(resultTemplate, null, 2)}\n`, 'utf8');
}

console.log(JSON.stringify({
  bundle_dir: bundleDir,
  workflow_id: plan.workflow_id,
  files: [
    options.outputJson ? path.basename(options.outputJson) : null,
    options.outputMd ? path.basename(options.outputMd) : null,
    options.resultTemplate ? path.basename(options.resultTemplate) : null,
  ].filter(Boolean),
}, null, 2));
