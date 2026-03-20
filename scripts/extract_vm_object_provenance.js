#!/usr/bin/env node
const fs = require('fs');

function usage() {
  console.error('Usage: extract_vm_object_provenance.js <decoded-first-layer.json-or-source> [--output <result.json>]');
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

function excerptAround(text, idx, radius = 220) {
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + radius);
  return text.slice(start, end);
}

function splitTopLevel(listText) {
  const parts = [];
  let current = '';
  let depthParen = 0;
  let depthBracket = 0;
  let depthBrace = 0;
  let quote = '';
  let escaped = false;
  for (const ch of listText) {
    current += ch;
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === quote) {
        quote = '';
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '(') depthParen += 1;
    else if (ch === ')') depthParen -= 1;
    else if (ch === '[') depthBracket += 1;
    else if (ch === ']') depthBracket -= 1;
    else if (ch === '{') depthBrace += 1;
    else if (ch === '}') depthBrace -= 1;
    else if (ch === ',' && depthParen === 0 && depthBracket === 0 && depthBrace === 0) {
      parts.push(current.slice(0, -1).trim());
      current = '';
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function inferSlotLabel(expr, idx) {
  if (/Z\.\$="?[\d.]+/.test(expr)) return 'dispatch-key';
  if (/Z\.apply\[Z\.\$\]=Z\.call\[Z\.\$\]=Z\.call/.test(expr)) return 'call-trampoline';
  if (/^Z\.apply$/.test(expr)) return 'apply-function';
  if (/^\[\]\.push$/.test(expr)) return 'array-push';
  if (/^\[\]\.pop$/.test(expr)) return 'array-pop';
  if (/^\[\]\.concat$/.test(expr)) return 'array-concat';
  if (/^\[\]\.slice$/.test(expr)) return 'array-slice';
  if (/^Z\.bind$/.test(expr)) return 'bind-function';
  if (/^function\(/.test(expr)) return 'dispatch-adapter';
  return `slot-${idx}`;
}

function readInput(inputPath) {
  if (!inputPath.endsWith('.json')) {
    return { source: inputPath, text: fs.readFileSync(inputPath, 'utf8'), runtimeFaultExcerpt: '' };
  }
  const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const source = data.target || data.source || inputPath;
  const text = fs.readFileSync(source, 'utf8');
  return {
    source,
    text,
    runtimeFaultExcerpt: ((data.excerpts || {}).runtime_fault_excerpt) || ''
  };
}

function findArrayBootstrap(text) {
  const marker = 'Z.$=[';
  const idx = text.indexOf(marker);
  if (idx === -1) return null;
  let depth = 0;
  let start = idx + marker.length;
  let quote = '';
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '[') depth += 1;
    else if (ch === ']') {
      if (depth === 0) {
        return {
          offset: idx,
          raw: text.slice(start, i),
          excerpt: excerptAround(text, idx)
        };
      }
      depth -= 1;
    }
  }
  return null;
}

const { source, text, runtimeFaultExcerpt } = readInput(input);
const bootstrap = findArrayBootstrap(text);
const slots = bootstrap ? splitTopLevel(bootstrap.raw).map((expr, idx) => ({
  index: idx,
  expression: expr,
  label: inferSlotLabel(expr, idx)
})) : [];

const bindSlot = slots.find((slot) => slot.label === 'bind-function') || null;
const trampolineSlot = slots.find((slot) => slot.label === 'call-trampoline') || null;
const adapterSlot = slots.find((slot) => slot.label === 'dispatch-adapter') || null;

const result = {
  input,
  source,
  inferred: {
    has_bootstrap_array: Boolean(bootstrap),
    slot_count: slots.length,
    has_bind_slot: Boolean(bindSlot),
    has_call_trampoline: Boolean(trampolineSlot),
    likely_bind_failure_origin: bindSlot ? 'bootstrap-slot-bind-function' : 'unknown'
  },
  excerpts: {
    bootstrap_excerpt: bootstrap ? bootstrap.excerpt : '',
    runtime_fault_excerpt: runtimeFaultExcerpt
  },
  slots: slots.slice(0, 16),
  critical_slots: {
    bind_slot: bindSlot,
    call_trampoline_slot: trampolineSlot,
    dispatch_adapter_slot: adapterSlot
  },
  recommendations: [
    'Treat the bootstrap slots as a stable alias map before patching runtime shims.',
    'If bind fails, inspect whether the bind slot is rebound, shadowed, or invoked through the call trampoline.',
    'Use this together with extract_vm_opcode_semantics.js so slot labels and opcode roles stay aligned.'
  ]
};

if (outputPath) fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
