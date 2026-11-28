#!/usr/bin/env node
// extract_module_entry_contract — what stands at the edges of ONE module file (or of the
// top-ranked module of a trace_module_graph.js graph): static import bindings, dynamic imports
// (a `/* webpackChunkName: … */` comment allowed), the globals it assigns (`window.X = …`,
// `globalThis.X = …`) with what is assigned, request-ish words it contains, `/api/…` routes, and
// bootstrap markers (eval, wasm). Regular expressions over the text, no parse.
// On a bundle the import lists are empty by truth — a bundler compiles imports away; whether it
// loads chunks is inspect_obfuscation_family.js's `chunk_calls`, not read here.
// Usage: node scripts/extract_module_entry_contract.js <input.js-or-graph.json> [--output <result.json>]
// Output: JSON — inferred (import_bindings, aliased_imports, dynamic_imports, global_assignments,
// request_field_hints, route_hints, bootstrap_hints), excerpts.lead_block, recommendations.
// Exit 1 usage; an unreadable input or a graph without a ranked module ends in the error thrown.

const fs = require('fs');
const { tokenAt, skipToken } = require('./inspect_obfuscation_family.js');

function usage() {
  console.error('Usage: extract_module_entry_contract.js <input.js-or-graph.json> [--output <result.json>]');
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

function loadGraph(inputPath) {
  if (!inputPath.endsWith('.json')) return null;
  return JSON.parse(fs.readFileSync(inputPath, 'utf8'));
}

function resolveTarget(inputPath) {
  if (!inputPath.endsWith('.json')) return inputPath;
  const data = loadGraph(inputPath);
  const top = (data.likely_request_modules || [])[0];
  if (!top) throw new Error('No likely_request_modules found in graph JSON');
  return top.node;
}

const graph = loadGraph(input);
const target = resolveTarget(input);
const code = fs.readFileSync(target, 'utf8');

// what follows `=`, up to where the assigned expression surely ends: `;`, or a `,`, `:` or an
// unbalanced `)` at depth zero — minified code writes `cond?window.X=fn:other`, and `fn` is what
// is assigned. Strings, comments and regexes are stepped over
function assignedValue(text, from) {
  let depth = 0;
  let i = from;
  for (; i < text.length && i - from < 240; i += 1) {
    if (tokenAt(text, i)) { i = skipToken(text, i) - 1; continue; }
    const ch = text[i];
    if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    // at depth zero a closing bracket, a comma or a colon belong to what surrounds the assignment
    else if (depth === 0 && (ch === ')' || ch === ']' || ch === '}' || ch === ';' || ch === ',' || ch === ':')) break;
    else if (ch === ')' || ch === ']' || ch === '}') depth -= 1;
  }
  return text.slice(from, i).trim();
}

const importMatches = [...code.matchAll(/import\s+([^'"]+?)\s+from\s+['"]([^'"]+)['"]/g)].map((m) => ({
  binding: m[1].trim(),
  specifier: m[2]
}));

const dynamicImports = [...code.matchAll(/import\s*\(\s*(?:\/\*[\s\S]*?\*\/\s*)?['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
// not `==`, not an arrow
const globalAssignments = [...code.matchAll(/(?:window|globalThis)\.([A-Za-z_$][A-Za-z0-9_$]*)\s*=(?![=>])\s*([^\n;]+)/g)].map((m) => ({
  target: m[1],
  value: assignedValue(code, m.index + m[0].length - m[2].trimStart().length)
}));
// the words as they are written, lower-cased: "X-Sign" and "sign(" are one hint. Bounded by
// letters: "assignment" is not "sign", " ByTagName" is not "yt" — but TOKEN_TABLE… still is
const requestFieldHints = uniq((code.match(/(?<![A-Za-z])(?:signature|token|sign|nonce|timestamp|authorization|cookie|yt\d*)(?![A-Za-z])/gi) || []).map((word) => word.toLowerCase())).sort();
const routeHints = uniq((code.match(/\/api\/[A-Za-z0-9/_-]+/g) || [])).sort();
const bootstrapHints = [];
if (/eval\s*\(/.test(code)) bootstrapHints.push('eval-bootstrap');
if (/WebAssembly|wasm|yew/i.test(code)) bootstrapHints.push('wasm-or-yew');

const leadExcerpt = code.slice(0, 640);
const aliasImports = graph
  ? (graph.nodes || [])
      .filter((node) => node.source_path && node.alias_local_path)
      .map((node) => ({
        specifier: node.source_path,
        alias_local_path: node.alias_local_path,
        alias_label: node.alias_label || null
      }))
  : [];

const result = {
  input,
  target,
  inferred: {
    import_bindings: importMatches,
    aliased_imports: aliasImports,
    dynamic_imports: dynamicImports,
    global_assignments: globalAssignments,
    request_field_hints: requestFieldHints,
    route_hints: routeHints,
    bootstrap_hints: bootstrapHints
  },
  excerpts: {
    lead_block: leadExcerpt
  },
  recommendations: [
    'Start from the imported entry module and any global assignment that exposes it.',
    'If request_field_hints are sparse, pair this with extract_request_neighborhood.js before deeper reading.',
    'If bootstrap_hints contains eval-bootstrap, treat the file as a loader and correlate with runtime initiator data.'
  ]
};

if (outputPath) fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
