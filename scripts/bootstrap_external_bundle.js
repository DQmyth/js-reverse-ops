#!/usr/bin/env node
const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

function usage() {
  console.error(
    'Usage: bootstrap_external_bundle.js --sample-dir <dir> [--bundle-name <name>] [--output-dir <dir>]'
  );
  process.exit(1);
}

const args = process.argv.slice(2);
if (!args.length) usage();

const options = {
  sampleDir: '',
  bundleName: 'baseline',
  outputDir: '',
};

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  const next = args[i + 1] || '';
  if (arg === '--sample-dir') {
    options.sampleDir = path.resolve(next);
    i += 1;
  } else if (arg === '--bundle-name') {
    options.bundleName = next;
    i += 1;
  } else if (arg === '--output-dir') {
    options.outputDir = path.resolve(next);
    i += 1;
  } else {
    usage();
  }
}

if (!options.sampleDir) usage();

const taskPath = path.join(options.sampleDir, 'task.json');
const sourcePath = path.join(options.sampleDir, 'external-source.json');
const notesPath = path.join(options.sampleDir, 'import-notes.md');

if (!fs.existsSync(taskPath) || !fs.existsSync(sourcePath)) {
  console.error(`Sample scaffold incomplete: ${options.sampleDir}`);
  process.exit(1);
}

const task = JSON.parse(fs.readFileSync(taskPath, 'utf8'));
const externalSource = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const sample = externalSource.sample || {};

const outputDir =
  options.outputDir || path.join(options.sampleDir, 'bundles', options.bundleName);
fs.mkdirSync(outputDir, { recursive: true });

function writeJson(fileName, data) {
  const filePath = path.join(outputDir, fileName);
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return filePath;
}

function writeText(fileName, content) {
  const filePath = path.join(outputDir, fileName);
  fs.writeFileSync(filePath, `${content}\n`, 'utf8');
  return filePath;
}

const bundleTask = {
  ...task,
  artifacts: [
    ...(Array.isArray(task.artifacts) ? task.artifacts : []),
    'external-source.json',
    'import-notes.md',
  ].filter((value, index, list) => list.indexOf(value) === index),
  unknowns: [
    ...(Array.isArray(task.unknowns) ? task.unknowns : []),
    'baseline bundle bootstrapped from external sample scaffold',
  ].filter((value, index, list) => list.indexOf(value) === index),
};

const evidence = {
  page_url: task.target_url || sample.source_url || '',
  protected_request: null,
  source_type: sample.source_type || 'external-sample',
  benchmark_sample: {
    id: sample.id || '',
    label: sample.label || '',
    family: sample.family || '',
    subfamily: sample.subfamily || '',
  },
  status: 'bootstrap-only',
  notes: [
    'No live runtime evidence has been captured yet.',
    'This bundle establishes the standard artifact contract for an external sample.',
  ],
};

const familyDecision = {
  family: sample.family || task.task_type || 'unknown',
  subfamily: sample.subfamily || 'unknown',
  confidence: 'inferred',
  evidence: [
    'external corpus manifest metadata',
    'sample scaffold task.json',
  ],
  next_steps: [
    'capture real source or runtime artifacts',
    'replace bootstrap-only evidence with verified findings',
  ],
};

const claimSet = {
  sample_id: sample.id || '',
  overall_status: 'bootstrap-only',
  claims: [
    {
      id: 'external-family-classification',
      status: 'inferred',
      strength: 'medium',
      statement: `Sample is classified as ${sample.family || task.task_type || 'unknown'} / ${sample.subfamily || 'unknown'}.`,
      evidence_sources: ['external-source.json', 'task.json'],
    },
    {
      id: 'external-bundle-not-yet-verified',
      status: 'verified',
      strength: 'high',
      statement: 'No live runtime evidence has been captured for this external sample bundle yet.',
      evidence_sources: ['task.json', 'evidence.json'],
    },
  ],
};

const riskSummary = {
  sample_id: sample.id || '',
  overall_risk: 'medium',
  labels: ['external-sample', 'bootstrap-only', 'runtime-evidence-missing'],
  items: [
    {
      id: 'runtime-evidence-missing',
      severity: 'medium',
      summary: 'Bundle does not yet contain verified runtime or static reverse evidence.',
      mitigation: 'Capture source snapshot, runtime evidence, or replay material before promoting conclusions.',
    },
  ],
};

const provenanceGraph = {
  sample_id: sample.id || '',
  status: 'bootstrap-only',
  nodes: [
    {
      id: 'sample',
      type: 'external-sample',
      label: sample.label || sample.id || 'external sample',
      data: {
        family: sample.family || '',
        subfamily: sample.subfamily || '',
        source_url: sample.source_url || task.target_url || '',
      },
    },
    {
      id: 'task',
      type: 'task',
      label: 'task.json',
      data: {
        task_type: task.task_type || '',
        target_url: task.target_url || '',
      },
    },
  ],
  edges: [
    {
      from: 'sample',
      to: 'task',
      type: 'describes',
      confidence: 'high',
    },
  ],
};

const provenanceSummary = [
  `# Provenance Summary: ${sample.label || sample.id || path.basename(options.sampleDir)}`,
  '',
  `- status: bootstrap-only`,
  `- family: ${sample.family || task.task_type || 'unknown'}`,
  `- subfamily: ${sample.subfamily || 'unknown'}`,
  `- source_url: ${sample.source_url || task.target_url || 'unknown'}`,
  '',
  'This bundle currently contains only scaffold-derived provenance. Add runtime captures, paused-frame locals, or source artifacts to promote this into a verified reverse bundle.',
].join('\n');

const operatorReview = [
  `# Operator Review: ${sample.label || sample.id || path.basename(options.sampleDir)}`,
  '',
  '## Current State',
  '',
  '- bundle is structurally complete but evidence-light',
  '- family classification comes from the external corpus manifest',
  '- no verified protected request or cookie/signature generation chain yet',
  '',
  '## Next Actions',
  '',
  '- import source snapshot or repository files into `artifacts/original/`',
  '- capture runtime evidence or static analysis outputs',
  '- regenerate claim, risk, and provenance artifacts with real evidence',
].join('\n');

const report = [
  `# External Bundle Report: ${sample.label || sample.id || path.basename(options.sampleDir)}`,
  '',
  'This is a bootstrap bundle created from the external sample scaffold. It should be treated as the starting point for reverse work, not as a solved sample.',
].join('\n');

const notes = [
  `# Notes: ${sample.label || sample.id || path.basename(options.sampleDir)}`,
  '',
  `- source_url: ${sample.source_url || task.target_url || 'unknown'}`,
  `- bundle_name: ${options.bundleName}`,
  '- bootstrap created before any live runtime capture',
].join('\n');

const generated = {
  taskJson: writeJson('task.json', bundleTask),
  evidenceJson: writeJson('evidence.json', evidence),
  familyDecisionJson: writeJson('family-decision.json', familyDecision),
  claimSetJson: writeJson('claim-set.json', claimSet),
  riskSummaryJson: writeJson('risk-summary.json', riskSummary),
  provenanceGraphJson: writeJson('provenance-graph.json', provenanceGraph),
  provenanceSummaryMd: writeText('provenance-summary.md', provenanceSummary),
  operatorReviewMd: writeText('operator-review.md', operatorReview),
  reportMd: writeText('report.md', report),
  notesMd: writeText('notes.md', notes),
};

const normalizeScript = path.resolve(__dirname, 'normalize_task_artifacts.js');
const normalizeArgs = [
  normalizeScript,
  '--output-dir',
  outputDir,
  '--task-json',
  generated.taskJson,
  '--evidence-json',
  generated.evidenceJson,
  '--report-md',
  generated.reportMd,
  '--notes-md',
  generated.notesMd,
  '--family-decision-json',
  generated.familyDecisionJson,
  '--claim-set-json',
  generated.claimSetJson,
  '--risk-summary-json',
  generated.riskSummaryJson,
  '--provenance-graph-json',
  generated.provenanceGraphJson,
  '--provenance-summary-md',
  generated.provenanceSummaryMd,
  '--operator-review-md',
  generated.operatorReviewMd,
  '--original',
  taskPath,
  '--original',
  sourcePath,
];

if (fs.existsSync(notesPath)) {
  normalizeArgs.push('--original', notesPath);
}

const result = childProcess.spawnSync(process.execPath, normalizeArgs, { encoding: 'utf8' });
if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || 'normalize_task_artifacts failed\n');
  process.exit(result.status || 1);
}

console.log(JSON.stringify({
  sample_dir: options.sampleDir,
  bundle_name: options.bundleName,
  output_dir: outputDir,
  files: Object.values(generated).map((file) => path.relative(outputDir, file)),
}, null, 2));
