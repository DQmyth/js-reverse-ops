'use strict';
// scripts catalog: the index must describe exactly what the public bundle
// ships — and must not silently degrade to a list of "(no header)" again. It
// did exactly that for months: the generator required a file to START with
// "//", the shebang on line 1 hid every header, and the freshness gate
// (catalog file == generator output) stayed green because both sides were
// equally empty. So this test looks at the CONTENT.
// The third column says what the test suite proves about a script (recorded by
// scripts/trace_script_evidence.js in assets/script-evidence.json): "real sample", "not from a
// tool", "untested". "untested" is pinned as a list that may only shrink — the same rule as for
// headerless scripts — because the number was never looked at: 120 of 162 at v1.9.0.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const GEN = path.join(ROOT, 'scripts', 'generate_scripts_catalog.js');
const MANIFEST = path.join(ROOT, 'assets', 'public-export-manifest.json');
const EVIDENCE = path.join(ROOT, 'assets', 'script-evidence.json');
const CATALOG = path.join(ROOT, 'references', 'scripts-catalog.md');
const readEntries = () => Object.fromEntries(
  [...fs.readFileSync(CATALOG, 'utf8').matchAll(/^\| `([^`]+)` \| (.*?) \| (real sample|not from a tool|untested) \|$/gm)]
    .map((m) => [m[1], { desc: m[2], ev: m[3] }]));

// Older scripts that never got a header comment. Add a header to a script,
// then remove its name here — a NEW script must never land on this list.
const HEADERLESS = [
  'analyze_external_static.js',
  'annotate_vm_slots.js',
  'apply_vm_labels.js',
  'assess_delivery_readiness.js',
  'assess_external_bundle.js',
  'augment_vm_opcode_semantics.js',
  'benchmark_external_corpus.js',
  'benchmark_reverse_skill.js',
  'bootstrap_external_bundle.js',
  'build_archival_antidebug_report.js',
  'build_archival_evidence_package.js',
  'build_archival_solver_provenance.js',
  'build_claim_set.js',
  'build_hook_action_plan.js',
  'build_hook_execution_runbook.js',
  'build_mcp_execution_context.js',
  'build_mcp_execution_guide.js',
  'build_provenance_graph.js',
  'build_risk_summary.js',
  'capture_default_receiver_runtime.js',
  'classify_reverse_pattern.js',
  'collect_target_code.js',
  'compare_external_replay_to_runtime.js',
  'compare_mcp_execution_records.js',
  'diagnose_runtime_capture_gaps.js',
  'diff_builds.js',
  'diff_claim_sets.js',
  'dispatch_composite_workflow.js',
  'drift_summary.js',
  'execute_adapter_branches.js',
  'extract_dispatch_adapter_contract.js',
  'extract_request_neighborhood.js',
  'extract_second_stage_dispatcher.js',
  'extract_tail_contract.js',
  'extract_vm_flag_schema.js',
  'extract_vm_object_provenance.js',
  'extract_vm_opcode_semantics.js',
  'extract_vm_state_table.js',
  'extract_vm_string_corpus.js',
  'fingerprint_env_gated_crypto.js',
  'function_diff.js',
  'generate_default_receiver_probe.js',
  'generate_domain_handoff_plan.js',
  'generate_public_router_docs.js',
  'generate_task_lane_plan.js',
  'ingest_external_challenge_success.js',
  'ingest_external_public_facts.js',
  'ingest_external_replay_validation.js',
  'ingest_external_runtime_evidence.js',
  'ingest_external_source_snapshot.js',
  'ingest_hook_evidence.js',
  'ingest_local_harness_result.js',
  'ingest_mcp_execution_record.js',
  'init_bundle_worklog.js',
  'init_external_sample.js',
  'inspect_module_hybrid.js',
  'js_reverse_ops.js',
  'label_vm_semantics.js',
  'manage_external_corpus.js',
  'map_case_to_pattern.js',
  'materialize_mcp_call_payload.js',
  'normalize_external_bundle_state.js',
  'normalize_paused_request_locals.js',
  'normalize_task_artifacts.js',
  'operator_review.js',
  'plan_env_patch_from_divergence.js',
  'prepare_external_replay_validation.js',
  'prepare_local_harness_plan.js',
  'prepare_mcp_execution_record_template.js',
  'prepare_request_var_capture.js',
  'promote_delivery_evidence.js',
  're_loop_bundle.js',
  'reconcile_external_replay_verification.js',
  'record_local_harness_result.js',
  'record_mcp_execution_results.js',
  'refresh_public_release.js',
  'render_labeled_vm_snippet.js',
  'run_composite_workflow.js',
  'run_public_benchmarks.js',
  'scaffold_external_replay.js',
  'scaffold_form_obfuscation_replay.js',
  'scaffold_proxy_rpc_delivery.js',
  'select_executable_mcp_actions.js',
  'simulate_vm_slots.js',
  'summarize_default_branch_helpers.js',
  'summarize_paused_request_locals.js',
  'trace_vm_receiver_flow.js',
  'validate_evidence_state_transitions.js',
  'validate_vm_bind_patch.js',
  'validate_vm_trampoline_patch.js',
];

test('scripts-catalog: fresh, covers js/py/sh, described entries carry words, and headerless scripts are exactly the known list', () => {
  execFileSync('node', [GEN, '--check'], { encoding: 'utf8' }); // throws when stale
  const cat = readEntries();
  const names = Object.keys(cat);
  assert.ok(names.length > 150, 'the catalog must cover the whole scripts dir, got ' + names.length);
  for (const ext of ['.js', '.py', '.sh']) assert.ok(names.some((n) => n.endsWith(ext)), 'must index ' + ext);
  const bare = names.filter((n) => cat[n].desc === '(no header)').sort();
  assert.deepStrictEqual(bare, HEADERLESS.slice().sort());
  const described = names.filter((n) => cat[n].desc !== '(no header)');
  assert.ok(described.length >= 60, 'described entries: ' + described.length);
  for (const n of described) assert.ok(cat[n].desc.length >= 4, 'suspiciously short description for ' + n + ': ' + cat[n].desc); // Chinese labels are 5-7 chars
});

// Scripts no test starts. Write a test that starts one on REAL tool output (tests/fixtures/
// provenance.json says what counts), regenerate the evidence, then remove its name here — a NEW
// script must not land on this list without being noticed.
const UNTESTED = [
  'analyze_external_static.js',
  'annotate_vm_slots.js',
  'apply_vm_labels.js',
  'assess_external_bundle.js',
  'augment_vm_opcode_semantics.js',
  'benchmark_external_corpus.js',
  'benchmark_reverse_skill.js',
  'bootstrap_external_bundle.js',
  'build_archival_antidebug_report.js',
  'build_archival_evidence_package.js',
  'build_archival_solver_provenance.js',
  'build_claim_set.js',
  'build_mcp_execution_context.js',
  'build_mcp_execution_guide.js',
  'build_provenance_graph.js',
  'build_risk_summary.js',
  'capture_default_receiver_runtime.js',
  'cdp_minibrowser.js',
  'cf_clearance_harvest.py',
  'check_debug_browser.sh',
  'check_js_reverse_ops_deps.py',
  'check_local_js_reverse_mcp.py',
  'check_public_release.sh',
  'classify_reverse_pattern.js',
  'collect_target_code.js',
  'compare_external_replay_to_runtime.js',
  'compare_mcp_execution_records.js',
  'detect_env_divergence.js',
  'diff_builds.js',
  'diff_claim_sets.js',
  'dispatch_composite_workflow.js',
  'drift_summary.js',
  'execute_adapter_branches.js',
  'extract_dispatch_adapter_contract.js',
  'extract_page_contract.js',
  'extract_second_stage_dispatcher.js',
  'extract_vm_flag_schema.js',
  'extract_vm_object_provenance.js',
  'extract_vm_opcode_semantics.js',
  'extract_vm_state_table.js',
  'extract_vm_string_corpus.js',
  'fingerprint_env_gated_crypto.js',
  'function_diff.js',
  'generate_capability_scorecard.js',
  'generate_default_receiver_probe.js',
  'generate_market_gap_scorecard.js',
  'generate_public_router_docs.js',
  'generate_report.py',
  'gym_generate_targets.js',
  'gym_generic_solver.js',
  'gym_run.js',
  'harvest_pattern_case.js',
  'ingest_external_challenge_success.js',
  'ingest_external_public_facts.js',
  'ingest_external_replay_validation.js',
  'ingest_external_runtime_evidence.js',
  'ingest_external_source_snapshot.js',
  'ingest_hook_evidence.js',
  'ingest_local_harness_result.js',
  'ingest_mcp_execution_record.js',
  'init_bundle_worklog.js',
  'init_external_sample.js',
  'inspect_module_hybrid.js',
  'install_local.sh',
  'jsro.js',
  'label_vm_semantics.js',
  'make_release.sh',
  'manage_external_corpus.js',
  'materialize_mcp_call_payload.js',
  'normalize_external_bundle_state.js',
  'normalize_paused_request_locals.js',
  'normalize_task_artifacts.js',
  'operator_review.js',
  'prepare_external_replay_validation.js',
  'prepare_local_harness_plan.js',
  'prepare_mcp_execution_record_template.js',
  'prepare_request_var_capture.js',
  'profile_page_family.js',
  'publish_release.sh',
  're_loop_bundle.js',
  'reconcile_external_replay_verification.js',
  'record_local_harness_result.js',
  'record_mcp_execution_results.js',
  'refresh_public_release.js',
  'render_labeled_vm_snippet.js',
  'replay_scaffold.py',
  'run_composite_workflow.js',
  'sample_via_fetch_injection.js',
  'scaffold_env_prelude.js',
  'scaffold_external_replay.js',
  'scaffold_form_obfuscation_replay.js',
  'scaffold_proxy_rpc_delivery.js',
  'select_executable_mcp_actions.js',
  'serve_form_challenge_fixture.py',
  'session_snapshot.js',
  'simulate_vm_slots.js',
  'start_debug_browser.sh',
  'start_local_js_reverse_mcp.sh',
  'suggest_js_reverse_ops_repairs.py',
  'summarize_default_branch_helpers.js',
  'summarize_paused_request_locals.js',
  'test_scaffold_verbatim_harness.js',
  'trace_script_evidence.js',
  'trace_vm_receiver_flow.js',
  'triage_js.sh',
  'update_pattern_index_stats.js',
  'validate_vm_bind_patch.js',
  'validate_vm_trampoline_patch.js',
  'verify_cf_solve_capability.sh',
  'verify_recaptcha_capability.py',
];

const EVIDENCE_LABEL = { 'real-sample': 'real sample', 'input-not-from-a-tool': 'not from a tool', untested: 'untested' };

test('scripts-catalog: the evidence column is the recorded evidence, and "untested" is exactly the known list', () => {
  assert.ok(fs.existsSync(EVIDENCE), 'assets/script-evidence.json ships with the bundle');
  const recorded = JSON.parse(fs.readFileSync(EVIDENCE, 'utf8'));
  // The producer refuses to write evidence from a suite with a failing file, so the committed
  // file never carries one. This test must not assert that itself: it is part of the recorded
  // run, and reading its own previous failure kept it failing for good.
  // …and so the one thing worth reading here is that the record names its environment.
  assert.ok(recorded.environment && recorded.environment.complete === true, 'evidence was recorded on a complete environment');
  const cat = readEntries();
  for (const [name, entry] of Object.entries(cat)) {
    const record = recorded.scripts[name];
    assert.strictEqual(entry.ev, record ? EVIDENCE_LABEL[record.tier] : 'untested', `${name}: column vs evidence file`);
  }
  const untested = Object.keys(cat).filter((n) => cat[n].ev === 'untested').sort();
  assert.deepStrictEqual(untested, UNTESTED.slice().sort());
  // tests/unit/scripts-catalog.test.js itself runs generate_scripts_catalog.js: it shows as "not from a tool"
  for (const n of ['recover_string_table.js', 'inspect_obfuscation_family.js', 'unbundle.js', 'run_ast_pipeline.js',
    'decode_string_array_runtime.js', 'extract_request_neighborhood.js', 'trace_module_graph.js', 'extract_module_entry_contract.js']) {
    assert.strictEqual(cat[n].ev, 'real sample', `${n} must keep its real-sample evidence`);
  }
  for (const n of Object.keys(recorded.scripts)) {
    if (recorded.scripts[n].tier === 'real-sample') assert.ok(recorded.scripts[n].inputs.real > 0, `${n}: real-sample needs a real input on record`);
  }
});

test('scripts-catalog: SKILL.md quotes the evidence counts in prose — they are the catalog\'s', () => {
  // public/SKILL.md in this workspace is SKILL.md at the root of the exported bundle
  const skill = [path.join(ROOT, 'public', 'SKILL.md'), path.join(ROOT, 'SKILL.md')].find((p) => fs.existsSync(p));
  assert.ok(skill, 'SKILL.md found');
  const quoted = /(\d+) are run on real tool output, (\d+) are never started by a test/.exec(fs.readFileSync(skill, 'utf8'));
  assert.ok(quoted, 'the sentence that carries the two numbers reads: N are run on real tool output, M are never started by a test');
  const tally = (label) => Object.values(readEntries()).filter((entry) => entry.ev === label).length;
  assert.deepStrictEqual([Number(quoted[1]), Number(quoted[2])], [tally('real sample'), tally('untested')],
    'SKILL.md was not updated after the evidence changed (or vice versa)');
});

test('scripts-catalog: scripts the export skips are not indexed', { skip: !fs.existsSync(MANIFEST) && 'no manifest inside the exported bundle' }, () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const skipped = new Set(manifest.skippedScriptFiles || []);
  for (const d of manifest.copyDirectories || []) {
    if (d.from === 'scripts') for (const n of [...(d.skipFiles || []), ...(d.skipNames || [])]) skipped.add(n);
  }
  assert.ok(skipped.size > 0);
  const cat = readEntries();
  for (const n of skipped) if (/\.(js|py|sh)$/.test(n)) assert.ok(!(n in cat), 'skipped by the export but indexed: ' + n);
});
