#!/usr/bin/env node
// extract_packed_eval_payload — fingerprints an eval-packed script WITHOUT running it: where the
// shell starts, what family of packer wrote it, and an excerpt of its wrapper. It reports; it does
// not unpack — scripts/decode_eval_wrapper.js does (for the classic shell, without running it).
// Verified on a classic-packer payload in tests/unit/eval-packer.test.js; the other families it
// names come from hand-written signatures (string-from-charcode, xor-decoder…) and have no
// real-sample test.
// Usage: node scripts/extract_packed_eval_payload.js <input.js-or-graph.json> [--output <result.json>]
// Exit 0 a report was produced (whether or not a shell was found — read has_packed_eval);
// 2 usage; 1 an unreadable input (the report names it).
const fs = require('fs');
const { classicShell } = require('./inspect_obfuscation_family.js');

function usage(note) {
  if (note) console.error(`extract_packed_eval_payload: ${note}`);
  console.error('Usage: extract_packed_eval_payload.js <input.js-or-graph.json> [--output <result.json>]');
  process.exit(2);
}

if (process.argv.length < 3) usage();

const args = process.argv.slice(2);
const input = args[0];
let outputPath = '';

for (let i = 1; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--output') {
    const value = args[++i];
    if (!value || value.startsWith('--')) usage('--output needs a path');
    outputPath = value;
  } else usage(`unknown option: ${arg}`);
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
let code;
try {
  code = fs.readFileSync(target, 'utf8');
} catch (err) {
  console.error(`extract_packed_eval_payload: cannot read ${target} — ${err.message}`);
  process.exit(1);
}
// the classic shell is known by shape (whatever the spacing): `function(p,a,c,k,e,d){…}(…)`
const shell = classicShell(code);
const evalIdx = shell ? shell.offset : code.indexOf('eval(function(');
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
// the signature is worth more than the signals: that unpacker carries "String.fromCharCode"
// for its own token encoding, which used to file the classic packer under other families
if (shell) {
  fingerprint.family = 'classic-eval-packer';
  fingerprint.signals = ['arguments-p,a,c,k,e,d', ...fingerprint.signals.filter((s) => s !== 'string-from-charcode')];
}

const result = {
  input,
  target,
  inferred: {
    has_packed_eval: evalIdx !== -1,
    eval_offset: evalIdx !== -1 ? evalIdx : null,
    packer_base: shell ? shell.base : null,
    dictionary_size: shell ? shell.dictionary_size : null,
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
    ...(shell
      ? ['classic-eval-packer: decode_eval_wrapper.js opens it by arithmetic, without running the sample — then run this again on what comes out (one layer per call).']
      : ['Use the wrapper head to fingerprint the packer before trying generic beautifiers.']),
    'Treat the payload excerpt as a bootstrap sample, not the full runtime semantics.',
    'Pair this with extract_module_entry_contract.js when the entry module only exposes imports and eval bootstrap.'
  ]
};

if (outputPath) fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
