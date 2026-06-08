#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function usage() {
  console.error('Usage: validate_replay_delivery_client.js <client-dir> [--json]');
  process.exit(1);
}

function parseArgs(argv) {
  const args = { dir: '', json: false };
  for (const item of argv) {
    if (item === '--json') args.json = true;
    else if (item === '--help' || item === '-h') usage();
    else if (!args.dir) args.dir = path.resolve(item);
    else usage();
  }
  if (!args.dir) usage();
  return args;
}

function readJsonIfExists(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return { __parse_error: error.message };
  }
}

function checkNode(file) {
  try {
    execFileSync(process.execPath, ['--check', file], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return null;
  } catch (error) {
    return error.stderr ? String(error.stderr).trim() : error.message;
  }
}

function checkPython(file) {
  try {
    execFileSync('python3', ['-m', 'py_compile', file], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return null;
  } catch (error) {
    return error.stderr ? String(error.stderr).trim() : error.message;
  }
}

function containsAny(text, values) {
  const haystack = String(text || '').toLowerCase();
  return values.some((item) => haystack.includes(item));
}

function validate(dir) {
  const manifestPath = path.join(dir, 'replay-client-manifest.json');
  const nodePath = path.join(dir, 'replay-client.node.js');
  const pythonPath = path.join(dir, 'replay-client.py');
  const notesPath = path.join(dir, 'replay-client-notes.md');
  const manifest = readJsonIfExists(manifestPath);
  const errors = [];
  const warnings = [];
  const files = {
    manifest: fs.existsSync(manifestPath),
    node_client: fs.existsSync(nodePath),
    python_client: fs.existsSync(pythonPath),
    notes: fs.existsSync(notesPath),
  };

  for (const [label, present] of Object.entries(files)) {
    if (!present) errors.push(`missing ${label}`);
  }
  if (manifest?.__parse_error) errors.push(`manifest parse error: ${manifest.__parse_error}`);
  if (manifest && !manifest.__parse_error) {
    if (manifest.schema !== 'js-reverse-ops-replay-delivery-client-manifest-v1') {
      errors.push(`unexpected manifest schema ${manifest.schema || 'unknown'}`);
    }
    if (!['accepted-replay-template', 'not-accepted-template'].includes(manifest.generation_status)) {
      errors.push(`unexpected generation_status ${manifest.generation_status || 'unknown'}`);
    }
    if (manifest.contract?.base_url !== 'https://example.invalid') {
      errors.push(`unsafe default base_url ${manifest.contract?.base_url || 'unknown'}`);
    }
    if (!manifest.boundary || !/do not promote replay evidence/i.test(manifest.boundary)) {
      errors.push('manifest boundary does not preserve evidence-promotion limits');
    }
    if (manifest.contract?.accepted !== true) {
      warnings.push('client was generated from non-accepted or divergent replay evidence');
    }
  }

  if (files.node_client) {
    const error = checkNode(nodePath);
    if (error) errors.push(`node syntax: ${error}`);
  }
  if (files.python_client) {
    const error = checkPython(pythonPath);
    if (error) errors.push(`python syntax: ${error}`);
  }

  const nodeText = files.node_client ? fs.readFileSync(nodePath, 'utf8') : '';
  const pythonText = files.python_client ? fs.readFileSync(pythonPath, 'utf8') : '';
  const notesText = files.notes ? fs.readFileSync(notesPath, 'utf8') : '';
  if (!nodeText.includes('REPLAY_BASE_URL') || !pythonText.includes('REPLAY_BASE_URL')) {
    errors.push('clients must keep base URL configurable through REPLAY_BASE_URL');
  }
  if (!notesText.includes('delivery templates') || !notesText.includes('not fresh proof')) {
    errors.push('notes must state template-only delivery boundary');
  }
  if (containsAny(`${nodeText}\n${pythonText}\n${notesText}`, [
    ['session', 'id'].join(''),
    'bearer ',
    'basic ',
    'github_pat_',
    'ghp_',
    'akia',
  ])) {
    errors.push('client output contains sensitive-looking credential markers');
  }

  return {
    schema: 'js-reverse-ops-replay-delivery-client-validation-v1',
    generated_at: new Date().toISOString(),
    dir,
    ok: errors.length === 0,
    generation_status: manifest && !manifest.__parse_error ? manifest.generation_status : null,
    files,
    errors,
    warnings,
    boundary: 'Replay client validation checks generated delivery templates. It does not prove live server acceptance.',
  };
}

function renderText(result) {
  const lines = [];
  lines.push(`replay client validation: ${result.ok ? 'ok' : 'failed'}`);
  lines.push(`generation_status: ${result.generation_status || 'unknown'}`);
  for (const error of result.errors) lines.push(`ERROR ${error}`);
  for (const warning of result.warnings) lines.push(`WARN ${warning}`);
  return `${lines.join('\n')}\n`;
}

const args = parseArgs(process.argv.slice(2));
const result = validate(args.dir);
process.stdout.write(args.json ? `${JSON.stringify(result, null, 2)}\n` : renderText(result));
if (!result.ok) process.exit(1);
