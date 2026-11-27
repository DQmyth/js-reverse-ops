#!/usr/bin/env node
// decode_eval_wrapper — peels ONE layer of an eval-packed script and writes what the packer
// would have evaluated. Call it again on the output when the result is another shell.
//   classic shell   `eval(function(p,a,c,k,e,d){…}('<payload>',62,n,'<words>'.split('|'),0,{}))`
//                   unpacked by arithmetic (the packer's own algorithm, run in reverse): nothing
//                   from the sample is executed
//   any other shell the rest of the file from `eval(function(` is run in Node's `vm` with the eval
//                   captured — which IS executing the sample: `vm` is not a security boundary,
//                   so only do that with a sample you trust
// Verified on a classic-packer payload (byte-identical to its source; nested shells peel one
// layer per call) in tests/unit/eval-packer.test.js. Other packers: verified only on the
// hand-written samples of the older benchmarks.
// Usage: node scripts/decode_eval_wrapper.js <input.js-or-graph.json> [--output <decoded.js>] [--json <result.json>]
// Exit 0 decoded; 1 no shell found, or the shell did not yield a string — nothing written then;
// 2 usage.
const fs = require('fs');
const vm = require('vm');
const { classicShell, classicUnpack } = require('./inspect_obfuscation_family.js');

function usage(note) {
  if (note) console.error(`decode_eval_wrapper: ${note}`);
  console.error('Usage: decode_eval_wrapper.js <input.js-or-graph.json> [--output <decoded.js>] [--json <result.json>]');
  process.exit(2);
}

if (process.argv.length < 3) usage();

const args = process.argv.slice(2);
const input = args[0];
let outputPath = '';
let jsonPath = '';

for (let i = 1; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--output' || arg === '--json') {
    const value = args[++i];
    if (!value || value.startsWith('--')) usage(`${arg} needs a path`);
    if (arg === '--output') outputPath = value;
    else jsonPath = value;
  } else usage(`unknown option: ${arg}`);
}

function resolveTarget(inputPath) {
  if (!inputPath.endsWith('.json')) return inputPath;
  const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const top = (data.likely_request_modules || [])[0];
  if (!top) throw new Error('No likely_request_modules found in graph JSON');
  return top.node;
}

const target = resolveTarget(input);
let code;
try {
  code = fs.readFileSync(target, 'utf8');
} catch (err) {
  console.error(`decode_eval_wrapper: cannot read ${target} — ${err.message}`);
  process.exit(1);
}
const marker = 'eval(function(';
// the classic shell first: arithmetic, no execution. Kept only if the result parses.
const shell = classicShell(code);
let staticResult = null;
if (shell) {
  try {
    const candidate = classicUnpack(code);
    if (candidate && typeof candidate.decoded === 'string') {
      new vm.Script(candidate.decoded, { filename: 'classic-packer-payload' });
      staticResult = candidate;
    }
  } catch (_err) {
    staticResult = null;
  }
}
const idx = staticResult ? staticResult.offset : code.indexOf(marker);
let decoded = staticResult ? staticResult.decoded : '';
let runtimeError = '';
let shimEvents = [];
let traceEvents = [];
let provenanceCandidates = [];
let runtimeStackHead = [];
let runtimeFaultExcerpt = '';

function excerptAround(text, idx, radius = 180) {
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + radius);
  return text.slice(start, end);
}

function uniqBy(items, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function collectProvenanceCandidates(text) {
  const patterns = [
    { kind: 'bind', regex: /([_$A-Za-z][_$A-Za-z0-9\].]*)\.bind\s*\(/g },
    { kind: 'call', regex: /([_$A-Za-z][_$A-Za-z0-9\].]*)\.call\s*\(/g },
    { kind: 'apply', regex: /([_$A-Za-z][_$A-Za-z0-9\].]*)\.apply\s*\(/g },
    { kind: 'bind-symbol', regex: /\b([_$A-Za-z][_$A-Za-z0-9]*)\s*[:=]\s*[^;]{0,80}\bbind\b/g }
  ];
  const candidates = [];
  for (const { kind, regex } of patterns) {
    for (const match of text.matchAll(regex)) {
      const expression = match[1];
      const offset = match.index || 0;
      candidates.push({
        kind,
        expression,
        offset,
        excerpt: excerptAround(text, offset)
      });
      if (candidates.length >= 48) break;
    }
  }
  return uniqBy(candidates, (item) => `${item.kind}:${item.expression}`).slice(0, 16);
}

function extractFaultExcerpt(stackLines, text) {
  for (const line of stackLines) {
    const match = line.match(/evalmachine\.<anonymous>:(\d+):(\d+)/);
    if (!match) continue;
    const lineNo = Number(match[1]);
    const column = Number(match[2]);
    if (lineNo < 50 || !column) continue;
    return excerptAround(text, Math.max(0, column - 1), 220);
  }
  return '';
}

if (idx !== -1 && staticResult) {
  runtimeError = '';
} else if (idx !== -1) {
  const runnable = code.slice(idx);
  const instrumented = runnable.replace('eval(function(', 'globalThis.__decoded_eval = (function(');
  provenanceCandidates = collectProvenanceCandidates(runnable);
  const prelude = `
globalThis.window = globalThis;
globalThis.self = globalThis;
globalThis.global = globalThis;
globalThis.console = console;
globalThis.__shim_events = [];
globalThis.__trace = [];
globalThis.__recordTrace = function(kind, value){
  try {
    if (globalThis.__trace.length < 24) {
      globalThis.__trace.push({ kind: kind, value: String(value).slice(0, 160) });
    }
  } catch (_err) {}
};
globalThis.setTimeout = function(fn){ return typeof fn === 'function' ? fn() : 0; };
globalThis.clearTimeout = function(){};
globalThis.setInterval = function(fn){ return typeof fn === 'function' ? fn() : 0; };
globalThis.clearInterval = function(){};
globalThis.atob = globalThis.atob || function(x){ return Buffer.from(x, 'base64').toString('binary'); };
globalThis.btoa = globalThis.btoa || function(x){ return Buffer.from(x, 'binary').toString('base64'); };
(function(){
  var __origBind = Function.prototype.bind;
  function __record(kind, value){
    try {
      globalThis.__shim_events.push({ kind: kind, value: String(value).slice(0, 120) });
    } catch (_err) {}
  }
  Function.prototype.bind = function(){
    var fn = this;
    var ctx = arguments.length ? arguments[0] : undefined;
    var boundArgs = Array.prototype.slice.call(arguments, 1);
    globalThis.__recordTrace('bind-enter', fn && fn.name ? fn.name : typeof fn);
    if (typeof fn !== 'function') {
      __record('bind-non-function', fn);
      return function(){ return fn; };
    }
    return function(){
      var callArgs = Array.prototype.slice.call(arguments);
      return fn.apply(ctx, boundArgs.concat(callArgs));
    };
  };
}());
globalThis.__safeCall = function(fn, ctx){
  if (typeof fn !== 'function') return fn;
  var args = Array.prototype.slice.call(arguments, 2);
  return Function.prototype.call.apply(fn, [ctx].concat(args));
};
globalThis.__safeApply = function(fn, ctx, args){
  if (typeof fn !== 'function') return fn;
  return Function.prototype.apply.call(fn, ctx, args);
};
`;
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
    vm.runInContext(`${prelude}\n${instrumented}`, sandbox, { timeout: 1500 });
    if (typeof sandbox.globalThis.__decoded_eval === 'string') {
      decoded = sandbox.globalThis.__decoded_eval;
    } else {
      runtimeError = 'instrumented wrapper did not return a string';
    }
    shimEvents = Array.isArray(sandbox.globalThis.__shim_events) ? sandbox.globalThis.__shim_events.slice(0, 20) : [];
    traceEvents = Array.isArray(sandbox.globalThis.__trace) ? sandbox.globalThis.__trace.slice(0, 20) : [];
  } catch (err) {
    runtimeError = err.message;
    runtimeStackHead = String(err.stack || '')
      .split('\n')
      .slice(0, 8);
    runtimeFaultExcerpt = extractFaultExcerpt(runtimeStackHead, runnable);
    shimEvents = Array.isArray(sandbox.globalThis.__shim_events) ? sandbox.globalThis.__shim_events.slice(0, 20) : [];
    traceEvents = Array.isArray(sandbox.globalThis.__trace) ? sandbox.globalThis.__trace.slice(0, 20) : [];
  }
} else {
  runtimeError = 'no eval(function(...)) wrapper found';
}

const result = {
  input,
  target,
  inferred: {
    has_eval_wrapper: idx !== -1,
    wrapper_offset: idx !== -1 ? idx : null,
    method: staticResult ? 'static' : decoded ? 'vm' : null,
    packer: staticResult ? { family: 'classic-eval-packer', base: staticResult.base, dictionary_size: staticResult.dictionary_size } : null,
    decoded_length: decoded.length,
    shim_event_count: shimEvents.length,
    trace_event_count: traceEvents.length,
    provenance_candidate_count: provenanceCandidates.length
  },
  excerpts: {
    decoded_head: decoded.slice(0, 1200),
    runtime_fault_excerpt: runtimeFaultExcerpt
  },
  shim_events: shimEvents,
  trace_events: traceEvents,
  provenance_candidates: provenanceCandidates,
  recommendations: [
    'Use the decoded head to identify whether the first layer expands into readable JS or a second-stage VM.',
    'If this fails with a bind/apply/call runtimeError, use provenance_candidates and runtime_fault_excerpt to locate the likely non-callable object source before adding more shims.',
    'Pair this with extract_packed_eval_payload.js so packer family and first-layer output stay together.'
  ]
};

if (runtimeError) result.runtime_error = runtimeError;
if (runtimeStackHead.length) result.runtime_stack_head = runtimeStackHead;
if (outputPath && decoded) fs.writeFileSync(outputPath, decoded);
if (jsonPath) fs.writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
if (!decoded) {
  console.error(`decode_eval_wrapper: nothing decoded — ${runtimeError || 'the shell returned no string'}. Is the file packed at all? inspect_obfuscation_family.js says what it is.`);
  process.exit(1);
}
