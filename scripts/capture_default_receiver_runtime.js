#!/usr/bin/env node
const fs = require('fs');

function usage() {
  console.error('Usage: capture_default_receiver_runtime.js <callframe-result.json> [--source <source.js>] [--url <script-url>] [--line <n>] [--column <n>] [--frame <n>] [--output <result.json>]');
  process.exit(1);
}

if (process.argv.length < 3) usage();

const args = process.argv.slice(2);
const inputPath = args[0];
let source = inputPath;
let url = '';
let line = 0;
let column = 0;
let frame = 0;
let outputPath = '';

for (let i = 1; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--source') source = args[++i] || source;
  else if (arg === '--url') url = args[++i] || '';
  else if (arg === '--line') line = Number(args[++i] || 0);
  else if (arg === '--column') column = Number(args[++i] || 0);
  else if (arg === '--frame') frame = Number(args[++i] || 0);
  else if (arg === '--output') outputPath = args[++i] || '';
  else usage();
}

const raw = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

const labelByOpcode = {
  2: 'apply-function',
  3: 'array-push',
  4: 'array-pop',
  5: 'array-concat',
  6: 'array-slice',
  7: 'bind-function',
  8: 'dispatch-adapter'
};

function normalizeCapture(item) {
  const opcode = typeof item.opcode === 'number' ? item.opcode : null;
  return {
    opcode_value: opcode,
    receiver_type: item.receiverType || null,
    receiver_preview: item.receiverString || null,
    dispatch_key: item.dispatchKey || null,
    trampoline_type: item.trampolineType || null,
    trampoline_preview: item.trampolineString || null,
    resolved_type: item.resolvedType || null,
    resolved_preview: item.resolvedString || null,
    argG_type: item.argGType || null,
    argI_type: item.argIType || null,
    inferred_label: opcode === null ? null : (labelByOpcode[opcode] || 'unknown-slot'),
    runtime_callable: item.receiverType === 'function' && item.resolvedType === 'function'
  };
}

const samples = Array.isArray(raw) ? raw.map(normalizeCapture) : [normalizeCapture(raw)];
const primary = samples[0] || null;
const distinctOpcodes = Array.from(new Set(samples.map((sample) => sample.opcode_value).filter((value) => typeof value === 'number')));

const result = {
  source,
  breakpoint: {
    url,
    line,
    column,
    frame
  },
  default_branch_capture: primary,
  default_branch_samples: samples,
  inferred: {
    default_branch_resolves_to_slot: primary ? primary.opcode_value : null,
    default_branch_label: primary ? primary.inferred_label : null,
    default_branch_runtime_callable: primary ? primary.runtime_callable : false,
    sample_count: samples.length,
    distinct_default_branch_slots: distinctOpcodes
  }
};

if (outputPath) fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
