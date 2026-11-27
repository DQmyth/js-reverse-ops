#!/usr/bin/env node
// recover_string_table — recover obfuscator.io string tables with webcrack, and say so when it did not.
// webcrack is the engine, required as a library (optional dependency; webcrack itself needs Node 22 or
// 24). Until v1.8.5 this tool had none: on every real sample tried (javascript-obfuscator v0.27 / v2.19
// / v4.1 / v5.10 output and a live 127 KB bundle) it recovered 0 strings, exited 0, and still wrote the
// re-printed input to --output. Now, with webcrack 2.16 on Node 24, the v2.19 / v4.1 / v5.10 samples
// (plain string table; rc4 + flattening + dead code + self-defending) and the live bundle come out with
// every lookup replaced by a literal; the 2019 v0.27 layout stays undecoded and exits 1.
// --builtin-only keeps the older dependency-free pass: it matches a layout none of those samples has and
// evaluates the sample's own table code in Node's `vm`, which is not a security boundary.
//   exit 0  recovered, or the file carries no string table;  exit 1  string table present, nothing
//   recovered, no output file;  exit 2  usage
// Usage: node scripts/recover_string_table.js <input.js> [--output <out.js>] [--json <report.json>] [--limit <n>] [--builtin-only]

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const esprima = require('esprima');
const estraverse = require('estraverse');
const escodegen = require('escodegen');

function usage() {
  console.error('Usage: recover_string_table.js <input.js> [--output <out.js>] [--json <report.json>] [--limit <n>] [--builtin-only]');
  process.exit(2);
}

if (process.argv.length < 3) {
  usage();
}

const args = process.argv.slice(2);
const input = args[0];
let outputPath = '';
let jsonPath = '';
let limit = 64;
let builtinOnly = false;   // the older dependency-free pass only; webcrack is never called

for (let i = 1; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--output') {
    outputPath = args[++i] || '';
  } else if (arg === '--json') {
    jsonPath = args[++i] || '';
  } else if (arg === '--limit') {
    limit = Number(args[++i] || 64);
  } else if (arg === '--builtin-only') {
    builtinOnly = true;
  } else {
    usage();
  }
}

if (!input) {
  usage();
}

let code;
try {
  code = fs.readFileSync(input, 'utf8');
} catch (err) {
  console.error(`recover_string_table: cannot read ${input} — ${err.message}`);
  process.exit(2);
}

// `x(0x1a3, 'key')`, `x('0x3')` (2019 builds) or `x(291)` (as a re-printer emits it) is what an
// unresolved string-table lookup looks like, whatever sits before the `_0x<hex>` part of the name
// (nothing, `a0_`, …). This is the yardstick for "did anything get recovered". Counting the hex form
// alone let a half-processed file pass as recovered: the re-print had turned its indices decimal.
// (A first cut also demanded a prefix before `_0x`, scored the common unprefixed form as 0, and so
// never reached the fallback on real files.)
function countHexLookups(source) {
  const arg = `(?:['"](?:0x[0-9a-f]+|\\d+)['"]|0x[0-9a-f]+|\\d+)\\s*[,)]`;
  return (source.match(new RegExp(`\\b(?:[_$A-Za-z][\\w$]*)?_0x[0-9a-f]{4,8}\\s*\\(\\s*${arg}`, 'g')) || []).length;
}
const hexLookupsBefore = countHexLookups(code);

// webcrack marks the nodes it substitutes at the very end of a run with `__…__` names. One left in
// the output means its pass stopped halfway — seen on the legacy layout, where it dropped the table
// and the decoder but kept the calls that went through them.
const WEBRACK_PLACEHOLDER_RE = /\b__(?:STRING_ARRAY|DECODE_\d+|RAW_STRING_ARRAY|RC4_[A-Z_]+|BASE64_[A-Z_]+)__\b/g;

// obfuscator.io's table function keeps one shape across releases, names aside: it declares a
// literal array of strings, then rewrites itself into `return <that array>`. Recognised by
// shape because the prefixes on global names (`a0_0x…`) differ between releases.
const TABLE_FUNCTION_RE = /function\s+([\w$]+)\s*\(\s*\)\s*\{[^{}]{0,120}?\b[\w$]+\s*=\s*\[\s*['"`][\s\S]{0,2000000}?\1\s*=\s*function\s*\(\s*\)\s*\{\s*return\s+[\w$]+\s*;?\s*\}\s*;?\s*return\s+\1\s*\(\s*\)/;

function detectTableFunction(source) {
  const match = source.match(TABLE_FUNCTION_RE);
  return match ? match[1] : null;
}

function uniq(items) {
  return [...new Set(items)];
}

function evalArithmetic(expr) {
  if (!expr) return null;
  const safe = expr.replace(/\s+/g, '');
  if (!/^[0-9a-fx()+\-*/|&^<>]+$/i.test(safe)) return null;
  try {
    return Function(`return (${safe});`)();
  } catch (_err) {
    return null;
  }
}

function findMatchingBrace(text, startIdx) {
  let depth = 0;
  let quote = '';
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;
  for (let i = startIdx; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }
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
    if (ch === '/' && next === '/') {
      inLineComment = true;
      i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === '\'' || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function extractFunctionSource(text, name) {
  const re = new RegExp(`function\\s+${name}\\s*\\(`);
  const match = re.exec(text);
  if (!match) return '';
  const braceIdx = text.indexOf('{', match.index);
  if (braceIdx === -1) return '';
  const endIdx = findMatchingBrace(text, braceIdx);
  if (endIdx === -1) return '';
  return text.slice(match.index, endIdx + 1);
}

function splitArgs(argText) {
  const parts = [];
  let current = '';
  let depthParen = 0;
  let depthBracket = 0;
  let depthBrace = 0;
  let quote = '';
  let escaped = false;
  for (let i = 0; i < argText.length; i += 1) {
    const ch = argText[i];
    if (quote) {
      current += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === quote) {
        quote = '';
      }
      continue;
    }
    if (ch === '"' || ch === '\'' || ch === '`') {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '(') depthParen += 1;
    else if (ch === ')') depthParen -= 1;
    else if (ch === '[') depthBracket += 1;
    else if (ch === ']') depthBracket -= 1;
    else if (ch === '{') depthBrace += 1;
    else if (ch === '}') depthBrace -= 1;
    if (ch === ',' && depthParen === 0 && depthBracket === 0 && depthBrace === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function isLiteralNumber(expr) {
  return /^[\s()+\-*/|&^<>0-9a-fx]+$/i.test(expr);
}

function toLiteralValue(expr) {
  const trimmed = expr.trim();
  if (isLiteralNumber(trimmed)) return evalArithmetic(trimmed);
  if (/^['"`]/.test(trimmed)) {
    try {
      return Function(`return (${trimmed});`)();
    } catch (_err) {
      return null;
    }
  }
  return null;
}

const bootstrapMatch = code.match(/^\(function\([\s\S]*?\}\((_0x[0-9a-f]+),([^)]+)\)\);/i);
const arrayFunctionName = bootstrapMatch ? bootstrapMatch[1] : '';
const rotationExpr = bootstrapMatch ? bootstrapMatch[2].trim() : '';
const arrayFunctionSource = arrayFunctionName ? extractFunctionSource(code, arrayFunctionName) : '';

const resolverMatch = code.match(/function\s+(_0x[0-9a-f]+)\s*\([^)]*\)\s*\{[\s\S]{0,2000}?return\s+\1\s*=\s*function/);
const resolverName = resolverMatch ? resolverMatch[1] : '';
const resolverSource = resolverName ? extractFunctionSource(code, resolverName) : '';
const baseOffsetMatch = resolverSource.match(/_[0-9a-z]+\s*=\s*_[0-9a-z]+\s*-\s*\(([^;]+)\);/i);
const baseOffset = baseOffsetMatch ? evalArithmetic(baseOffsetMatch[1]) : null;

const wrapperRegex = new RegExp(`function\\s+([_$A-Za-z][_$A-Za-z0-9]*)\\s*\\(([^)]*)\\)\\s*\\{\\s*return\\s+${resolverName}\\(([^,]+),([^)]*)\\);\\s*\\}`, 'g');
const wrappers = [];
for (const match of code.matchAll(wrapperRegex)) {
  wrappers.push({
    name: match[1],
    args: match[2].split(',').map((s) => s.trim()).filter(Boolean),
    indexExpr: match[3].trim(),
    passthroughExpr: match[4].trim(),
    source: match[0]
  });
}

const snippetParts = [];
if (bootstrapMatch) snippetParts.push(bootstrapMatch[0]);
if (arrayFunctionSource) snippetParts.push(arrayFunctionSource);
if (resolverSource) snippetParts.push(resolverSource);
for (const wrapper of wrappers) snippetParts.push(wrapper.source);

const sandbox = {
  module: { exports: {} },
  exports: {},
  decodeURIComponent,
  encodeURIComponent,
  parseInt,
  String,
  Array,
  Math,
  JSON,
  Number,
  RegExp,
  Date
};
vm.createContext(sandbox);

let runtimeError = '';
// Only --builtin-only evaluates the sample's code, and it does so here in Node's `vm`, which is
// not a security boundary. webcrack evaluates inside isolated-vm instead.
if (builtinOnly) {
  try {
    const exportNames = uniq([arrayFunctionName, resolverName, ...wrappers.map((w) => w.name)]).filter(Boolean);
    const bundle = `${snippetParts.join('\n')}\nmodule.exports = { ${exportNames.join(', ')} };`;
    vm.runInContext(bundle, sandbox, { timeout: 1200 });
  } catch (err) {
    runtimeError = err.message;
  }
}

const exported = sandbox.module.exports || {};
const arrayFunction = arrayFunctionName ? exported[arrayFunctionName] : null;
const resolver = resolverName ? exported[resolverName] : null;
const rawArray = typeof arrayFunction === 'function' ? arrayFunction() : [];
const rotatedPreview = [];

if (typeof resolver === 'function' && typeof baseOffset === 'number') {
  for (let i = 0; i < Math.min(limit, rawArray.length); i += 1) {
    try {
      rotatedPreview.push({
        index: i,
        lookup: `0x${(baseOffset + i).toString(16)}`,
        value: resolver(baseOffset + i)
      });
    } catch (err) {
      rotatedPreview.push({
        index: i,
        lookup: `0x${(baseOffset + i).toString(16)}`,
        error: err.message
      });
    }
  }
}

function inlineWrapperCalls(source, wrapper) {
  const callRe = new RegExp(`${wrapper.name}\\(([^()]*?(?:\\([^()]*\\)[^()]*)*)\\)`, 'g');
  let replacements = 0;
  const next = source.replace(callRe, (full, argText) => {
    const parts = splitArgs(argText);
    if (parts.length !== wrapper.args.length) return full;
    const values = {};
    for (let i = 0; i < wrapper.args.length; i += 1) {
      const value = toLiteralValue(parts[i]);
      if (value === null || value === undefined) return full;
      values[wrapper.args[i]] = value;
    }
    let computedIndex;
    try {
      computedIndex = Function(...wrapper.args, `return (${wrapper.indexExpr});`)(...wrapper.args.map((name) => values[name]));
    } catch (_err) {
      return full;
    }
    if (typeof resolver !== 'function') return full;
    try {
      const decoded = resolver(computedIndex);
      if (typeof decoded !== 'string') return full;
      replacements += 1;
      return JSON.stringify(decoded);
    } catch (_err) {
      return full;
    }
  });
  return { code: next, replacements };
}

function evalNode(node, env) {
  if (!node) return { ok: false };
  if (node.type === 'Literal') return { ok: true, value: node.value };
  if (node.type === 'Identifier') {
    if (Object.prototype.hasOwnProperty.call(env, node.name)) return { ok: true, value: env[node.name] };
    return { ok: false };
  }
  if (node.type === 'UnaryExpression') {
    const arg = evalNode(node.argument, env);
    if (!arg.ok) return { ok: false };
    switch (node.operator) {
      case '+': return { ok: true, value: +arg.value };
      case '-': return { ok: true, value: -arg.value };
      case '!': return { ok: true, value: !arg.value };
      case '~': return { ok: true, value: ~arg.value };
      default: return { ok: false };
    }
  }
  if (node.type === 'BinaryExpression') {
    const left = evalNode(node.left, env);
    const right = evalNode(node.right, env);
    if (!left.ok || !right.ok) return { ok: false };
    switch (node.operator) {
      case '+': return { ok: true, value: left.value + right.value };
      case '-': return { ok: true, value: left.value - right.value };
      case '*': return { ok: true, value: left.value * right.value };
      case '/': return { ok: true, value: left.value / right.value };
      case '%': return { ok: true, value: left.value % right.value };
      case '<<': return { ok: true, value: left.value << right.value };
      case '>>': return { ok: true, value: left.value >> right.value };
      case '>>>': return { ok: true, value: left.value >>> right.value };
      case '|': return { ok: true, value: left.value | right.value };
      case '&': return { ok: true, value: left.value & right.value };
      case '^': return { ok: true, value: left.value ^ right.value };
      default: return { ok: false };
    }
  }
  return { ok: false };
}

function collectAstWrappers(tree) {
  const map = new Map();
  estraverse.traverse(tree, {
    enter(node, parent) {
      let name = '';
      let fn = null;
      if (node.type === 'FunctionDeclaration' && node.id) {
        name = node.id.name;
        fn = node;
      } else if (node.type === 'VariableDeclarator' && node.id && node.id.type === 'Identifier'
        && node.init && (node.init.type === 'FunctionExpression' || node.init.type === 'ArrowFunctionExpression')) {
        name = node.id.name;
        fn = node.init;
      } else {
        return;
      }
      if (!fn.body || fn.body.type !== 'BlockStatement' || fn.body.body.length !== 1) return;
      const ret = fn.body.body[0];
      if (!ret || ret.type !== 'ReturnStatement' || !ret.argument || ret.argument.type !== 'CallExpression') return;
      if (ret.argument.callee.type !== 'Identifier') return;
      map.set(name, {
        params: fn.params.map((p) => p.type === 'Identifier' ? p.name : null),
        call: ret.argument
      });
    }
  });
  return map;
}

function resolveWrapperCall(name, argValues, wrapperMap, depth = 0) {
  if (!name || depth > 8 || !wrapperMap.has(name)) return null;
  const wrapper = wrapperMap.get(name);
  const env = {};
  for (let i = 0; i < wrapper.params.length; i += 1) {
    env[wrapper.params[i]] = argValues[i];
  }
  const calleeName = wrapper.call.callee.name;
  if (calleeName === resolverName && typeof resolver === 'function') {
    const indexValue = evalNode(wrapper.call.arguments[0], env);
    if (!indexValue.ok) return null;
    try {
      return resolver(indexValue.value);
    } catch (_err) {
      return null;
    }
  }
  if (!wrapperMap.has(calleeName)) return null;
  const nextArgs = [];
  for (const argNode of wrapper.call.arguments) {
    const value = evalNode(argNode, env);
    if (!value.ok) return null;
    nextArgs.push(value.value);
  }
  return resolveWrapperCall(calleeName, nextArgs, wrapperMap, depth + 1);
}

let transformed = code;
let replacementCount = 0;
for (const wrapper of builtinOnly ? wrappers : []) {
  const result = inlineWrapperCalls(transformed, wrapper);
  transformed = result.code;
  replacementCount += result.replacements;
}

let astReplacementCount = 0;
// the AST re-print is what carries the neighborhood replacements into the text
let legacyOutput = transformed;
let legacyOutputReady = false;
if (builtinOnly) {
  try {
    const ast = esprima.parseScript(transformed, { range: true, tolerant: true });
    const wrapperMap = collectAstWrappers(ast);
    const nextAst = estraverse.replace(ast, {
      leave(node) {
        if (node.type !== 'CallExpression' || node.callee.type !== 'Identifier') return node;
        if (!wrapperMap.has(node.callee.name)) return node;
        const argValues = [];
        for (const arg of node.arguments) {
          const value = evalNode(arg, {});
          if (!value.ok) return node;
          argValues.push(value.value);
        }
        const decoded = resolveWrapperCall(node.callee.name, argValues, wrapperMap);
        if (typeof decoded !== 'string') return node;
        astReplacementCount += 1;
        return { type: 'Literal', value: decoded, raw: JSON.stringify(decoded) };
      }
    });
    legacyOutput = escodegen.generate(nextAst, {
      format: {
        indent: { style: '  ' },
        semicolons: true
      }
    });
    legacyOutputReady = true;
  } catch (err) {
    if (!runtimeError) runtimeError = `ast-inline: ${err.message}`;
  }
}

const result = {
  file: input,
  engine: builtinOnly ? 'builtin' : 'webcrack',
  recovered_by: 'none',
  string_table: {
    hex_indexed_lookups: hexLookupsBefore,
    table_function: detectTableFunction(code),
    legacy_layout: Boolean(arrayFunctionName || resolverName)
  },
  webcrack: builtinOnly ? { skipped: '--builtin-only' } : null,
  inferred: {
    array_function: arrayFunctionName || null,
    resolver_function: resolverName || null,
    rotation_expression: rotationExpr || null,
    rotation_value: evalArithmetic(rotationExpr),
    base_offset: baseOffset,
    raw_string_count: Array.isArray(rawArray) ? rawArray.length : 0,
    wrapper_function_count: wrappers.length,
    wrapper_samples: wrappers.slice(0, 40).map((w) => ({
      name: w.name,
      args: w.args,
      index_expr: w.indexExpr
    }))
  },
  samples: {
    raw_strings: Array.isArray(rawArray) ? rawArray.slice(0, Math.min(limit, rawArray.length)) : [],
    decoded_strings: rotatedPreview
  },
  transformed: {
    replacement_passes: replacementCount,
    ast_neighborhood_replacements: astReplacementCount,
    output_path: null
  },
  notes: [
    'Use this before broad AST cleanup on _0x-heavy bundles.',
    'Decoded strings are sampled after the bootstrap rotation and resolver base offset are applied.',
    'Inline replacement only affects direct literal wrapper calls. Complex dynamic calls still need runtime or AST work.'
  ]
};

if (runtimeError) {
  result.runtime_error = runtimeError;
}

const builtinOutput = legacyOutputReady ? legacyOutput : transformed;
const builtinRecovered = replacementCount + astReplacementCount;
const hexLookupsAfterBuiltin = countHexLookups(builtinOutput);
const tableFunctionAfterBuiltin = detectTableFunction(builtinOutput);

// A string table is "there" when a build's table function is recognised by shape, when
// hex-indexed lookups are visible, or when the legacy layout was recognised.
const present = result.string_table.hex_indexed_lookups > 0
  || Boolean(result.string_table.table_function)
  || result.string_table.legacy_layout;

function describeTable() {
  const bits = [];
  if (result.string_table.hex_indexed_lookups > 0) {
    bits.push(`${result.string_table.hex_indexed_lookups} hex-indexed lookups`);
  }
  if (result.string_table.table_function) bits.push(`table function ${result.string_table.table_function}`);
  if (result.string_table.legacy_layout) bits.push('legacy rotation layout');
  return bits.join(', ');
}

function readWebcrackPackage() {
  const pkgPath = path.join(path.dirname(require.resolve('webcrack')), '..', 'package.json');
  return JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
}

// webcrack's own engines field names the Node lines it is built for; on another line its
// native part may be missing, and the failure says so only in terms of ABI numbers.
function webcrackNodeHint() {
  try {
    const range = readWebcrackPackage().engines.node;
    const major = Number(process.versions.node.split('.')[0]);
    const supported = [...range.matchAll(/>=(\d+)/g)].some((m) => Number(m[1]) === major);
    return supported ? '' : `  webcrack declares "${range}"; this is Node ${process.version} — switch to one of those lines and reinstall\n`;
  } catch (_err) {
    return '';
  }
}

function webcrackVersion() {
  try {
    return readWebcrackPackage().version;
  } catch (_err) {
    return null;
  }
}

function loadWebcrack() {
  let mod;
  try {
    mod = require('webcrack');
  } catch (err) {
    return /Cannot find module 'webcrack'/.test(String(err && err.message))
      ? { state: 'missing' }
      : { state: 'failed', error: String(err && err.message) };
  }
  const run = typeof mod === 'function' ? mod : (mod.webcrack || mod.default);
  return typeof run === 'function'
    ? { state: 'ready', run }
    : { state: 'failed', error: 'webcrack exports no callable entry' };
}

(async () => {
  let finalOutput = builtinRecovered > 0 ? builtinOutput : null;
  if (builtinRecovered > 0) result.recovered_by = 'builtin';
  // where a table webcrack does not finish can still go: for tables without per-call keys
  // (plain or base64) the dependency-free decoder runs the sample's own lookup on any Node
  const runtimeHint = 'for a table without per-call keys (plain or base64), scripts/decode_string_array_runtime.js runs the sample\'s own decoder on any Node, no install';

  // nothing is left for webcrack when the built-in pass already took every lookup out
  const builtinFinished = builtinRecovered > 0 && hexLookupsAfterBuiltin === 0 && !tableFunctionAfterBuiltin;
  if (!builtinOnly && present && !builtinFinished) {
    const wc = loadWebcrack();
    if (wc.state !== 'ready') {
      result.webcrack = { state: wc.state, error: wc.error || null };
    } else {
      try {
        const out = await wc.run(code);
        const decoded = typeof out === 'string' ? out : (out && out.code) || '';
        const lookupsAfter = countHexLookups(decoded);
        const tableAfter = detectTableFunction(decoded);
        const placeholders = (decoded.match(WEBRACK_PLACEHOLDER_RE) || []).length;
        result.webcrack = {
          state: 'ran',
          version: webcrackVersion(),
          hex_indexed_lookups_after: lookupsAfter,
          table_function_after: tableAfter || null,
          unresolved_placeholders: placeholders
        };
        // progress is fewer lookups; a table that is gone only counts when there was no literal-index
        // lookup to count in the first place (they hide behind variables then)
        const progressed = lookupsAfter < hexLookupsBefore
          || (hexLookupsBefore === 0 && Boolean(result.string_table.table_function) && !tableAfter);
        if (placeholders > 0) {
          result.webcrack.state = 'incomplete';
        } else if (progressed && decoded) {
          finalOutput = decoded;
          result.recovered_by = 'webcrack';
        }
      } catch (err) {
        result.webcrack = { state: 'failed', error: String(err && err.message).split('\n')[0] };
      }
    }
  }

  // an unrecovered file must not leave a convincing-looking "output" behind
  result.transformed.output_path = finalOutput && outputPath ? outputPath : null;
  if (finalOutput && outputPath) {
    fs.writeFileSync(outputPath, finalOutput);
  }
  const lookupsFinal = finalOutput ? countHexLookups(finalOutput) : hexLookupsBefore;
  result.hex_calls = { before: hexLookupsBefore, after: lookupsFinal };
  result.output_bytes = finalOutput ? Buffer.byteLength(finalOutput) : null;
  if (jsonPath) {
    fs.writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`);
  }

  const failed = result.recovered_by === 'none' && present;
  const status = result.recovered_by === 'builtin'
    ? `recovered ${builtinRecovered} lookups with the built-in pass (hex-indexed lookups ${hexLookupsBefore} -> ${hexLookupsAfterBuiltin})`
    : result.recovered_by === 'webcrack'
      ? `hex-indexed lookups ${hexLookupsBefore} -> ${lookupsFinal} (file ${Buffer.byteLength(code)} -> ${result.output_bytes} bytes, webcrack ${result.webcrack.version || 'unknown'})`
      : failed
        ? `NOTHING RECOVERED from a file that carries a string table (${describeTable()})`
        : 'no string table found — nothing to recover';
  console.error(`recover_string_table: ${result.recovered_by} — ${status}`);
  if (result.recovered_by !== 'none' && lookupsFinal > 0) {
    console.error(`  ${lookupsFinal} calls of the form x(number) to hex-named functions remain — ordinary calls in obfuscated code, or lookups still indirect; if the latter, ${runtimeHint}`);
  }
  if (failed) {
    const wc = result.webcrack || {};
    const why = builtinOnly
      ? 'the built-in pass decoded nothing. Run again without --builtin-only to let webcrack handle it'
      : wc.state === 'incomplete'
        ? `webcrack's pass did not finish: ${wc.unresolved_placeholders} reference${wc.unresolved_placeholders === 1 ? '' : 's'} to its own placeholders ${wc.unresolved_placeholders === 1 ? 'is' : 'are'} still in the output — ${runtimeHint}`
        : wc.state === 'ran'
        ? `webcrack ran but resolved nothing in this file — ${runtimeHint}`
        : wc.state === 'missing'
          ? 'webcrack is not installed, and it is the engine of this tool. From the skill directory: `npm install` (it is an optional dependency), or `npm install webcrack`'
          : wc.state === 'failed'
            ? `webcrack failed on this file: ${wc.error}`
            : `${runtimeHint}`;
    console.error(`  ${why}`);
    if (wc.state === 'failed') process.stderr.write(webcrackNodeHint());
    if (runtimeError) console.error(`  built-in error: ${runtimeError}`);
  }

  console.log(JSON.stringify(result, null, 2));
  process.exitCode = failed ? 1 : 0;
})().catch((err) => {
  console.error(`recover_string_table: ${err.message}`);
  process.exit(2);
});
