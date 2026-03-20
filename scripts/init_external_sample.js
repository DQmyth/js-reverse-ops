#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function usage() {
  console.error(
    'Usage: init_external_sample.js --id <sample-id> [--manifest <external-corpus-manifest.json>] [--output-root <dir>]'
  );
  process.exit(1);
}

const args = process.argv.slice(2);
if (!args.length) usage();

const options = {
  id: '',
  manifest: path.resolve(__dirname, '..', 'references', 'external-corpus-manifest.json'),
  outputRoot: path.resolve(__dirname, '..', 'tmp_cases', 'external'),
};

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  const next = args[i + 1] || '';
  if (arg === '--id') {
    options.id = next;
    i += 1;
  } else if (arg === '--manifest') {
    options.manifest = path.resolve(next);
    i += 1;
  } else if (arg === '--output-root') {
    options.outputRoot = path.resolve(next);
    i += 1;
  } else {
    usage();
  }
}

if (!options.id) usage();

const manifest = JSON.parse(fs.readFileSync(options.manifest, 'utf8'));
const sample = (manifest.samples || []).find((item) => item.id === options.id);
if (!sample) {
  console.error(`Sample not found: ${options.id}`);
  process.exit(1);
}

const templatePath = path.resolve(__dirname, '..', 'assets', 'reverse-task-template.json');
const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
const outputDir = path.join(options.outputRoot, options.id);

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

ensureDir(outputDir);
ensureDir(path.join(outputDir, 'artifacts', 'original'));
ensureDir(path.join(outputDir, 'artifacts', 'derived'));
ensureDir(path.join(outputDir, 'artifacts', 'evidence'));

const sourceUrl = sample.source_url || '';
let baseUrl = sourceUrl;
let routePath = '';
try {
  const parsed = new URL(sourceUrl);
  baseUrl = `${parsed.protocol}//${parsed.host}`;
  routePath = parsed.pathname || '/';
} catch {}

const task = {
  ...template,
  title: sample.label || sample.id,
  task_type: sample.family || template.task_type,
  target_url: sourceUrl,
  target_action: `initialize external benchmark sample ${sample.id}`,
  base_url: baseUrl,
  path: routePath || template.path,
  method: null,
  sample_payload: {},
  risk_labels: [],
  verified_findings: [],
  inferred_findings: [
    `external sample family: ${sample.family || 'unknown'}`,
    `external sample subfamily: ${sample.subfamily || 'unknown'}`,
    `expected signals: ${(sample.expected_signals || []).join(', ') || 'none'}`,
  ],
  unknowns: [
    'no local runtime evidence captured yet',
    'bundle artifacts not generated yet',
  ],
  validation: [],
  artifacts: [
    'external-source.json',
    'import-notes.md',
  ],
};

const externalSource = {
  source_manifest: options.manifest,
  sample,
};

const importNotes = [
  `# ${sample.label || sample.id}`,
  '',
  '## Source',
  '',
  `- source_url: ${sample.source_url || 'unknown'}`,
  `- family: ${sample.family || 'unknown'}`,
  `- subfamily: ${sample.subfamily || 'unknown'}`,
  `- status: ${sample.status || 'unknown'}`,
  '',
  '## Benchmark Goals',
  '',
  ...((sample.benchmark_goals || []).length
    ? sample.benchmark_goals.map((item) => `- ${item}`)
    : ['- none']),
  '',
  '## Next Steps',
  '',
  '- capture the real entry page or repository snapshot',
  '- create the first runtime or static evidence bundle',
  '- update the external corpus manifest when the sample is actually validated',
  '',
].join('\n');

const artifactIndex = {
  output_dir: outputDir,
  root_files: [
    path.join(outputDir, 'task.json'),
    path.join(outputDir, 'external-source.json'),
    path.join(outputDir, 'import-notes.md'),
  ],
  groups: {
    original: [],
    derived: [],
    evidence: [],
  },
};

fs.writeFileSync(path.join(outputDir, 'task.json'), `${JSON.stringify(task, null, 2)}\n`, 'utf8');
fs.writeFileSync(path.join(outputDir, 'external-source.json'), `${JSON.stringify(externalSource, null, 2)}\n`, 'utf8');
fs.writeFileSync(path.join(outputDir, 'import-notes.md'), `${importNotes}\n`, 'utf8');
fs.writeFileSync(path.join(outputDir, 'artifact-index.json'), `${JSON.stringify(artifactIndex, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  id: sample.id,
  output_dir: outputDir,
  files: ['task.json', 'external-source.json', 'import-notes.md', 'artifact-index.json'],
}, null, 2));
