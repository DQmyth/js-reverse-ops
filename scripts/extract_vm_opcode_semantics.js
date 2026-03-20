#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function usage() {
  console.error('Usage: extract_vm_opcode_semantics.js <dispatcher.json-or-source> [--output <result.json>]');
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

function uniq(items) {
  return [...new Set(items)];
}

const dispatcher = safeReadJson(input);
if (!dispatcher) usage();

const stateTablePath = siblingJson(input, 'second-stage-dispatcher.json', 'vm-state-table.json');
const flagSchemaPath = siblingJson(input, 'second-stage-dispatcher.json', 'vm-flag-schema.json');
const stringCorpusPath = siblingJson(input, 'second-stage-dispatcher.json', 'vm-string-corpus.json');
const stateTable = safeReadJson(stateTablePath) || {};
const flagSchema = safeReadJson(flagSchemaPath) || {};
const stringCorpus = safeReadJson(stringCorpusPath) || {};

const qDispatcher = (((dispatcher.excerpts || {}).q_dispatcher) || '');
const QDispatcher = (((dispatcher.excerpts || {}).Q_dispatcher) || '');
const xorDecoder = (((dispatcher.excerpts || {}).xor_decoder) || '');
const flagBits = (((flagSchema.inferred || {}).unique_flag_bits) || []).map(Number).sort((a, b) => a - b);
const jumpAssignments = ((((stateTable.state_tables || {}).jump_assignments) || []).map((item) => item.pattern));
const identifiers = (((stringCorpus.corpus || {}).identifiers) || []);
const quotedStrings = (((stringCorpus.corpus || {}).quoted_strings) || []);

const opcodeFamilies = [];

if (/t\[l\]\s*=\s*p/.test(QDispatcher)) {
  opcodeFamilies.push({
    family: 'table-registration',
    confidence: 'high',
    evidence: 't[l]=p',
    meaning: 'decoded arrays or handler groups are registered into an object-backed table before execution'
  });
}

if (/Q\[1\]\s*=/.test(QDispatcher) && flagBits.includes(1)) {
  opcodeFamilies.push({
    family: 'single-scalar-operand',
    confidence: 'high',
    evidence: '1&_ with Q[1]=...',
    meaning: 'bit 1 likely gates a single immediate operand or index field'
  });
}

if (/Q\[2\]\s*=\s*\[/.test(QDispatcher) && flagBits.includes(2)) {
  opcodeFamilies.push({
    family: 'paired-operand',
    confidence: 'high',
    evidence: '2&_ with Q[2]=[...]',
    meaning: 'bit 2 likely gates a pair of related operands such as bounds, tuple indexes, or source/target slots'
  });
}

if (/Q\[3\]\s*=\s*\[/.test(QDispatcher) && flagBits.includes(4)) {
  opcodeFamilies.push({
    family: 'raw-range-operand',
    confidence: 'medium',
    evidence: '4&_ with Q[3]=[...]',
    meaning: 'bit 4 likely gates a raw range or coordinate pair that skips the -1 normalization used by the other operands'
  });
}

if (/String\.fromCharCode|fromCharCode/.test(xorDecoder) && /charCodeAt/.test(xorDecoder)) {
  opcodeFamilies.push({
    family: 'string-decode',
    confidence: 'high',
    evidence: 'fromCharCode + charCodeAt',
    meaning: 'the VM includes a string reconstruction or XOR-based decode stage'
  });
}

if (/JSON\.stringify|stringify/.test(QDispatcher + xorDecoder) || identifiers.includes('stringify')) {
  opcodeFamilies.push({
    family: 'serialization',
    confidence: 'medium',
    evidence: 'JSON.stringify',
    meaning: 'the dispatcher can serialize structures or emit JSON-like payload fragments'
  });
}

if (/Math\.sin|sin/.test(QDispatcher + xorDecoder) || identifiers.includes('random')) {
  opcodeFamilies.push({
    family: 'entropy-or-noise',
    confidence: 'low',
    evidence: 'Math.sin or random markers',
    meaning: 'the packer likely uses pseudo-randomized scaffolding or numeric disguises around the dispatch core'
  });
}

const branchSchema = flagBits.map((bit) => {
  if (bit === 1) {
    return {
      bit,
      role: 'optional scalar operand',
      evidence: 'Q[1]=s[a](o,u++)-1'
    };
  }
  if (bit === 2) {
    return {
      bit,
      role: 'optional operand pair',
      evidence: 'Q[2]=[s[a](o,u++)-1-1,s[a](o,u++)-1-1]'
    };
  }
  if (bit === 4) {
    return {
      bit,
      role: 'optional raw pair',
      evidence: 'Q[3]=[s[a](o,u++)-1,s[a](o,u++)-1]'
    };
  }
  return {
    bit,
    role: 'unknown',
    evidence: ''
  };
});

const summarySignals = uniq([
  ...((((dispatcher.inferred || {}).dispatcher_signals) || [])),
  ...quotedStrings.slice(0, 8),
  ...jumpAssignments.slice(0, 4)
]).slice(0, 16);

const result = {
  input,
  source: dispatcher.source || input,
  supporting_inputs: {
    state_table: stateTablePath || null,
    flag_schema: flagSchemaPath || null,
    string_corpus: stringCorpusPath || null
  },
  inferred: {
    likely_vm_family: ((dispatcher.inferred || {}).likely_vm_family) || 'unknown',
    opcode_family_count: opcodeFamilies.length,
    branch_schema_count: branchSchema.length
  },
  opcode_families: opcodeFamilies,
  branch_schema: branchSchema,
  summary_signals: summarySignals,
  recommendations: [
    'Treat opcode_families as a prioritization map for manual renaming and focused AST slicing.',
    'Read branch_schema together with jump assignments to map flag bits to operand layouts.',
    'If a family is still ambiguous, correlate it with runtime request neighborhoods before rebuilding the VM.'
  ]
};

if (outputPath) fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
