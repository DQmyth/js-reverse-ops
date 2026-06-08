#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

function usage() {
  console.error('Usage: validate_domain_handoff_record.js --record <record.json> [--json] [--strict]');
  process.exit(1);
}

function parseArgs(argv) {
  const args = { record: '', json: false, strict: false };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--record') {
      args.record = argv[index + 1] || '';
      index += 1;
    } else if (item === '--json') {
      args.json = true;
    } else if (item === '--strict') {
      args.strict = true;
    } else if (item === '--help' || item === '-h') {
      usage();
    } else if (!args.record) {
      args.record = item;
    } else {
      usage();
    }
  }
  if (!args.record) usage();
  return args;
}

function resolveRepoPath(value) {
  const candidates = path.isAbsolute(value)
    ? [value]
    : [path.resolve(process.cwd(), value), path.join(rootDir, value), path.join(rootDir, 'public', value)];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(resolveRepoPath(file), 'utf8'));
}

function validate(args) {
  const model = readJson(path.join(rootDir, 'assets/domain-handoff-model.json'));
  const record = readJson(args.record);
  const handoff = (model.handoffs || []).find((item) => item.id === record.handoff_id);
  const artifacts = Array.isArray(record.boundary_artifacts) ? record.boundary_artifacts : [];
  const errors = [];
  const warnings = [];

  if (record.schema !== 'js-reverse-ops-domain-handoff-record-v1') {
    errors.push(`unexpected schema ${record.schema || 'unknown'}`);
  }
  if (!handoff) {
    errors.push(`unknown handoff_id ${record.handoff_id || 'unknown'}`);
  }
  if (!artifacts.length) {
    errors.push('boundary_artifacts must not be empty');
  }

  const artifactKinds = artifacts.map((item) => String(item.kind || '').toLowerCase());
  for (const required of handoff?.boundary_artifacts || []) {
    const words = String(required).toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3);
    const covered = artifactKinds.some((kind) => words.some((word) => kind.includes(word)));
    if (!covered) warnings.push(`missing explicit artifact kind for ${required}`);
  }

  if (args.strict && warnings.some((warning) => warning.startsWith('missing explicit artifact kind'))) {
    errors.push('strict mode requires every modeled boundary artifact kind to be represented');
  }

  for (const artifact of artifacts) {
    if (!artifact.kind) errors.push('artifact missing kind');
    if (!artifact.value) errors.push(`artifact ${artifact.kind || 'unknown'} missing value`);
    if (artifact.sanitized !== true) errors.push(`artifact ${artifact.kind || 'unknown'} is not marked sanitized`);
    if (artifact.present !== true) errors.push(`artifact ${artifact.kind || 'unknown'} is not marked present`);
    const value = String(artifact.value || '').toLowerCase();
    if (/\.(har|pcap|pcapng)\b/.test(value)) {
      errors.push(`artifact ${artifact.kind || 'unknown'} points to raw capture material`);
    }
  }

  if (!/does not prove/i.test(record.promotion_boundary || '')) {
    errors.push('promotion_boundary must state what the handoff does not prove');
  }

  return {
    schema: 'js-reverse-ops-domain-handoff-record-validation-v1',
    generated_at: new Date().toISOString(),
    record: args.record,
    ok: errors.length === 0,
    strict: args.strict,
    handoff_id: record.handoff_id || null,
    target_lane: record.target_lane || handoff?.target_lane || null,
    artifact_count: artifacts.length,
    errors,
    warnings,
    boundary: 'Domain handoff validation checks artifact boundary preservation. It does not promote packet, mobile, WASM, or binary findings into verified JS replay claims.',
  };
}

function renderText(result) {
  const lines = [];
  lines.push(`domain handoff record: ${result.ok ? 'ok' : 'failed'}`);
  lines.push(`handoff: ${result.handoff_id || 'unknown'}`);
  for (const error of result.errors) lines.push(`ERROR ${error}`);
  for (const warning of result.warnings) lines.push(`WARN ${warning}`);
  return `${lines.join('\n')}\n`;
}

const args = parseArgs(process.argv.slice(2));
const result = validate(args);
process.stdout.write(args.json ? `${JSON.stringify(result, null, 2)}\n` : renderText(result));
if (!result.ok) process.exit(1);
