#!/usr/bin/env node
const fs = require('fs');

function usage() {
  console.error('Usage: extract_second_stage_dispatcher.js <input.js-or-json> [--output <result.json>]');
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

function readTarget(inputPath) {
  if (!inputPath.endsWith('.json')) return { source: inputPath, text: fs.readFileSync(inputPath, 'utf8') };
  const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const text =
    (data.excerpts && (data.excerpts.payload_excerpt || data.excerpts.decoded_head || data.excerpts.wrapper_head)) ||
    '';
  const source = data.target || inputPath;
  return { source, text };
}

function uniq(items) {
  return [...new Set(items)];
}

function excerptAround(text, needle, radius = 480) {
  const idx = text.indexOf(needle);
  if (idx === -1) return '';
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + needle.length + radius);
  return text.slice(start, end);
}

const { source, text } = readTarget(input);
const signals = [];
if (/function q\(/.test(text)) signals.push('dispatcher-q');
if (/function Q\(/.test(text)) signals.push('dispatcher-Q');
if (/String\.fromCharCode/.test(text)) signals.push('string-from-charcode');
if (/charCodeAt/.test(text)) signals.push('charcode-loop');
if (/JSON\.stringify/.test(text)) signals.push('json-stringify');
if (/Math\.sin/.test(text)) signals.push('math-sin');
if (/1\.\.toString/.test(text)) signals.push('numeric-prototype-trick');
if (/S\[a\]\(m,s\[a\]\(b,C\)\^o\)/.test(text) || /\^o/.test(text)) signals.push('xor-decoder');

const result = {
  input,
  source,
  inferred: {
    dispatcher_signals: uniq(signals),
    likely_vm_family: signals.includes('xor-decoder') && signals.includes('dispatcher-q')
      ? 'custom-xor-dispatch-vm'
      : signals.length
        ? 'dispatcher-like'
        : 'unknown'
  },
  excerpts: {
    q_dispatcher: excerptAround(text, 'function q('),
    Q_dispatcher: excerptAround(text, 'function Q('),
    xor_decoder: excerptAround(text, '^o'),
  },
  recommendations: [
    'Treat q/Q dispatchers as second-stage control flow anchors.',
    'If xor-decoder is present, isolate its input corpus before attempting full VM flattening.',
    'Pair this with decode_eval_wrapper.js when first-layer expansion succeeds, or with extract_packed_eval_payload.js when it does not.'
  ]
};

if (outputPath) fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
