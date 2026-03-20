#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { extractIocsFromFile } = require('./lib/ioc');

if (process.argv.length < 3) {
  console.error('Usage: classify_reverse_pattern.js <file-or-page>');
  process.exit(1);
}

const target = process.argv[2];
const text = fs.readFileSync(target, 'utf8');
const ext = path.extname(target).toLowerCase();
const isHtml = ext === '.html' || /<html/i.test(text);

function collect(re, source = text) {
  return [...new Set([...source.matchAll(re)].map((m) => m[1] || m[0]))];
}

let families = [];
let reasons = [];

if (isHtml) {
  const hasRemoteCore = /match\d+\.js|corejs/i.test(text);
  const hasModule = /type="module"|modulepreload/i.test(text);
  const hasInlineCall = /\bcall\s*\(/.test(text) || /\bsubmit\s*\(/.test(text) || /onclick="submit\(\)"/.test(text);
  const hasWasm = /\.wasm|yew|fonteditor/i.test(text);

  if (hasRemoteCore) {
    families.push('remote-corejs-monolith');
    reasons.push('HTML references external match/corejs assets.');
  }
  if (!hasRemoteCore && hasInlineCall) {
    families.push('inline-page-challenge');
    reasons.push('HTML contains inline call/submit handlers and no external challenge script.');
  }
  if (hasModule || hasWasm) {
    families.push('module-or-wasm-hybrid');
    reasons.push('HTML contains module scripts, modulepreload, or wasm-adjacent hints.');
  }
} else {
  const iocs = extractIocsFromFile(target);
  const hexVarCount = (text.match(/\b_0x[0-9a-f]+\b/g) || []).length;
  const browserify = /\(function\(\)\{function a\(b,c,d\)/.test(text);
  const numericAscii = (text.match(/\d{1,3},\d{1,3},\d{1,3},\d{1,3}/g) || []).length;
  const moduleLike = /\bimport\s+(?:[^'"]+from\s+)?['"]/.test(text) || /yew|wasm_bindgen|WebAssembly/.test(text);

  if (browserify || iocs.crypto_terms.length > 6) {
    families.push('browserify-or-crypto-bundle');
    reasons.push('Bundle bootstrap or dense crypto library signatures found.');
  }
  if (hexVarCount > 500) {
    families.push('string-table-obfuscation');
    reasons.push('Heavy _0x-style indirection detected.');
  }
  if (numericAscii > 8) {
    families.push('numeric-ascii-tail-builder');
    reasons.push('Dense numeric ASCII runs suggest encoded tail contract strings.');
  }
  if (moduleLike) {
    families.push('module-or-wasm-hybrid');
    reasons.push('Module or wasm-related loader hints found inside script.');
  }
  if (!families.length && iocs.route_fragments.some((s) => /\/api\/[A-Za-z0-9_-]+\/\d+/.test(s))) {
    families.push('request-contract-visible');
    reasons.push('Direct request route fragments are present in the file.');
  }
}

const result = {
  target,
  kind: isHtml ? 'html' : 'script',
  families: [...new Set(families)],
  reasons,
};

console.log(JSON.stringify(result, null, 2));
