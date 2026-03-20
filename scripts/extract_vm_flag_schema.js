#!/usr/bin/env node
const fs = require('fs');

function usage() {
  console.error('Usage: extract_vm_flag_schema.js <input.js-or-json> [--output <result.json>]');
  process.exit(1);
}

if (process.argv.length < 3) usage();

const args = process.argv.slice(2);
const input = args[0];
let outputPath = '';

for (let i = 1; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--output') outputPath = args[++i] || '';
  else usage();
}

function readTarget(inputPath) {
  if (!inputPath.endsWith('.json')) return { source: inputPath, text: fs.readFileSync(inputPath, 'utf8') };
  const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const text =
    (data.excerpts && (
      data.excerpts.Q_dispatcher ||
      data.excerpts.q_dispatcher ||
      data.excerpts.payload_excerpt ||
      data.excerpts.wrapper_head
    )) || '';
  return { source: data.source || data.target || inputPath, text };
}

function uniq(items) {
  return [...new Set(items)];
}

function excerptAround(text, idx, radius = 220) {
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + radius);
  return text.slice(start, end);
}

const { source, text } = readTarget(input);
const flags = [];
for (const m of text.matchAll(/(\d+)\s*&\s*([_$A-Za-z][_$A-Za-z0-9]*|\d+)/g)) {
  flags.push({
    bit: Number(m[1]),
    expression: m[0],
    excerpt: excerptAround(text, m.index || 0)
  });
}

const result = {
  input,
  source,
  inferred: {
    unique_flag_bits: uniq(flags.map((f) => f.bit)).sort((a, b) => a - b),
    flag_expression_count: flags.length
  },
  flags: flags.slice(0, 24),
  recommendations: [
    'Treat each bit as a candidate optional field or branch selector inside the VM.',
    'Correlate nearby excerpts with object writes and decoder calls to infer flag meaning.',
    'Use this after extract_vm_state_table.js so bits and jump assignments are read together.'
  ]
};

if (outputPath) fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
