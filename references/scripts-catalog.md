# Scripts Catalog

This catalog is a generated index of the private `scripts/` directory.

- total scripts: `136`
- exported in the public bundle: `132`

Use this file when the repository feels deeper than the starter scripts exposed in `repo-map.json`.

## Triage

| Script | Stage | Inputs | Outputs | Public | Description |
| --- | --- | --- | --- | --- | --- |
| `scripts/extract_iocs.js` | `locate` | javascript | ioc json | `yes` | extract endpoints, crypto markers, eval sites, and other structural indicators |
| `scripts/extract_page_contract.js` | `locate` | html | page contract | `yes` | recover visible page endpoints, helper calls, and challenge-side contracts from HTML |
| `scripts/extract_request_contract.js` | `locate` | javascript | request contract | `yes` | recover likely request fields, methods, and signer-adjacent hints from code |
| `scripts/js_reverse_ops.js` | `locate` | url, html, javascript | routing plan, recommended scripts, recommended playbook | `yes` | unified task intake router that recommends stage, scripts, playbooks, and hook presets |
| `scripts/map_case_to_pattern.js` | `locate` | case notes, runtime observations, failure summary | ranked pattern matches, first moves, hook presets | `yes` | map sanitized observations or case notes to reusable playbooks and first moves |
| `scripts/profile_page_family.js` | `locate` | html | page family profile | `yes` | classify one HTML page into a reverse family before deeper analysis |
| `scripts/triage_js.sh` | `locate` | javascript | summary, candidate markers | `yes` | fast first-pass triage for one local JavaScript target |

## Runtime

| Script | Stage | Inputs | Outputs | Public | Description |
| --- | --- | --- | --- | --- | --- |
| `scripts/check_debug_browser.sh` | `runtime` | runtime evidence, browser target | health status | `yes` | smoke-test the debug browser endpoint |
| `scripts/check_js_reverse_ops_deps.py` | `runtime` | runtime evidence, browser target | health status | `yes` | verify local dependency health for browser-backed reverse work |
| `scripts/check_local_js_reverse_mcp.py` | `runtime` | runtime evidence, browser target | health status | `yes` | verify the local MCP bridge for browser-backed runtime tasks |
| `scripts/scaffold_hook_profile.js` | `runtime` | hook preset, target description | hook profile json, hook preload js | `yes` | generate a repeatable hook profile for runtime browser instrumentation |
| `scripts/start_debug_browser.sh` | `runtime` | runtime evidence, browser target | analysis artifact | `yes` | launch a debug browser session for runtime capture work |

## Recover

| Script | Stage | Inputs | Outputs | Public | Description |
| --- | --- | --- | --- | --- | --- |
| `scripts/extract_packed_eval_payload.js` | `recover` | javascript | extracted contract json | `yes` | peel one packed eval wrapper and isolate its payload |
| `scripts/extract_vm_opcode_semantics.js` | `recover` | javascript | extracted contract json | `yes` | recover opcode-level semantics for VM-style bundles |
| `scripts/recover_string_table.js` | `recover` | javascript | recovery artifact | `yes` | decode string-array and wrapper-heavy obfuscation patterns |
| `scripts/run_ast_pipeline.js` | `recover` | javascript | recovery artifact | `yes` | run one staged AST cleanup and readability pipeline over packed code |
| `scripts/trace_module_graph.js` | `recover` | html, javascript | recovery artifact | `yes` | map module import relationships and likely request-producing nodes |

## Replay

| Script | Stage | Inputs | Outputs | Public | Description |
| --- | --- | --- | --- | --- | --- |
| `scripts/generate_replay_delivery_client.js` | `replay` | accepted replay record | Node replay client, Python replay client, delivery manifest, delivery notes | `yes` | generate sanitized Node and Python replay clients from accepted replay evidence |
| `scripts/normalize_task_artifacts.js` | `replay` | request contract, runtime evidence | analysis artifact | `yes` | normalize one task directory into the canonical artifact layout |
| `scripts/replay_scaffold.py` | `replay` | request contract | Python replay scaffold | `yes` | baseline Python replay scaffold for recovered request contracts |
| `scripts/scaffold_external_replay.js` | `replay` | request contract, runtime evidence | replay scaffold | `yes` | generate one replay scaffold for an extracted external target |
| `scripts/scaffold_proxy_rpc_delivery.js` | `replay` | request contract, runtime evidence | scaffold files | `yes` | generate a proxy or RPC-oriented replay handoff scaffold |
| `scripts/validate_replay_delivery_client.js` | `replay` | generated replay client directory | replay client validation status, syntax checks, manifest safety checks | `yes` | validate generated replay client syntax, manifest safety, and delivery boundaries |

## Maintenance

| Script | Stage | Inputs | Outputs | Public | Description |
| --- | --- | --- | --- | --- | --- |
| `scripts/generate_capability_scorecard.js` | `maintenance` | public repository | capability scorecard json, capability scorecard markdown | `yes` | generate a public capability scorecard from repository evidence and benchmark results |
| `scripts/install_local.sh` | `maintenance` | public repository | installed skill directory | `yes` | install the public skill into CODEX_HOME skills directory |
| `scripts/promote_delivery_evidence.js` | `maintenance` | playbook run directory, hook evidence, mcp execution record, replay record | updated evidence, updated claims, updated provenance, updated replay status, updated operator review | `yes` | promote hook, MCP execution, or replay evidence into playbook runner delivery artifacts |
| `scripts/publish_release.sh` | `maintenance` | public repository | release check status, optional commit, optional tag, optional push | `yes` | run public release checks and optionally commit, tag, and push a release |
| `scripts/recommend_next_action.js` | `maintenance` | playbook run directory, operator notes | recommended action, recommended command, candidate next steps, readiness summary | `yes` | recommend the next smallest operator command from a playbook run directory |
| `scripts/run_public_benchmarks.js` | `maintenance` | public benchmark cases | benchmark summary, case pass/fail results | `yes` | run sanitized public benchmark cases for router and pattern-memory regressions |
| `scripts/validate_delivery_artifacts.js` | `maintenance` | playbook run directory | delivery validation status | `yes` | validate playbook runner delivery artifacts and bootstrap claim discipline |

## Other

| Script | Stage | Inputs | Outputs | Public | Description |
| --- | --- | --- | --- | --- | --- |
| `scripts/analyze_external_static.js` | `mixed` | javascript | analysis artifact | `yes` | analyze external static |
| `scripts/annotate_vm_slots.js` | `mixed` | javascript | analysis artifact | `yes` | annotate vm slots |
| `scripts/apply_vm_labels.js` | `mixed` | javascript | analysis artifact | `yes` | apply vm labels |
| `scripts/assess_delivery_readiness.js` | `mixed` | javascript | analysis artifact | `yes` | assess delivery readiness |
| `scripts/assess_external_bundle.js` | `mixed` | javascript | analysis artifact | `yes` | assess external bundle |
| `scripts/assess_static_recovery_truth.js` | `mixed` | original javascript, recovered javascript, runtime evidence, replay record | static truth assessment, promotion state, risk signals | `yes` | label static recovery output as inferred, runtime-correlated, divergent, or replay-verified |
| `scripts/augment_vm_opcode_semantics.js` | `mixed` | javascript | analysis artifact | `yes` | augment vm opcode semantics |
| `scripts/benchmark_external_corpus.js` | `mixed` | javascript | analysis artifact | `yes` | benchmark external corpus |
| `scripts/benchmark_reverse_skill.js` | `mixed` | javascript | analysis artifact | `yes` | benchmark reverse skill |
| `scripts/bootstrap_external_bundle.js` | `mixed` | javascript | analysis artifact | `yes` | bootstrap external bundle |
| `scripts/build_archival_antidebug_report.js` | `mixed` | javascript | derived artifact json, derived artifact markdown | `yes` | build archival antidebug report |
| `scripts/build_archival_evidence_package.js` | `mixed` | javascript | derived artifact json, derived artifact markdown | `yes` | build archival evidence package |
| `scripts/build_archival_solver_provenance.js` | `mixed` | javascript | derived artifact json, derived artifact markdown | `yes` | build archival solver provenance |
| `scripts/build_benchmark_corpus.js` | `mixed` | javascript | derived artifact json, derived artifact markdown | `no` | build benchmark corpus |
| `scripts/build_claim_set.js` | `mixed` | javascript | derived artifact json, derived artifact markdown | `yes` | build claim set |
| `scripts/build_hook_action_plan.js` | `mixed` | javascript | derived artifact json, derived artifact markdown | `yes` | build hook action plan |
| `scripts/build_hook_execution_runbook.js` | `mixed` | javascript | derived artifact json, derived artifact markdown | `yes` | build hook execution runbook |
| `scripts/build_mcp_execution_context.js` | `mixed` | javascript | derived artifact json, derived artifact markdown | `yes` | build mcp execution context |
| `scripts/build_mcp_execution_guide.js` | `mixed` | javascript | derived artifact json, derived artifact markdown | `yes` | build mcp execution guide |
| `scripts/build_provenance_graph.js` | `mixed` | javascript | derived artifact json, derived artifact markdown | `yes` | build provenance graph |
| `scripts/build_risk_summary.js` | `mixed` | javascript | derived artifact json, derived artifact markdown | `yes` | build risk summary |
| `scripts/capture_default_receiver_runtime.js` | `mixed` | javascript | analysis artifact | `yes` | capture default receiver runtime |
| `scripts/classify_reverse_pattern.js` | `mixed` | javascript | analysis artifact | `yes` | classify reverse pattern |
| `scripts/collect_target_code.js` | `mixed` | javascript | analysis artifact | `yes` | collect target code |
| `scripts/compare_external_replay_to_runtime.js` | `mixed` | javascript | analysis artifact | `yes` | compare external replay to runtime |
| `scripts/compare_external_skill_matrix.js` | `mixed` | public repository, external skill regression model | external matrix json, external matrix markdown, priority improvements | `yes` | compare js-reverse-ops against external reverse-engineering skill and toolchain capability profiles |
| `scripts/compare_mcp_execution_records.js` | `mixed` | javascript | analysis artifact | `yes` | compare mcp execution records |
| `scripts/decode_eval_wrapper.js` | `mixed` | javascript | analysis artifact | `yes` | decode eval wrapper |
| `scripts/diagnose_replay_failure.js` | `mixed` | playbook run directory, replay record, divergence notes | replay failure diagnosis, recommended repair class, next scripts | `yes` | classify rejected or divergent replay evidence and recommend the smallest repair lane |
| `scripts/diagnose_runtime_capture_gaps.js` | `mixed` | javascript | analysis artifact | `yes` | diagnose runtime capture gaps |
| `scripts/diff_builds.js` | `mixed` | javascript | analysis artifact | `yes` | diff builds |
| `scripts/diff_claim_sets.js` | `mixed` | javascript | analysis artifact | `yes` | diff claim sets |
| `scripts/dispatch_composite_workflow.js` | `mixed` | javascript | analysis artifact | `yes` | dispatch composite workflow |
| `scripts/drift_summary.js` | `mixed` | javascript | analysis artifact | `yes` | drift summary |
| `scripts/execute_adapter_branches.js` | `mixed` | javascript | analysis artifact | `yes` | execute adapter branches |
| `scripts/explain_public_release_risk.js` | `mixed` | javascript | analysis artifact | `yes` | explain public release risk |
| `scripts/export_public_skill.js` | `mixed` | javascript | analysis artifact | `no` | export public skill |
| `scripts/export_runtime_evidence.js` | `mixed` | javascript | analysis artifact | `no` | export runtime evidence |
| `scripts/extract_dispatch_adapter_contract.js` | `mixed` | javascript | extracted contract json | `yes` | extract dispatch adapter contract |
| `scripts/extract_module_entry_contract.js` | `mixed` | html, javascript | extracted contract json | `yes` | extract module entry contract |
| `scripts/extract_request_neighborhood.js` | `mixed` | javascript | extracted contract json | `yes` | extract request neighborhood |
| `scripts/extract_second_stage_dispatcher.js` | `mixed` | javascript | extracted contract json | `yes` | extract second stage dispatcher |
| `scripts/extract_tail_contract.js` | `mixed` | javascript | extracted contract json | `yes` | extract tail contract |
| `scripts/extract_vm_flag_schema.js` | `mixed` | javascript | extracted contract json | `yes` | extract vm flag schema |
| `scripts/extract_vm_object_provenance.js` | `mixed` | javascript | extracted contract json | `yes` | extract vm object provenance |
| `scripts/extract_vm_state_table.js` | `mixed` | javascript | extracted contract json | `yes` | extract vm state table |
| `scripts/extract_vm_string_corpus.js` | `mixed` | javascript | extracted contract json | `yes` | extract vm string corpus |
| `scripts/function_diff.js` | `mixed` | javascript | analysis artifact | `yes` | function diff |
| `scripts/generate_default_receiver_probe.js` | `mixed` | javascript | analysis artifact | `yes` | generate default receiver probe |
| `scripts/generate_market_gap_scorecard.js` | `mixed` | javascript | analysis artifact | `yes` | generate market gap scorecard |
| `scripts/generate_public_router_docs.js` | `mixed` | javascript | analysis artifact | `yes` | generate public router docs |
| `scripts/generate_report.py` | `mixed` | json, request contract | analysis artifact | `yes` | generate report |
| `scripts/generate_scripts_catalog.js` | `mixed` | javascript | analysis artifact | `yes` | generate scripts catalog |
| `scripts/generate_task_lane_plan.js` | `mixed` | javascript | analysis artifact | `yes` | generate task lane plan |
| `scripts/ingest_external_challenge_success.js` | `mixed` | javascript | analysis artifact | `yes` | ingest external challenge success |
| `scripts/ingest_external_public_facts.js` | `mixed` | javascript | analysis artifact | `yes` | ingest external public facts |
| `scripts/ingest_external_replay_validation.js` | `mixed` | javascript | analysis artifact | `yes` | ingest external replay validation |
| `scripts/ingest_external_runtime_evidence.js` | `mixed` | javascript | analysis artifact | `yes` | ingest external runtime evidence |
| `scripts/ingest_external_source_snapshot.js` | `mixed` | javascript | analysis artifact | `yes` | ingest external source snapshot |
| `scripts/ingest_hook_evidence.js` | `mixed` | javascript | analysis artifact | `yes` | ingest hook evidence |
| `scripts/ingest_local_harness_result.js` | `mixed` | javascript | analysis artifact | `yes` | ingest local harness result |
| `scripts/ingest_mcp_execution_record.js` | `mixed` | javascript | analysis artifact | `yes` | ingest mcp execution record |
| `scripts/init_bundle_worklog.js` | `mixed` | javascript | analysis artifact | `yes` | init bundle worklog |
| `scripts/init_external_sample.js` | `mixed` | javascript | analysis artifact | `yes` | init external sample |
| `scripts/inspect_module_hybrid.js` | `mixed` | html, javascript | analysis artifact | `yes` | inspect module hybrid |
| `scripts/inspect_obfuscation_family.js` | `mixed` | javascript | analysis artifact | `yes` | inspect obfuscation family |
| `scripts/jsro.js` | `mixed` | cli command | delegated command output | `yes` | single-command CLI wrapper for routing, pattern mapping, runner, validation, benchmark, scorecard, install, and publish |
| `scripts/label_vm_semantics.js` | `mixed` | javascript | analysis artifact | `yes` | label vm semantics |
| `scripts/manage_external_corpus.js` | `mixed` | javascript | analysis artifact | `yes` | manage external corpus |
| `scripts/materialize_mcp_call_payload.js` | `mixed` | javascript | analysis artifact | `yes` | materialize mcp call payload |
| `scripts/normalize_external_bundle_state.js` | `mixed` | javascript | analysis artifact | `yes` | normalize external bundle state |
| `scripts/normalize_paused_request_locals.js` | `mixed` | javascript | analysis artifact | `yes` | normalize paused request locals |
| `scripts/operator_review.js` | `mixed` | javascript | analysis artifact | `yes` | operator review |
| `scripts/plan_browser_mcp_smoke.js` | `mixed` | mcp server family, public repository | browser mcp smoke plan json, browser mcp smoke plan markdown, missing capabilities | `yes` | plan browser MCP adapter smoke checks while preserving planned versus observed evidence boundaries |
| `scripts/plan_env_patch_from_divergence.js` | `mixed` | javascript | analysis artifact | `yes` | plan env patch from divergence |
| `scripts/plan_static_toolchain.js` | `mixed` | javascript | analysis artifact | `yes` | plan static toolchain |
| `scripts/prepare_external_replay_validation.js` | `mixed` | javascript | analysis artifact | `yes` | prepare external replay validation |
| `scripts/prepare_local_harness_plan.js` | `mixed` | javascript | analysis artifact | `yes` | prepare local harness plan |
| `scripts/prepare_mcp_execution_record_template.js` | `mixed` | javascript | analysis artifact | `yes` | prepare mcp execution record template |
| `scripts/prepare_request_var_capture.js` | `mixed` | javascript | analysis artifact | `yes` | prepare request var capture |
| `scripts/re_loop_bundle.js` | `mixed` | javascript | analysis artifact | `yes` | re loop bundle |
| `scripts/reconcile_external_replay_verification.js` | `mixed` | javascript | analysis artifact | `yes` | reconcile external replay verification |
| `scripts/record_local_harness_result.js` | `mixed` | javascript | analysis artifact | `yes` | record local harness result |
| `scripts/record_mcp_execution_results.js` | `mixed` | javascript | analysis artifact | `yes` | record mcp execution results |
| `scripts/refresh_public_release.js` | `mixed` | javascript | analysis artifact | `yes` | refresh public release |
| `scripts/render_labeled_vm_snippet.js` | `mixed` | javascript | analysis artifact | `yes` | render labeled vm snippet |
| `scripts/run_composite_workflow.js` | `mixed` | javascript | analysis artifact | `yes` | run composite workflow |
| `scripts/run_live_validation.js` | `mixed` | javascript | analysis artifact | `no` | run live validation |
| `scripts/run_mcp_delivery_loop.js` | `mixed` | target, case notes, mcp execution record | playbook run directory, mcp smoke plan, mcp execution record template, delivery loop summary | `yes` | run browser MCP delivery loop scaffolding, optional record verification, evidence promotion, validation, and readiness checks |
| `scripts/run_playbook.js` | `mixed` | url, html, javascript, case notes | playbook run json, playbook run markdown, hook profile scaffold | `yes` | turn router and playbook output into a concrete run directory with hook scaffolds and optional local execution |
| `scripts/scaffold_form_obfuscation_replay.js` | `mixed` | javascript | scaffold files | `yes` | scaffold form obfuscation replay |
| `scripts/select_anti_detection_profile.js` | `mixed` | javascript | analysis artifact | `yes` | select anti detection profile |
| `scripts/select_executable_mcp_actions.js` | `mixed` | javascript | analysis artifact | `yes` | select executable mcp actions |
| `scripts/serve_form_challenge_fixture.py` | `mixed` | json, request contract | analysis artifact | `yes` | serve form challenge fixture |
| `scripts/simulate_vm_slots.js` | `mixed` | javascript | analysis artifact | `yes` | simulate vm slots |
| `scripts/start_local_js_reverse_mcp.sh` | `mixed` | javascript | analysis artifact | `yes` | start local js reverse mcp |
| `scripts/suggest_js_reverse_ops_repairs.py` | `mixed` | json, request contract | analysis artifact | `yes` | suggest js reverse ops repairs |
| `scripts/summarize_default_branch_helpers.js` | `mixed` | javascript | analysis artifact | `yes` | summarize default branch helpers |
| `scripts/summarize_paused_request_locals.js` | `mixed` | javascript | analysis artifact | `yes` | summarize paused request locals |
| `scripts/trace_vm_receiver_flow.js` | `mixed` | javascript | analysis artifact | `yes` | trace vm receiver flow |
| `scripts/validate_evidence_state_transitions.js` | `mixed` | javascript | analysis artifact | `yes` | validate evidence state transitions |
| `scripts/validate_vm_bind_patch.js` | `mixed` | javascript | analysis artifact | `yes` | validate vm bind patch |
| `scripts/validate_vm_trampoline_patch.js` | `mixed` | javascript | analysis artifact | `yes` | validate vm trampoline patch |
| `scripts/verify_browser_mcp_smoke_record.js` | `mixed` | mcp execution record | browser mcp smoke verification, observed capability coverage, raw capture risk warnings | `yes` | verify browser MCP smoke execution records against adapter capabilities and sanitized observation requirements |

