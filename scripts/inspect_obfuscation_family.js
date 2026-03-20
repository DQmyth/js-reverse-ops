#!/usr/bin/env node
const fs = require('fs');

if (process.argv.length < 3) {
  console.error('Usage: inspect_obfuscation_family.js <input.js>');
  process.exit(1);
}

const file = process.argv[2];
const code = fs.readFileSync(file, 'utf8');

function uniq(items) {
  return [...new Set(items)];
}

function count(re) {
  const m = code.match(re);
  return m ? m.length : 0;
}

function collect(re, limit = 20) {
  const out = [];
  for (const m of code.matchAll(re)) {
    out.push(m[1] || m[0]);
    if (out.length >= limit) break;
  }
  return uniq(out);
}

const hexVars = count(/\b_0x[0-9a-f]+\b/g);
const arrayLikeCalls = count(/\b_0x[0-9a-f]+\(\s*0x[0-9a-f]+/gi);
const whileSwitch = count(/while\s*\(\s*(?:true|!!\[\])\s*\)\s*\{[\s\S]{0,1200}?switch\s*\(/g);
const selfDefending = count(/(?:debugger|constructor\(['"]debugger['"]\)|setInterval\s*\(\s*function\s*\(\)\s*\{\s*debugger)/g);
const stringArrayHints = count(/\[[^\]]*['"][^'"]{2,}['"][^\]]*\]/g);
const numericAsciiDensity = count(/\d{1,3},\d{1,3},\d{1,3},\d{1,3}/g);
const browserifyBootstrap = count(/\(function\(\)\{function a\(b,c,d\)/g);

let family = 'unknown';
if (browserifyBootstrap > 0) family = 'browserify-bundle';
else if (numericAsciiDensity > 8) family = 'numeric-ascii-vm-or-table';
else if (hexVars > 500 || arrayLikeCalls > 120) family = 'string-table-obfuscation';
else if (whileSwitch > 0) family = 'control-flow-flattening';

const result = {
  file,
  family,
  signals: {
    hex_var_count: hexVars,
    hex_dispatch_calls: arrayLikeCalls,
    while_switch_dispatchers: whileSwitch,
    self_defending_markers: selfDefending,
    string_array_hints: stringArrayHints,
    numeric_ascii_chunks: numericAsciiDensity,
    browserify_bootstrap: browserifyBootstrap,
  },
  samples: {
    hex_vars: collect(/\b(_0x[0-9a-f]+)\b/g, 30),
    candidate_arrays: collect(/(?:var|const)\s+([_$A-Za-z][_$A-Za-z0-9]*)\s*=\s*\[(?:[^\]]{0,240})\]/g, 20),
    candidate_dispatchers: collect(/function\s+([_$A-Za-z][_$A-Za-z0-9]*)\([^)]*\)\s*\{[\s\S]{0,500}?_0x[0-9a-f]+/g, 12),
  },
  recommendations: family === 'string-table-obfuscation'
    ? [
        'Recover the string table and index resolver before reading business logic.',
        'Use full-file contract extraction after string resolution, not before.',
        'Prefer runtime request capture to avoid chasing dead string aliases.'
      ]
    : family === 'numeric-ascii-vm-or-table'
      ? [
          'Inspect tail-first and decode numeric ASCII runs before broad search.',
          'Expect route strings and header names to appear only after decoding.',
          'Correlate with runtime initiator before climbing VM helpers.'
        ]
      : family === 'browserify-bundle'
        ? [
            'Treat the bundle as a module graph, not a monolithic obfuscation blob.',
            'Search explicit route strings and business modules first.',
            'Use full-file contract extraction before AST cleanup.'
          ]
        : [
            'Start with runtime capture and request initiator analysis.',
            'Use AST cleanup only after isolating a business neighborhood.'
          ]
};

console.log(JSON.stringify(result, null, 2));
