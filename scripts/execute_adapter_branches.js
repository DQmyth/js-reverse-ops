#!/usr/bin/env node
const fs = require('fs');

function usage() {
  console.error('Usage: execute_adapter_branches.js <slot-simulation.json> <adapter-contract.json> [--runtime <default-receiver-runtime.json>] [--output <result.json>]');
  process.exit(1);
}

if (process.argv.length < 4) usage();

const args = process.argv.slice(2);
const slotPath = args[0];
const adapterPath = args[1];
let outputPath = '';
let runtimePath = '';

for (let i = 2; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--output') outputPath = args[++i] || '';
  else if (arg === '--runtime') runtimePath = args[++i] || '';
  else usage();
}

const slots = JSON.parse(fs.readFileSync(slotPath, 'utf8'));
const adapter = JSON.parse(fs.readFileSync(adapterPath, 'utf8'));
const runtime = runtimePath ? JSON.parse(fs.readFileSync(runtimePath, 'utf8')) : null;
const runtimeSamples = runtime
  ? (runtime.default_branch_samples || (runtime.default_branch_capture ? [runtime.default_branch_capture] : []))
  : [];

function lookupSlotState(index) {
  return (slots.slot_state || []).find((slot) => slot.index === index) || null;
}

function receiverFromArg(argExpr) {
  if (argExpr === 'Z.$[3]') return lookupSlotState(3);
  if (argExpr === 'Z.$[o]') return null;
  return null;
}

function parseOpcodeTest(test) {
  const match = /^(\d+)\s*==\s*o$/.exec(test || '');
  if (match) return Number(match[1]);
  return null;
}

const simulated_branches = (adapter.branches || []).map((branch) => {
  const opcode = parseOpcodeTest(branch.opcode_test);
  const runtimeMatches = runtimeSamples.filter((sample) =>
    branch.opcode_test === 'default' || sample.opcode_value === opcode
  );
  const runtimeMatch = runtimeMatches[0] || null;
  const receiverSlot = branch.first_argument === 'Z.$[3]' ? lookupSlotState(3) :
    typeof opcode === 'number' ? lookupSlotState(opcode) : receiverFromArg(branch.first_argument);
  const receiverCallable = receiverSlot ? Boolean(receiverSlot.state && receiverSlot.state.callable) : false;
  const callSite = `${branch.trampoline_target}(${[branch.first_argument].concat(branch.forwarded_args || []).join(', ')})`;
  const runtimeCallable = runtimeMatch ? runtimeMatch.receiver_type === 'function' && runtimeMatch.resolved_type === 'function' : false;
  const resolvedSlot = runtimeMatch && typeof runtimeMatch.opcode_value === 'number'
    ? lookupSlotState(runtimeMatch.opcode_value)
    : receiverSlot;
  const viability = runtimeCallable ? 'callable-runtime-confirmed' : (receiverCallable ? 'callable-receiver' : 'non-callable-or-dynamic');
  return {
    opcode_test: branch.opcode_test,
    opcode_value: opcode,
    receiver_expression: branch.first_argument,
    resolved_receiver_slot: resolvedSlot ? {
      index: resolvedSlot.index,
      label: resolvedSlot.label,
      resolved_value: resolvedSlot.state.resolved_value,
      callable: Boolean(resolvedSlot.state && resolvedSlot.state.callable)
    } : null,
    forwarded_args: branch.forwarded_args || [],
    trampoline_target: branch.trampoline_target,
    simulated_callsite: callSite,
    runtime_capture: runtimeMatch ? {
      opcode_value: runtimeMatch.opcode_value,
      receiver_type: runtimeMatch.receiver_type,
      receiver_preview: runtimeMatch.receiver_preview,
      resolved_type: runtimeMatch.resolved_type,
      resolved_preview: runtimeMatch.resolved_preview
    } : null,
    runtime_samples: runtimeMatches.map((sample) => ({
      opcode_value: sample.opcode_value,
      inferred_label: sample.inferred_label || null,
      receiver_type: sample.receiver_type,
      receiver_preview: sample.receiver_preview,
      resolved_type: sample.resolved_type
    })),
    viability
  };
});

const failing = simulated_branches.filter((branch) =>
  branch.viability !== 'callable-receiver' && branch.viability !== 'callable-runtime-confirmed'
);

const result = {
  input: {
    slot_simulation: slotPath,
    adapter_contract: adapterPath,
    runtime_capture: runtimePath || null
  },
  source: slots.source || adapter.source || slotPath,
  inferred: {
    branch_count: simulated_branches.length,
    statically_callable_branches: simulated_branches.filter((branch) => branch.viability === 'callable-receiver').length,
    runtime_confirmed_branches: simulated_branches.filter((branch) => branch.viability === 'callable-runtime-confirmed').length,
    runtime_sample_count: runtimeSamples.length,
    unresolved_or_failing_branches: failing.length
  },
  simulated_branches,
  recommendations: failing.length ? [
    'Branches that resolve to dynamic-or-missing receivers need runtime receiver tracing before local execution can be trusted.',
    'Compare opcode_value against bootstrap slot count to see whether adapter opcodes index helper slots or VM operands.',
    'Use this executor after slot simulation and adapter contract extraction, not before.'
  ] : [
    'All branches currently resolve to callable bootstrap slots under the static model.',
    'Next step is comparing static slot resolution against runtime receiver values.'
  ]
};

if (outputPath) fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
