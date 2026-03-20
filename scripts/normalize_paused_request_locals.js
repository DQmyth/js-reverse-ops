#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function usage() {
  console.error('Usage: normalize_paused_request_locals.js <raw-paused-frame.json> [--request-var-capture <capture-template.json>] [--output <paused-frame-locals.json>]');
  process.exit(1);
}

const args = process.argv.slice(2);
if (!args.length) usage();

const inputPath = args[0];
let requestVarCapturePath = '';
let outputPath = '';
for (let i = 1; i < args.length; i += 1) {
  if (args[i] === '--request-var-capture') requestVarCapturePath = args[++i] || '';
  else if (args[i] === '--output') outputPath = args[++i] || '';
  else usage();
}

const raw = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const requestVarCapture = requestVarCapturePath && fs.existsSync(requestVarCapturePath)
  ? JSON.parse(fs.readFileSync(requestVarCapturePath, 'utf8'))
  : null;

function collectScopeEntries(value, out = []) {
  if (!value) return out;
  if (Array.isArray(value)) {
    for (const item of value) collectScopeEntries(item, out);
    return out;
  }
  if (typeof value !== 'object') return out;

  if (typeof value.name === 'string' && Object.prototype.hasOwnProperty.call(value, 'value')) {
    out.push({
      name: value.name,
      value: value.value,
      source: value.scopeType || value.source || 'scope-entry',
    });
  }

  if (value.locals && typeof value.locals === 'object' && !Array.isArray(value.locals)) {
    for (const [name, localValue] of Object.entries(value.locals)) {
      out.push({ name, value: localValue, source: value.scopeType || 'locals-map' });
    }
  }

  if (value.scope && typeof value.scope === 'object') collectScopeEntries(value.scope, out);
  if (value.scopes) collectScopeEntries(value.scopes, out);
  if (value.properties) collectScopeEntries(value.properties, out);
  if (value.callFrames) collectScopeEntries(value.callFrames, out);
  if (value.frames) collectScopeEntries(value.frames, out);
  if (value.result && typeof value.result === 'object') collectScopeEntries(value.result, out);

  return out;
}

function normalizePreview(value) {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object') {
    if (typeof value.description === 'string') return value.description;
    if (typeof value.value === 'string' || typeof value.value === 'number' || typeof value.value === 'boolean') return String(value.value);
    try {
      return JSON.stringify(value).slice(0, 200);
    } catch {
      return '[object]';
    }
  }
  return String(value);
}

const rawEntries = collectScopeEntries(raw);
const deduped = [];
const seen = new Set();
for (const entry of rawEntries) {
  const key = `${entry.name}::${normalizePreview(entry.value)}::${entry.source}`;
  if (seen.has(key)) continue;
  seen.add(key);
  deduped.push({
    name: entry.name,
    value_preview: normalizePreview(entry.value),
    source: entry.source || null,
  });
}

const targetByField = new Map();
for (const target of (requestVarCapture ? requestVarCapture.capture_targets || [] : [])) {
  targetByField.set(target.field, target);
}

const matchedFields = [];
for (const [field, target] of targetByField.entries()) {
  const candidates = new Set([
    ...(target.upstream_var_candidates || []),
    ...(target.frame_candidates || []),
  ]);
  const matched = deduped.filter((entry) => candidates.has(entry.name));
  const valueMatched = deduped.filter((entry) => String(entry.value_preview || '') === String(target.observed_value || ''));
  matchedFields.push({
    field,
    observed_value: target.observed_value,
    matched_locals: matched,
    matched_by_value: valueMatched,
    verified: matched.some((entry) => entry.value_preview === String(target.observed_value)) || valueMatched.length > 0,
  });
}

const result = {
  source: path.resolve(inputPath),
  request_var_capture: requestVarCapturePath ? path.resolve(requestVarCapturePath) : null,
  generated_at: new Date().toISOString(),
  normalized_locals: deduped,
  matched_fields: matchedFields,
  summary: {
    local_count: deduped.length,
    field_matches: matchedFields.filter((item) => item.matched_locals.length || item.matched_by_value.length).length,
    verified_fields: matchedFields.filter((item) => item.verified).map((item) => item.field),
  },
};

const json = JSON.stringify(result, null, 2);
if (outputPath) fs.writeFileSync(outputPath, `${json}\n`, 'utf8');
console.log(json);
