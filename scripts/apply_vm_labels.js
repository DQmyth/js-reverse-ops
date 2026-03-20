#!/usr/bin/env node
const fs = require('fs');

function usage() {
  console.error('Usage: apply_vm_labels.js <source.js> <labeled-semantics.json> [--output <labeled.js>]');
  process.exit(1);
}

if (process.argv.length < 4) usage();

const args = process.argv.slice(2);
const sourcePath = args[0];
const labelsPath = args[1];
let outputPath = '';

for (let i = 2; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--output') outputPath = args[++i] || '';
  else usage();
}

const source = fs.readFileSync(sourcePath, 'utf8');
const labelData = JSON.parse(fs.readFileSync(labelsPath, 'utf8'));
const labelMap = (labelData.label_map || []).slice().sort((a, b) => (b.pattern || '').length - (a.pattern || '').length);
const runtimeLabelCount = (labelData.label_map || []).filter((entry) => String(entry.label || '').startsWith('DEFAULT_BRANCH_OPCODE_')).length;

let labeled = source;
for (const entry of labelMap) {
  if (!entry.pattern || !entry.label) continue;
  labeled = labeled.split(entry.pattern).join(`/* ${entry.label} */ ${entry.pattern}`);
}

const result = {
  source: sourcePath,
  labels: labelMap.length,
  runtime_labels: runtimeLabelCount,
  output: outputPath || null
};

if (outputPath) {
  fs.writeFileSync(outputPath, labeled);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  process.stdout.write(labeled);
}
