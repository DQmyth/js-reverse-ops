#!/usr/bin/env node
const fs = require('fs');

function usage() {
  console.error('Usage: label_vm_semantics.js <dispatcher.json> [--output <result.json>]');
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

function safeReadJson(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_err) {
    return null;
  }
}

function siblingJson(inputPath, currentSuffix, nextSuffix) {
  if (!inputPath.endsWith('.json')) return '';
  return inputPath.replace(currentSuffix, nextSuffix);
}

function applyLabels(text, labelMap) {
  let out = text;
  for (const entry of labelMap) {
    if (!entry.pattern || !entry.label) continue;
    out = out.split(entry.pattern).join(`[${entry.label}:${entry.pattern}]`);
  }
  return out;
}

const dispatcher = safeReadJson(input);
if (!dispatcher) usage();

const opcodePath = siblingJson(input, 'second-stage-dispatcher.json', 'vm-opcode-semantics.json');
const augmentedOpcodePath = siblingJson(input, 'second-stage-dispatcher.json', 'vm-opcode-semantics-augmented.json');
const provenancePath = siblingJson(input, 'second-stage-dispatcher.json', 'vm-object-provenance.json');
const opcode = safeReadJson(augmentedOpcodePath) || safeReadJson(opcodePath) || {};
const provenance = safeReadJson(provenancePath) || {};

const qDispatcher = (((dispatcher.excerpts || {}).q_dispatcher) || '');
const QDispatcher = (((dispatcher.excerpts || {}).Q_dispatcher) || '');
const labelMap = [
  { pattern: 't[l]=p', label: 'TABLE_REGISTRATION' },
  { pattern: 'Q[1]=', label: 'FLAG1_SCALAR_SLOT' },
  { pattern: 'Q[2]=[', label: 'FLAG2_PAIR_SLOT' },
  { pattern: 'Q[3]=[', label: 'FLAG4_RAW_PAIR_SLOT' },
  { pattern: 'String.fromCharCode', label: 'STRING_DECODE' },
  { pattern: 'JSON.stringify', label: 'SERIALIZE' },
  { pattern: 'Z.$[1][Z.$[0]]', label: 'CALL_TRAMPOLINE' },
  { pattern: 'Z.bind', label: 'BIND_SLOT' },
  { pattern: 'Z.apply', label: 'APPLY_SLOT' },
  { pattern: 'Z.call', label: 'CALL_SLOT' }
];

for (const entry of ((opcode.runtime_default_branch_table || []))) {
  if (typeof entry.opcode_value !== 'number' || !entry.helper_label) continue;
  const label = `DEFAULT_BRANCH_OPCODE_${entry.opcode_value}_${String(entry.helper_label).toUpperCase().replace(/-/g, '_')}`;
  const pattern = `Z.$[${entry.opcode_value}]`;
  if (labelMap.some((item) => item.pattern === pattern)) continue;
  labelMap.push({ pattern, label });
}

for (const slot of (provenance.slots || [])) {
  if (!slot.expression || !slot.label) continue;
  if (labelMap.some((entry) => entry.pattern === slot.expression)) continue;
  labelMap.push({
    pattern: slot.expression,
    label: slot.label.toUpperCase().replace(/-/g, '_')
  });
}

const result = {
  input,
  source: dispatcher.source || input,
  supporting_inputs: {
    opcode_semantics: augmentedOpcodePath || opcodePath || null,
    object_provenance: provenancePath || null
  },
  inferred: {
    label_count: labelMap.length,
    opcode_family_count: (((opcode.inferred || {}).opcode_family_count) || ((opcode.opcode_families || []).length) || 0),
    has_bootstrap_labels: Boolean((provenance.inferred || {}).has_bootstrap_array),
    runtime_default_helper_count: ((opcode.runtime_default_branch_table || []).length || 0)
  },
  label_map: labelMap,
  labeled_excerpts: {
    Q_dispatcher: applyLabels(QDispatcher.slice(0, 2200), labelMap),
    q_dispatcher: applyLabels(qDispatcher.slice(0, 1800), labelMap)
  },
  recommendations: [
    'Use labeled_excerpts as the default reading view before manual renaming.',
    'Promote stable labels into AST transforms only after they survive runtime comparison.',
    'If a label still feels ambiguous, compare it against request-neighborhood evidence instead of forcing a rename.'
  ]
};

if (outputPath) fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
