#!/usr/bin/env node
const fs = require('fs');

function usage() {
  console.error('Usage: trace_vm_receiver_flow.js <object-provenance.json> [--trampoline <trampoline-validation.json>] [--output <result.json>]');
  process.exit(1);
}

if (process.argv.length < 3) usage();

const args = process.argv.slice(2);
const provenancePath = args[0];
let trampolinePath = '';
let outputPath = '';

for (let i = 1; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--trampoline') trampolinePath = args[++i] || '';
  else if (arg === '--output') outputPath = args[++i] || '';
  else usage();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

const provenance = readJson(provenancePath);
const trampoline = trampolinePath ? readJson(trampolinePath) : null;

const slots = provenance.slots || [];
const findSlot = (label) => slots.find((slot) => slot.label === label) || null;

const dispatchKey = findSlot('dispatch-key');
const callTrampoline = findSlot('call-trampoline');
const bindSlot = findSlot('bind-function');
const adapter = findSlot('dispatch-adapter');

const flow = [
  dispatchKey ? {
    stage: 'dispatch-key',
    expression: dispatchKey.expression,
    meaning: 'property used to select the callable alias on bootstrap slots'
  } : null,
  callTrampoline ? {
    stage: 'call-trampoline',
    expression: callTrampoline.expression,
    meaning: 'slot intended to resolve a callable via the dispatch key'
  } : null,
  adapter ? {
    stage: 'dispatch-adapter',
    expression: adapter.expression,
    meaning: 'wrapper that routes opcode branches into the trampoline'
  } : null,
  bindSlot ? {
    stage: 'bind-slot',
    expression: bindSlot.expression,
    meaning: 'bootstrap bind alias previously identified as an early failure point'
  } : null
].filter(Boolean);

const result = {
  input: provenancePath,
  source: provenance.source || provenancePath,
  supporting_inputs: {
    trampoline_validation: trampolinePath || null
  },
  inferred: {
    flow_stage_count: flow.length,
    current_failure_stage: trampoline && trampoline.runtime_error && trampoline.runtime_error.includes('Z.$[1][Z.$[0]]')
      ? 'call-trampoline'
      : ((provenance.inferred || {}).likely_bind_failure_origin) || 'unknown'
  },
  flow,
  current_fault: trampoline ? {
    runtime_error: trampoline.runtime_error || null,
    fault_excerpt: ((trampoline.excerpts || {}).fault_excerpt) || ''
  } : null,
  recommendations: [
    'If current_failure_stage is call-trampoline, inspect the receiver object and dispatch key together rather than patching bind again.',
    'Compare the fault excerpt with the bootstrap slots to see whether Z.$[1] is expected to be apply/call or a patched proxy.',
    'Use this before trying to emulate the adapter branch values locally.'
  ]
};

if (outputPath) fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
