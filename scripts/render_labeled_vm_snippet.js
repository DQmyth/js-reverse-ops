#!/usr/bin/env node
const fs = require('fs');

function usage() {
  console.error('Usage: render_labeled_vm_snippet.js <labeled-semantics.json> [--output <snippet.txt>]');
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
const lines = [];

lines.push(`Source: ${data.source || input}`);
lines.push(`Labels: ${((data.label_map || []).length)}`);
lines.push('');
lines.push('Label Map');
for (const entry of (data.label_map || [])) {
  lines.push(`- ${entry.label}: ${entry.pattern}`);
}
lines.push('');
lines.push('Q Dispatcher');
lines.push((data.labeled_excerpts || {}).Q_dispatcher || '');
lines.push('');
lines.push('q Dispatcher');
lines.push((data.labeled_excerpts || {}).q_dispatcher || '');
lines.push('');
lines.push('Reading Notes');
lines.push('- Read TABLE_REGISTRATION before branch slots; it tells you where decoded handler groups land.');
lines.push('- Read FLAG1/2/4 slots as operand-layout selectors, not as business fields.');
lines.push('- Read CALL_TRAMPOLINE, BIND_SLOT, APPLY_SLOT, and CALL_SLOT as bootstrap aliasing, not business logic.');

const output = `${lines.join('\n')}\n`;
if (outputPath) fs.writeFileSync(outputPath, output);
process.stdout.write(output);
