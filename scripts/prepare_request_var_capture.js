#!/usr/bin/env node
const fs = require('fs');

function usage() {
  console.error('Usage: prepare_request_var_capture.js <protected-request-preflight.json> [--output <capture-template.json>]');
  process.exit(1);
}

if (process.argv.length < 3) usage();

const args = process.argv.slice(2);
const inputPath = args[0];
let outputPath = '';

for (let i = 1; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--output') outputPath = args[++i] || '';
  else usage();
}

const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const body = ((data.protected_runtime_request || {}).body) || {};
const fields = Object.keys(body);

function heuristicsForField(field) {
  switch (field) {
    case 'page':
      return {
        upstream_var_candidates: ['page', 'currentPage', 'paginationState', 'routePage'],
        frame_candidates: ['request initiator frame', 'submit/helper frame', 'component state frame'],
        source_candidates: ['location.search', 'pagination click handler', 'component props/state'],
      };
    case 'token':
      return {
        upstream_var_candidates: ['token', 'sign', 'signature', 'digest', 'hash'],
        frame_candidates: ['request serialization frame', 'crypto/helper frame', 'wasm bridge frame'],
        source_candidates: ['crypto helper output', 'wasm return value', 'vm string/number reducer'],
      };
    case 't':
      return {
        upstream_var_candidates: ['t', 'ts', 'timestamp', 'now'],
        frame_candidates: ['request serialization frame', 'timestamp helper frame'],
        source_candidates: ['Date.now()', 'new Date().getTime()', 'performance/time normalization helper'],
      };
    case 'x':
    case 'y':
      return {
        upstream_var_candidates: [field, `${field}Coord`, `${field}Value`, `${field}BigInt`],
        frame_candidates: ['request serialization frame', 'wasm bridge frame', 'vm operand assembly frame'],
        source_candidates: ['wasm numeric output', 'big-int encoder', 'coordinate/point packing helper'],
      };
    default:
      return {
        upstream_var_candidates: [field],
        frame_candidates: ['request initiator frame'],
        source_candidates: [],
      };
  }
}

const result = {
  input: inputPath,
  source: data.source || null,
  target_request: {
    method: ((data.protected_runtime_request || {}).method) || null,
    url: ((data.protected_runtime_request || {}).url) || null,
    fields,
  },
  capture_targets: fields.map((field) => ({
    field,
    observed_value: body[field],
    ...heuristicsForField(field),
    verified: false,
  })),
  recommended_runtime_steps: [
    'Break on the protected request URL or hook XMLHttpRequest.prototype.send / fetch.',
    'At the paused request frame, capture the serialized body and the nearest pre-serialization locals.',
    'Walk one or two frames up from the request initiator and record variable names or expressions feeding page/token/t/x/y.',
    'Persist the result as a dedicated runtime artifact before restarting the browser session.'
  ],
  trust_rule: {
    source_helper_is_hint_only: true,
    runtime_request_is_source_of_truth: true,
  },
};

if (outputPath) fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
