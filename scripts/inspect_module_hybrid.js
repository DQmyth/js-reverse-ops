#!/usr/bin/env node
const fs = require('fs');

if (process.argv.length < 3) {
  console.error('Usage: inspect_module_hybrid.js <page.html-or-module.js>');
  process.exit(1);
}

const file = process.argv[2];
const text = fs.readFileSync(file, 'utf8');
const isHtml = /<html/i.test(text) || /<script/i.test(text);

function uniq(items) {
  return [...new Set(items)].sort();
}

function collect(re, source = text) {
  return uniq([...source.matchAll(re)].map((m) => m[1] || m[0]));
}

let imports = [];
let modulePreloads = [];
let wasmHints = [];
let frameworkHints = [];
let runtimeHints = [];
let appBundleHints = [];

if (isHtml) {
  imports = collect(/<script[^>]+type="module"[^>]+src="([^"]+)"/g);
  modulePreloads = collect(/<link[^>]+modulepreload[^>]+href="([^"]+)"/g);
  wasmHints = collect(/([A-Za-z0-9_./-]+\.wasm)/g);
  frameworkHints = collect(/(yew|wasm|rust|fonteditor)/ig);
  runtimeHints = collect(/(modulepreload|type="module"|WebAssembly)/g);
  appBundleHints = uniq([
    ...collect(/<script[^>]+src="([^"]+)"/g).filter((s) => /(flutter|main\.dart|canvaskit|manifest\.json|engit\.js)/i.test(s)),
    ...collect(/([A-Za-z0-9_./-]+(?:flutter|main\.dart|canvaskit|manifest\.json|engit)\.[A-Za-z0-9._-]+)/gi),
  ]);
  if (appBundleHints.some((s) => /canvaskit|flutter/i.test(s))) wasmHints = uniq([...wasmHints, ...appBundleHints.filter((s) => /canvaskit|flutter/i.test(s))]);
  if (appBundleHints.some((s) => /flutter|main\.dart|canvaskit/i.test(s))) frameworkHints = uniq([...frameworkHints, ...appBundleHints.filter((s) => /flutter|main\.dart|canvaskit/i.test(s)).map(() => 'flutter')]);
} else {
  imports = collect(/import\s+(?:[^'"]+from\s+)?['"]([^'"]+)['"]/g);
  wasmHints = collect(/([A-Za-z0-9_./-]+\.wasm)/g);
  frameworkHints = collect(/\b(yew|wasm_bindgen|WebAssembly|rust)\b/ig);
  runtimeHints = collect(/\b(import\(|export\s|eval\(|new\s+URL\()/g);
  appBundleHints = collect(/\b(flutter|main\.dart|canvaskit|manifest\.json|engit)\b/ig);
}

const result = {
  file,
  kind: isHtml ? 'html' : 'module-or-script',
  inferred: {
    is_module_hybrid: imports.length > 0 || modulePreloads.length > 0 || wasmHints.length > 0 || frameworkHints.length > 0 || appBundleHints.length > 0,
    imports,
    module_preloads: modulePreloads,
    wasm_hints: wasmHints,
    framework_hints: frameworkHints,
    runtime_hints: runtimeHints,
    app_bundle_hints: appBundleHints,
  },
  recommendations: [
    'Capture runtime requests before treating the file as a monolithic challenge script.',
    'Inspect module entrypoints and loader glue separately from the main core script.',
    'If wasm assets appear, treat JS as orchestration and look for request code in modules or runtime hooks.'
  ]
};

console.log(JSON.stringify(result, null, 2));
