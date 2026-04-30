# Scripts Catalog

This catalog is a generated index of the private `scripts/` directory.

- total scripts: `105`
- exported in the public bundle: `101`

Use this file when the repository feels deeper than the starter scripts exposed in `repo-map.json`.

## Triage

| Script | Stage | Public | Description |
| --- | --- | --- | --- |
| `scripts/extract_iocs.js` | `locate` | `yes` | extract endpoints, crypto markers, eval sites, and other structural indicators |
| `scripts/extract_page_contract.js` | `locate` | `yes` | recover visible page endpoints, helper calls, and challenge-side contracts from HTML |
| `scripts/extract_request_contract.js` | `locate` | `yes` | recover likely request fields, methods, and signer-adjacent hints from code |
| `scripts/profile_page_family.js` | `locate` | `yes` | classify one HTML page into a reverse family before deeper analysis |
| `scripts/triage_js.sh` | `locate` | `yes` | fast first-pass triage for one local JavaScript target |

## Runtime

| Script | Stage | Public | Description |
| --- | --- | --- | --- |
| `scripts/check_debug_browser.sh` | `runtime` | `yes` | smoke-test the debug browser endpoint |
| `scripts/check_js_reverse_ops_deps.py` | `runtime` | `yes` | verify local dependency health for browser-backed reverse work |
| `scripts/check_local_js_reverse_mcp.py` | `runtime` | `yes` | verify the local MCP bridge for browser-backed runtime tasks |
| `scripts/scaffold_hook_profile.js` | `runtime` | `yes` | generate a repeatable hook profile for runtime browser instrumentation |
| `scripts/start_debug_browser.sh` | `runtime` | `yes` | launch a debug browser session for runtime capture work |

## Recover

| Script | Stage | Public | Description |
| --- | --- | --- | --- |
| `scripts/extract_packed_eval_payload.js` | `recover` | `yes` | peel one packed eval wrapper and isolate its payload |
| `scripts/extract_vm_opcode_semantics.js` | `recover` | `yes` | recover opcode-level semantics for VM-style bundles |
| `scripts/recover_string_table.js` | `recover` | `yes` | decode string-array and wrapper-heavy obfuscation patterns |
| `scripts/run_ast_pipeline.js` | `recover` | `yes` | run one staged AST cleanup and readability pipeline over packed code |
| `scripts/trace_module_graph.js` | `recover` | `yes` | map module import relationships and likely request-producing nodes |

## Replay

| Script | Stage | Public | Description |
| --- | --- | --- | --- |
| `scripts/normalize_task_artifacts.js` | `replay` | `yes` | normalize one task directory into the canonical artifact layout |
| `scripts/replay_scaffold.py` | `replay` | `yes` | baseline Python replay scaffold for recovered request contracts |
| `scripts/scaffold_external_replay.js` | `replay` | `yes` | generate one replay scaffold for an extracted external target |
| `scripts/scaffold_proxy_rpc_delivery.js` | `replay` | `yes` | generate a proxy or RPC-oriented replay handoff scaffold |

## Other

| Script | Stage | Public | Description |
| --- | --- | --- | --- |
| `scripts/analyze_external_static.js` | `mixed` | `yes` | analyze external static |
| `scripts/annotate_vm_slots.js` | `mixed` | `yes` | annotate vm slots |
| `scripts/apply_vm_labels.js` | `mixed` | `yes` | apply vm labels |
| `scripts/assess_external_bundle.js` | `mixed` | `yes` | assess external bundle |
| `scripts/augment_vm_opcode_semantics.js` | `mixed` | `yes` | augment vm opcode semantics |
| `scripts/benchmark_external_corpus.js` | `mixed` | `yes` | benchmark external corpus |
| `scripts/benchmark_reverse_skill.js` | `mixed` | `yes` | benchmark reverse skill |
| `scripts/bootstrap_external_bundle.js` | `mixed` | `yes` | bootstrap external bundle |
| `scripts/build_archival_antidebug_report.js` | `mixed` | `yes` | build archival antidebug report |
| `scripts/build_archival_evidence_package.js` | `mixed` | `yes` | build archival evidence package |
| `scripts/build_archival_solver_provenance.js` | `mixed` | `yes` | build archival solver provenance |
| `scripts/build_benchmark_corpus.js` | `mixed` | `no` | build benchmark corpus |
| `scripts/build_claim_set.js` | `mixed` | `yes` | build claim set |
| `scripts/build_hook_action_plan.js` | `mixed` | `yes` | build hook action plan |
| `scripts/build_hook_execution_runbook.js` | `mixed` | `yes` | build hook execution runbook |
| `scripts/build_mcp_execution_context.js` | `mixed` | `yes` | build mcp execution context |
| `scripts/build_mcp_execution_guide.js` | `mixed` | `yes` | build mcp execution guide |
| `scripts/build_provenance_graph.js` | `mixed` | `yes` | build provenance graph |
| `scripts/build_risk_summary.js` | `mixed` | `yes` | build risk summary |
| `scripts/capture_default_receiver_runtime.js` | `mixed` | `yes` | capture default receiver runtime |
| `scripts/classify_reverse_pattern.js` | `mixed` | `yes` | classify reverse pattern |
| `scripts/collect_target_code.js` | `mixed` | `yes` | collect target code |
| `scripts/compare_external_replay_to_runtime.js` | `mixed` | `yes` | compare external replay to runtime |
| `scripts/decode_eval_wrapper.js` | `mixed` | `yes` | decode eval wrapper |
| `scripts/diff_builds.js` | `mixed` | `yes` | diff builds |
| `scripts/diff_claim_sets.js` | `mixed` | `yes` | diff claim sets |
| `scripts/dispatch_composite_workflow.js` | `mixed` | `yes` | dispatch composite workflow |
| `scripts/drift_summary.js` | `mixed` | `yes` | drift summary |
| `scripts/execute_adapter_branches.js` | `mixed` | `yes` | execute adapter branches |
| `scripts/export_public_skill.js` | `mixed` | `no` | export public skill |
| `scripts/export_runtime_evidence.js` | `mixed` | `no` | export runtime evidence |
| `scripts/extract_dispatch_adapter_contract.js` | `mixed` | `yes` | extract dispatch adapter contract |
| `scripts/extract_module_entry_contract.js` | `mixed` | `yes` | extract module entry contract |
| `scripts/extract_request_neighborhood.js` | `mixed` | `yes` | extract request neighborhood |
| `scripts/extract_second_stage_dispatcher.js` | `mixed` | `yes` | extract second stage dispatcher |
| `scripts/extract_tail_contract.js` | `mixed` | `yes` | extract tail contract |
| `scripts/extract_vm_flag_schema.js` | `mixed` | `yes` | extract vm flag schema |
| `scripts/extract_vm_object_provenance.js` | `mixed` | `yes` | extract vm object provenance |
| `scripts/extract_vm_state_table.js` | `mixed` | `yes` | extract vm state table |
| `scripts/extract_vm_string_corpus.js` | `mixed` | `yes` | extract vm string corpus |
| `scripts/function_diff.js` | `mixed` | `yes` | function diff |
| `scripts/generate_default_receiver_probe.js` | `mixed` | `yes` | generate default receiver probe |
| `scripts/generate_public_router_docs.js` | `mixed` | `yes` | generate public router docs |
| `scripts/generate_report.py` | `mixed` | `yes` | generate report |
| `scripts/generate_scripts_catalog.js` | `mixed` | `yes` | generate scripts catalog |
| `scripts/ingest_external_challenge_success.js` | `mixed` | `yes` | ingest external challenge success |
| `scripts/ingest_external_public_facts.js` | `mixed` | `yes` | ingest external public facts |
| `scripts/ingest_external_replay_validation.js` | `mixed` | `yes` | ingest external replay validation |
| `scripts/ingest_external_runtime_evidence.js` | `mixed` | `yes` | ingest external runtime evidence |
| `scripts/ingest_external_source_snapshot.js` | `mixed` | `yes` | ingest external source snapshot |
| `scripts/ingest_hook_evidence.js` | `mixed` | `yes` | ingest hook evidence |
| `scripts/ingest_local_harness_result.js` | `mixed` | `yes` | ingest local harness result |
| `scripts/ingest_mcp_execution_record.js` | `mixed` | `yes` | ingest mcp execution record |
| `scripts/init_bundle_worklog.js` | `mixed` | `yes` | init bundle worklog |
| `scripts/init_external_sample.js` | `mixed` | `yes` | init external sample |
| `scripts/inspect_module_hybrid.js` | `mixed` | `yes` | inspect module hybrid |
| `scripts/inspect_obfuscation_family.js` | `mixed` | `yes` | inspect obfuscation family |
| `scripts/label_vm_semantics.js` | `mixed` | `yes` | label vm semantics |
| `scripts/manage_external_corpus.js` | `mixed` | `yes` | manage external corpus |
| `scripts/materialize_mcp_call_payload.js` | `mixed` | `yes` | materialize mcp call payload |
| `scripts/normalize_external_bundle_state.js` | `mixed` | `yes` | normalize external bundle state |
| `scripts/normalize_paused_request_locals.js` | `mixed` | `yes` | normalize paused request locals |
| `scripts/operator_review.js` | `mixed` | `yes` | operator review |
| `scripts/prepare_external_replay_validation.js` | `mixed` | `yes` | prepare external replay validation |
| `scripts/prepare_local_harness_plan.js` | `mixed` | `yes` | prepare local harness plan |
| `scripts/prepare_mcp_execution_record_template.js` | `mixed` | `yes` | prepare mcp execution record template |
| `scripts/prepare_request_var_capture.js` | `mixed` | `yes` | prepare request var capture |
| `scripts/re_loop_bundle.js` | `mixed` | `yes` | re loop bundle |
| `scripts/reconcile_external_replay_verification.js` | `mixed` | `yes` | reconcile external replay verification |
| `scripts/record_local_harness_result.js` | `mixed` | `yes` | record local harness result |
| `scripts/record_mcp_execution_results.js` | `mixed` | `yes` | record mcp execution results |
| `scripts/refresh_public_release.js` | `mixed` | `yes` | refresh public release |
| `scripts/render_labeled_vm_snippet.js` | `mixed` | `yes` | render labeled vm snippet |
| `scripts/run_composite_workflow.js` | `mixed` | `yes` | run composite workflow |
| `scripts/run_live_validation.js` | `mixed` | `no` | run live validation |
| `scripts/scaffold_form_obfuscation_replay.js` | `mixed` | `yes` | scaffold form obfuscation replay |
| `scripts/select_executable_mcp_actions.js` | `mixed` | `yes` | select executable mcp actions |
| `scripts/serve_form_challenge_fixture.py` | `mixed` | `yes` | serve form challenge fixture |
| `scripts/simulate_vm_slots.js` | `mixed` | `yes` | simulate vm slots |
| `scripts/start_local_js_reverse_mcp.sh` | `mixed` | `yes` | start local js reverse mcp |
| `scripts/suggest_js_reverse_ops_repairs.py` | `mixed` | `yes` | suggest js reverse ops repairs |
| `scripts/summarize_default_branch_helpers.js` | `mixed` | `yes` | summarize default branch helpers |
| `scripts/summarize_paused_request_locals.js` | `mixed` | `yes` | summarize paused request locals |
| `scripts/trace_vm_receiver_flow.js` | `mixed` | `yes` | trace vm receiver flow |
| `scripts/validate_vm_bind_patch.js` | `mixed` | `yes` | validate vm bind patch |
| `scripts/validate_vm_trampoline_patch.js` | `mixed` | `yes` | validate vm trampoline patch |

