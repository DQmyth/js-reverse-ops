#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const scriptsDir = path.join(rootDir, 'scripts');
const publicScriptsDir = path.join(rootDir, 'public', 'scripts');
const referencesDir = path.join(rootDir, 'references');
const repoMapPath = path.join(rootDir, 'public', 'repo-map.json');
const exportManifestPath = path.join(rootDir, 'assets', 'public-export-manifest.json');

const OUTPUT_JSON = path.join(referencesDir, 'scripts-catalog.json');
const OUTPUT_MD = path.join(referencesDir, 'scripts-catalog.md');

const DESCRIPTION_OVERRIDES = {
  'triage_js.sh': 'fast first-pass triage for one local JavaScript target',
  'extract_iocs.js': 'extract endpoints, crypto markers, eval sites, and other structural indicators',
  'extract_request_contract.js': 'recover likely request fields, methods, and signer-adjacent hints from code',
  'profile_page_family.js': 'classify one HTML page into a reverse family before deeper analysis',
  'extract_page_contract.js': 'recover visible page endpoints, helper calls, and challenge-side contracts from HTML',
  'check_public_release.sh': 'verify the sanitized public repository before publishing',
  'check_js_reverse_ops_deps.py': 'verify local dependency health for browser-backed reverse work',
  'check_debug_browser.sh': 'smoke-test the debug browser endpoint',
  'start_debug_browser.sh': 'launch a debug browser session for runtime capture work',
  'check_local_js_reverse_mcp.py': 'verify the local MCP bridge for browser-backed runtime tasks',
  'recover_string_table.js': 'decode string-array and wrapper-heavy obfuscation patterns',
  'run_ast_pipeline.js': 'run one staged AST cleanup and readability pipeline over packed code',
  'extract_packed_eval_payload.js': 'peel one packed eval wrapper and isolate its payload',
  'extract_vm_opcode_semantics.js': 'recover opcode-level semantics for VM-style bundles',
  'trace_module_graph.js': 'map module import relationships and likely request-producing nodes',
  'scaffold_proxy_rpc_delivery.js': 'generate a proxy or RPC-oriented replay handoff scaffold',
  'scaffold_external_replay.js': 'generate one replay scaffold for an extracted external target',
  'replay_scaffold.py': 'baseline Python replay scaffold for recovered request contracts',
  'normalize_task_artifacts.js': 'normalize one task directory into the canonical artifact layout',
  'scaffold_hook_profile.js': 'generate a repeatable hook profile for runtime browser instrumentation'
};

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function listFiles(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
}

function inferGroup(filename, repoMap) {
  const groups = repoMap.script_groups || {};
  for (const [group, entries] of Object.entries(groups)) {
    if (entries.some((entry) => path.basename(entry) === filename)) {
      return group;
    }
  }
  return 'other';
}

function inferStage(group) {
  if (group === 'triage') return 'locate';
  if (group === 'runtime') return 'runtime';
  if (group === 'recover') return 'recover';
  if (group === 'replay') return 'replay';
  if (group === 'maintenance') return 'maintenance';
  return 'mixed';
}

function humanize(filename) {
  return filename
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildCatalog() {
  const repoMap = readJson(repoMapPath);
  const exportManifest = readJson(exportManifestPath);
  const privateFiles = listFiles(scriptsDir).filter((name) => name !== '.js-reverse-ops-collect.json');
  const exportedFiles = new Set(
    privateFiles.filter((name) => !(exportManifest.skippedScriptFiles || []).includes(name)),
  );
  const publicOverlayFiles = new Set(listFiles(publicScriptsDir));

  const records = privateFiles.map((filename) => {
    const group = inferGroup(filename, repoMap);
    const stage = inferStage(group);
    const ext = path.extname(filename).replace(/^\./, '') || 'none';
    return {
      filename,
      extension: ext,
      group,
      stage,
      exported_publicly: exportedFiles.has(filename) || publicOverlayFiles.has(filename),
      has_public_overlay: publicOverlayFiles.has(filename),
      starter_script: (repoMap.starter_scripts || []).some((entry) => path.basename(entry) === filename),
      description: DESCRIPTION_OVERRIDES[filename] || humanize(filename),
      source_path: `scripts/${filename}`
    };
  });

  return {
    generated_at: new Date().toISOString(),
    total_scripts: records.length,
    public_exported_count: records.filter((record) => record.exported_publicly).length,
    records
  };
}

function renderMarkdown(catalog) {
  const groups = ['triage', 'runtime', 'recover', 'replay', 'maintenance', 'other'];
  const lines = [
    '# Scripts Catalog',
    '',
    'This catalog is a generated index of the private `scripts/` directory.',
    '',
    `- total scripts: \`${catalog.total_scripts}\``,
    `- exported in the public bundle: \`${catalog.public_exported_count}\``,
    '',
    'Use this file when the repository feels deeper than the starter scripts exposed in `repo-map.json`.',
    ''
  ];

  for (const group of groups) {
    const entries = catalog.records.filter((record) => record.group === group);
    if (!entries.length) continue;
    lines.push(`## ${group[0].toUpperCase()}${group.slice(1)}`, '');
    lines.push('| Script | Stage | Public | Description |');
    lines.push('| --- | --- | --- | --- |');
    for (const entry of entries) {
      lines.push(
        `| \`${entry.source_path}\` | \`${entry.stage}\` | \`${entry.exported_publicly ? 'yes' : 'no'}\` | ${entry.description} |`,
      );
    }
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

function main() {
  const catalog = buildCatalog();
  fs.writeFileSync(OUTPUT_JSON, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
  fs.writeFileSync(OUTPUT_MD, renderMarkdown(catalog), 'utf8');
  console.log(JSON.stringify({ status: 'ok', output_json: OUTPUT_JSON, output_md: OUTPUT_MD }, null, 2));
}

main();
