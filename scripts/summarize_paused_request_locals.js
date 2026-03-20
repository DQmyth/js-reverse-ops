#!/usr/bin/env node
const fs = require('fs');

function usage() {
  console.error('Usage: summarize_paused_request_locals.js <paused-frame-locals.json> [--output <paused-frame-locals.md>]');
  process.exit(1);
}

const args = process.argv.slice(2);
if (!args.length) usage();
const inputPath = args[0];
let outputPath = '';
for (let i = 1; i < args.length; i += 1) {
  if (args[i] === '--output') outputPath = args[++i] || '';
  else usage();
}

const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const lines = [
  '# Paused Frame Locals Summary',
  '',
  `- source: ${data.source || 'unknown'}`,
  `- normalized locals: ${(data.summary || {}).local_count || 0}`,
  `- matched fields: ${(data.summary || {}).field_matches || 0}`,
  `- verified fields: ${((data.summary || {}).verified_fields || []).join(', ') || 'none'}`,
  '',
  '## Matched Fields',
  '',
  ...((data.matched_fields || []).length
    ? data.matched_fields.map((field) => `- ${field.field}: locals=${field.matched_locals.length}, value_matches=${field.matched_by_value.length}, verified=${field.verified}`)
    : ['- none']),
  '',
].join('\n');

if (outputPath) fs.writeFileSync(outputPath, `${lines}\n`, 'utf8');
console.log(lines);
