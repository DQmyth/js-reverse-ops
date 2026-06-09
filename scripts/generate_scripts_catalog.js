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
  'js_reverse_ops.js': 'unified task intake router that recommends stage, scripts, playbooks, and hook presets',
  'map_case_to_pattern.js': 'map sanitized observations or case notes to reusable playbooks and first moves',
  'run_playbook.js': 'turn router and playbook output into a concrete run directory with hook scaffolds and optional local execution',
  'validate_delivery_artifacts.js': 'validate playbook runner delivery artifacts and bootstrap claim discipline',
  'promote_delivery_evidence.js': 'promote hook, MCP execution, or replay evidence into playbook runner delivery artifacts',
  'recommend_next_action.js': 'recommend the next smallest operator command from a playbook run directory',
  'run_public_benchmarks.js': 'run sanitized public benchmark cases for router and pattern-memory regressions',
  'generate_capability_scorecard.js': 'generate a public capability scorecard from repository evidence and benchmark results',
  'compare_external_skill_matrix.js': 'compare js-reverse-ops against external reverse-engineering skill and toolchain capability profiles',
  'plan_browser_mcp_smoke.js': 'plan browser MCP adapter smoke checks while preserving planned versus observed evidence boundaries',
  'verify_browser_mcp_smoke_record.js': 'verify browser MCP smoke execution records against adapter capabilities and sanitized observation requirements',
  'run_mcp_delivery_loop.js': 'run browser MCP delivery loop scaffolding, optional record verification, evidence promotion, validation, and readiness checks',
  'diagnose_replay_failure.js': 'classify rejected or divergent replay evidence and recommend the smallest repair lane',
  'generate_replay_delivery_client.js': 'generate sanitized Node and Python replay clients from accepted replay evidence',
  'validate_replay_delivery_client.js': 'validate generated replay client syntax, manifest safety, and delivery boundaries',
  'assess_static_recovery_truth.js': 'label static recovery output as inferred, runtime-correlated, divergent, or replay-verified',
  'validate_domain_handoff_record.js': 'validate cross-domain handoff records and boundary artifact preservation',
  'jsro.js': 'single-command CLI wrapper for routing, pattern mapping, runner, validation, benchmark, scorecard, install, and publish',
  'install_local.sh': 'install the public skill into CODEX_HOME skills directory',
  'publish_release.sh': 'run public release checks and optionally commit, tag, and push a release',
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

const METADATA_OVERRIDES = {
  'js_reverse_ops.js': {
    input_types: ['url', 'html', 'javascript'],
    triggers: ['unknown target', 'what should I run first', 'route this task', 'choose playbook'],
    outputs: ['routing plan', 'recommended scripts', 'recommended playbook'],
    next_scripts: ['triage_js.sh', 'profile_page_family.js', 'extract_page_contract.js', 'extract_request_contract.js']
  },
  'map_case_to_pattern.js': {
    input_types: ['case notes', 'runtime observations', 'failure summary'],
    triggers: ['which playbook fits this case', 'map symptoms to pattern', 'reuse prior case learning'],
    outputs: ['ranked pattern matches', 'first moves', 'hook presets'],
    next_scripts: ['js_reverse_ops.js', 'run_playbook.js', 'scaffold_hook_profile.js']
  },
  'run_playbook.js': {
    input_types: ['url', 'html', 'javascript', 'case notes'],
    triggers: ['run the matching playbook', 'make this actionable', 'generate reverse runbook'],
    outputs: ['playbook run json', 'playbook run markdown', 'hook profile scaffold'],
    next_scripts: ['validate_delivery_artifacts.js', 'scaffold_hook_profile.js', 'run_public_benchmarks.js']
  },
  'validate_delivery_artifacts.js': {
    input_types: ['playbook run directory'],
    triggers: ['validate delivery artifacts', 'check claim discipline', 'before publishing runner output'],
    outputs: ['delivery validation status'],
    next_scripts: []
  },
  'promote_delivery_evidence.js': {
    input_types: ['playbook run directory', 'hook evidence', 'mcp execution record', 'replay record'],
    triggers: ['promote runtime evidence', 'upgrade delivery artifacts', 'ingest hook evidence', 'mark accepted replay'],
    outputs: ['updated evidence', 'updated claims', 'updated provenance', 'updated replay status', 'updated operator review'],
    next_scripts: ['validate_delivery_artifacts.js']
  },
  'recommend_next_action.js': {
    input_types: ['playbook run directory', 'operator notes'],
    triggers: ['what next', 'next operator command', 'run directory blockers', 'continue this reverse run'],
    outputs: ['recommended action', 'recommended command', 'candidate next steps', 'readiness summary'],
    next_scripts: ['diagnose_runtime_capture_gaps.js', 'diagnose_replay_failure.js', 'assess_delivery_readiness.js']
  },
  'run_public_benchmarks.js': {
    input_types: ['public benchmark cases'],
    triggers: ['before publish', 'validate public skill quality', 'router regression check'],
    outputs: ['benchmark summary', 'case pass/fail results'],
    next_scripts: ['generate_capability_scorecard.js']
  },
  'generate_capability_scorecard.js': {
    input_types: ['public repository'],
    triggers: ['compare capability', 'score this skill', 'public quality summary'],
    outputs: ['capability scorecard json', 'capability scorecard markdown'],
    next_scripts: []
  },
  'compare_external_skill_matrix.js': {
    input_types: ['public repository', 'external skill regression model'],
    triggers: ['compare against other reverse skills', 'external regression matrix', 'competitive gap check'],
    outputs: ['external matrix json', 'external matrix markdown', 'priority improvements'],
    next_scripts: ['run_public_benchmarks.js', 'generate_market_gap_scorecard.js']
  },
  'plan_browser_mcp_smoke.js': {
    input_types: ['mcp server family', 'public repository'],
    triggers: ['browser mcp smoke test', 'adapter capability check', 'runtime surface gap'],
    outputs: ['browser mcp smoke plan json', 'browser mcp smoke plan markdown', 'missing capabilities'],
    next_scripts: ['verify_browser_mcp_smoke_record.js', 'prepare_mcp_execution_record_template.js', 'ingest_mcp_execution_record.js']
  },
  'verify_browser_mcp_smoke_record.js': {
    input_types: ['mcp execution record'],
    triggers: ['verify browser mcp smoke', 'adapter smoke execution record', 'runtime surface observation check', 'playwright mcp record', 'browser tools mcp record'],
    outputs: ['browser mcp smoke verification', 'observed capability coverage', 'raw capture risk warnings'],
    next_scripts: ['run_mcp_delivery_loop.js', 'ingest_mcp_execution_record.js', 'compare_mcp_execution_records.js']
  },
  'run_mcp_delivery_loop.js': {
    input_types: ['target', 'case notes', 'mcp execution record'],
    triggers: ['mcp delivery loop', 'browser mcp closed loop', 'promote mcp record into delivery artifacts'],
    outputs: ['playbook run directory', 'mcp smoke plan', 'mcp execution record template', 'delivery loop summary'],
    next_scripts: ['promote_delivery_evidence.js', 'validate_delivery_artifacts.js', 'assess_delivery_readiness.js']
  },
  'diagnose_replay_failure.js': {
    input_types: ['playbook run directory', 'replay record', 'divergence notes'],
    triggers: ['replay failed', 'accepted request wrong response', 'diagnose replay divergence', 'why not delivery ready'],
    outputs: ['replay failure diagnosis', 'recommended repair class', 'next scripts'],
    next_scripts: ['plan_env_patch_from_divergence.js', 'compare_external_replay_to_runtime.js', 'promote_delivery_evidence.js']
  },
  'generate_replay_delivery_client.js': {
    input_types: ['accepted replay record'],
    triggers: ['generate replay client', 'export python replay', 'export node replay', 'delivery client from replay evidence'],
    outputs: ['Node replay client', 'Python replay client', 'delivery manifest', 'delivery notes'],
    next_scripts: ['validate_replay_delivery_client.js', 'validate_delivery_artifacts.js', 'assess_delivery_readiness.js']
  },
  'validate_replay_delivery_client.js': {
    input_types: ['generated replay client directory'],
    triggers: ['validate replay client', 'check replay client safety', 'verify generated replay artifacts'],
    outputs: ['replay client validation status', 'syntax checks', 'manifest safety checks'],
    next_scripts: ['assess_delivery_readiness.js']
  },
  'assess_static_recovery_truth.js': {
    input_types: ['original javascript', 'recovered javascript', 'runtime evidence', 'replay record'],
    triggers: ['static output truth gate', 'adversarial static recovery', 'readable output verification'],
    outputs: ['static truth assessment', 'promotion state', 'risk signals'],
    next_scripts: ['scaffold_hook_profile.js', 'promote_delivery_evidence.js']
  },
  'validate_domain_handoff_record.js': {
    input_types: ['domain handoff record'],
    triggers: ['validate domain handoff', 'check wasm handoff', 'check packet handoff', 'check mobile handoff', 'check native handoff', 'check debugger frame handoff', 'check proxy rpc handoff'],
    outputs: ['handoff validation status', 'boundary artifact checks', 'promotion boundary warnings'],
    next_scripts: ['generate_domain_handoff_plan.js', 'promote_delivery_evidence.js']
  },
  'jsro.js': {
    input_types: ['cli command'],
    triggers: ['one command cli', 'npm bin', 'quick command wrapper'],
    outputs: ['delegated command output'],
    next_scripts: []
  },
  'install_local.sh': {
    input_types: ['public repository'],
    triggers: ['install skill', 'one command setup'],
    outputs: ['installed skill directory'],
    next_scripts: ['run_public_benchmarks.js']
  },
  'publish_release.sh': {
    input_types: ['public repository'],
    triggers: ['publish release', 'one command release'],
    outputs: ['release check status', 'optional commit', 'optional tag', 'optional push'],
    next_scripts: []
  },
  'triage_js.sh': {
    input_types: ['javascript'],
    triggers: ['first pass over local JS', 'large bundle triage'],
    outputs: ['summary', 'candidate markers'],
    next_scripts: ['extract_iocs.js', 'extract_request_contract.js']
  },
  'extract_iocs.js': {
    input_types: ['javascript'],
    triggers: ['find URLs and crypto markers', 'static endpoint discovery'],
    outputs: ['ioc json'],
    next_scripts: ['extract_request_contract.js', 'inspect_obfuscation_family.js']
  },
  'extract_request_contract.js': {
    input_types: ['javascript'],
    triggers: ['recover request shape', 'find signer fields'],
    outputs: ['request contract'],
    next_scripts: ['scaffold_external_replay.js', 'scaffold_hook_profile.js']
  },
  'profile_page_family.js': {
    input_types: ['html'],
    triggers: ['classify downloaded page', 'choose HTML workflow'],
    outputs: ['page family profile'],
    next_scripts: ['extract_page_contract.js']
  },
  'extract_page_contract.js': {
    input_types: ['html'],
    triggers: ['recover page endpoints and helpers'],
    outputs: ['page contract'],
    next_scripts: ['scaffold_hook_profile.js', 'trace_module_graph.js']
  },
  'scaffold_hook_profile.js': {
    input_types: ['hook preset', 'target description'],
    triggers: ['need repeatable runtime hook plan'],
    outputs: ['hook profile json', 'hook preload js'],
    next_scripts: ['build_hook_action_plan.js', 'build_hook_execution_runbook.js']
  },
  'scaffold_external_replay.js': {
    input_types: ['request contract', 'runtime evidence'],
    triggers: ['need Node replay scaffold'],
    outputs: ['replay scaffold'],
    next_scripts: ['prepare_external_replay_validation.js']
  },
  'replay_scaffold.py': {
    input_types: ['request contract'],
    triggers: ['need Python replay starter'],
    outputs: ['Python replay scaffold'],
    next_scripts: []
  },
  'check_public_release.sh': {
    input_types: ['public repository'],
    triggers: ['before publish', 'public export check'],
    outputs: ['release check status'],
    next_scripts: []
  }
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

function inferInputTypes(filename, group, ext) {
  if (METADATA_OVERRIDES[filename] && METADATA_OVERRIDES[filename].input_types) {
    return METADATA_OVERRIDES[filename].input_types;
  }
  if (filename.includes('page') || filename.includes('html')) return ['html'];
  if (filename.includes('module') || filename.includes('wasm')) return ['html', 'javascript'];
  if (group === 'runtime') return ['runtime evidence', 'browser target'];
  if (group === 'replay') return ['request contract', 'runtime evidence'];
  if (ext === 'py') return ['json', 'request contract'];
  return ['javascript'];
}

function inferTriggers(filename, description) {
  if (METADATA_OVERRIDES[filename] && METADATA_OVERRIDES[filename].triggers) {
    return METADATA_OVERRIDES[filename].triggers;
  }
  return description
    .split(/,| and | for | over /)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3);
}

function inferOutputs(filename, group) {
  if (METADATA_OVERRIDES[filename] && METADATA_OVERRIDES[filename].outputs) {
    return METADATA_OVERRIDES[filename].outputs;
  }
  if (filename.startsWith('extract_')) return ['extracted contract json'];
  if (filename.startsWith('scaffold_')) return ['scaffold files'];
  if (filename.startsWith('build_')) return ['derived artifact json', 'derived artifact markdown'];
  if (filename.startsWith('check_')) return ['health status'];
  if (group === 'recover') return ['recovery artifact'];
  return ['analysis artifact'];
}

function inferNextScripts(filename, repoMap) {
  if (METADATA_OVERRIDES[filename] && METADATA_OVERRIDES[filename].next_scripts) {
    return METADATA_OVERRIDES[filename].next_scripts.map((item) => `scripts/${item}`);
  }
  const out = new Set();
  for (const sequence of Object.values(repoMap.recommended_sequences || {})) {
    const index = sequence.findIndex((item) => path.basename(item) === filename);
    if (index !== -1) {
      for (const next of sequence.slice(index + 1)) {
        if (next.startsWith('scripts/')) out.add(next);
      }
    }
  }
  return [...out].slice(0, 5);
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
    const description = DESCRIPTION_OVERRIDES[filename] || humanize(filename);
    return {
      filename,
      extension: ext,
      group,
      stage,
      input_types: inferInputTypes(filename, group, ext),
      triggers: inferTriggers(filename, description),
      outputs: inferOutputs(filename, group),
      next_scripts: inferNextScripts(filename, repoMap),
      exported_publicly: exportedFiles.has(filename) || publicOverlayFiles.has(filename),
      has_public_overlay: publicOverlayFiles.has(filename),
      starter_script: (repoMap.starter_scripts || []).some((entry) => path.basename(entry) === filename),
      description,
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
    lines.push('| Script | Stage | Inputs | Outputs | Public | Description |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const entry of entries) {
      lines.push(
        `| \`${entry.source_path}\` | \`${entry.stage}\` | ${entry.input_types.join(', ')} | ${entry.outputs.join(', ')} | \`${entry.exported_publicly ? 'yes' : 'no'}\` | ${entry.description} |`,
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
