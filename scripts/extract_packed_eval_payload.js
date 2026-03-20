#!/usr/bin/env node
const fs = require('fs');

function usage() {
  console.error('Usage: extract_packed_eval_payload.js <input.js-or-graph.json> [--output <result.json>]');
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

function resolveTarget(inputPath) {
  if (!inputPath.endsWith('.json')) return inputPath;
  const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const top = (data.likely_request_modules || [])[0];
  if (!top) throw new Error('No likely_request_modules found in graph JSON');
  return top.node;
}

function fingerprintWrapper(text) {
  if (!text) return { family: 'none', signals: [] };
  const signals = [];
  if (/String\.fromCharCode/.test(text)) signals.push('string-from-charcode');
  if (/charCodeAt/.test(text)) signals.push('charcode-loop');
  if (/JSON\.stringify/.test(text)) signals.push('json-stringify');
  if (/Math\.sin/.test(text)) signals.push('math-sin');
  if (/1\.\.toString/.test(text)) signals.push('numeric-prototype-trick');
  if (/function q\(/.test(text)) signals.push('dispatcher-q');
  if (/function Q\(/.test(text)) signals.push('dispatcher-Q');
  if (/S\[a\]\(m,s\[a\]\(b,C\)\^o\)/.test(text)) signals.push('xor-decoder');
  let family = 'generic-packed-eval';
  if (signals.includes('xor-decoder') && signals.includes('dispatcher-q')) family = 'custom-xor-dispatch-vm';
  else if (signals.includes('string-from-charcode') && signals.includes('charcode-loop')) family = 'string-charcode-packer';
  return { family, signals };
}

function findMatching(text, startIdx, openChar, closeChar) {
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let i = startIdx; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === '\'' || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === openChar) depth += 1;
    else if (ch === closeChar) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

const target = resolveTarget(input);
const code = fs.readFileSync(target, 'utf8');
const evalIdx = code.indexOf('eval(function(');
let payload = '';
let wrapper = '';
if (evalIdx !== -1) {
  const openIdx = code.indexOf('(', evalIdx);
  const closeIdx = findMatching(code, openIdx, '(', ')');
  if (closeIdx !== -1) {
    wrapper = code.slice(evalIdx, closeIdx + 1);
    const fnStart = code.indexOf('{', evalIdx);
    const fnEnd = fnStart !== -1 ? findMatching(code, fnStart, '{', '}') : -1;
    if (fnEnd !== -1) {
      payload = code.slice(fnStart + 1, Math.min(fnEnd, fnStart + 4000));
    }
  }
}
const fingerprint = fingerprintWrapper(wrapper);

const result = {
  input,
  target,
  inferred: {
    has_packed_eval: evalIdx !== -1,
    eval_offset: evalIdx !== -1 ? evalIdx : null,
    payload_excerpt_length: payload.length,
    wrapper_length: wrapper.length,
    packer_family: fingerprint.family,
    packer_signals: fingerprint.signals
  },
  excerpts: {
    wrapper_head: wrapper ? wrapper.slice(0, 800) : '',
    payload_excerpt: payload
  },
  recommendations: [
    'Use the wrapper head to fingerprint the packer before trying generic beautifiers.',
    'Treat the payload excerpt as a bootstrap sample, not the full runtime semantics.',
    'Pair this with extract_module_entry_contract.js when the entry module only exposes imports and eval bootstrap.'
  ]
};

if (outputPath) fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
