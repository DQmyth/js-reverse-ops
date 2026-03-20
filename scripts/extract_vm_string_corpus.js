#!/usr/bin/env node
const fs = require('fs');

function usage() {
  console.error('Usage: extract_vm_string_corpus.js <input.js-or-json> [--output <result.json>]');
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

function uniq(items) {
  return [...new Set(items)];
}

function readTarget(inputPath) {
  if (!inputPath.endsWith('.json')) return { source: inputPath, text: fs.readFileSync(inputPath, 'utf8') };
  const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const text =
    (data.excerpts && (
      data.excerpts.payload_excerpt ||
      data.excerpts.decoded_head ||
      data.excerpts.Q_dispatcher ||
      data.excerpts.wrapper_head
    )) || '';
  return { source: data.source || data.target || inputPath, text };
}

const { source, text } = readTarget(input);
const quoted = uniq([...text.matchAll(/['"]([^'"\\]{3,80})['"]/g)].map((m) => m[1])).slice(0, 120);
const pipeTokens = uniq([...text.matchAll(/['"]([0-9|]{5,80})['"]/g)].map((m) => m[1])).slice(0, 40);
const alphaTokens = uniq(
  [...text.matchAll(/\b[A-Za-z_$][A-Za-z0-9_$]{3,24}\b/g)]
    .map((m) => m[0])
    .filter((s) => !['function', 'return', 'var', 'const', 'while', 'for'].includes(s))
).slice(0, 120);
const delimiters = uniq((text.match(/(?:\|{1,2}|::|=>|==|!=|<=|>=|\+\=|\-\=)/g) || [])).sort();

const result = {
  input,
  source,
  inferred: {
    quoted_string_count: quoted.length,
    pipe_token_count: pipeTokens.length,
    identifier_corpus_count: alphaTokens.length,
    delimiter_corpus: delimiters
  },
  corpus: {
    quoted_strings: quoted,
    pipe_tokens: pipeTokens,
    identifiers: alphaTokens
  },
  recommendations: [
    'Use pipe_tokens to find dispatcher order tables or split-based control flow.',
    'Use quoted_strings and identifiers to seed AST or search-based reduction passes.',
    'Pair this with extract_second_stage_dispatcher.js when the VM family is known but the string corpus is still opaque.'
  ]
};

if (outputPath) fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
