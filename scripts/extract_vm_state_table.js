#!/usr/bin/env node
const fs = require('fs');

function usage() {
  console.error('Usage: extract_vm_state_table.js <input.js-or-json> [--output <result.json>]');
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

function uniq(items) {
  return [...new Set(items)];
}

function readTarget(inputPath) {
  if (!inputPath.endsWith('.json')) return { source: inputPath, text: fs.readFileSync(inputPath, 'utf8') };
  const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const text =
    (data.excerpts && (
      data.excerpts.payload_excerpt ||
      data.excerpts.decoded_head ||
      data.excerpts.Q_dispatcher ||
      data.excerpts.q_dispatcher ||
      data.excerpts.wrapper_head
    )) || '';
  return { source: data.source || data.target || inputPath, text };
}

function excerptAround(text, idx, radius = 260) {
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + radius);
  return text.slice(start, end);
}

const { source, text } = readTarget(input);

const pipeStates = uniq([...text.matchAll(/['"]([0-9]+(?:\|[0-9]+){2,})['"]/g)].map((m) => m[1])).slice(0, 40);
const numericLadders = uniq([...text.matchAll(/(?:\b\d+\b(?:\s*,\s*\b\d+\b){3,})/g)].map((m) => m[0])).slice(0, 40);
const bitmaskBranches = [];
for (const m of text.matchAll(/([0-9]+|[_$A-Za-z][_$A-Za-z0-9]*)\s*&\s*([0-9]+|[_$A-Za-z][_$A-Za-z0-9]*)/g)) {
  bitmaskBranches.push(m[0]);
  if (bitmaskBranches.length >= 30) break;
}
const jumpAssignments = [];
for (const m of text.matchAll(/([_$A-Za-z][_$A-Za-z0-9]*)\[[^\]]+\]\s*=\s*([_$A-Za-z][_$A-Za-z0-9]*|\{)/g)) {
  jumpAssignments.push({
    pattern: m[0],
    excerpt: excerptAround(text, m.index || 0)
  });
  if (jumpAssignments.length >= 12) break;
}

const result = {
  input,
  source,
  inferred: {
    pipe_state_count: pipeStates.length,
    numeric_ladder_count: numericLadders.length,
    bitmask_branch_count: bitmaskBranches.length,
    jump_assignment_count: jumpAssignments.length
  },
  state_tables: {
    pipe_states: pipeStates,
    numeric_ladders: numericLadders,
    bitmask_branches: bitmaskBranches,
    jump_assignments: jumpAssignments
  },
  recommendations: [
    'Use pipe_states as candidate dispatcher order strings or stage schedules.',
    'Use bitmask_branches to find flag-decoding and switchless dispatch logic.',
    'Use jump_assignments to anchor object-backed jump tables before AST transforms.'
  ]
};

if (outputPath) fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
