#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function usage() {
  console.error('Usage: prepare_external_replay_validation.js --bundle-dir <dir>');
  process.exit(1);
}

const args = process.argv.slice(2);
if (!args.length) usage();

let bundleDir = '';
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--bundle-dir') {
    bundleDir = path.resolve(args[++i] || '');
  } else {
    usage();
  }
}
if (!bundleDir) usage();

function readJson(name, fallback = {}) {
  const file = path.join(bundleDir, name);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback;
}

const evidence = readJson('evidence.json');
const runtime = evidence.runtime_evidence || {};
const request = runtime.request || {};
const replayScaffold = evidence.replay_scaffold || {};

const template = {
  executed_at: new Date().toISOString(),
  synthetic: false,
  accepted: false,
  parity_confirmed: false,
  runtime_reference: {
    method: request.method || 'POST',
    url: request.url || '',
    fields: request.fields || [],
    status: request.status == null ? null : request.status,
  },
  replay_attempt: {
    request_method: request.method || 'POST',
    request_url: request.url || '',
    request_fields: request.fields || [],
    response_status: null,
    response_body_excerpt: '',
  },
  comparison: {
    method_match: null,
    url_match: null,
    field_match: null,
    status_match: null,
    notes: [],
  },
  notes: [
    'Fill this file with a real replay attempt result.',
    'Set synthetic=false only for actual replay executions.',
    'Set accepted=true and parity_confirmed=true only when the replay is both server-accepted and behaviorally aligned with runtime truth.',
  ],
};

const checklist = [
  '# Replay Validation Checklist',
  '',
  `- runtime_method: ${request.method || 'UNKNOWN'}`,
  `- runtime_url: ${request.url || 'unknown'}`,
  `- runtime_fields: ${(request.fields || []).join(', ') || 'none'}`,
  `- runtime_status: ${request.status == null ? 'unknown' : request.status}`,
  `- replay_scaffold: ${replayScaffold.generated ? replayScaffold.file : 'missing'}`,
  '',
  '## Before Running',
  '',
  '- replace placeholder payload fields in `replay.py`',
  '- replace placeholder headers, signatures, cookies, or timestamps with real logic',
  '- preserve the actual replay request and response',
  '',
  '## Validation Rules',
  '',
  '- `accepted=true` only if the replay request is genuinely server-accepted',
  '- `parity_confirmed=true` only if request contract and behavior match runtime truth closely enough to trust the replay',
  '- leave `synthetic=false` only for a real replay run',
  '',
  '## Output Artifacts',
  '',
  '- fill `replay-validation-template.json` with the replay result',
  '- optionally add raw request and response dumps under `artifacts/evidence/replay-validation/`',
].join('\n');

const templatePath = path.join(bundleDir, 'replay-validation-template.json');
const checklistPath = path.join(bundleDir, 'replay-validation-checklist.md');
fs.writeFileSync(templatePath, `${JSON.stringify(template, null, 2)}\n`, 'utf8');
fs.writeFileSync(checklistPath, `${checklist}\n`, 'utf8');

console.log(JSON.stringify({
  bundle_dir: bundleDir,
  template: templatePath,
  checklist: checklistPath,
}, null, 2));
