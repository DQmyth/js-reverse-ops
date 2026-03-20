#!/usr/bin/env node
const fs = require('fs');
const vm = require('vm');
const esprima = require('esprima');
const estraverse = require('estraverse');
const escodegen = require('escodegen');

function usage() {
  console.error('Usage: recover_string_table.js <input.js> [--output <transformed.js>] [--json <result.json>] [--limit <n>]');
  process.exit(1);
}

if (process.argv.length < 3) {
  usage();
}

const args = process.argv.slice(2);
const input = args[0];
let outputPath = '';
let jsonPath = '';
let limit = 64;

for (let i = 1; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--output') {
    outputPath = args[++i] || '';
  } else if (arg === '--json') {
    jsonPath = args[++i] || '';
  } else if (arg === '--limit') {
    limit = Number(args[++i] || 64);
  } else {
    usage();
  }
}

if (!input) {
  usage();
}

const code = fs.readFileSync(input, 'utf8');

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
try {
  const exportNames = uniq([arrayFunctionName, resolverName, ...wrappers.map((w) => w.name)]).filter(Boolean);
  const bundle = `${snippetParts.join('\n')}\nmodule.exports = { ${exportNames.join(', ')} };`;
  vm.runInContext(bundle, sandbox, { timeout: 1200 });
} catch (err) {
  runtimeError = err.message;
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
for (const wrapper of wrappers) {
  const result = inlineWrapperCalls(transformed, wrapper);
  transformed = result.code;
  replacementCount += result.replacements;
}

let astReplacementCount = 0;
let finalOutput = transformed;
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
  finalOutput = escodegen.generate(nextAst, {
    format: {
      indent: { style: '  ' },
      semicolons: true
    }
  });
} catch (err) {
  if (!runtimeError) runtimeError = `ast-inline: ${err.message}`;
}

const result = {
  file: input,
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
    output_path: outputPath || null
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

if (outputPath) {
  fs.writeFileSync(outputPath, finalOutput);
}
if (jsonPath) {
  fs.writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`);
}

console.log(JSON.stringify(result, null, 2));
