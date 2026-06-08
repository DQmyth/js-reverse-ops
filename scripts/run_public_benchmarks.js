#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const defaultCasesPath = path.join(rootDir, 'assets', 'public-benchmark-cases.json');

function parseArgs(argv) {
  const args = { cases: defaultCasesPath, json: false, out: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--json') args.json = true;
    else if (item === '--cases') {
      args.cases = path.resolve(rootDir, argv[index + 1] || '');
      index += 1;
    } else if (item === '--out') {
      args.out = path.resolve(rootDir, argv[index + 1] || '');
      index += 1;
    } else if (item === '--help' || item === '-h') {
      args.help = true;
    }
  }
  return args;
}

function usage() {
  return [
    'Usage: node scripts/run_public_benchmarks.js [--json] [--out result.json]',
    '',
    'Runs the sanitized public benchmark suite against router and pattern-memory scripts.',
  ].join('\n');
}

function runNode(script, args) {
  const output = execFileSync(process.execPath, [path.join(rootDir, script), ...args], {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(output);
}

function resolveRepoPath(relPath) {
  const candidates = [
    path.join(rootDir, relPath),
    path.join(rootDir, 'public', relPath),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.join(rootDir, relPath);
}

function assertEqual(errors, label, actual, expected) {
  if (actual !== expected) errors.push(`${label}: expected ${expected}, got ${actual}`);
}

function assertIncludes(errors, label, values, expected) {
  if (!Array.isArray(values) || !values.includes(expected)) {
    errors.push(`${label}: expected to include ${expected}`);
  }
}

function runPatternCase(testCase) {
  const result = runNode('scripts/map_case_to_pattern.js', ['--text', testCase.text || '', '--json']);
  const top = result.results && result.results[0];
  const errors = [];
  if (!top) {
    errors.push('no pattern result returned');
  } else {
    assertEqual(errors, 'top pattern', top.id, testCase.expect.top_pattern);
    if (typeof testCase.expect.min_score === 'number' && top.score < testCase.expect.min_score) {
      errors.push(`score: expected >= ${testCase.expect.min_score}, got ${top.score}`);
    }
    if (testCase.expect.playbook) assertEqual(errors, 'playbook', top.playbook, testCase.expect.playbook);
    if (testCase.expect.hook_preset) assertIncludes(errors, 'hook presets', top.hook_presets, testCase.expect.hook_preset);
  }
  return { id: testCase.id, type: testCase.type, ok: errors.length === 0, errors, observed: top || null };
}

function runRouteCase(testCase) {
  const args = [testCase.target, '--json'];
  if (testCase.notes) args.splice(1, 0, '--notes', testCase.notes);
  const plan = runNode('scripts/js_reverse_ops.js', args);
  const lanePlan = runNode('scripts/generate_task_lane_plan.js', [
    testCase.target,
    ...(testCase.notes ? ['--notes', testCase.notes] : []),
    '--json',
  ]);
  const errors = [];
  if (testCase.expect.family) assertEqual(errors, 'family', plan.family, testCase.expect.family);
  if (testCase.expect.stage) assertEqual(errors, 'stage', plan.stage, testCase.expect.stage);
  if (testCase.expect.playbook) assertEqual(errors, 'playbook', plan.playbook, testCase.expect.playbook);
  if (testCase.expect.hook_preset) assertIncludes(errors, 'hook presets', plan.hook_presets, testCase.expect.hook_preset);
  if (testCase.expect.sequence_item) {
    assertIncludes(errors, 'recommended sequence', plan.recommended_sequence, testCase.expect.sequence_item);
  }
  if (testCase.expect.next_lane) {
    assertEqual(errors, 'next lane', lanePlan.next_lane && lanePlan.next_lane.id, testCase.expect.next_lane);
  }
  return {
    id: testCase.id,
    type: testCase.type,
    ok: errors.length === 0,
    errors,
    observed: {
      family: plan.family,
      stage: plan.stage,
      playbook: plan.playbook,
      hook_presets: plan.hook_presets,
      pattern_matches: plan.pattern_matches,
      lane_plan: lanePlan,
    },
  };
}

function runRuntimeCaptureCase(testCase) {
  const result = runNode('scripts/diagnose_runtime_capture_gaps.js', [
    '--notes',
    testCase.notes || '',
    '--json',
  ]);
  const errors = [];
  if (testCase.expect.capture_mode) assertEqual(errors, 'capture mode', result.capture_mode, testCase.expect.capture_mode);
  if (testCase.expect.missing_surface) {
    assertIncludes(
      errors,
      'missing surfaces',
      (result.missing_surfaces || []).map((item) => item.id),
      testCase.expect.missing_surface,
    );
  }
  if (testCase.expect.recommended_preset) {
    assertIncludes(errors, 'recommended presets', result.recommended_presets, testCase.expect.recommended_preset);
  }
  return {
    id: testCase.id,
    type: testCase.type,
    ok: errors.length === 0,
    errors,
    observed: result,
  };
}

function runEnvPatchCase(testCase) {
  const result = runNode('scripts/plan_env_patch_from_divergence.js', [
    '--divergence',
    path.relative(rootDir, resolveRepoPath(testCase.divergence_record)),
    ...(testCase.notes ? ['--notes', testCase.notes] : []),
    '--json',
  ]);
  const errors = [];
  if (testCase.expect.first_divergence_kind) {
    assertEqual(errors, 'first divergence', result.first_divergence && result.first_divergence.kind, testCase.expect.first_divergence_kind);
  }
  if (testCase.expect.recommended_patch) {
    assertEqual(errors, 'recommended patch', result.recommended_patch && result.recommended_patch.id, testCase.expect.recommended_patch);
  }
  if (testCase.expect.matched_signal) {
    assertIncludes(errors, 'matched signals', result.recommended_patch && result.recommended_patch.matched_signals, testCase.expect.matched_signal);
  }
  return {
    id: testCase.id,
    type: testCase.type,
    ok: errors.length === 0,
    errors,
    observed: result,
  };
}

function runStaticToolchainCase(testCase) {
  const result = runNode('scripts/plan_static_toolchain.js', [
    path.relative(rootDir, resolveRepoPath(testCase.target)),
    ...(testCase.notes ? ['--notes', testCase.notes] : []),
    '--json',
  ]);
  const errors = [];
  if (testCase.expect.recommended_step) {
    assertEqual(errors, 'recommended step', result.recommended_step && result.recommended_step.id, testCase.expect.recommended_step);
  }
  if (testCase.expect.selected_step) {
    assertIncludes(errors, 'selected steps', (result.selected_steps || []).map((item) => item.id), testCase.expect.selected_step);
  }
  if (testCase.expect.local_script) {
    const scripts = (result.selected_steps || []).flatMap((item) => item.local_scripts || []);
    assertIncludes(errors, 'local scripts', scripts, testCase.expect.local_script);
  }
  if (testCase.expect.source_mapping_url) {
    assertEqual(errors, 'sourceMappingURL', result.source_map_hints && result.source_map_hints.source_mapping_url, testCase.expect.source_mapping_url);
  }
  return {
    id: testCase.id,
    type: testCase.type,
    ok: errors.length === 0,
    errors,
    observed: result,
  };
}

function runStaticTruthCase(testCase) {
  const recoveredPath = path.join(rootDir, testCase.out || 'tmp/static-truth-recovered.js');
  fs.mkdirSync(path.dirname(recoveredPath), { recursive: true });
  execFileSync(process.execPath, [
    path.join(rootDir, 'scripts/run_ast_pipeline.js'),
    resolveRepoPath(testCase.target),
    recoveredPath,
  ], {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const result = runNode('scripts/assess_static_recovery_truth.js', [
    '--original',
    path.relative(rootDir, resolveRepoPath(testCase.target)),
    '--recovered',
    path.relative(rootDir, recoveredPath),
    ...(testCase.runtime_evidence ? ['--runtime-evidence', path.relative(rootDir, resolveRepoPath(testCase.runtime_evidence))] : []),
    ...(testCase.replay_record ? ['--replay-record', path.relative(rootDir, resolveRepoPath(testCase.replay_record))] : []),
    '--json',
  ]);
  const errors = [];
  if (testCase.expect.state) assertEqual(errors, 'state', result.state, testCase.expect.state);
  if (typeof testCase.expect.delivery_ready === 'boolean' && result.delivery_ready !== testCase.expect.delivery_ready) {
    errors.push(`delivery_ready: expected ${testCase.expect.delivery_ready}, got ${result.delivery_ready}`);
  }
  if (testCase.expect.risk_signal) {
    assertIncludes(errors, 'risk signals', (result.risk_signals || []).map((item) => item.id), testCase.expect.risk_signal);
  }
  return {
    id: testCase.id,
    type: testCase.type,
    ok: errors.length === 0,
    errors,
    observed: result,
  };
}

function runDomainHandoffCase(testCase) {
  const result = runNode('scripts/generate_domain_handoff_plan.js', [
    '--notes',
    testCase.notes || '',
    '--json',
  ]);
  const errors = [];
  if (testCase.expect.recommended_handoff) {
    assertEqual(errors, 'recommended handoff', result.recommended_handoff && result.recommended_handoff.id, testCase.expect.recommended_handoff);
  }
  if (testCase.expect.matched_signal) {
    assertIncludes(errors, 'matched signals', result.recommended_handoff && result.recommended_handoff.matched_signals, testCase.expect.matched_signal);
  }
  if (testCase.expect.boundary_artifact) {
    assertIncludes(errors, 'boundary artifacts', result.recommended_handoff && result.recommended_handoff.boundary_artifacts, testCase.expect.boundary_artifact);
  }
  return {
    id: testCase.id,
    type: testCase.type,
    ok: errors.length === 0,
    errors,
    observed: result,
  };
}

function runDomainHandoffRecordCase(testCase) {
  const args = [
    '--record',
    path.relative(rootDir, resolveRepoPath(testCase.record)),
    '--json',
  ];
  if (testCase.strict) args.push('--strict');
  const result = runNode('scripts/validate_domain_handoff_record.js', args);
  const errors = [];
  if (typeof testCase.expect.ok === 'boolean' && result.ok !== testCase.expect.ok) {
    errors.push(`ok: expected ${testCase.expect.ok}, got ${result.ok}`);
  }
  if (testCase.expect.handoff_id) assertEqual(errors, 'handoff id', result.handoff_id, testCase.expect.handoff_id);
  if (typeof testCase.expect.min_artifact_count === 'number' && result.artifact_count < testCase.expect.min_artifact_count) {
    errors.push(`artifact count: expected >= ${testCase.expect.min_artifact_count}, got ${result.artifact_count}`);
  }
  if (typeof testCase.expect.max_warnings === 'number' && result.warnings.length > testCase.expect.max_warnings) {
    errors.push(`warnings: expected <= ${testCase.expect.max_warnings}, got ${result.warnings.length}`);
  }
  if (testCase.expect.boundary_includes && !String(result.boundary || '').includes(testCase.expect.boundary_includes)) {
    errors.push(`boundary: expected to include ${testCase.expect.boundary_includes}`);
  }
  return {
    id: testCase.id,
    type: testCase.type,
    ok: errors.length === 0,
    errors,
    observed: result,
  };
}

function runReleaseRiskCase(testCase) {
  const args = [];
  for (const item of testCase.paths || []) args.push('--path', item);
  args.push('--json');
  const result = runNode('scripts/explain_public_release_risk.js', args);
  const errors = [];
  if (testCase.expect.risk_level) assertEqual(errors, 'risk level', result.risk_level, testCase.expect.risk_level);
  if (testCase.expect.finding_class) {
    assertIncludes(errors, 'finding classes', (result.findings || []).map((item) => item.risk_class), testCase.expect.finding_class);
  }
  if (testCase.expect.severity) {
    assertIncludes(errors, 'finding severities', (result.findings || []).map((item) => item.severity), testCase.expect.severity);
  }
  if (typeof testCase.expect.min_findings === 'number' && (result.findings || []).length < testCase.expect.min_findings) {
    errors.push(`findings: expected >= ${testCase.expect.min_findings}, got ${(result.findings || []).length}`);
  }
  return {
    id: testCase.id,
    type: testCase.type,
    ok: errors.length === 0,
    errors,
    observed: result,
  };
}

function runExternalMatrixCase(testCase) {
  const args = ['--json'];
  if (testCase.focus) args.unshift('--focus', testCase.focus);
  const result = runNode('scripts/compare_external_skill_matrix.js', args);
  const errors = [];
  if (testCase.expect.top_profile) {
    assertEqual(errors, 'top profile', result.profiles && result.profiles[0] && result.profiles[0].id, testCase.expect.top_profile);
  }
  if (testCase.expect.dimension_leader) {
    const row = (result.rows || []).find((item) => item.id === testCase.expect.dimension);
    assertEqual(errors, 'dimension leader', row && row.leader, testCase.expect.dimension_leader);
  }
  if (typeof testCase.expect.min_js_score === 'number') {
    const score = result.js_reverse_ops && result.js_reverse_ops.score;
    if (score < testCase.expect.min_js_score) errors.push(`js-reverse-ops score: expected >= ${testCase.expect.min_js_score}, got ${score}`);
  }
  if (testCase.expect.no_priority_gaps && (result.priority_improvements || []).length) {
    errors.push(`priority gaps: expected none, got ${result.priority_improvements.length}`);
  }
  return {
    id: testCase.id,
    type: testCase.type,
    ok: errors.length === 0,
    errors,
    observed: result,
  };
}

function runAntiDetectionCase(testCase) {
  const result = runNode('scripts/select_anti_detection_profile.js', [
    '--symptoms',
    testCase.symptoms || '',
    '--json',
  ]);
  const errors = [];
  if (testCase.expect.selected_profile) {
    assertEqual(errors, 'selected profile', result.selected_profile && result.selected_profile.id, testCase.expect.selected_profile);
  }
  if (testCase.expect.matched_profile) {
    const matched = (result.matched_signals || []).map((item) => item.profile);
    assertIncludes(errors, 'matched profiles', matched, testCase.expect.matched_profile);
  }
  if (testCase.expect.boundary_includes && !String(result.decision?.promotion_boundary || '').includes(testCase.expect.boundary_includes)) {
    errors.push(`promotion boundary: expected to include ${testCase.expect.boundary_includes}`);
  }
  if (testCase.expect.next_verification_includes && !String(result.decision?.next_verification || '').includes(testCase.expect.next_verification_includes)) {
    errors.push(`next verification: expected to include ${testCase.expect.next_verification_includes}`);
  }
  return {
    id: testCase.id,
    type: testCase.type,
    ok: errors.length === 0,
    errors,
    observed: result,
  };
}

function runMcpSmokeCase(testCase) {
  const args = ['--json'];
  if (testCase.server_family) args.unshift('--server-family', testCase.server_family);
  const result = runNode('scripts/plan_browser_mcp_smoke.js', args);
  const errors = [];
  if (testCase.expect.server_family) assertEqual(errors, 'server family', result.server_family, testCase.expect.server_family);
  if (typeof testCase.expect.min_coverage_score === 'number' && result.coverage_score < testCase.expect.min_coverage_score) {
    errors.push(`coverage score: expected >= ${testCase.expect.min_coverage_score}, got ${result.coverage_score}`);
  }
  if (testCase.expect.planned_capability) {
    const planned = (result.planned_checks || []).filter((item) => item.supported).map((item) => item.capability);
    assertIncludes(errors, 'planned capabilities', planned, testCase.expect.planned_capability);
  }
  if (testCase.expect.state) {
    assertIncludes(errors, 'planned states', (result.planned_checks || []).map((item) => item.state), testCase.expect.state);
  }
  return {
    id: testCase.id,
    type: testCase.type,
    ok: errors.length === 0,
    errors,
    observed: result,
  };
}

function runMcpSmokeRecordCase(testCase) {
  const args = [
    '--record',
    path.relative(rootDir, resolveRepoPath(testCase.record)),
    '--json',
  ];
  if (testCase.server_family) args.splice(2, 0, '--server-family', testCase.server_family);
  const result = runNode('scripts/verify_browser_mcp_smoke_record.js', args);
  const errors = [];
  if (testCase.expect.server_family) assertEqual(errors, 'server family', result.server_family, testCase.expect.server_family);
  if (typeof testCase.expect.ok === 'boolean' && result.ok !== testCase.expect.ok) {
    errors.push(`ok: expected ${testCase.expect.ok}, got ${result.ok}`);
  }
  if (typeof testCase.expect.min_coverage_score === 'number' && result.coverage_score < testCase.expect.min_coverage_score) {
    errors.push(`coverage score: expected >= ${testCase.expect.min_coverage_score}, got ${result.coverage_score}`);
  }
  if (testCase.expect.observed_capability) {
    const observed = (result.capability_results || [])
      .filter((item) => item.status === 'observed')
      .map((item) => item.capability);
    assertIncludes(errors, 'observed capabilities', observed, testCase.expect.observed_capability);
  }
  return {
    id: testCase.id,
    type: testCase.type,
    ok: errors.length === 0,
    errors,
    observed: result,
  };
}

function runMcpDeliveryLoopCase(testCase) {
  const outDir = path.join(rootDir, testCase.out || 'tmp/mcp-delivery-loop-benchmark');
  const args = [
    testCase.target,
    '--out',
    path.relative(rootDir, outDir),
    '--server-family',
    testCase.server_family || 'chrome_devtools_mcp',
  ];
  if (testCase.notes) args.push('--notes', testCase.notes);
  if (testCase.record) args.push('--record', testCase.record);
  args.push('--json');
  const result = runNode('scripts/run_mcp_delivery_loop.js', args);
  const errors = [];
  if (testCase.expect.loop_status) assertEqual(errors, 'loop status', result.loop_status, testCase.expect.loop_status);
  if (typeof testCase.expect.record_verified === 'boolean') {
    const ok = !!(result.record_verification && result.record_verification.ok);
    if (ok !== testCase.expect.record_verified) errors.push(`record verified: expected ${testCase.expect.record_verified}, got ${ok}`);
  }
  if (typeof testCase.expect.validation_ok === 'boolean' && result.delivery_validation.ok !== testCase.expect.validation_ok) {
    errors.push(`delivery validation: expected ${testCase.expect.validation_ok}, got ${result.delivery_validation.ok}`);
  }
  if (testCase.expect.readiness) assertEqual(errors, 'readiness', result.delivery_readiness && result.delivery_readiness.readiness, testCase.expect.readiness);
  for (const file of testCase.expect.files || []) {
    if (!fs.existsSync(path.join(outDir, file))) errors.push(`missing generated file ${file}`);
  }
  return {
    id: testCase.id,
    type: testCase.type,
    ok: errors.length === 0,
    errors,
    observed: result,
  };
}

function runReplayDiagnosisCase(testCase) {
  const args = [];
  if (testCase.run_dir) args.push('--run-dir', testCase.run_dir);
  if (testCase.replay_record) args.push('--replay-record', testCase.replay_record);
  if (testCase.notes) args.push('--notes', testCase.notes);
  args.push('--json');
  const result = runNode('scripts/diagnose_replay_failure.js', args);
  const errors = [];
  if (testCase.expect.recommended_diagnosis) {
    assertEqual(errors, 'recommended diagnosis', result.recommended_diagnosis && result.recommended_diagnosis.id, testCase.expect.recommended_diagnosis);
  }
  if (testCase.expect.matched_signal) {
    assertIncludes(errors, 'matched signals', result.recommended_diagnosis && result.recommended_diagnosis.matched_signals, testCase.expect.matched_signal);
  }
  if (typeof testCase.expect.min_divergence_count === 'number' && result.divergence_count < testCase.expect.min_divergence_count) {
    errors.push(`divergence_count: expected >= ${testCase.expect.min_divergence_count}, got ${result.divergence_count}`);
  }
  if (testCase.expect.next_script) assertIncludes(errors, 'next scripts', result.next_scripts || [], testCase.expect.next_script);
  return {
    id: testCase.id,
    type: testCase.type,
    ok: errors.length === 0,
    errors,
    observed: result,
  };
}

function runNextActionCase(testCase) {
  const runDir = path.join(rootDir, testCase.out || 'tmp/next-action-benchmark');
  fs.mkdirSync(runDir, { recursive: true });
  runNode('scripts/run_playbook.js', [
    testCase.target,
    ...(testCase.notes ? ['--notes', testCase.notes] : []),
    '--out',
    path.relative(rootDir, runDir),
    '--json',
  ]);
  const result = runNode('scripts/recommend_next_action.js', [
    path.relative(rootDir, runDir),
    ...(testCase.notes ? ['--notes', testCase.notes] : []),
    '--json',
  ]);
  const errors = [];
  if (testCase.expect.recommended_action) {
    assertEqual(errors, 'recommended action', result.recommended_action && result.recommended_action.id, testCase.expect.recommended_action);
  }
  if (testCase.expect.command_includes && !String(result.recommended_action?.command || '').includes(testCase.expect.command_includes)) {
    errors.push(`command: expected to include ${testCase.expect.command_includes}`);
  }
  if (testCase.expect.reason_includes) {
    assertIncludes(errors, 'reasons', result.reasons || [], testCase.expect.reason_includes);
  }
  if (testCase.expect.readiness) {
    assertEqual(errors, 'readiness', result.readiness && result.readiness.readiness, testCase.expect.readiness);
  }
  return {
    id: testCase.id,
    type: testCase.type,
    ok: errors.length === 0,
    errors,
    observed: result,
  };
}

function runReplayClientCase(testCase) {
  const outDir = path.join(rootDir, testCase.out || 'tmp/replay-client-benchmark');
  fs.mkdirSync(outDir, { recursive: true });
  const result = runNode('scripts/generate_replay_delivery_client.js', [
    '--record',
    path.relative(rootDir, resolveRepoPath(testCase.replay_record)),
    '--out',
    path.relative(rootDir, outDir),
    '--json',
  ]);
  const manifest = JSON.parse(fs.readFileSync(path.join(outDir, 'replay-client-manifest.json'), 'utf8'));
  const validation = runNode('scripts/validate_replay_delivery_client.js', [
    path.relative(rootDir, outDir),
    '--json',
  ]);
  const errors = [];
  if (testCase.expect.generation_status) {
    assertEqual(errors, 'generation status', result.generation_status, testCase.expect.generation_status);
  }
  if (testCase.expect.method) assertEqual(errors, 'method', result.contract && result.contract.method, testCase.expect.method);
  if (testCase.expect.path) assertEqual(errors, 'path', result.contract && result.contract.path, testCase.expect.path);
  for (const file of testCase.expect.files || []) {
    if (!fs.existsSync(path.join(outDir, file))) errors.push(`missing generated file ${file}`);
  }
  if (testCase.expect.manifest_status) {
    assertEqual(errors, 'manifest status', manifest.generation_status, testCase.expect.manifest_status);
  }
  if (testCase.expect.node_check) {
    execFileSync(process.execPath, ['--check', path.join(outDir, 'replay-client.node.js')], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }
  if (typeof testCase.expect.validation_ok === 'boolean' && validation.ok !== testCase.expect.validation_ok) {
    errors.push(`client validation: expected ${testCase.expect.validation_ok}, got ${validation.ok}`);
  }
  return {
    id: testCase.id,
    type: testCase.type,
    ok: errors.length === 0,
    errors,
    observed: { result, manifest, validation },
  };
}

function runPlaybookCase(testCase) {
  const args = [testCase.target, '--json'];
  if (testCase.notes) args.push('--notes', testCase.notes);
  if (testCase.out) args.push('--out', testCase.out);
  const summary = runNode('scripts/run_playbook.js', args);
  const errors = [];
  if (testCase.expect.family) assertEqual(errors, 'family', summary.family, testCase.expect.family);
  if (testCase.expect.stage) assertEqual(errors, 'stage', summary.stage, testCase.expect.stage);
  if (testCase.expect.playbook) assertEqual(errors, 'playbook', summary.playbook, testCase.expect.playbook);
  for (const file of testCase.expect.files || []) {
    assertIncludes(errors, 'generated files', summary.files, file);
  }
  let validation = null;
  try {
    validation = runNode('scripts/validate_delivery_artifacts.js', [path.relative(rootDir, summary.out_dir), '--json']);
    if (!validation.ok) {
      errors.push(`delivery validation failed: ${(validation.errors || []).join('; ')}`);
    }
  } catch (error) {
    errors.push(`delivery validation failed: ${error.message}`);
  }
  return {
    id: testCase.id,
    type: testCase.type,
    ok: errors.length === 0,
    errors,
    observed: { ...summary, delivery_validation: validation },
  };
}

function runStaticRecoverCase(testCase) {
  const outPath = path.join(rootDir, testCase.out || 'tmp/static-recovered.js');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const result = execFileSync(process.execPath, [
    path.join(rootDir, 'scripts/run_ast_pipeline.js'),
    resolveRepoPath(testCase.target),
    outPath,
  ], {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const output = fs.readFileSync(outPath, 'utf8');
  const errors = [];
  for (const item of testCase.expect.contains || []) {
    if (!output.includes(item)) errors.push(`recovered output missing ${item}`);
  }
  return {
    id: testCase.id,
    type: testCase.type,
    ok: errors.length === 0,
    errors,
    observed: {
      out: path.relative(rootDir, outPath),
      stderr_json: result ? String(result).slice(0, 2000) : '',
      output_preview: output.slice(0, 500),
    },
  };
}

function runPromoteEvidenceCase(testCase) {
  const runDir = path.join(rootDir, testCase.out || 'tmp/promote-delivery-run');
  fs.mkdirSync(runDir, { recursive: true });
  const runSummary = runNode('scripts/run_playbook.js', [
    testCase.target,
    '--notes',
    testCase.notes || '',
    '--out',
    path.relative(rootDir, runDir),
    '--json',
  ]);
  const promoteSummary = runNode('scripts/promote_delivery_evidence.js', [
    path.relative(rootDir, runDir),
    '--hook-evidence',
    testCase.hook_evidence,
    ...(testCase.replay_record ? ['--replay-record', testCase.replay_record] : []),
    '--json',
  ]);
  const validation = runNode('scripts/validate_delivery_artifacts.js', [path.relative(rootDir, runDir), '--json']);
  const stateValidation = runNode('scripts/validate_evidence_state_transitions.js', [path.relative(rootDir, runDir), '--json']);
  const readiness = runNode('scripts/assess_delivery_readiness.js', [path.relative(rootDir, runDir), '--json']);
  const errors = [];
  if (testCase.expect.provenance_status && promoteSummary.provenance_status !== testCase.expect.provenance_status) {
    errors.push(`provenance_status: expected ${testCase.expect.provenance_status}, got ${promoteSummary.provenance_status}`);
  }
  if (typeof testCase.expect.min_verified_claims === 'number' && (promoteSummary.claim_summary.verified || 0) < testCase.expect.min_verified_claims) {
    errors.push(`verified claims: expected >= ${testCase.expect.min_verified_claims}, got ${promoteSummary.claim_summary.verified || 0}`);
  }
  if (testCase.expect.replay_acceptance_status && promoteSummary.replay_acceptance_status !== testCase.expect.replay_acceptance_status) {
    errors.push(`replay_acceptance_status: expected ${testCase.expect.replay_acceptance_status}, got ${promoteSummary.replay_acceptance_status}`);
  }
  if (typeof testCase.expect.min_replay_quality_errors === 'number' && (promoteSummary.replay_quality_errors || []).length < testCase.expect.min_replay_quality_errors) {
    errors.push(`replay quality errors: expected >= ${testCase.expect.min_replay_quality_errors}, got ${(promoteSummary.replay_quality_errors || []).length}`);
  }
  if (testCase.expect.delivery_readiness && readiness.readiness !== testCase.expect.delivery_readiness) {
    errors.push(`delivery readiness: expected ${testCase.expect.delivery_readiness}, got ${readiness.readiness}`);
  }
  if (!validation.ok) errors.push(`delivery validation failed: ${(validation.errors || []).join('; ')}`);
  if (!stateValidation.ok) errors.push(`evidence state validation failed: ${(stateValidation.errors || []).join('; ')}`);
  return {
    id: testCase.id,
    type: testCase.type,
    ok: errors.length === 0,
    errors,
    observed: { runSummary, promoteSummary, validation, stateValidation, readiness },
  };
}

function runCase(testCase) {
  if (testCase.type === 'pattern') return runPatternCase(testCase);
  if (testCase.type === 'route') return runRouteCase(testCase);
  if (testCase.type === 'runtime_capture') return runRuntimeCaptureCase(testCase);
  if (testCase.type === 'env_patch') return runEnvPatchCase(testCase);
  if (testCase.type === 'static_toolchain') return runStaticToolchainCase(testCase);
  if (testCase.type === 'static_truth') return runStaticTruthCase(testCase);
  if (testCase.type === 'domain_handoff') return runDomainHandoffCase(testCase);
  if (testCase.type === 'domain_handoff_record') return runDomainHandoffRecordCase(testCase);
  if (testCase.type === 'release_risk') return runReleaseRiskCase(testCase);
  if (testCase.type === 'external_matrix') return runExternalMatrixCase(testCase);
  if (testCase.type === 'anti_detection') return runAntiDetectionCase(testCase);
  if (testCase.type === 'mcp_smoke') return runMcpSmokeCase(testCase);
  if (testCase.type === 'mcp_smoke_record') return runMcpSmokeRecordCase(testCase);
  if (testCase.type === 'mcp_delivery_loop') return runMcpDeliveryLoopCase(testCase);
  if (testCase.type === 'replay_diagnosis') return runReplayDiagnosisCase(testCase);
  if (testCase.type === 'next_action') return runNextActionCase(testCase);
  if (testCase.type === 'replay_client') return runReplayClientCase(testCase);
  if (testCase.type === 'playbook_run') return runPlaybookCase(testCase);
  if (testCase.type === 'static_recover') return runStaticRecoverCase(testCase);
  if (testCase.type === 'promote_evidence') return runPromoteEvidenceCase(testCase);
  return { id: testCase.id || 'unknown', type: testCase.type || 'unknown', ok: false, errors: ['unknown case type'] };
}

function renderText(summary) {
  const lines = [
    `public benchmarks: ${summary.passed}/${summary.total} passed`,
    `pattern cases: ${summary.pattern_passed}/${summary.pattern_total} passed`,
    `route cases: ${summary.route_passed}/${summary.route_total} passed`,
    `runtime capture cases: ${summary.runtime_capture_passed}/${summary.runtime_capture_total} passed`,
    `environment patch cases: ${summary.env_patch_passed}/${summary.env_patch_total} passed`,
    `static toolchain cases: ${summary.static_toolchain_passed}/${summary.static_toolchain_total} passed`,
    `static truth cases: ${summary.static_truth_passed}/${summary.static_truth_total} passed`,
    `domain handoff cases: ${summary.domain_handoff_passed}/${summary.domain_handoff_total} passed`,
    `domain handoff record cases: ${summary.domain_handoff_record_passed}/${summary.domain_handoff_record_total} passed`,
    `release risk cases: ${summary.release_risk_passed}/${summary.release_risk_total} passed`,
    `external matrix cases: ${summary.external_matrix_passed}/${summary.external_matrix_total} passed`,
    `anti-detection cases: ${summary.anti_detection_passed}/${summary.anti_detection_total} passed`,
    `mcp smoke cases: ${summary.mcp_smoke_passed}/${summary.mcp_smoke_total} passed`,
    `mcp smoke record cases: ${summary.mcp_smoke_record_passed}/${summary.mcp_smoke_record_total} passed`,
    `mcp delivery loop cases: ${summary.mcp_delivery_loop_passed}/${summary.mcp_delivery_loop_total} passed`,
    `replay diagnosis cases: ${summary.replay_diagnosis_passed}/${summary.replay_diagnosis_total} passed`,
    `next action cases: ${summary.next_action_passed}/${summary.next_action_total} passed`,
    `replay client cases: ${summary.replay_client_passed}/${summary.replay_client_total} passed`,
    `playbook runner cases: ${summary.playbook_passed}/${summary.playbook_total} passed`,
    `static recovery cases: ${summary.static_recover_passed}/${summary.static_recover_total} passed`,
    `evidence promotion cases: ${summary.promote_evidence_passed}/${summary.promote_evidence_total} passed`,
  ];
  for (const item of summary.results) {
    lines.push(`${item.ok ? 'PASS' : 'FAIL'} ${item.id}`);
    for (const error of item.errors || []) lines.push(`  - ${error}`);
  }
  return `${lines.join('\n')}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  const suite = JSON.parse(fs.readFileSync(args.cases, 'utf8'));
  const results = (suite.cases || []).map(runCase);
  const patternResults = results.filter((item) => item.type === 'pattern');
  const routeResults = results.filter((item) => item.type === 'route');
  const runtimeCaptureResults = results.filter((item) => item.type === 'runtime_capture');
  const envPatchResults = results.filter((item) => item.type === 'env_patch');
  const staticToolchainResults = results.filter((item) => item.type === 'static_toolchain');
  const staticTruthResults = results.filter((item) => item.type === 'static_truth');
  const domainHandoffResults = results.filter((item) => item.type === 'domain_handoff');
  const domainHandoffRecordResults = results.filter((item) => item.type === 'domain_handoff_record');
  const releaseRiskResults = results.filter((item) => item.type === 'release_risk');
  const externalMatrixResults = results.filter((item) => item.type === 'external_matrix');
  const antiDetectionResults = results.filter((item) => item.type === 'anti_detection');
  const mcpSmokeResults = results.filter((item) => item.type === 'mcp_smoke');
  const mcpSmokeRecordResults = results.filter((item) => item.type === 'mcp_smoke_record');
  const mcpDeliveryLoopResults = results.filter((item) => item.type === 'mcp_delivery_loop');
  const replayDiagnosisResults = results.filter((item) => item.type === 'replay_diagnosis');
  const nextActionResults = results.filter((item) => item.type === 'next_action');
  const replayClientResults = results.filter((item) => item.type === 'replay_client');
  const playbookResults = results.filter((item) => item.type === 'playbook_run');
  const staticRecoverResults = results.filter((item) => item.type === 'static_recover');
  const promoteResults = results.filter((item) => item.type === 'promote_evidence');
  const summary = {
    schema: 'js-reverse-ops-public-benchmark-result-v1',
    cases_file: path.relative(rootDir, args.cases),
    total: results.length,
    passed: results.filter((item) => item.ok).length,
    failed: results.filter((item) => !item.ok).length,
    pattern_total: patternResults.length,
    pattern_passed: patternResults.filter((item) => item.ok).length,
    route_total: routeResults.length,
    route_passed: routeResults.filter((item) => item.ok).length,
    runtime_capture_total: runtimeCaptureResults.length,
    runtime_capture_passed: runtimeCaptureResults.filter((item) => item.ok).length,
    env_patch_total: envPatchResults.length,
    env_patch_passed: envPatchResults.filter((item) => item.ok).length,
    static_toolchain_total: staticToolchainResults.length,
    static_toolchain_passed: staticToolchainResults.filter((item) => item.ok).length,
    static_truth_total: staticTruthResults.length,
    static_truth_passed: staticTruthResults.filter((item) => item.ok).length,
    domain_handoff_total: domainHandoffResults.length,
    domain_handoff_passed: domainHandoffResults.filter((item) => item.ok).length,
    domain_handoff_record_total: domainHandoffRecordResults.length,
    domain_handoff_record_passed: domainHandoffRecordResults.filter((item) => item.ok).length,
    release_risk_total: releaseRiskResults.length,
    release_risk_passed: releaseRiskResults.filter((item) => item.ok).length,
    external_matrix_total: externalMatrixResults.length,
    external_matrix_passed: externalMatrixResults.filter((item) => item.ok).length,
    anti_detection_total: antiDetectionResults.length,
    anti_detection_passed: antiDetectionResults.filter((item) => item.ok).length,
    mcp_smoke_total: mcpSmokeResults.length,
    mcp_smoke_passed: mcpSmokeResults.filter((item) => item.ok).length,
    mcp_smoke_record_total: mcpSmokeRecordResults.length,
    mcp_smoke_record_passed: mcpSmokeRecordResults.filter((item) => item.ok).length,
    mcp_delivery_loop_total: mcpDeliveryLoopResults.length,
    mcp_delivery_loop_passed: mcpDeliveryLoopResults.filter((item) => item.ok).length,
    replay_diagnosis_total: replayDiagnosisResults.length,
    replay_diagnosis_passed: replayDiagnosisResults.filter((item) => item.ok).length,
    next_action_total: nextActionResults.length,
    next_action_passed: nextActionResults.filter((item) => item.ok).length,
    replay_client_total: replayClientResults.length,
    replay_client_passed: replayClientResults.filter((item) => item.ok).length,
    playbook_total: playbookResults.length,
    playbook_passed: playbookResults.filter((item) => item.ok).length,
    static_recover_total: staticRecoverResults.length,
    static_recover_passed: staticRecoverResults.filter((item) => item.ok).length,
    promote_evidence_total: promoteResults.length,
    promote_evidence_passed: promoteResults.filter((item) => item.ok).length,
    results,
  };

  if (args.out) fs.writeFileSync(args.out, `${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(args.json ? `${JSON.stringify(summary, null, 2)}\n` : renderText(summary));
  if (summary.failed) process.exit(1);
}

main();
