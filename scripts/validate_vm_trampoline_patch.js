#!/usr/bin/env node
const fs = require('fs');
const vm = require('vm');

function usage() {
  console.error('Usage: validate_vm_trampoline_patch.js <input.js-or-graph.json> [--output <result.json>]');
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

function excerptAround(text, idx, radius = 220) {
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + radius);
  return text.slice(start, end);
}

const target = resolveTarget(input);
const code = fs.readFileSync(target, 'utf8');
const marker = 'eval(function(';
const idx = code.indexOf(marker);

let patchedWrapper = '';
let runtimeError = '';
let stackHead = [];
let patchesApplied = [];
let faultExcerpt = '';

if (idx !== -1) {
  const runnable = code.slice(idx);
  patchedWrapper = runnable;

  if (patchedWrapper.includes('Z.apply[Z.$]=Z.call[Z.$]=Z.call')) {
    patchedWrapper = patchedWrapper.replace(
      'Z.apply[Z.$]=Z.call[Z.$]=Z.call',
      'Z.apply[Z.$]=Z.call[Z.$]=function(){return Function.prototype.apply.call(arguments[0], arguments[1], Array.prototype.slice.call(arguments,2));}'
    );
    patchesApplied.push('call-trampoline');
  }

  if (patchedWrapper.includes('Z.bind,function(')) {
    patchedWrapper = patchedWrapper.replace('Z.bind,function(', 'Function.prototype.bind,function(');
    patchesApplied.push('bind-slot');
  }

  const instrumented = patchedWrapper.replace('eval(function(', 'globalThis.__decoded_eval = (function(');
  const sandbox = {
    globalThis: {},
    window: {},
    Math,
    JSON,
    String,
    Function,
    Object,
    Number,
    Boolean,
    Buffer,
    Array,
    RegExp,
    Date,
    parseInt,
    decodeURIComponent,
    encodeURIComponent,
    console: { log() {}, warn() {}, error() {} }
  };
  sandbox.window = sandbox.globalThis;
  vm.createContext(sandbox);
  try {
    vm.runInContext(`
globalThis.window = globalThis;
globalThis.self = globalThis;
globalThis.global = globalThis;
globalThis.console = console;
globalThis.setTimeout = function(fn){ return typeof fn === 'function' ? fn() : 0; };
globalThis.clearTimeout = function(){};
globalThis.setInterval = function(fn){ return typeof fn === 'function' ? fn() : 0; };
globalThis.clearInterval = function(){};
globalThis.atob = globalThis.atob || function(x){ return Buffer.from(x, 'base64').toString('binary'); };
globalThis.btoa = globalThis.btoa || function(x){ return Buffer.from(x, 'binary').toString('base64'); };
${instrumented}
`, sandbox, { timeout: 1800 });
  } catch (err) {
    runtimeError = err.message;
    stackHead = String(err.stack || '').split('\n').slice(0, 6);
    for (const line of stackHead) {
      const match = line.match(/evalmachine\.<anonymous>:(\d+):(\d+)/);
      if (!match) continue;
      faultExcerpt = excerptAround(patchedWrapper, Math.max(0, Number(match[2]) - 1), 220);
      break;
    }
  }
}

const result = {
  input,
  target,
  inferred: {
    has_eval_wrapper: idx !== -1,
    patches_applied: patchesApplied,
    moved_past_bind_error: runtimeError && runtimeError !== 'Bind must be called on a function'
  },
  runtime_error: runtimeError || null,
  runtime_stack_head: stackHead,
  excerpts: {
    fault_excerpt: faultExcerpt
  },
  recommendations: [
    'If the error changes after call-trampoline patching, the next blocker is downstream of bootstrap aliasing.',
    'If bind remains the same even after trampoline patching, inspect dynamic receiver values flowing into the dispatch adapter.',
    'Keep this as a validation artifact, not a final replay patch.'
  ]
};

if (outputPath) fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
