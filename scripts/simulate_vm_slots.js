#!/usr/bin/env node
const fs = require('fs');

function usage() {
  console.error('Usage: simulate_vm_slots.js <object-provenance.json> [--output <result.json>]');
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

const data = JSON.parse(fs.readFileSync(input, 'utf8'));
const slots = data.slots || [];

function classifySlot(slot) {
  const expr = slot.expression || '';
  if (slot.label === 'dispatch-key') {
    return {
      kind: 'literal',
      resolved_value: '1.1',
      callable: false,
      notes: ['property key used to select alias on bootstrap slots']
    };
  }
  if (slot.label === 'call-trampoline') {
    return {
      kind: 'callable-alias',
      resolved_value: 'Function.prototype.call',
      callable: true,
      notes: ['expression aliases call onto Z.apply[dispatch-key] and Z.call[dispatch-key]']
    };
  }
  if (slot.label === 'apply-function') {
    return {
      kind: 'callable-reference',
      resolved_value: 'Z.apply',
      callable: true,
      notes: ['bootstrap stores apply holder separately from call trampoline']
    };
  }
  if (slot.label.startsWith('array-')) {
    return {
      kind: 'callable-reference',
      resolved_value: expr,
      callable: true,
      notes: ['bootstrap utility array method']
    };
  }
  if (slot.label === 'bind-function') {
    return {
      kind: 'callable-reference',
      resolved_value: 'Z.bind',
      callable: true,
      notes: ['likely bootstrap alias for Function.prototype.bind or wrapped equivalent']
    };
  }
  if (slot.label === 'dispatch-adapter') {
    return {
      kind: 'callable-reference',
      resolved_value: 'dispatch-adapter',
      callable: true,
      notes: ['opcode router that forwards into call trampoline']
    };
  }
  return {
    kind: 'unknown',
    resolved_value: expr,
    callable: /\bfunction\b|=>|\.\w+$|\[\]/.test(expr),
    notes: ['no specialized resolver for this slot yet']
  };
}

const slot_state = slots.map((slot) => {
  const summary = classifySlot(slot);
  return {
    index: slot.index,
    label: slot.label,
    expression: slot.expression,
    state: summary
  };
});

const dispatchKey = slot_state.find((slot) => slot.label === 'dispatch-key');
const trampoline = slot_state.find((slot) => slot.label === 'call-trampoline');
const applyFn = slot_state.find((slot) => slot.label === 'apply-function');
const bindFn = slot_state.find((slot) => slot.label === 'bind-function');
const adapter = slot_state.find((slot) => slot.label === 'dispatch-adapter');

const result = {
  input,
  source: data.source || input,
  inferred: {
    slot_count: slot_state.length,
    callable_slot_count: slot_state.filter((slot) => slot.state.callable).length,
    has_dispatch_key: Boolean(dispatchKey),
    has_trampoline: Boolean(trampoline),
    has_adapter: Boolean(adapter)
  },
  dispatch_resolution: {
    dispatch_key: dispatchKey ? dispatchKey.state.resolved_value : null,
    call_trampoline_base: trampoline ? trampoline.state.resolved_value : null,
    call_trampoline_lookup: dispatchKey && trampoline ? `${trampoline.state.resolved_value}["${dispatchKey.state.resolved_value}"]` : null,
    expected_receiver_holder: applyFn ? applyFn.state.resolved_value : null,
    expected_bind_holder: bindFn ? bindFn.state.resolved_value : null
  },
  slot_state,
  recommendations: [
    'Use this slot-state view before emulating adapter branches so receiver candidates are interpreted as bootstrap aliases rather than business values.',
    'If call_trampoline_lookup still fails, compare the expected receiver holder with runtime receiver values for Z.$[1] and Z.$[0].',
    'Treat dispatch-adapter as a callable bootstrap helper, not as a payload constructor.'
  ]
};

if (outputPath) fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
