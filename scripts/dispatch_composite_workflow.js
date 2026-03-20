#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function usage() {
  console.error(
    'Usage: dispatch_composite_workflow.js [--bundle-dir <dir>] [--target <text>] [--output <workflow.json>]'
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const options = {
  bundleDir: '',
  target: '',
  output: '',
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
  } else if (arg === '--output') {
    options.output = path.resolve(next);
    i += 1;
  } else {
    usage();
  }
}

if (!options.bundleDir && !options.target) usage();

function readJsonIfExists(filePath, fallback = null) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : fallback;
}

function pushStep(steps, stage, command, reason) {
  steps.push({ stage, command, reason });
}

const bundleDir = options.bundleDir;
const targetText = (options.target || '').toLowerCase();
const evidence = bundleDir ? readJsonIfExists(path.join(bundleDir, 'evidence.json'), {}) : {};
const maturity = bundleDir ? readJsonIfExists(path.join(bundleDir, 'maturity-summary.json'), {}) : {};
const artifactIndex = bundleDir ? readJsonIfExists(path.join(bundleDir, 'artifact-index.json'), {}) : {};
const staticAnalysis = bundleDir
  ? readJsonIfExists(path.join(bundleDir, 'artifacts', 'derived', 'static-analysis', 'static-analysis-summary.json'), {})
  : {};
const notes = Array.isArray(evidence.notes) ? evidence.notes.join(' ').toLowerCase() : '';
const sourcePaths = ((evidence.source_snapshot || {}).paths || []).join(' ').toLowerCase();
const publicWriteupFacts = evidence.public_writeup_facts || {};
const publicFactStack = (publicWriteupFacts.stack || []).map((item) => String(item).toLowerCase());
const publicCriticalPaths = (publicWriteupFacts.critical_paths || []).map((item) => String(item).toLowerCase());
const publicKeywords = ((((publicWriteupFacts.public_signals || {}).writeup_keywords) || [])).map((item) => String(item).toLowerCase());
const staticHelperMarkers = ((((staticAnalysis || {}).inferred || {}).helper_markers) || []).map((item) => String(item).toLowerCase());
const staticModuleHints = ((((staticAnalysis || {}).inferred || {}).module_hints) || []).map((item) => String(item).toLowerCase());
const staticFamilies = ((((staticAnalysis || {}).inferred || {}).families) || []).map((item) => String(item).toLowerCase());
const currentMaturity = maturity.maturity || 'unknown';
const capabilityDimensions = maturity.capability_dimensions || {};
const hasPcap = sourcePaths.includes('.pcap') || notes.includes('pcap');
const hasFormReplay = Boolean(evidence.form_replay && evidence.form_replay.generated);
const hasHookEvidence = Boolean(evidence.hook_evidence || notes.includes('hook'));
const hasArchivalChallengeSuccess = Boolean((evidence.challenge_success || {}).archival_public);
const runtimeAccepted = Boolean((maturity.signals || {}).runtime_request_accepted);
const replayScaffolded = Boolean((maturity.signals || {}).replay_scaffold_generated);
const solverBacked = Boolean(capabilityDimensions.solver_backed);
const hookBacked = Boolean(capabilityDimensions.hook_backed);
const pcapBacked = Boolean(capabilityDimensions.pcap_backed);
const archivalBacked = Boolean(capabilityDimensions.archival_backed);
const staticSignalText = [
  sourcePaths,
  notes,
  ...staticHelperMarkers,
  ...staticModuleHints,
  ...staticFamilies,
].join(' ');

function hasStaticAny(patterns) {
  return patterns.some((pattern) => staticSignalText.includes(pattern));
}

const emscriptenEntrypoint =
  publicCriticalPaths.some((item) => item.includes('module.ccall') || item.includes('module.cwrap') || item.includes('validate') || item.includes('checkauth') || item.includes('checkflag')) ||
  publicKeywords.some((item) => item.includes('module.ccall') || item.includes('module.cwrap') || item.includes('validate') || item.includes('checkauth') || item.includes('checkflag')) ||
  hasStaticAny(['module.ccall', 'module.cwrap', 'validate', 'checkauth', 'checkflag']);

const archivalWasmSolver =
  archivalBacked &&
  (
    publicFactStack.includes('webassembly') ||
    /webassembly|wasm/.test(sourcePaths) ||
    hasStaticAny(['webassembly', 'wasm', '.wasm'])
  ) &&
  (
    publicCriticalPaths.some((item) => item.includes('checkflag') || item.includes('aes')) ||
    hasStaticAny(['checkflag', 'aes', 'free_play.wasm', 'runtime.wasm'])
  ) &&
  !emscriptenEntrypoint;
const archivalChallengeReconstruction =
  (
    archivalBacked &&
    (
      publicFactStack.includes('webassembly') ||
      publicCriticalPaths.some((item) => item.includes('challenge-success') || item.includes('browser challenge ui')) ||
      hasStaticAny(['challenge-success', 'browser challenge ui', 'webassembly.instantiate', 'teen_wasm.wasm', 'module.ccall', 'module.cwrap', 'checkauth', 'validate'])
    )
  ) ||
  /module\.?c(?:call|wrap)|checkauth|validate|challenge-success reconstruction|browser challenge ui/.test(targetText);
const archivalAntiDebugHtml =
  (
    archivalBacked &&
    (
      publicCriticalPaths.some((item) => item.includes('anti-debug') || item.includes('unlock') || item.includes('localstorage')) ||
      publicKeywords.some((item) => item.includes('anti-debug') || item.includes('devtools') || item.includes('unlock')) ||
      hasStaticAny(['anti-debug', 'antidebug', 'unlock(', 'localstorage', 'devtools', 'setinterval', 'clear()'])
    )
  ) ||
  /anti-?debug|unlock|localstorage|devtools/.test(targetText);
const archivalRuntimeInternals =
  archivalBacked &&
  (publicFactStack.includes('v8') ||
    publicFactStack.some((item) => item.includes('engine') || item.includes('runtime')) ||
    publicCriticalPaths.some((item) => item.includes('promise') || item.includes('runtime')) ||
    hasStaticAny(['promiseresolvethenablejob', 'promise', 'runtime internals', 'engine', 'builtin', 'patch target']));

let workflowId = 'search-first-runtime-escalation';
let rationale = 'Default runtime-first escalation is the safest starting point when the target class is still broad.';
const steps = [];

if (archivalWasmSolver) {
  workflowId = 'archival-wasm-solver';
  rationale = 'The bundle or target already exposes archival WASM plus checkFlag/AES anchors, so the next workflow should preserve a solver or memory-oriented route instead of widening into replay-first work.';
  pushStep(steps, 'source', 'Preserve archival HTML, loader, and writeup facts for the WASM target.', 'Solver-backed archival WASM work depends on explicit preserved anchors.');
  pushStep(steps, 'recover', 'Materialize checkFlag, loader, symbol-map, and AES or memory-oriented hints as first-class artifacts.', 'The durable path is usually solver or memory reasoning, not endpoint replay.');
  pushStep(steps, 'evidence', 'Encode the solver or memory route into provenance and challenge-success scaffolds.', 'The point is to preserve a reproducible reverse chain even when live assets are missing.');
  pushStep(steps, 'verify', 'Keep archival solver proof separate from live parity and replay verification.', 'Archival WASM proof is strong but not equivalent to surviving remote acceptance.');
} else if (archivalRuntimeInternals) {
  workflowId = 'archival-runtime-internals-reference';
  rationale = 'The bundle or target points at engine or runtime internals, so the right workflow is reference preservation and POC provenance, not request replay.';
  pushStep(steps, 'source', 'Preserve writeup facts, patch targets, and any writeup-derived entrypoints.', 'Runtime-internals references lose value quickly if patch context is not preserved.');
  pushStep(steps, 'recover', 'Materialize patch, builtin, or POC anchors as first-class artifacts.', 'These cases are best carried by runtime-internals provenance rather than endpoint contracts.');
  pushStep(steps, 'evidence', 'Record the patch or POC route as archival evidence with clear boundaries.', 'Keep reference-heavy cases explicit so they do not get mistaken for replay targets.');
  pushStep(steps, 'verify', 'Avoid replay-style promotion unless a safe reproducible harness or preserved live target actually exists.', 'Reference-heavy engine cases should not be over-promoted.');
} else if (archivalChallengeReconstruction) {
  workflowId = 'minimal-local-harness';
  rationale = 'The bundle or target points at challenge-success reconstruction, so the next step should be a minimal local harness rather than replay or generic solver escalation.';
  pushStep(steps, 'source', 'Preserve writeup facts, loader hints, and challenge-success anchors.', 'Minimal local harness work still depends on explicit archival boundaries.');
  pushStep(steps, 'recover', 'Materialize the smallest runnable harness or browser fixture that can exercise the challenge logic.', 'A minimal harness is more honest than pretending request replay exists.');
  pushStep(steps, 'evidence', 'Preserve local-harness execution results and mark them as local-only proof.', 'Local harness proof is useful, but it should not be conflated with live parity.');
  pushStep(steps, 'verify', 'Only promote beyond local proof if a surviving live target or accepted remote path is later recovered.', 'This route is intentionally bounded by the archival surface.');
} else if (archivalAntiDebugHtml) {
  workflowId = 'archival-antidebug-html';
  rationale = 'The bundle or target points at anti-debug or unlock-style HTML logic, so the next step should preserve the bypass and unlock route rather than invent a request or replay surface.';
  pushStep(steps, 'source', 'Preserve writeup facts, archived HTML, and any anti-debug or unlock anchors.', 'These cases lose value quickly if the bypass context is flattened into generic notes.');
  pushStep(steps, 'recover', 'Materialize deobfuscated unlock paths, localStorage gates, and anti-debug bypass notes as first-class artifacts.', 'The durable reverse path is usually an unlock route, not a request contract.');
  pushStep(steps, 'evidence', 'Preserve bypass and unlock proof as archival challenge-success or archival-only evidence.', 'Anti-debug HTML proof should be explicit about being archival or local.');
  pushStep(steps, 'verify', 'Do not promote into replay or accepted runtime unless a real remote surface is later recovered.', 'These cases are usually local browser logic, not replay targets.');
} else if (solverBacked || archivalBacked || hasArchivalChallengeSuccess || /archival|writeup|solver|solved grid|challenge-success/.test(targetText)) {
  workflowId = 'archival-challenge-success';
  rationale = solverBacked || archivalBacked
    ? 'The bundle is already marked solver-backed or archival-backed, so the next workflow should preserve solver and challenge-success provenance instead of pretending live replay parity exists.'
    : 'The target is an archival or writeup-backed challenge where solver and challenge-success provenance are more valuable than fake live replay claims.';
  pushStep(steps, 'source', 'Preserve public writeup facts, source snapshot, and archival asset hints.', 'Archival cases need explicit boundaries before any solver or runtime claim is promoted.');
  pushStep(steps, 'recover', 'Materialize symbol maps, solver scaffolds, and solved outputs as first-class artifacts.', 'The solver route is the durable reverse path when surviving live assets are partial.');
  pushStep(steps, 'evidence', 'Build archival solver provenance and challenge-success artifacts.', 'Challenge-success should be preserved as a chain, not as an isolated flag note.');
  pushStep(steps, 'verify', 'Keep archival challenge-success separate from live remote parity and replay verification.', 'Archival proof is strong, but it is not a substitute for surviving accepted runtime parity.');
} else if (pcapBacked || (hasPcap && hasFormReplay) || /pcap|form|onsubmit|hidden field/.test(targetText)) {
  workflowId = 'pcap-guided-form-replay';
  rationale = pcapBacked
    ? 'The bundle is already pcap-backed, so replay and drift handling should continue from capture-backed request truth rather than broad runtime discovery.'
    : 'The target exposes form transforms and packet truth, so form replay should be driven from capture-backed credentials rather than broad hook activation.';
  pushStep(steps, 'source', 'Import HTML and pcap into the sample bundle.', 'Packet-guided replay needs both the transform source and the capture artifact.');
  pushStep(steps, 'recover', 'Extract form contract and inline transform from the page.', 'Hidden fields, action, and onsubmit logic define the replay contract.');
  pushStep(steps, 'replay', 'Generate form replay scaffold and preserve cleared source fields.', 'Parity often depends on both transformed hidden fields and emptied visible inputs.');
  pushStep(steps, 'runtime', 'Capture one real browser submission from the original remote target.', 'Remote method, URL, field set, and response status remain the source of truth.');
  pushStep(steps, 'verify', 'Compare replay to runtime truth and reconcile replay verification.', 'Promotion to replay-verified requires non-synthetic accepted parity.');
} else if (hookBacked || hasHookEvidence || /hook|cookie|jsonp|script insert|storage|auth header|token|nonce/.test(targetText)) {
  workflowId = 'hook-to-provenance-loop';
  rationale = hookBacked
    ? 'The bundle is already hook-backed, so the next value comes from deepening accepted paths and turning runtime observations into durable provenance.'
    : 'Hook-backed evidence is either already present or strongly implied by the target question, so the next value comes from turning hook captures into durable provenance.';
  pushStep(steps, 'runtime', 'Scaffold a hook profile from the closest presets.', 'Preset-driven hook planning keeps runtime work repeatable.');
  pushStep(steps, 'runtime', 'Compile the hook action plan and execution runbook.', 'The runbook becomes the operator-facing source of truth.');
  pushStep(steps, 'runtime', 'Capture hook evidence in summary mode first.', 'Summary capture keeps noise low and preserves timing.');
  pushStep(steps, 'evidence', 'Ingest hook evidence into the bundle evidence surface.', 'Claims, provenance, and risk should consume hook data automatically.');
  pushStep(steps, 'verify', 'Rebuild claim, provenance, and risk outputs from the new hook evidence.', 'The hook path is only useful if it changes durable bundle state.');
} else if (runtimeAccepted || replayScaffolded || /proxy|burp|mitm|jsrpc|delivery|handoff/.test(targetText)) {
  workflowId = 'delivery-ready-replay';
  rationale = 'The bundle already has replay-adjacent evidence, or the user is asking for an operational handoff rather than first-pass analysis.';
  pushStep(steps, 'runtime', 'Confirm the latest runtime truth and maturity level.', 'Delivery should not outrun the current evidence floor.');
  pushStep(steps, 'replay', 'Scaffold or refresh replay artifacts against the accepted request contract.', 'Delivery output depends on a stable replay surface.');
  pushStep(steps, 'verify', 'Run replay validation and compare against browser truth.', 'Do not mark delivery-ready without parity evidence.');
  pushStep(steps, 'delivery', 'Emit python-replay, jsrpc-bridge, or proxy-injector artifacts.', 'Pick the smallest delivery mode that matches the operator goal.');
} else {
  workflowId = 'search-first-runtime-escalation';
  rationale = 'The target still looks like a general runtime tracing problem, so start with search and only escalate hooks after initiator evidence exists.';
  pushStep(steps, 'locate', 'Search page and sources for endpoint, token, cookie, and helper signals.', 'Broad search is cheaper than broad hook activation.');
  pushStep(steps, 'runtime', 'Capture request initiators and summary hook observations.', 'Initiator evidence narrows the call path quickly.');
  pushStep(steps, 'runtime', 'Escalate to priority hook plan only for the winning branch.', 'This preserves flow and reduces noise.');
  pushStep(steps, 'runtime', 'Use paused frames only if hook evidence is insufficient.', 'Breakpoints stay narrow and evidence-backed.');
}

const result = {
  generated_at: new Date().toISOString(),
  bundle_dir: bundleDir || null,
  target: options.target || null,
  current_maturity: currentMaturity,
  capability_dimensions: capabilityDimensions,
  workflow_id: workflowId,
  rationale,
  steps,
  suggested_references: [
    'references/composite-workflows.md',
    workflowId === 'hook-to-provenance-loop' ? 'references/browser-hooks.md' : null,
    workflowId === 'delivery-ready-replay' ? 'references/proxy-rpc-integration.md' : null,
    workflowId === 'pcap-guided-form-replay' ? 'references/external-benchmark-sources.md' : null,
    workflowId === 'archival-challenge-success' ? 'references/external-benchmark-sources.md' : null,
    workflowId === 'archival-wasm-solver' ? 'references/external-benchmark-sources.md' : null,
    workflowId === 'archival-runtime-internals-reference' ? 'references/external-benchmark-sources.md' : null,
    workflowId === 'minimal-local-harness' ? 'references/external-benchmark-sources.md' : null,
    workflowId === 'archival-antidebug-html' ? 'references/external-benchmark-sources.md' : null,
  ].filter(Boolean),
};

if (options.output) {
  fs.writeFileSync(options.output, JSON.stringify(result, null, 2) + '\n', 'utf8');
}

console.log(JSON.stringify(result, null, 2));
