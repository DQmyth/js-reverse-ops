#!/usr/bin/env node
const fs = require('fs');

function usage() {
  console.error('Usage: augment_vm_opcode_semantics.js <vm-opcode-semantics.json> <default-branch-helper-map.json> [--output <result.json>]');
  process.exit(1);
}

if (process.argv.length < 4) usage();

const args = process.argv.slice(2);
const semanticsPath = args[0];
const helperMapPath = args[1];
let outputPath = '';

for (let i = 2; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--output') outputPath = args[++i] || '';
  else usage();
}

const semantics = JSON.parse(fs.readFileSync(semanticsPath, 'utf8'));
const helperMap = JSON.parse(fs.readFileSync(helperMapPath, 'utf8'));

const runtimeFamilies = (helperMap.helper_map || []).map((entry) => ({
  family: `default-branch-${entry.helper_label}`,
  confidence: entry.runtime_callable ? 'high' : 'medium',
  evidence: `opcode ${entry.opcode_value} -> ${entry.helper_label}`,
  meaning: `runtime capture shows the default adapter branch can resolve opcode ${entry.opcode_value} to ${entry.helper_label}`,
  runtime_samples: entry.count
}));

const opcodeToHelper = (helperMap.helper_map || []).map((entry) => ({
  opcode_value: entry.opcode_value,
  helper_label: entry.helper_label,
  count: entry.count,
  runtime_callable: entry.runtime_callable,
  argI_types: entry.argI_types || [],
  receiver_previews: entry.receiver_previews || []
}));

const result = {
  input: {
    semantics: semanticsPath,
    helper_map: helperMapPath
  },
  source: semantics.source || helperMap.source || semanticsPath,
  supporting_inputs: {
    opcode_semantics: semanticsPath,
    default_branch_helper_map: helperMapPath
  },
  inferred: {
    likely_vm_family: ((semantics.inferred || {}).likely_vm_family) || 'unknown',
    static_opcode_family_count: ((semantics.opcode_families || []).length),
    runtime_default_helper_count: opcodeToHelper.length
  },
  opcode_families: (semantics.opcode_families || []).concat(runtimeFamilies),
  branch_schema: semantics.branch_schema || [],
  runtime_default_branch_table: opcodeToHelper,
  summary_signals: (semantics.summary_signals || []).concat(
    opcodeToHelper.map((entry) => `default:${entry.opcode_value}->${entry.helper_label}`)
  ).slice(0, 24),
  recommendations: [
    'Read runtime_default_branch_table before assigning business semantics to the default adapter branch.',
    'If new default-branch opcodes appear, regenerate the helper map and rerun this augmentation instead of editing semantics manually.',
    'Use the merged opcode_families list as the runtime-backed starting point for VM renaming and opcode family clustering.'
  ]
};

if (outputPath) fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
