#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function usage() {
  console.error('Usage: compare_external_replay_to_runtime.js --bundle-dir <dir> --validation-json <file> [--output <file>]');
  process.exit(1);
}

const args = process.argv.slice(2);
if (!args.length) usage();

const options = {
  bundleDir: '',
  validationJson: '',
  output: '',
};

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  const next = args[i + 1] || '';
  if (arg === '--bundle-dir') {
    options.bundleDir = path.resolve(next);
    i += 1;
  } else if (arg === '--validation-json') {
    options.validationJson = path.resolve(next);
    i += 1;
  } else if (arg === '--output') {
    options.output = path.resolve(next);
    i += 1;
  } else {
    usage();
  }
}
if (!options.bundleDir || !options.validationJson) usage();

const evidence = JSON.parse(fs.readFileSync(path.join(options.bundleDir, 'evidence.json'), 'utf8'));
const validation = JSON.parse(fs.readFileSync(options.validationJson, 'utf8'));
const runtime = evidence.runtime_evidence || {};
const request = runtime.request || {};
const replayAttempt = validation.replay_attempt || {};

function normalizeFields(fields) {
  return [...new Set((fields || []).filter(Boolean))].sort();
}

function equalArray(a, b) {
  return JSON.stringify(normalizeFields(a)) === JSON.stringify(normalizeFields(b));
}

const result = {
  bundle_dir: options.bundleDir,
  validation_json: options.validationJson,
  runtime_reference: {
    method: request.method || null,
    url: request.url || null,
    fields: normalizeFields(request.fields || []),
    status: request.status == null ? null : request.status,
  },
  replay_reference: {
    method: replayAttempt.request_method || null,
    url: replayAttempt.request_url || null,
    fields: normalizeFields(replayAttempt.request_fields || []),
    status: replayAttempt.response_status == null ? null : replayAttempt.response_status,
  },
  comparison: {
    method_match: (request.method || null) === (replayAttempt.request_method || null),
    url_match: (request.url || null) === (replayAttempt.request_url || null),
    field_match: equalArray(request.fields || [], replayAttempt.request_fields || []),
    status_match: request.status == null ? null : request.status === replayAttempt.response_status,
  },
};

result.parity_candidate = Boolean(
  result.comparison.method_match &&
  result.comparison.url_match &&
  result.comparison.field_match
);

if (options.output) fs.writeFileSync(options.output, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(result, null, 2));
