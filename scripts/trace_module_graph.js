#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function usage() {
  console.error('Usage: trace_module_graph.js <entry1> [entry2 ...] [--root <dir>] [--json <result.json>]');
  process.exit(1);
}

if (process.argv.length < 3) {
  usage();
}

const args = process.argv.slice(2);
const entries = [];
const roots = [];
let jsonPath = '';

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--root') {
    roots.push(path.resolve(args[++i] || '.'));
  } else if (arg === '--json') {
    jsonPath = args[++i] || '';
  } else {
    entries.push(path.resolve(arg));
  }
}

if (!entries.length) {
  usage();
}

function uniq(items) {
  return [...new Set(items)];
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function fileKind(text, file) {
  if (/<html/i.test(text) || /\.html?$/i.test(file)) return 'html';
  return 'script';
}

function collect(re, text) {
  return uniq([...text.matchAll(re)].map((m) => m[1] || m[0]));
}

function toUrlPath(spec) {
  if (!spec) return spec;
  return spec.replace(/^https?:\/\/[^/]+/, '');
}

function addNode(nodes, id, props) {
  if (!nodes.has(id)) {
    nodes.set(id, { id, ...props });
    return;
  }
  Object.assign(nodes.get(id), props);
}

function addEdge(edges, from, to, kind) {
  const key = `${from}::${to}::${kind}`;
  if (!edges.has(key)) edges.set(key, { from, to, kind });
}

function maybeResolve(spec, baseFile, searchRoots) {
  if (!spec || /^https?:\/\//i.test(spec)) return null;
  const candidates = [];
  const baseDir = path.dirname(baseFile);
  if (spec.startsWith('.')) {
    candidates.push(path.resolve(baseDir, spec));
  } else if (spec.startsWith('/')) {
    for (const root of searchRoots) {
      candidates.push(path.resolve(root, `.${spec}`));
      candidates.push(path.resolve(root, spec.slice(1)));
    }
  } else {
    candidates.push(path.resolve(baseDir, spec));
    for (const root of searchRoots) candidates.push(path.resolve(root, spec));
  }
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function stemHint(spec) {
  const base = path.basename(spec || '', path.extname(spec || ''));
  return base
    .replace(/-[0-9a-f]{8,}$/i, '')
    .replace(/[_-](?:bg|min|bundle|starter)$/i, '')
    .toLowerCase();
}

function aliasResolve(spec, searchRoots) {
  const specBase = path.basename(spec || '').toLowerCase();
  const specStem = stemHint(spec);
  const candidates = [];
  for (const root of searchRoots) {
    if (!fs.existsSync(root)) continue;
    for (const name of fs.readdirSync(root)) {
      const full = path.join(root, name);
      if (!fs.statSync(full).isFile()) continue;
      const lower = name.toLowerCase();
      const lowerStem = stemHint(name);
      let score = 0;
      if (specBase && lower === specBase) score += 12;
      if (specStem && lowerStem && specStem === lowerStem) score += 9;
      if (specStem && lower.includes(specStem)) score += 6;
      if (/yew|wasm/.test(specBase) && /yew|wasm/.test(lower)) score += 3;
      if (/match\d+/.test(specBase) && /match\d+/.test(lower) && specBase.match(/match\d+/)[0] === lower.match(/match\d+/)[0]) score += 5;
      if (score > 0) candidates.push({ full, score, alias_label: name });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] || null;
}

function analyzeHtml(file, text) {
  const scriptTags = [...text.matchAll(/<script\b([^>]*)\bsrc="([^"]+)"/g)];
  const moduleScripts = uniq(
    scriptTags
      .filter((m) => /\btype="module"/.test(m[1]))
      .map((m) => m[2])
  );
  const classicScripts = uniq(
    scriptTags
      .filter((m) => !/\btype="module"/.test(m[1]))
      .map((m) => m[2])
  );
  return {
    moduleScripts,
    modulePreloads: collect(/<link[^>]+modulepreload[^>]+href="([^"]+)"/g, text),
    classicScripts,
    wasmHints: collect(/([A-Za-z0-9_./:-]+\.wasm)/g, text),
    dynamicImports: [],
    importSpecifiers: []
  };
}

function analyzeScript(text) {
  return {
    moduleScripts: [],
    modulePreloads: [],
    classicScripts: [],
    wasmHints: collect(/([A-Za-z0-9_./:-]+\.wasm)/g, text),
    dynamicImports: collect(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g, text),
    importSpecifiers: collect(/import\s+(?:[^'"]+from\s+)?['"]([^'"]+)['"]/g, text)
  };
}

function scoreModuleText(text, nodeId) {
  const signals = [];
  let score = 0;
  const checks = [
    { re: /\/api\//g, score: 8, label: 'api-route' },
    { re: /\bfetch\s*\(/g, score: 6, label: 'fetch' },
    { re: /\bXMLHttpRequest\b/g, score: 5, label: 'xhr' },
    { re: /\b(?:\$\.ajax|ajax\s*\(|axios)\b/g, score: 5, label: 'ajax-like' },
    { re: /(?:token|sign|nonce|timestamp|yt\d*)/gi, score: 4, label: 'request-field' },
    { re: /(?:crypto|md5|sha|aes|rsa|subtle)/gi, score: 3, label: 'crypto-marker' },
    { re: /\beval\s*\(/g, score: 2, label: 'packed-bootstrap' },
    { re: /(?:WebAssembly|wasm|yew)/gi, score: 2, label: 'wasm-or-yew' }
  ];
  for (const check of checks) {
    const count = (text.match(check.re) || []).length;
    if (!count) continue;
    score += Math.min(count, 3) * check.score;
    signals.push(`${check.label}:${count}`);
  }
  if (/match\d+/i.test(nodeId)) {
    score += 2;
    signals.push('match-artifact');
  }
  if (/yew|wasm/i.test(nodeId)) {
    score += 3;
    signals.push('hybrid-artifact-name');
  }
  if (/\.html?$/i.test(nodeId)) {
    score -= 2;
    signals.push('html-penalty');
  }
  return { score, signals };
}

const searchRoots = uniq([
  ...roots,
  ...entries.map((entry) => path.dirname(entry)),
  path.resolve('skills/js-reverse-ops/tmp_cases/scripts'),
  path.resolve('skills/js-reverse-ops/tmp_cases/topics')
]);

const nodes = new Map();
const edges = new Map();
const queue = [...entries];
const seenFiles = new Set();
const unresolved = [];
const localAnalyses = [];

while (queue.length) {
  const current = queue.shift();
  if (seenFiles.has(current) || !fs.existsSync(current)) continue;
  seenFiles.add(current);
  const text = read(current);
  const kind = fileKind(text, current);
  addNode(nodes, current, { kind, local_path: current });
  localAnalyses.push({
    node: current,
    kind,
    ...scoreModuleText(text, current)
  });

  const info = kind === 'html' ? analyzeHtml(current, text) : analyzeScript(text);
  const imports = uniq([...info.moduleScripts, ...info.modulePreloads, ...info.importSpecifiers, ...info.dynamicImports]);

  for (const src of info.classicScripts) {
    const nodeId = toUrlPath(src);
    addNode(nodes, nodeId, { kind: 'classic-script', source_path: src });
    addEdge(edges, current, nodeId, 'classic-script');
  }

  for (const wasm of info.wasmHints) {
    const nodeId = toUrlPath(wasm);
    addNode(nodes, nodeId, { kind: 'wasm-hint', source_path: wasm });
    addEdge(edges, current, nodeId, 'wasm-hint');
  }

  for (const spec of imports) {
    const nodeId = toUrlPath(spec);
    const local = maybeResolve(spec, current, searchRoots);
    const alias = local ? null : aliasResolve(spec, searchRoots);
    addNode(nodes, nodeId, {
      kind: 'module-specifier',
      source_path: spec,
      resolved_local_path: local || null,
      alias_local_path: alias ? alias.full : null,
      alias_label: alias ? alias.alias_label : null
    });
    const edgeKind = info.modulePreloads.includes(spec) ? 'modulepreload' : info.dynamicImports.includes(spec) ? 'dynamic-import' : 'import';
    addEdge(edges, current, nodeId, edgeKind);
    if (local && !seenFiles.has(local)) {
      queue.push(local);
    } else if (alias && !seenFiles.has(alias.full)) {
      queue.push(alias.full);
    } else if (!local) {
      unresolved.push({
        from: current,
        specifier: spec,
        alias_local_path: alias ? alias.full : null,
        alias_label: alias ? alias.alias_label : null
      });
    }
  }
}

const moduleEntrypoints = [...nodes.values()]
  .filter((node) => node.kind === 'module-specifier' || node.kind === 'html')
  .map((node) => node.id);

const candidatePool = localAnalyses.some((item) => item.kind !== 'html' && item.score > 0)
  ? localAnalyses.filter((item) => item.kind !== 'html' && item.score > 0)
  : localAnalyses.filter((item) => item.score > 0);

const rankedCandidates = candidatePool
  .sort((a, b) => b.score - a.score)
  .slice(0, 8);

const result = {
  entries,
  search_roots: searchRoots,
  summary: {
    node_count: nodes.size,
    edge_count: edges.size,
    resolved_local_nodes: [...nodes.values()].filter((node) => node.resolved_local_path).length,
    aliased_local_nodes: [...nodes.values()].filter((node) => node.alias_local_path).length,
    unresolved_imports: unresolved.length,
    module_entrypoints: moduleEntrypoints
  },
  likely_request_modules: rankedCandidates,
  nodes: [...nodes.values()],
  edges: [...edges.values()],
  unresolved_imports: unresolved,
  recommendations: [
    'Use the graph to separate HTML routing, module bootstrap, and wasm-orchestration layers.',
    'Resolve imported modules locally when possible, then inspect only the request-producing subgraph.',
    'If imports remain unresolved, capture runtime requests first and treat unresolved modules as orchestration until proven otherwise.'
  ]
};

if (jsonPath) {
  fs.writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`);
}

console.log(JSON.stringify(result, null, 2));
