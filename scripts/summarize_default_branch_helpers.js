#!/usr/bin/env node
const fs = require('fs');

function usage() {
  console.error('Usage: summarize_default_branch_helpers.js <default-receiver-runtime.json> [--output <result.json>]');
  process.exit(1);
}

if (process.argv.length < 3) usage();

const args = process.argv.slice(2);
const inputPath = args[0];
let outputPath = '';

for (let i = 1; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--output') outputPath = args[++i] || '';
  else usage();
}

const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const samples = data.default_branch_samples || (data.default_branch_capture ? [data.default_branch_capture] : []);
const map = new Map();

for (const sample of samples) {
  const opcode = sample.opcode_value;
  if (typeof opcode !== 'number') continue;
  if (!map.has(opcode)) {
    map.set(opcode, {
      opcode_value: opcode,
      helper_label: sample.inferred_label || 'unknown-slot',
      receiver_previews: new Set(),
      count: 0,
      runtime_callable: true,
      argI_types: new Set()
    });
  }
  const entry = map.get(opcode);
  entry.count += 1;
  if (sample.receiver_preview) entry.receiver_previews.add(sample.receiver_preview);
  entry.runtime_callable = entry.runtime_callable && Boolean(sample.runtime_callable);
  if (sample.argI_type) entry.argI_types.add(sample.argI_type);
}

const helper_map = Array.from(map.values())
  .sort((a, b) => a.opcode_value - b.opcode_value)
  .map((entry) => ({
    opcode_value: entry.opcode_value,
    helper_label: entry.helper_label,
    count: entry.count,
    receiver_previews: Array.from(entry.receiver_previews),
    argI_types: Array.from(entry.argI_types),
    runtime_callable: entry.runtime_callable
  }));

const result = {
  input: inputPath,
  source: data.source || inputPath,
  inferred: {
    sample_count: samples.length,
    distinct_opcode_count: helper_map.length,
    all_runtime_callable: helper_map.every((entry) => entry.runtime_callable)
  },
  helper_map,
  recommendations: [
    'Use this map as the runtime-backed default-branch opcode table before assigning business semantics to helper slots.',
    'If new opcodes appear later, append more paused-frame samples and rerun this summary instead of editing labels by hand.',
    'Compare helper_map with slot simulation so runtime-backed opcodes and bootstrap slot labels stay aligned.'
  ]
};

if (outputPath) fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
