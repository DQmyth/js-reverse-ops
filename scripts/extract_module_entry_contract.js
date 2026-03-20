#!/usr/bin/env node
const fs = require('fs');

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

const importMatches = [...code.matchAll(/import\s+([^'"]+?)\s+from\s+['"]([^'"]+)['"]/g)].map((m) => ({
  binding: m[1].trim(),
  specifier: m[2]
}));

const dynamicImports = [...code.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
const globalAssignments = [...code.matchAll(/(?:window|globalThis)\.([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*([^\n;]+)/g)].map((m) => ({
  target: m[1],
  value: m[2].trim()
}));
const requestFieldHints = uniq((code.match(/(?:token|sign|nonce|timestamp|yt\d*)/gi) || [])).sort();
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
