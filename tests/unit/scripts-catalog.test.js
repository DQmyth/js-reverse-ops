'use strict';
// scripts catalog: the index must describe exactly what the public bundle
// ships — and must not silently degrade to a list of "(no header)" again. It
// did exactly that for months: the generator required a file to START with
// "//", the shebang on line 1 hid every header, and the freshness gate
// (catalog file == generator output) stayed green because both sides were
// equally empty. So this test looks at the CONTENT.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const GEN = path.join(ROOT, 'scripts', 'generate_scripts_catalog.js');
const MANIFEST = path.join(ROOT, 'assets', 'public-export-manifest.json');
const CATALOG = path.join(ROOT, 'references', 'scripts-catalog.md');
const readEntries = () => Object.fromEntries(
  [...fs.readFileSync(CATALOG, 'utf8').matchAll(/^\| `([^`]+)` \| (.*?) \|$/gm)].map((m) => [m[1], m[2]]));

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
  'decode_eval_wrapper.js',
  'diagnose_runtime_capture_gaps.js',
  'diff_builds.js',
  'diff_claim_sets.js',
  'dispatch_composite_workflow.js',
  'drift_summary.js',
  'execute_adapter_branches.js',
  'extract_dispatch_adapter_contract.js',
  'extract_module_entry_contract.js',
  'extract_packed_eval_payload.js',
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
  'inspect_obfuscation_family.js',
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
  'plan_static_toolchain.js',
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
  const bare = names.filter((n) => cat[n] === '(no header)').sort();
  assert.deepStrictEqual(bare, HEADERLESS.slice().sort());
  const described = names.filter((n) => cat[n] !== '(no header)');
  assert.ok(described.length >= 60, 'described entries: ' + described.length);
  for (const n of described) assert.ok(cat[n].length >= 4, 'suspiciously short description for ' + n + ': ' + cat[n]); // Chinese labels are 5-7 chars
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
