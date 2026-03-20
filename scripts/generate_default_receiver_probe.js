#!/usr/bin/env node
const fs = require('fs');

function usage() {
  console.error('Usage: generate_default_receiver_probe.js <slot-simulation.json> <adapter-contract.json> [--output <probe.js>] [--json <result.json>]');
  process.exit(1);
}

if (process.argv.length < 4) usage();

const args = process.argv.slice(2);
const slotPath = args[0];
const adapterPath = args[1];
let outputPath = '';
let jsonPath = '';

for (let i = 2; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--output') outputPath = args[++i] || '';
  else if (arg === '--json') jsonPath = args[++i] || '';
  else usage();
}

const slots = JSON.parse(fs.readFileSync(slotPath, 'utf8'));
const adapter = JSON.parse(fs.readFileSync(adapterPath, 'utf8'));

const defaultBranch = (adapter.branches || []).find((branch) => branch.opcode_test === 'default') || null;
const dispatchKey = (slots.dispatch_resolution || {}).dispatch_key || '1.1';
const slotCount = ((slots.slot_state || []).length) || 0;
const candidateIndices = [];
for (let i = 0; i < slotCount; i += 1) {
  if (i !== 2 && i !== 3) candidateIndices.push(i);
}

const probe = `(function(){
  var out = [];
  function safeType(value){
    try { return typeof value; } catch (err) { return 'throws:' + err.message; }
  }
  function safeRead(fn){
    try { return fn(); } catch (err) { return 'throws:' + err.message; }
  }
  function snapshot(o){
    var receiver = safeRead(function(){ return Z.$[o]; });
    var trampolineBase = safeRead(function(){ return Z.$[1]; });
    var dispatchKey = ${JSON.stringify(dispatchKey)};
    var resolved = safeRead(function(){ return trampolineBase[dispatchKey]; });
    out.push({
      opcode: o,
      receiver_type: safeType(receiver),
      receiver_preview: String(receiver).slice(0, 120),
      trampoline_type: safeType(trampolineBase),
      dispatch_key: dispatchKey,
      resolved_type: safeType(resolved),
      resolved_preview: String(resolved).slice(0, 120)
    });
  }
  [${candidateIndices.join(', ')}].forEach(snapshot);
  globalThis.__vmDefaultReceiverProbe = out;
  return out;
})();`;

const result = {
  input: {
    slot_simulation: slotPath,
    adapter_contract: adapterPath
  },
  inferred: {
    has_default_branch: Boolean(defaultBranch),
    dispatch_key: dispatchKey,
    probe_candidate_count: candidateIndices.length
  },
  probe_targets: {
    default_branch: defaultBranch,
    candidate_slot_indices: candidateIndices
  },
  recommendations: [
    'Inject this after the bootstrap array exists so Z.$ can be read safely.',
    'Read globalThis.__vmDefaultReceiverProbe after execution and compare receiver_type with the static slot model.',
    'Start with default branch candidates because 2 and 3 were already explained statically.'
  ]
};

if (outputPath) fs.writeFileSync(outputPath, `${probe}\n`);
if (jsonPath) fs.writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`);
if (!outputPath) process.stdout.write(`${probe}\n`);
else process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
