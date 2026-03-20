#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function usage() {
  console.error('Usage: extract_request_neighborhood.js <input.js-or-graph.json> [--output <result.json>] [--radius <lines>]');
  process.exit(1);
}

if (process.argv.length < 3) usage();

const args = process.argv.slice(2);
const input = args[0];
let outputPath = '';
let radius = 6;

for (let i = 1; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--output') outputPath = args[++i] || '';
  else if (arg === '--radius') radius = Number(args[++i] || 6);
  else usage();
}

function uniq(items) {
  return [...new Set(items)];
}

function printableRatio(text) {
  if (!text) return 0;
  const printable = (text.match(/[\x09\x0a\x0d\x20-\x7e]/g) || []).length;
  return printable / text.length;
}

function resolveTargetFromGraph(graphPath) {
  const data = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  const top = (data.likely_request_modules || [])[0];
  if (!top) throw new Error('No likely_request_modules found in graph JSON');
  return top.node;
}

let target = input;
if (input.endsWith('.json')) {
  target = resolveTargetFromGraph(input);
}

const code = fs.readFileSync(target, 'utf8');
const lines = code.split('\n');
const charRadius = 240;
const signalPatterns = [
  { re: /\/api\//, label: 'api-route' },
  { re: /\bfetch\s*\(/, label: 'fetch' },
  { re: /\bXMLHttpRequest\b/, label: 'xhr' },
  { re: /\b(?:\$\.ajax|ajax\s*\(|axios)\b/, label: 'ajax-like' },
  { re: /(?:token|sign|nonce|timestamp|yt\d*)/i, label: 'request-field' },
  { re: /(?:crypto|md5|sha|aes|rsa|subtle)/i, label: 'crypto-marker' },
  { re: /eval\s*\(/, label: 'packed-bootstrap' },
  { re: /(?:yew|wasm|WebAssembly)/i, label: 'wasm-or-yew' },
];

const hits = [];

const longLineMode = lines.length <= 5 && lines.some((line) => line.length > 1200);

if (longLineMode) {
  const seenWindows = new Set();
  for (const pattern of signalPatterns) {
    const flags = pattern.re.flags.includes('g') ? pattern.re.flags : `${pattern.re.flags}g`;
    const re = new RegExp(pattern.re.source, flags);
    for (const match of code.matchAll(re)) {
      const idx = match.index || 0;
      const start = Math.max(0, idx - charRadius);
      const end = Math.min(code.length, idx + (match[0] || '').length + charRadius);
      const key = `${start}:${end}`;
      if (seenWindows.has(key)) continue;
      seenWindows.add(key);
      const excerpt = code.slice(start, end);
      if (printableRatio(excerpt) < 0.82) continue;
      const labels = signalPatterns.filter((p) => p.re.test(excerpt)).map((p) => p.label);
      if (!labels.length) continue;
      hits.push({
        offset: idx,
        labels,
        excerpt
      });
      if (hits.length >= 24) break;
    }
    if (hits.length >= 24) break;
  }
} else {
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const labels = signalPatterns.filter((p) => p.re.test(line)).map((p) => p.label);
    if (!labels.length) continue;
    const start = Math.max(0, i - radius);
    const end = Math.min(lines.length, i + radius + 1);
    hits.push({
      line_number: i + 1,
      labels,
      excerpt: lines.slice(start, end).join('\n')
    });
  }
}

const result = {
  input,
  target,
  summary: {
    total_lines: lines.length,
    long_line_mode: longLineMode,
    neighborhood_count: hits.length,
    signal_labels: uniq(hits.flatMap((h) => h.labels)).sort()
  },
  neighborhoods: hits.slice(0, 24),
  recommendations: [
    'Start from the first neighborhood that mixes request-field and IO labels.',
    'If only packed-bootstrap or wasm-or-yew appears, pair this with runtime initiator data before deep reading.',
    'Use this after module graph ranking or string-table recovery to avoid reading the whole file.'
  ]
};

if (outputPath) fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
