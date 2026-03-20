#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function usage() {
  console.error('Usage: build_provenance_graph.js <evidence.json> [--output <provenance-graph.json>] [--summary <provenance-summary.md>] [--request-var-capture <capture-template.json>] [--runtime-capture <runtime-capture.json>]... [--paused-frame-locals <paused-frame-locals.json>]...');
  process.exit(1);
}

const args = process.argv.slice(2);
if (!args.length) usage();

const inputPath = args[0];
let outputPath = '';
let summaryPath = '';
let requestVarCapturePath = '';
const runtimeCapturePaths = [];
const pausedFrameLocalPaths = [];
for (let i = 1; i < args.length; i += 1) {
  if (args[i] === '--output') outputPath = args[++i] || '';
  else if (args[i] === '--summary') summaryPath = args[++i] || '';
  else if (args[i] === '--request-var-capture') requestVarCapturePath = args[++i] || '';
  else if (args[i] === '--runtime-capture') runtimeCapturePaths.push(args[++i] || '');
  else if (args[i] === '--paused-frame-locals') pausedFrameLocalPaths.push(args[++i] || '');
  else usage();
}

const evidence = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const runtime = evidence.runtime_evidence || {};
const request = runtime.request || {};
const requestHeaderNames = Array.isArray(request.headers)
  ? request.headers
  : Object.keys(request.headers || {});
const sourceSnapshot = evidence.source_snapshot || {};
const staticAnalysis = evidence.static_analysis || {};
const staticEvidence = evidence.static_evidence || {};
const hookEvidence = evidence.hook_evidence || {};
const mcpExecution = evidence.mcp_execution || {};
const challengeSuccess = evidence.challenge_success || {};
const publicWriteupFacts = evidence.public_writeup_facts || {};
const familyDecision = staticEvidence.family_decision || {};
const requestContracts = staticEvidence.request_contracts || [];
const requestVarCapture = requestVarCapturePath && fs.existsSync(requestVarCapturePath)
  ? JSON.parse(fs.readFileSync(requestVarCapturePath, 'utf8'))
  : null;
const runtimeCaptures = runtimeCapturePaths
  .filter((file) => file && fs.existsSync(file))
  .map((file) => ({ file: path.resolve(file), data: JSON.parse(fs.readFileSync(file, 'utf8')) }));
const pausedFrameLocals = pausedFrameLocalPaths
  .filter((file) => file && fs.existsSync(file))
  .map((file) => ({ file: path.resolve(file), data: JSON.parse(fs.readFileSync(file, 'utf8')) }));

const nodes = [];
const edges = [];
const fieldStatus = {};
const fieldEvidence = {};

function addNode(id, type, label, extra = {}) {
  if (!nodes.some((node) => node.id === id)) nodes.push({ id, type, label, ...extra });
}

function addEdge(from, to, relation, strength, basis) {
  edges.push({ from, to, relation, strength, basis });
}

function helperMarkersFor(field) {
  const text = JSON.stringify(requestContracts.map((item) => item.inferred || {}));
  if (field === 'token') {
    if (/sm3Digest/i.test(text)) return ['sm3Digest'];
    if (/CryptoJS|MD5|SHA|AES|RSA/i.test(text)) return ['crypto-helper'];
    return ['signature-helper'];
  }
  if (field === 't') return ['Date.now()'];
  if (field === 'page') return ['pagination-state'];
  if (field === 'x' || field === 'y') return ['wasm-or-bigint-helper'];
  return ['runtime-serialization'];
}

function setFieldStatus(field, next) {
  const rank = { unknown: 0, partial: 1, direct: 2 };
  const current = fieldStatus[field] || 'unknown';
  if ((rank[next] || 0) >= (rank[current] || 0)) fieldStatus[field] = next;
}

function noteFieldEvidence(field, source, detail) {
  if (!fieldEvidence[field]) fieldEvidence[field] = [];
  fieldEvidence[field].push({ source, detail });
}

function deriveProvenanceStatus() {
  const runtimeStatus = Number(request.status || 0);
  const hasRuntimeRequest =
    Boolean(request.url || request.body || (request.fields || []).length || requestHeaderNames.length);
  const hasChallengeSuccess = Boolean(challengeSuccess.challenge && Object.keys(challengeSuccess.challenge).length);
  const hasStaticAnalysis = Boolean(staticAnalysis.summary || staticAnalysis.analyzed_files);
  const hasSourceSnapshot = Boolean(sourceSnapshot.imported_count || (sourceSnapshot.paths || []).length);

  if (runtimeStatus === 200 && !request.asset_only && !runtime.local_harness) return 'runtime-accepted';
  if (hasRuntimeRequest || hasChallengeSuccess) return 'runtime-captured';
  if (hasStaticAnalysis) return 'static-analysis-generated';
  if (hasSourceSnapshot) return 'source-snapshot-imported';
  return 'bootstrap-only';
}

addNode('runtime_request', 'request', request.url || 'runtime_request', { status: request.status || null });

if (sourceSnapshot.imported_count || (sourceSnapshot.paths || []).length) {
  addNode('source-snapshot', 'source-snapshot', 'Local source snapshot', {
    imported_count: sourceSnapshot.imported_count || (sourceSnapshot.paths || []).length || 0,
    paths: sourceSnapshot.paths || [],
  });
  addEdge('source-snapshot', 'runtime_request', 'supports_analysis_of', 'verified', 'source snapshot');
}

if (staticAnalysis.summary || staticAnalysis.analyzed_files) {
  addNode('static-analysis', 'static-analysis', 'External static analysis', {
    analyzed_files: staticAnalysis.analyzed_files || 0,
    summary: staticAnalysis.summary || null,
    endpoint_candidates: staticAnalysis.endpoint_candidates || [],
    token_fields: staticAnalysis.token_fields || [],
  });
  addEdge('static-analysis', 'runtime_request', 'supports_analysis_of', 'inferred', 'static analysis');
}

if (publicWriteupFacts.artifact) {
  addNode('public-writeup-facts', 'archival-facts', publicWriteupFacts.artifact, {
    critical_paths: publicWriteupFacts.critical_paths || [],
    stack: publicWriteupFacts.stack || [],
  });
  addEdge('public-writeup-facts', 'runtime_request', 'supports_analysis_of', 'inferred', 'archival public facts');
  if (staticAnalysis.summary || staticAnalysis.analyzed_files) {
    addEdge('public-writeup-facts', 'static-analysis', 'guides', 'inferred', 'archival public facts');
  }
}

for (const field of request.fields || []) {
  const fieldId = `field:${field}`;
  addNode(fieldId, 'field', field);
  addEdge(fieldId, 'runtime_request', 'serialized_into', 'verified', 'network');
  noteFieldEvidence(field, 'network', 'observed in protected request body');

  const markers = helperMarkersFor(field);
  let status = 'partial';
  if (field === 'page') status = 'direct';
  if (field === 't' && /Date\.now|timestamp/i.test(markers.join(' '))) status = 'partial';
  if (field === 'token' && request.status === 200) status = 'partial';
  if ((field === 'x' || field === 'y') && /module|wasm/i.test(runtime.family_runtime || '')) status = 'partial';
  setFieldStatus(field, status);

  for (const marker of markers) {
    const helperId = `helper:${field}:${marker}`;
    addNode(helperId, 'helper', marker);
    addEdge(helperId, fieldId, 'feeds', marker === 'pagination-state' ? 'inferred' : 'weak', marker);
    noteFieldEvidence(field, 'heuristic', `marker ${marker}`);
  }

  if (field === 'token' && (request.headers || []).includes('accept-time')) {
    addNode('header:accept-time', 'header', 'accept-time');
    addEdge('header:accept-time', fieldId, 'feeds', 'inferred', 'runtime header and token co-observed');
    noteFieldEvidence(field, 'runtime-header', 'accept-time co-observed with token');
  }

  if ((field === 'x' || field === 'y') && /module|wasm/i.test(runtime.family_runtime || '')) {
    addNode('runtime:wasm', 'runtime', 'wasm/module runtime');
    addEdge('runtime:wasm', fieldId, 'feeds', 'inferred', 'module-or-wasm-hybrid family');
    noteFieldEvidence(field, 'family', 'module-or-wasm-hybrid');
  }
}

for (const header of requestHeaderNames) {
  const headerId = `header:${header}`;
  addNode(headerId, 'header', header);
  addEdge(headerId, 'runtime_request', 'sent_with', 'verified', 'network');
}

if (runtime.helper_page && runtime.helper_page.endpoint) {
  addNode('helper:endpoint', 'helper-endpoint', runtime.helper_page.endpoint);
  addEdge('helper:endpoint', 'runtime_request', 'related_but_not_equal', request.status === 200 ? 'verified' : 'inferred', 'runtime helper-page split');
}

if (runtime.launcher_page && runtime.data_page) {
  addNode('page:launcher', 'page', runtime.launcher_page);
  addNode('page:data', 'page', runtime.data_page);
  addEdge('page:launcher', 'page:data', 'hands_off_to', 'verified', 'runtime launcher/data split');
  addEdge('page:data', 'runtime_request', 'initiates', 'verified', 'runtime app shell');
}

if ((familyDecision.detected_risks || []).includes('runtime-first-required')) {
  addNode('risk:runtime-first', 'risk', 'runtime-first-required');
  addEdge('risk:runtime-first', 'runtime_request', 'governs_analysis', 'verified', 'family decision');
}

if ((hookEvidence.observations || []).length) {
  addNode('hook:evidence', 'hook-evidence', 'hook evidence');
  addEdge('hook:evidence', 'runtime_request', 'observes_runtime', 'verified', 'hook evidence');
  for (const observation of hookEvidence.observations || []) {
    const obsId = `hook:${observation.id || observation.surface || Math.random().toString(36).slice(2)}`;
    addNode(obsId, 'hook-observation', observation.surface || observation.id || 'hook observation', {
      matches_target: !!observation.matches_target,
    });
    addEdge(obsId, 'runtime_request', observation.matches_target ? 'matches_target_request' : 'relates_to_request', observation.matches_target ? 'verified' : 'inferred', 'hook evidence');
    for (const cookie of observation.cookies || []) {
      const cookieId = `cookie:${cookie.name}`;
      addNode(cookieId, 'cookie', cookie.name, { value_preview: cookie.value_preview || null });
      addEdge(obsId, cookieId, 'observes_cookie', 'verified', 'hook evidence');
      noteFieldEvidence(cookie.name, 'hook', `cookie observed via ${observation.surface || observation.id || 'hook'}`);
      setFieldStatus(cookie.name, 'direct');
    }
    for (const field of observation.fields || []) {
      const fieldName = typeof field === 'string' ? field : field.name;
      const fieldId = `field:${fieldName}`;
      addNode(fieldId, 'field', fieldName);
      addEdge(obsId, fieldId, 'observes_field', observation.matches_target ? 'verified' : 'inferred', 'hook evidence');
      noteFieldEvidence(fieldName, 'hook', `field observed via ${observation.surface || observation.id || 'hook'}`);
      setFieldStatus(fieldName, observation.matches_target ? 'direct' : 'partial');
    }
  }
}

if (mcpExecution.run_status) {
  addNode('mcp:execution', 'mcp-execution', mcpExecution.workflow_id || 'mcp execution', {
    run_status: mcpExecution.run_status,
    completed_steps: mcpExecution.completed_steps || 0,
    step_count: mcpExecution.step_count || 0,
  });
  addEdge(
    'mcp:execution',
    'runtime_request',
    'captures_runtime_control_flow',
    mcpExecution.run_status === 'completed' ? 'verified' : 'inferred',
    'mcp execution record'
  );
  for (const step of mcpExecution.steps || []) {
    const stepId = `mcp:step:${step.step}`;
    addNode(stepId, 'mcp-step', `${step.group_id || 'group'}:${step.adapter || 'unknown'}`, {
      status: step.status,
    });
    addEdge(
      stepId,
      'mcp:execution',
      'part_of',
      step.status === 'completed' ? 'verified' : 'inferred',
      'mcp execution record'
    );
  }
}

if (challengeSuccess.challenge && Object.keys(challengeSuccess.challenge).length) {
  addNode('challenge-success', 'challenge-success', challengeSuccess.challenge.type || 'challenge success', {
    success_signal: challengeSuccess.challenge.success_signal || null,
    password: challengeSuccess.challenge.password || null,
    archival_public: Boolean(challengeSuccess.archival_public),
    local_harness: Boolean(challengeSuccess.local_harness),
  });
  addEdge(
    'challenge-success',
    'task',
    'supports',
    challengeSuccess.synthetic ? 'inferred' : 'verified',
    'challenge success evidence'
  );

  const challengeEvidence = challengeSuccess.evidence || {};
  if (challengeEvidence.writeup_facts) {
    addNode('challenge:writeup-facts', 'archival-facts', challengeEvidence.writeup_facts);
    addEdge('challenge:writeup-facts', 'challenge-success', 'supports', 'verified', 'challenge success evidence');
  }
  if (challengeEvidence.plan_json) {
    addNode('challenge:harness-plan', 'local-harness-plan', challengeEvidence.plan_json);
    addEdge('challenge:harness-plan', 'challenge-success', 'supports', 'verified', 'challenge success evidence');
  }
  if (challengeEvidence.symbol_map) {
    addNode('challenge:symbol-map', 'symbol-map', challengeEvidence.symbol_map);
    addEdge('challenge:symbol-map', 'challenge-success', 'supports', 'verified', 'challenge success evidence');
  }
  if (challengeEvidence.solver) {
    addNode('challenge:solver', 'solver', challengeEvidence.solver, {
      solver_result: challengeEvidence.solver_result || null,
    });
    addEdge('challenge:solver', 'challenge-success', 'derives', 'verified', 'challenge success evidence');
    if (challengeEvidence.writeup_facts) {
      addEdge('challenge:writeup-facts', 'challenge:solver', 'constrains', 'verified', 'public solver route');
    }
    if (challengeEvidence.symbol_map) {
      addEdge('challenge:symbol-map', 'challenge:solver', 'feeds', 'verified', 'public solver route');
    }
  }
  if (Array.isArray(challengeEvidence.grid) && challengeEvidence.grid.length) {
    addNode('challenge:solved-grid', 'solved-grid', 'solved board grid', {
      rows: challengeEvidence.grid.length,
    });
    addEdge('challenge:solved-grid', 'challenge-success', 'demonstrates', 'verified', 'challenge success evidence');
    if (challengeEvidence.solver) {
      addEdge('challenge:solver', 'challenge:solved-grid', 'solves', 'verified', 'public solver route');
    }
  }
  if (challengeEvidence.harness_entrypoint) {
    addNode('challenge:harness-entrypoint', 'local-harness-entrypoint', String(challengeEvidence.harness_entrypoint));
    addEdge('challenge:harness-entrypoint', 'challenge-success', 'drives', 'verified', 'challenge success evidence');
  }
  if (challengeEvidence.local_fixture) {
    addNode('challenge:local-fixture', 'local-harness-fixture', String(challengeEvidence.local_fixture));
    addEdge('challenge:local-fixture', 'challenge-success', 'supports', 'verified', 'challenge success evidence');
  }
  if (sourceSnapshot.imported_count || (sourceSnapshot.paths || []).length) {
    addEdge('source-snapshot', 'challenge-success', 'supports', 'inferred', 'archival source snapshot');
  }
  if (staticAnalysis.summary || staticAnalysis.analyzed_files) {
    addEdge('static-analysis', 'challenge-success', 'supports', 'inferred', 'static analysis');
  }
}

if (requestVarCapture) {
  addNode('capture:request-var-template', 'runtime-template', path.basename(requestVarCapturePath));
  for (const target of requestVarCapture.capture_targets || []) {
    const field = target.field;
    const fieldId = `field:${field}`;
    addNode(fieldId, 'field', field);
    for (const name of target.upstream_var_candidates || []) {
      const nodeId = `candidate:${field}:var:${name}`;
      addNode(nodeId, 'candidate-var', name);
      addEdge(nodeId, fieldId, 'candidate_upstream_var', target.verified ? 'verified' : 'weak', 'request-var-capture-template');
    }
    for (const frame of target.frame_candidates || []) {
      const nodeId = `candidate:${field}:frame:${frame}`;
      addNode(nodeId, 'candidate-frame', frame);
      addEdge(nodeId, fieldId, 'candidate_frame', target.verified ? 'verified' : 'weak', 'request-var-capture-template');
    }
    for (const source of target.source_candidates || []) {
      const nodeId = `candidate:${field}:source:${source}`;
      addNode(nodeId, 'candidate-source', source);
      addEdge(nodeId, fieldId, 'candidate_source', target.verified ? 'verified' : 'weak', 'request-var-capture-template');
    }
    noteFieldEvidence(field, 'request-var-capture', `${(target.upstream_var_candidates || []).length} var candidates`);
    if (target.verified) setFieldStatus(field, 'direct');
  }
}

for (const capture of runtimeCaptures) {
  const data = capture.data || {};
  const label = path.basename(capture.file);
  addNode(`runtime-capture:${label}`, 'runtime-capture', label);
  if ((data.entrypoint || {}).function) {
    addNode(`entrypoint:${label}`, 'entrypoint', `${data.entrypoint.function}`);
    addEdge(`entrypoint:${label}`, 'runtime_request', 'initiates', 'inferred', 'runtime capture entrypoint');
  }
  for (const stackItem of data.initiator_stack || []) {
    const nodeId = `stack:${label}:${stackItem}`;
    addNode(nodeId, 'initiator-frame', stackItem);
    addEdge(nodeId, 'runtime_request', 'initiates', 'inferred', 'runtime capture initiator stack');
  }
  const body = ((data.runtime_request || {}).body) || {};
  for (const field of Object.keys(body)) {
    const fieldId = `field:${field}`;
    addNode(fieldId, 'field', field);
    addEdge(`runtime-capture:${label}`, fieldId, 'captures_runtime_value', 'verified', label);
    noteFieldEvidence(field, 'runtime-capture', label);
    setFieldStatus(field, field === 'page' ? 'direct' : 'partial');
  }
}

for (const paused of pausedFrameLocals) {
  const label = path.basename(paused.file);
  addNode(`paused-frame:${label}`, 'paused-frame', label);
  for (const match of (paused.data.matched_fields || [])) {
    const field = match.field;
    const fieldId = `field:${field}`;
    addNode(fieldId, 'field', field);
    addEdge(`paused-frame:${label}`, fieldId, 'observes_upstream_locals', match.verified ? 'verified' : 'inferred', 'paused-frame-locals');
    noteFieldEvidence(field, 'paused-frame-locals', label);
    if (match.verified) setFieldStatus(field, 'direct');
    else if ((match.matched_locals || []).length || (match.matched_by_value || []).length) setFieldStatus(field, 'partial');
    for (const local of match.matched_locals || []) {
      const localId = `paused-local:${field}:${local.name}:${label}`;
      addNode(localId, 'paused-local', local.name, { preview: local.value_preview || null });
      addEdge(localId, fieldId, 'matched_local', match.verified ? 'verified' : 'inferred', label);
    }
  }
}

const result = {
  source: path.resolve(inputPath),
  topic: runtime.topic || null,
  status: deriveProvenanceStatus(),
  generated_at: new Date().toISOString(),
  inputs: {
    request_var_capture: requestVarCapturePath ? path.resolve(requestVarCapturePath) : null,
    runtime_captures: runtimeCaptures.map((item) => item.file),
    paused_frame_locals: pausedFrameLocals.map((item) => item.file),
  },
  graph: {
    nodes,
    edges,
  },
  field_status: fieldStatus,
  field_evidence: fieldEvidence,
};

const fieldLines = (request.fields || []).length
  ? request.fields.map((field) => {
    const evidenceNotes = (fieldEvidence[field] || []).map((item) => item.source).join(', ');
    return `- ${field}: ${fieldStatus[field] || 'unknown'}${evidenceNotes ? ` (${evidenceNotes})` : ''}`;
  })
  : ['- none'];

const challengeLines = challengeSuccess.challenge && Object.keys(challengeSuccess.challenge).length
  ? [
    `- type: ${challengeSuccess.challenge.type || 'unknown'}`,
    `- success_signal: ${challengeSuccess.challenge.success_signal || 'unknown'}`,
    `- password: ${challengeSuccess.challenge.password || 'unknown'}`,
    `- archival_public: ${Boolean(challengeSuccess.archival_public)}`,
    `- local_harness: ${Boolean(challengeSuccess.local_harness)}`,
  ]
  : ['- none'];

const summary = [
  '# Provenance Summary',
  '',
  `- topic: ${runtime.topic || 'unknown'}`,
  `- status: ${result.status}`,
  `- runtime family: ${runtime.family_runtime || 'unknown'}`,
  `- protected request: ${request.method || 'UNKNOWN'} ${request.url || 'unknown'}`,
  '',
  '## Fields',
  '',
  ...fieldLines,
  '',
  '## Challenge Success',
  '',
  ...challengeLines,
  '',
  '## Notes',
  '',
  '- `direct` means the upstream source is structurally obvious from current evidence.',
  '- `partial` means the field is tied to a plausible generation chain but still needs tighter runtime or callframe proof.',
  '- `unknown` means the current bundle does not yet explain the field generation path.',
  '',
].join('\n');

const json = JSON.stringify(result, null, 2);
if (outputPath) fs.writeFileSync(outputPath, `${json}\n`, 'utf8');
if (summaryPath) fs.writeFileSync(summaryPath, `${summary}\n`, 'utf8');
console.log(json);
