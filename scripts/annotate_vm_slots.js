#!/usr/bin/env node
const fs = require('fs');

function usage() {
  console.error('Usage: annotate_vm_slots.js <labeled.js> <slot-simulation.json> [--output <annotated.js>]');
  process.exit(1);
}

if (process.argv.length < 4) usage();

const args = process.argv.slice(2);
const sourcePath = args[0];
const slotPath = args[1];
let outputPath = '';

for (let i = 2; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--output') outputPath = args[++i] || '';
  else usage();
}

const source = fs.readFileSync(sourcePath, 'utf8');
const slotData = JSON.parse(fs.readFileSync(slotPath, 'utf8'));
const slotState = slotData.slot_state || [];

let annotated = source;
for (const slot of slotState.slice().sort((a, b) => (b.expression || '').length - (a.expression || '').length)) {
  if (!slot.expression || !slot.label) continue;
  const comment = `/* SLOT ${slot.index}: ${slot.label} => ${slot.state.resolved_value} */ `;
  annotated = annotated.split(slot.expression).join(`${comment}${slot.expression}`);
}

const header = [
  '/*',
  ' VM slot annotation artifact',
  ` Source: ${sourcePath}`,
  ` Slot model: ${slotPath}`,
  ' Slots:',
  ...slotState.map((slot) => `  [${slot.index}] ${slot.label} => ${slot.state.resolved_value}`),
  '*/',
  ''
].join('\n');

const result = `${header}${annotated}`;

if (outputPath) {
  fs.writeFileSync(outputPath, result);
  process.stdout.write(`${JSON.stringify({ source: sourcePath, slots: slotState.length, output: outputPath }, null, 2)}\n`);
} else {
  process.stdout.write(result);
}
