#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function usage() {
  console.error(
    'Usage: run_composite_workflow.js [--bundle-dir <dir>] [--target <text>] [--output-dir <dir>] [--context-json <file>] [--allow-mutating-page-state] [--auto-local]'
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const options = {
  bundleDir: '',
  target: '',
  outputDir: '',
  contextJson: '',
  allowMutatingPageState: false,
  autoLocal: false,
};

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  const next = args[i + 1] || '';
  if (arg === '--bundle-dir') {
    options.bundleDir = path.resolve(next);
    i += 1;
  } else if (arg === '--target') {
    options.target = next;
    i += 1;
  } else if (arg === '--output-dir') {
    options.outputDir = path.resolve(next);
    i += 1;
  } else if (arg === '--context-json') {
    options.contextJson = path.resolve(next);
    i += 1;
  } else if (arg === '--allow-mutating-page-state') {
    options.allowMutatingPageState = true;
  } else if (arg === '--auto-local') {
    options.autoLocal = true;
  } else {
    usage();
  }
}

if (!options.bundleDir && !options.target) usage();

const ROOT = path.resolve(__dirname, '..');
const SCRIPTS = path.join(ROOT, 'scripts');

function readJsonIfExists(filePath, fallback = null) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : fallback;
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function relFrom(base, filePath) {
  return path.relative(base, filePath) || '.';
}

function dedupeByDestination(entries) {
  const seen = new Set();
  const out = [];
  for (const entry of entries || []) {
    const key = entry.destination || `${entry.source || ''}:${entry.status || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out;
}

function runNodeScript(scriptName, scriptArgs, cwd) {
  const result = spawnSync('node', [path.join(SCRIPTS, scriptName), ...scriptArgs], {
    cwd,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `${scriptName} failed`);
  }
  const stdout = (result.stdout || '').trim();
  return stdout ? JSON.parse(stdout) : {};
}

function runLocalAction(action) {
  const params = action.parameters || {};
  const args = [];
  if (action.recipient_name === 'compare_external_replay_to_runtime.js') {
    args.push(path.join(SCRIPTS, 'compare_external_replay_to_runtime.js'));
    args.push('--bundle-dir', params.bundle_dir);
    args.push('--validation-json', params.validation_json);
    if (params.output) args.push('--output', params.output);
  } else if (action.recipient_name === 'reconcile_external_replay_verification.js') {
    args.push(path.join(SCRIPTS, 'reconcile_external_replay_verification.js'));
    args.push('--bundle-dir', params.bundle_dir);
    if (params.compare_json) args.push('--compare-json', params.compare_json);
  } else if (action.recipient_name === 'scaffold_proxy_rpc_delivery.js') {
    args.push(path.join(SCRIPTS, 'scaffold_proxy_rpc_delivery.js'));
    args.push('--bundle-dir', params.bundle_dir);
    if (params.mode) args.push('--mode', params.mode);
  } else {
    throw new Error(`Unsupported local action: ${action.recipient_name}`);
  }

  const result = spawnSync('node', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `${action.recipient_name} failed`);
  }
  const stdout = (result.stdout || '').trim();
  return stdout ? JSON.parse(stdout) : {};
}

function inferHookPresets(text, evidence) {
  const haystack = `${text || ''} ${JSON.stringify(evidence || {})}`.toLowerCase();
  const presets = new Set();
  if (/cookie/.test(haystack)) presets.add('cookie-write');
  if (/jsonp|callback|script/.test(haystack)) presets.add('jsonp-insert');
  if (/fetch|sign|signature|auth header|token|nonce/.test(haystack)) presets.add('fetch-signature');
  if (/storage|localstorage|sessionstorage|seed/.test(haystack)) presets.add('storage-bootstrap');
  if (/crypto|aes|rsa|sha|md5|encrypt/.test(haystack)) presets.add('crypto-surface');
  if (/submit|call|business|builder/.test(haystack)) presets.add('business-function');
  if (!presets.size) presets.add('fetch-signature');
  return [...presets];
}

function findFormReplayInputs(bundleDir) {
  const evidence = readJsonIfExists(path.join(bundleDir, 'evidence.json'), {});
  const sourceHtmlRel = evidence.form_replay?.source_html || '';
  const pageContractRel = evidence.form_replay?.page_contract || '';
  if (!sourceHtmlRel || !pageContractRel) return null;
  return {
    sourceHtml: path.resolve(bundleDir, sourceHtmlRel),
    pageContract: path.resolve(bundleDir, pageContractRel),
  };
}

function sampleDirFromBundle(bundleDir) {
  return path.resolve(bundleDir, '..', '..');
}

const bundleDir = options.bundleDir;
const outDir = options.outputDir || bundleDir || process.cwd();
ensureDir(outDir);

const dispatchPath = path.join(outDir, 'workflow-dispatch.json');
const dispatch = runNodeScript(
  'dispatch_composite_workflow.js',
  [
    ...(bundleDir ? ['--bundle-dir', bundleDir] : []),
    ...(options.target ? ['--target', options.target] : []),
    '--output',
    dispatchPath,
  ],
  process.cwd()
);
const capabilityDimensions = dispatch.capability_dimensions || {};
const isSolverBacked = Boolean(capabilityDimensions.solver_backed);
const isHookBacked = Boolean(capabilityDimensions.hook_backed);
const isPcapBacked = Boolean(capabilityDimensions.pcap_backed);
const isArchivalBacked = Boolean(capabilityDimensions.archival_backed);

function capabilityFocusSummary() {
  if (dispatch.workflow_id === 'archival-wasm-solver') {
    return 'Capability-aware focus: preserve archival WASM solver or memory-oriented proof around checkFlag/AES/loader anchors instead of widening into replay-first work.';
  }
  if (dispatch.workflow_id === 'minimal-local-harness') {
    return 'Capability-aware focus: preserve a minimal local harness and challenge-success reconstruction path instead of inventing replay or live parity.';
  }
  if (dispatch.workflow_id === 'archival-antidebug-html') {
    return 'Capability-aware focus: preserve anti-debug bypass and unlock provenance instead of inventing a request or replay surface.';
  }
  if (dispatch.workflow_id === 'archival-runtime-internals-reference') {
    return 'Capability-aware focus: preserve runtime-internals patch or POC provenance, not request replay or generic endpoint discovery.';
  }
  if (isSolverBacked || isArchivalBacked) {
    return 'Capability-aware focus: preserve archival solver proof and avoid widening into fake live parity work.';
  }
  if (isPcapBacked && dispatch.current_maturity === 'replay-verified') {
    return 'Capability-aware focus: treat the bundle as a drift fixture and skip redundant capture or parity loops by default.';
  }
  if (isPcapBacked) {
    return 'Capability-aware focus: prefer capture-backed replay and parity checks over broad runtime discovery.';
  }
  if (isHookBacked) {
    return 'Capability-aware focus: deepen from existing hook truth into accepted paths instead of broadening hook coverage.';
  }
  return 'Capability-aware focus: no strong specialized dimension yet, so keep the workflow broad and evidence-seeking.';
}

function actionGenerationSummary() {
  if (dispatch.workflow_id === 'archival-wasm-solver') {
    return 'No follow-up browser actions were generated because this archival WASM case should deepen around solver, memory, and checkFlag/AES provenance before any replay-centric branch.';
  }
  if (dispatch.workflow_id === 'minimal-local-harness') {
    return 'No live browser actions were generated because this archival challenge should first preserve a minimal local harness and local-only proof before any parity claims.';
  }
  if (dispatch.workflow_id === 'archival-antidebug-html') {
    return 'No live browser actions were generated because this archival anti-debug case should first preserve bypass and unlock provenance before any parity or replay claims.';
  }
  if (dispatch.workflow_id === 'archival-runtime-internals-reference') {
    return 'No follow-up browser actions were generated because this archival runtime-internals case should preserve patch or POC provenance instead of pretending to be a request replay target.';
  }
  if (dispatch.workflow_id === 'archival-challenge-success' && (isSolverBacked || isArchivalBacked)) {
    return 'No follow-up actions were generated because this bundle is treated as archival solver-backed proof, not as a live replay or browser-capture target.';
  }
  if (dispatch.workflow_id === 'pcap-guided-form-replay' && isPcapBacked && dispatch.current_maturity === 'replay-verified') {
    return 'Follow-up actions were intentionally omitted because this bundle is already a verified pcap-backed drift fixture.';
  }
  if (dispatch.workflow_id === 'hook-to-provenance-loop' && isHookBacked) {
    return 'Follow-up actions stay narrow because the bundle already has hook-backed runtime truth and should deepen accepted paths instead of broadening coverage.';
  }
  return 'Follow-up actions were generated from the active workflow and current evidence floor.';
}

function shouldBuildArchivalPackage() {
  return [
    'archival-wasm-solver',
    'archival-runtime-internals-reference',
    'archival-challenge-success',
    'archival-antidebug-html',
    'minimal-local-harness',
  ].includes(dispatch.workflow_id);
}

const runResult = {
  generated_at: new Date().toISOString(),
  workflow_id: dispatch.workflow_id,
  bundle_dir: bundleDir || null,
  target: options.target || null,
  dispatch_rationale: dispatch.rationale || '',
  current_maturity: dispatch.current_maturity || 'unknown',
  capability_dimensions: capabilityDimensions,
  capability_focus: capabilityFocusSummary(),
  action_generation_summary: actionGenerationSummary(),
  dispatch_json: dispatchPath,
  executed_steps: [],
  manual_steps: [],
  action_list: [],
  auto_local_results: [],
  artifacts: [dispatchPath],
  status: 'completed-with-manual-steps',
};

let nextActionId = 1;

function recordExecuted(scriptName, scriptArgs, parsed) {
  runResult.executed_steps.push({
    type: 'script',
    script: scriptName,
    args: scriptArgs,
    result: parsed,
  });
}

function recordManual(stage, command, reason) {
  runResult.manual_steps.push({ stage, command, reason });
}

function addAction(kind, recipientName, parameters, note, metadata = {}) {
  const order = typeof metadata.order === 'number' ? metadata.order : runResult.action_list.length + 1;
  const stage = metadata.stage || 'unspecified';
  const guards = metadata.guards || [];
  const requirements = metadata.requirements || {};
  const effects = metadata.effects || {};
  const actionRationale = metadata.rationale || runResult.dispatch_rationale || '';
  const actionCapabilityFocus = metadata.capability_focus || runResult.capability_focus || '';
  runResult.action_list.push({
    id: `action-${String(nextActionId).padStart(3, '0')}`,
    kind,
    order,
    stage,
    recipient_name: recipientName,
    parameters,
    note: note || '',
    dispatch_rationale: actionRationale,
    capability_focus: actionCapabilityFocus,
    guards,
    requirements: {
      selected_page: Boolean(requirements.selected_page),
      active_target_loaded: Boolean(requirements.active_target_loaded),
      preload_ready: Boolean(requirements.preload_ready),
      runtime_evidence_present: Boolean(requirements.runtime_evidence_present),
      remote_validation_present: Boolean(requirements.remote_validation_present),
      compare_artifact_present: Boolean(requirements.compare_artifact_present),
    },
    effects: {
      mutates_page_state: Boolean(effects.mutates_page_state),
      mutates_bundle_state: Boolean(effects.mutates_bundle_state),
      network_observing_only: Boolean(effects.network_observing_only),
    },
    safe_auto_execute: kind === 'local-script',
  });
  nextActionId += 1;
}

function buildMcpBatch(actions) {
  const mcpActions = actions
    .filter((action) => action.kind === 'mcp-tool')
    .sort((a, b) => a.order - b.order);
  return {
    generated_at: runResult.generated_at,
    workflow_id: runResult.workflow_id,
    bundle_dir: runResult.bundle_dir,
    target: runResult.target,
    current_maturity: runResult.current_maturity,
    capability_dimensions: runResult.capability_dimensions,
    dispatch_rationale: runResult.dispatch_rationale,
    capability_focus: runResult.capability_focus,
    action_generation_summary: runResult.action_generation_summary,
    execution_notes: [
      'Execute actions in ascending order.',
      'Do not skip guard checks when preload injection or reload sequencing is involved.',
      'Actions marked as mutating page state should be run only after confirming the correct target tab is selected.',
    ],
    tool_uses: mcpActions.map((action) => ({
      id: action.id,
      order: action.order,
      stage: action.stage,
      recipient_name: action.recipient_name,
      parameters: action.parameters,
      guards: action.guards,
      requirements: action.requirements,
      effects: action.effects,
      note: action.note,
    })),
  };
}

function appendArtifactIndexEntry(index, bucket, filePath, status = 'generated') {
  index.groups = index.groups || { original: [], derived: [], evidence: [] };
  index.groups[bucket] = index.groups[bucket] || [];
  index.groups[bucket].push({
    status,
    source: path.resolve(filePath),
    destination: path.resolve(filePath),
  });
}

function maybeRunAutoLocal() {
  if (!options.autoLocal) return;
  for (const action of runResult.action_list) {
    if (action.kind !== 'local-script') continue;
    try {
      const parsed = runLocalAction(action);
      runResult.auto_local_results.push({
        recipient_name: action.recipient_name,
        status: 'ok',
        result: parsed,
      });
    } catch (error) {
      runResult.auto_local_results.push({
        recipient_name: action.recipient_name,
        status: 'failed',
        error: String(error),
      });
      runResult.status = 'failed';
    }
  }
}

try {
  if (dispatch.workflow_id === 'hook-to-provenance-loop') {
    const evidence = bundleDir ? readJsonIfExists(path.join(bundleDir, 'evidence.json'), {}) : {};
    const presets = inferHookPresets(options.target || dispatch.target || '', evidence);
    const hookOutDir = bundleDir || outDir;

    const profile = runNodeScript(
      'scaffold_hook_profile.js',
      ['--preset', presets.join(','), '--mode', 'summary', '--out', hookOutDir, '--target', options.target || dispatch.target || dispatch.workflow_id],
      process.cwd()
    );
    recordExecuted('scaffold_hook_profile.js', ['--preset', presets.join(','), '--mode', 'summary', '--out', hookOutDir], profile);
    runResult.artifacts.push(...profile.files.map((name) => path.join(hookOutDir, name)));

    const plan = runNodeScript(
      'build_hook_action_plan.js',
      [path.join(hookOutDir, 'hook-profile.json'), '--out', hookOutDir],
      process.cwd()
    );
    recordExecuted('build_hook_action_plan.js', [path.join(hookOutDir, 'hook-profile.json'), '--out', hookOutDir], plan);
    runResult.artifacts.push(...plan.files.map((name) => path.join(hookOutDir, name)));

    const runbook = runNodeScript(
      'build_hook_execution_runbook.js',
      [path.join(hookOutDir, 'hook-action-plan.json'), '--out', hookOutDir],
      process.cwd()
    );
    recordExecuted('build_hook_execution_runbook.js', [path.join(hookOutDir, 'hook-action-plan.json'), '--out', hookOutDir], runbook);
    runResult.artifacts.push(...runbook.files.map((name) => path.join(hookOutDir, name)));

    recordManual('runtime', 'Execute the generated hook runbook in the active browser session.', 'This runner does not auto-drive MCP browser hooks.');
    recordManual('evidence', 'Capture hook evidence and ingest it with ingest_hook_evidence.js.', 'Hook evidence remains runtime-bound and must come from a live target session.');
    addAction(
      'mcp-tool',
      'functions.mcp__js-reverse__inject_preload_script',
      { scriptFile: path.join(hookOutDir, 'hook-preload.js') },
      'Inject preload before reloading if early writes matter.',
      {
        order: 1,
        stage: 'runtime',
        guards: ['require-hook-preload-file', 'confirm-correct-target-page'],
        requirements: { selected_page: true, active_target_loaded: true, preload_ready: true },
        effects: { mutates_page_state: false, network_observing_only: false },
      }
    );
    addAction(
      'mcp-tool',
      'functions.mcp__js-reverse__navigate_page',
      { type: 'reload' },
      'Reload after preload injection so bootstrap hooks apply.',
      {
        order: 2,
        stage: 'runtime',
        guards: ['preload-injected', 'confirm-reload-safe'],
        requirements: { selected_page: true, active_target_loaded: true, preload_ready: true },
        effects: { mutates_page_state: true, network_observing_only: false },
      }
    );
    addAction(
      'mcp-tool',
      'functions.mcp__js-reverse__get_hook_data',
      { view: 'summary', maxRecords: 50 },
      'Collect summary hook evidence first, then ingest it with ingest_hook_evidence.js.',
      {
        order: 3,
        stage: 'evidence',
        guards: ['hook-runbook-executed'],
        requirements: { selected_page: true, active_target_loaded: true },
        effects: { mutates_page_state: false, network_observing_only: true },
      }
    );
  } else if (dispatch.workflow_id === 'archival-wasm-solver') {
    if (!bundleDir) {
      recordManual('source', 'Provide --bundle-dir for archival WASM solver workflows.', 'Archival WASM solver provenance is bundle-scoped.');
    } else {
      const report = runNodeScript(
        'build_archival_solver_provenance.js',
        [
          path.join(bundleDir, 'evidence.json'),
          '--output-json',
          path.join(bundleDir, 'solver-provenance-report.json'),
          '--output-md',
          path.join(bundleDir, 'solver-provenance-report.md'),
        ],
        process.cwd()
      );
      recordExecuted(
        'build_archival_solver_provenance.js',
        [
          path.join(bundleDir, 'evidence.json'),
          '--output-json',
          path.join(bundleDir, 'solver-provenance-report.json'),
          '--output-md',
          path.join(bundleDir, 'solver-provenance-report.md'),
        ],
        report
      );
      runResult.artifacts.push(
        path.join(bundleDir, 'solver-provenance-report.json'),
        path.join(bundleDir, 'solver-provenance-report.md')
      );
      recordManual('recover', 'Preserve checkFlag, loader, symbol-map, AES, or memory-oriented anchors before attempting any live-target reconstruction.', 'This class of archival WASM case is usually solved through solver or memory reasoning, not request replay.');
      recordManual('verify', 'Treat any solver-backed or challenge-success result as archival proof unless you later recover a surviving accepted live path.', 'Archival WASM solver proof and live parity remain different evidence classes.');
    }
  } else if (dispatch.workflow_id === 'minimal-local-harness') {
    if (!bundleDir) {
      recordManual('source', 'Provide --bundle-dir for minimal local harness workflows.', 'Local harness scaffolding is bundle-scoped.');
    } else {
      const harnessPlanJson = path.join(bundleDir, 'local-harness-plan.json');
      const harnessPlanMd = path.join(bundleDir, 'local-harness-plan.md');
      const harnessResultTemplateJson = path.join(bundleDir, 'local-harness-result-template.json');
      const harnessPlan = runNodeScript(
        'prepare_local_harness_plan.js',
        [
          bundleDir,
          '--output-json',
          harnessPlanJson,
          '--output-md',
          harnessPlanMd,
          '--result-template',
          harnessResultTemplateJson,
        ],
        process.cwd()
      );
      recordExecuted(
        'prepare_local_harness_plan.js',
        [
          bundleDir,
          '--output-json',
          harnessPlanJson,
          '--output-md',
          harnessPlanMd,
          '--result-template',
          harnessResultTemplateJson,
        ],
        harnessPlan
      );
      runResult.artifacts.push(harnessPlanJson, harnessPlanMd, harnessResultTemplateJson);
      recordManual('recover', 'Preserve the smallest runnable local harness or browser fixture that can exercise the preserved challenge logic.', 'This route is for archival challenge-success reconstruction, not request replay.');
      recordManual('evidence', 'If local execution succeeds, fill local-harness-result-template.json, normalize it with record_local_harness_result.js, then ingest it as local_harness challenge-success instead of replay or live runtime parity.', 'Local harness proof must remain explicitly local.');
      recordManual('verify', 'Only promote beyond local-only proof if a surviving live target or accepted remote path is later recovered.', 'This workflow intentionally stops at local proof unless the target surface changes.');
    }
  } else if (dispatch.workflow_id === 'archival-antidebug-html') {
    if (!bundleDir) {
      recordManual('source', 'Provide --bundle-dir for archival anti-debug HTML workflows.', 'Anti-debug unlock provenance is bundle-scoped.');
    } else {
      const antiDebugReportJson = path.join(bundleDir, 'archival-antidebug-report.json');
      const antiDebugReportMd = path.join(bundleDir, 'archival-antidebug-report.md');
      const report = runNodeScript(
        'build_archival_antidebug_report.js',
        [
          bundleDir,
          '--output-json',
          antiDebugReportJson,
          '--output-md',
          antiDebugReportMd,
        ],
        process.cwd()
      );
      recordExecuted(
        'build_archival_antidebug_report.js',
        [
          bundleDir,
          '--output-json',
          antiDebugReportJson,
          '--output-md',
          antiDebugReportMd,
        ],
        report
      );
      runResult.artifacts.push(antiDebugReportJson, antiDebugReportMd);
      recordManual('recover', 'Preserve deobfuscated unlock paths, localStorage gates, and anti-debug bypass notes as first-class artifacts.', 'These cases are usually local browser logic rather than replay surfaces.');
      recordManual('evidence', 'If a local unlock path is reconstructed, preserve it as archival or local-only challenge-success instead of remote parity.', 'Unlock proof should stay explicit about its local or archival boundary.');
      recordManual('verify', 'Do not promote this bundle into replay or accepted runtime claims unless a real remote surface is later recovered.', 'Anti-debug HTML cases rarely justify replay promotion on archival evidence alone.');
    }
  } else if (dispatch.workflow_id === 'archival-runtime-internals-reference') {
    if (!bundleDir) {
      recordManual('source', 'Provide --bundle-dir for archival runtime-internals workflows.', 'Runtime-internals archival provenance is bundle-scoped.');
    } else {
      recordManual('recover', 'Preserve writeup-derived patch targets, builtin names, and POC entrypoints as first-class artifacts.', 'These bundles are reference-heavy and should preserve engine reasoning before runtime speculation.');
      recordManual('verify', 'Do not promote this bundle into replay or accepted runtime claims unless a safe reproducible harness or preserved live asset set is found.', 'Runtime-internals references are valuable even without request parity.');
    }
  } else if (dispatch.workflow_id === 'archival-challenge-success') {
    if (!bundleDir) {
      recordManual('source', 'Provide --bundle-dir for archival challenge-success workflows.', 'Archival solver provenance is bundle-scoped.');
    } else {
      const report = runNodeScript(
        'build_archival_solver_provenance.js',
        [
          path.join(bundleDir, 'evidence.json'),
          '--output-json',
          path.join(bundleDir, 'solver-provenance-report.json'),
          '--output-md',
          path.join(bundleDir, 'solver-provenance-report.md'),
        ],
        process.cwd()
      );
      recordExecuted(
        'build_archival_solver_provenance.js',
        [
          path.join(bundleDir, 'evidence.json'),
          '--output-json',
          path.join(bundleDir, 'solver-provenance-report.json'),
          '--output-md',
          path.join(bundleDir, 'solver-provenance-report.md'),
        ],
        report
      );
      runResult.artifacts.push(
        path.join(bundleDir, 'solver-provenance-report.json'),
        path.join(bundleDir, 'solver-provenance-report.md')
      );
      if (isSolverBacked || isArchivalBacked) {
        recordManual('source', 'Only chase surviving live HTML/JS/WASM assets if a concrete archival mirror or accepted remote endpoint is discovered.', 'This bundle already has archival solver-backed proof, so broad live hunting is lower priority than preserving evidence boundaries.');
        recordManual('verify', 'Keep archival solver-backed challenge-success separate from replay verification and accepted remote parity.', 'Archival proof and live parity remain different evidence classes.');
      } else {
        recordManual('source', 'Keep looking for surviving live HTML/JS/WASM assets if the original challenge host can still be mirrored.', 'Archival solver provenance does not replace live asset capture.');
        recordManual('verify', 'Do not promote archival challenge-success to replay-verified unless surviving accepted remote parity is demonstrated.', 'Archival proof and live parity remain different evidence classes.');
      }
    }
  } else if (dispatch.workflow_id === 'pcap-guided-form-replay') {
    if (!bundleDir) {
      recordManual('source', 'Provide --bundle-dir for pcap-guided form replay.', 'This workflow needs bundle-local source snapshot and page-contract artifacts.');
    } else {
      const inputs = findFormReplayInputs(bundleDir);
      if (!inputs) {
        recordManual('recover', 'Generate static page contract and form replay inputs first.', 'evidence.form_replay source_html/page_contract are missing.');
      } else {
        const replay = runNodeScript(
          'scaffold_form_obfuscation_replay.js',
          ['--source-html', inputs.sourceHtml, '--page-contract', inputs.pageContract, '--bundle-dir', bundleDir],
          process.cwd()
        );
        recordExecuted('scaffold_form_obfuscation_replay.js', ['--source-html', inputs.sourceHtml, '--page-contract', inputs.pageContract, '--bundle-dir', bundleDir], replay);
        runResult.artifacts.push(replay.replay_file, path.join(bundleDir, 'form-replay-notes.md'));
      }
      if (dispatch.current_maturity === 'replay-verified' && isPcapBacked) {
        recordManual('verify', 'Use the pcap-backed replay pair as a drift fixture and only recapture remote browser submissions when you suspect algorithm drift.', 'This bundle already has verified parity, so default work should shift to regression rather than repeating the same capture loop.');
      } else {
        recordManual('runtime', 'Capture one real browser submission from the original remote target.', 'Remote method/url/fields/status remain the parity reference.');
        recordManual('verify', 'Create runtime and replay validation artifacts, then run compare_external_replay_to_runtime.js and reconcile_external_replay_verification.js.', 'Promotion requires non-synthetic accepted parity.');
      }
      const sampleDir = sampleDirFromBundle(bundleDir);
      if (dispatch.current_maturity !== 'replay-verified') {
        addAction(
          'browser-capture',
          'functions.mcp__chrome-devtools__list_network_requests',
          { resourceTypes: ['document', 'xhr', 'fetch', 'other'], pageSize: 10 },
          'Capture the real browser submission request and then inspect it with get_network_request.',
          {
            order: 1,
            stage: 'runtime',
            guards: ['submit-form-on-remote-target-first'],
            requirements: { selected_page: true, active_target_loaded: true },
            effects: { mutates_page_state: false, network_observing_only: true },
          }
        );
        addAction(
          'local-script',
          'compare_external_replay_to_runtime.js',
          {
            bundle_dir: bundleDir,
            validation_json: path.join(sampleDir, 'remote-replay-validation.json'),
            output: path.join(bundleDir, 'replay-validation-compare.json'),
          },
          'Run after remote runtime and replay validation artifacts exist.',
          {
            order: 2,
            stage: 'verify',
            guards: ['remote-validation-artifacts-present'],
            requirements: { remote_validation_present: true },
            effects: { mutates_bundle_state: true },
          }
        );
        addAction(
          'local-script',
          'reconcile_external_replay_verification.js',
          {
            bundle_dir: bundleDir,
            compare_json: path.join(bundleDir, 'replay-validation-compare.json'),
          },
          'Promote to replay-verified only after non-synthetic accepted parity is confirmed.',
          {
            order: 3,
            stage: 'verify',
            guards: ['compare-artifact-present', 'accepted-parity-confirmed'],
            requirements: { compare_artifact_present: true },
            effects: { mutates_bundle_state: true },
          }
        );
      }
    }
  } else if (dispatch.workflow_id === 'delivery-ready-replay') {
    if (!bundleDir) {
      recordManual('delivery', 'Provide --bundle-dir for delivery scaffold generation.', 'Delivery artifacts are bundle-scoped.');
    } else {
      const maturity = readJsonIfExists(path.join(bundleDir, 'maturity-summary.json'), {});
      const mode = (maturity.maturity === 'runtime-accepted' || maturity.maturity === 'replay-verified') ? 'python-replay' : 'jsrpc-bridge';
      const delivery = runNodeScript(
        'scaffold_proxy_rpc_delivery.js',
        ['--bundle-dir', bundleDir, '--mode', mode],
        process.cwd()
      );
      recordExecuted('scaffold_proxy_rpc_delivery.js', ['--bundle-dir', bundleDir, '--mode', mode], delivery);
      runResult.artifacts.push(...delivery.files.map((name) => path.join(bundleDir, name)));
      recordManual('verify', 'Confirm replay parity before treating delivery artifacts as production-ready.', 'Delivery scaffolds inherit current maturity and do not prove acceptance by themselves.');
      addAction(
        'local-script',
        'scaffold_proxy_rpc_delivery.js',
        { bundle_dir: bundleDir, mode },
        'Regenerate delivery scaffolds after replay or runtime truth changes.',
        {
          order: 1,
          stage: 'delivery',
          guards: ['bundle-present'],
          requirements: { runtime_evidence_present: true },
          effects: { mutates_bundle_state: true },
        }
      );
    }
  } else {
    recordManual('locate', 'Run page/source search and request initiator capture.', 'Search-first escalation still depends on the active target session.');
    if (isHookBacked) {
      recordManual('runtime', 'Use the current hook-backed runtime truth to target one deeper accepted path before broadening hook coverage.', 'This bundle already has runtime observations, so the next step is depth, not breadth.');
    } else {
      recordManual('runtime', 'Only activate priority hook plans after initiator evidence narrows the branch.', 'This workflow is intentionally conservative and session-driven.');
    }
    addAction(
      'mcp-tool',
      'functions.mcp__js-reverse__list_network_requests',
      { pageSize: 20 },
      'Start with request discovery before escalating hook coverage.',
      {
        order: 1,
        stage: 'locate',
        guards: ['confirm-correct-target-page'],
        requirements: { selected_page: true, active_target_loaded: true },
        effects: { mutates_page_state: false, network_observing_only: true },
      }
    );
    addAction(
      'mcp-tool',
      'functions.mcp__js-reverse__get_request_initiator',
      { requestId: '<candidate-request-id>' },
      'Use initiator evidence to decide whether the next step should be hooks or paused frames.',
      {
        order: 2,
        stage: 'locate',
        guards: ['replace-candidate-request-id-with-real-request'],
        requirements: { selected_page: true, active_target_loaded: true },
        effects: { mutates_page_state: false, network_observing_only: true },
      }
    );
  }
} catch (error) {
  runResult.status = 'failed';
  runResult.error = String(error);
}

if (runResult.status !== 'failed') {
  maybeRunAutoLocal();
}

const runJsonPath = path.join(outDir, 'workflow-run.json');
const runMdPath = path.join(outDir, 'workflow-run.md');
const actionListPath = path.join(outDir, 'workflow-action-list.json');
const mcpBatchPath = path.join(outDir, 'workflow-mcp-batch.json');
const mcpContextPath = path.join(outDir, 'workflow-mcp-context.json');
const mcpExecPlanPath = path.join(outDir, 'workflow-mcp-exec-plan.json');
const mcpCallPayloadPath = path.join(outDir, 'workflow-mcp-call-payload.json');
const mcpExecutionGuideJsonPath = path.join(outDir, 'workflow-mcp-execution-guide.json');
const mcpExecutionGuideMdPath = path.join(outDir, 'workflow-mcp-execution-guide.md');
const mcpExecutionTemplatePath = path.join(outDir, 'workflow-mcp-execution-template.json');
const archivalPackageJsonPath = path.join(outDir, 'archival-evidence-package.json');
const archivalPackageMdPath = path.join(outDir, 'archival-evidence-package.md');
fs.writeFileSync(runJsonPath, JSON.stringify(runResult, null, 2) + '\n', 'utf8');
fs.writeFileSync(actionListPath, JSON.stringify({
  generated_at: runResult.generated_at,
  workflow_id: runResult.workflow_id,
  bundle_dir: runResult.bundle_dir,
  target: runResult.target,
  auto_local: options.autoLocal,
  actions: runResult.action_list,
}, null, 2) + '\n', 'utf8');
fs.writeFileSync(mcpBatchPath, JSON.stringify(buildMcpBatch(runResult.action_list), null, 2) + '\n', 'utf8');
const contextArgs = [];
if (bundleDir) contextArgs.push('--bundle-dir', bundleDir);
if (options.contextJson) contextArgs.push('--context-json', options.contextJson);
const mcpContext = runNodeScript(
  'build_mcp_execution_context.js',
  [...contextArgs, '--output', mcpContextPath],
  process.cwd()
);
const mcpExecPlan = runNodeScript(
  'select_executable_mcp_actions.js',
  [
    mcpBatchPath,
    '--context-json',
    mcpContextPath,
    ...(options.allowMutatingPageState ? ['--allow-mutating-page-state'] : []),
    '--output',
    mcpExecPlanPath,
  ],
  process.cwd()
);
const mcpCallPayload = runNodeScript(
  'materialize_mcp_call_payload.js',
  [mcpExecPlanPath, '--output', mcpCallPayloadPath],
  process.cwd()
);
const mcpExecutionGuide = runNodeScript(
  'build_mcp_execution_guide.js',
  [
    mcpCallPayloadPath,
    '--output-json',
    mcpExecutionGuideJsonPath,
    '--output-md',
    mcpExecutionGuideMdPath,
  ],
  process.cwd()
);
runNodeScript(
  'prepare_mcp_execution_record_template.js',
  [mcpExecutionGuideJsonPath, '--output', mcpExecutionTemplatePath],
  process.cwd()
);
if (bundleDir && shouldBuildArchivalPackage()) {
  runNodeScript(
    'build_archival_evidence_package.js',
    [
      bundleDir,
      '--output-json',
      archivalPackageJsonPath,
      '--output-md',
      archivalPackageMdPath,
    ],
    process.cwd()
  );
  runResult.artifacts.push(archivalPackageJsonPath, archivalPackageMdPath);
}

if (bundleDir) {
  const artifactIndexPath = path.join(bundleDir, 'artifact-index.json');
  const artifactIndex = readJsonIfExists(artifactIndexPath, {
    output_dir: bundleDir,
    root_files: [],
    groups: { original: [], derived: [], evidence: [] },
  });
  const derivedWorkflowArtifacts = [
    dispatchPath,
    runJsonPath,
    runMdPath,
    actionListPath,
    mcpBatchPath,
    mcpContextPath,
    mcpExecPlanPath,
    mcpCallPayloadPath,
    mcpExecutionGuideJsonPath,
    mcpExecutionGuideMdPath,
    mcpExecutionTemplatePath,
    ...runResult.artifacts.filter((file) => path.dirname(file) === bundleDir),
  ];
  for (const file of derivedWorkflowArtifacts) {
    appendArtifactIndexEntry(artifactIndex, 'derived', file, 'generated');
  }
  artifactIndex.groups.derived = dedupeByDestination(artifactIndex.groups.derived || []);
  artifactIndex.groups.evidence = dedupeByDestination(artifactIndex.groups.evidence || []);
  writeJson(artifactIndexPath, artifactIndex);
}

const md = [
  '# Workflow Run',
  '',
  `- workflow_id: ${runResult.workflow_id}`,
  `- status: ${runResult.status}`,
  `- bundle_dir: ${runResult.bundle_dir || 'none'}`,
  `- target: ${runResult.target || 'none'}`,
  `- current_maturity: ${runResult.current_maturity}`,
  `- capability_dimensions: solver=${isSolverBacked}, hook=${isHookBacked}, pcap=${isPcapBacked}, archival=${isArchivalBacked}`,
  `- dispatch_rationale: ${runResult.dispatch_rationale || 'none'}`,
  `- capability_focus: ${runResult.capability_focus}`,
  `- action_generation_summary: ${runResult.action_generation_summary}`,
  '',
  '## Executed Steps',
  '',
  ...(runResult.executed_steps.length
    ? runResult.executed_steps.map((step) => `- ${step.script} ${step.args.map((arg) => `\`${arg}\``).join(' ')}`)
    : ['- none']),
  '',
  '## Manual Steps',
  '',
  ...(runResult.manual_steps.length
    ? runResult.manual_steps.map((step) => `- [${step.stage}] ${step.command}` + (step.reason ? `: ${step.reason}` : ''))
    : ['- none']),
  '',
  '## Auto Local Results',
  '',
  ...(runResult.auto_local_results.length
    ? runResult.auto_local_results.map((item) => `- ${item.recipient_name}: ${item.status}`)
    : ['- none']),
  '',
  '## Artifacts',
  '',
  ...runResult.artifacts.map((item) => `- \`${relFrom(outDir, item)}\``),
  `- \`${relFrom(outDir, actionListPath)}\``,
  `- \`${relFrom(outDir, mcpBatchPath)}\``,
  `- \`${relFrom(outDir, mcpContextPath)}\``,
  `- \`${relFrom(outDir, mcpExecPlanPath)}\``,
  `- \`${relFrom(outDir, mcpCallPayloadPath)}\``,
  `- \`${relFrom(outDir, mcpExecutionGuideJsonPath)}\``,
  `- \`${relFrom(outDir, mcpExecutionGuideMdPath)}\``,
  `- \`${relFrom(outDir, mcpExecutionTemplatePath)}\``,
  '',
  '## MCP Exec Plan',
  '',
  `- selected_page: ${Boolean(mcpContext.selected_page)}`,
  `- active_target_loaded: ${Boolean(mcpContext.active_target_loaded)}`,
  `- preload_ready: ${Boolean(mcpContext.preload_ready)}`,
  `- allow_mutating_page_state: ${Boolean(mcpContext.allow_mutating_page_state || options.allowMutatingPageState)}`,
  `- executable_actions: ${mcpExecPlan.executable_count}`,
  `- blocked_actions: ${mcpExecPlan.blocked_count}`,
  '',
  '## MCP Call Payload',
  '',
  `- execution_groups: ${mcpCallPayload.execution_groups.length}`,
  '',
  '## MCP Execution Guide',
  '',
  `- steps: ${mcpExecutionGuide.steps.length}`,
  '',
].join('\n');
fs.writeFileSync(runMdPath, md + '\n', 'utf8');

console.log(JSON.stringify({
  workflow_id: runResult.workflow_id,
  status: runResult.status,
  executed_steps: runResult.executed_steps.length,
  manual_steps: runResult.manual_steps.length,
  action_list: runResult.action_list.length,
  auto_local_results: runResult.auto_local_results.length,
  run_json: runJsonPath,
  action_list_json: actionListPath,
  mcp_batch_json: mcpBatchPath,
  mcp_context_json: mcpContextPath,
  mcp_exec_plan_json: mcpExecPlanPath,
  mcp_call_payload_json: mcpCallPayloadPath,
  mcp_execution_guide_json: mcpExecutionGuideJsonPath,
  mcp_execution_guide_md: mcpExecutionGuideMdPath,
  mcp_execution_template_json: mcpExecutionTemplatePath,
  run_md: runMdPath,
}, null, 2));
