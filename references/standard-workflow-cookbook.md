# Standard Workflow Cookbook（按需加载）

本文件是 `SKILL.md` Standard Workflow 的完整脚本菜谱。使用方式：**不要通读**。
先看 SKILL.md 的工作流分组索引定位当前阶段，再跳到对应小节挑下一步。
每条都是一个"症状/目标 → 命令"对，按执行顺序排列，同阶段内按需取用。

## Standard Workflow

### 1. Triage

Start with the smallest reliable context.

- If unsure which path applies, run `node scripts/js_reverse_ops.js <target-url-or-file> [--json]` to get a stage, script sequence, playbook, and hook preset recommendation.
- For local files, run `scripts/triage_js.sh <path>`.
- Before blaming the environment, run `python3 scripts/check_js_reverse_ops_deps.py`.
- If dependencies are missing, run `python3 scripts/suggest_js_reverse_ops_repairs.py <dep-report.json>` to generate the smallest repair plan.
- For browser targets, if the runtime bridge is not healthy, run `scripts/start_debug_browser.sh` and then `scripts/check_debug_browser.sh`.
- On macOS, if the browser binary briefly opens `9222` and then exits, rerun `scripts/start_debug_browser.sh` with `MACOS_OPEN_APP=1` and an isolated `USER_DATA_DIR` so the launcher uses `open -na` instead of trusting a transient binary launch.
- If the DevTools endpoint is healthy but MCP tools fail with `Transport closed`, run `python3 scripts/check_local_js_reverse_mcp.py`. If that smoke test passes, treat the current Codex session's MCP binding as dead, persist the current evidence, and restart from browser preflight in a fresh session instead of continuing the broken one.
- For browser targets, identify the concrete target action and target request first.
- For suspicious bundles, run `scripts/extract_iocs.js <path>` to extract URLs, crypto markers, dynamic execution sites, and bundler clues.
- For files where the endpoint is not obviously at the tail, run `scripts/extract_request_contract.js <path>` before reading code manually.
- For heavy `_0x` or string-table bundles, run `scripts/inspect_obfuscation_family.js <path>` before attempting AST cleanup.
- For heavy `_0x` bundles with a top-level array rotation and resolver wrapper, run `scripts/recover_string_table.js <path>` to recover decoded samples and recursively inline simple wrapper neighborhoods before broader transforms.
- For large local targets, run `node scripts/collect_target_code.js <target> --mode summary|priority|incremental` before loading code wholesale.
- For downloaded HTML challenge pages, run `scripts/profile_page_family.js <page.html>` to classify whether the target is remote-corejs, inline-page, or module/wasm-backed.
- For HTML-first challenges, run `scripts/extract_page_contract.js <page.html>`.
- If the landing page only links into a data subpage or app shell, capture both pages separately before choosing a family.
- For module or wasm-backed pages, run `scripts/inspect_module_hybrid.js <page-or-module>` and favor runtime-first discovery.
- To turn one verified runtime sample into a reusable artifact bundle, run `scripts/export_runtime_evidence.js --runtime-summary <summary.json> --topic <id> --output-dir <dir>`.
- To normalize a task directory into the canonical artifact layout, run `scripts/normalize_task_artifacts.js --output-dir <dir> ...`.
- To batch-check a whole page family against one runtime summary and downloaded artifacts, run `scripts/run_live_validation.js --runtime-summary <summary.json> --downloads-root <dir> --output-dir <dir>`.
- If paused-frame locals are captured, normalize them with `scripts/normalize_paused_request_locals.js` before treating them as provenance evidence.
- For module or wasm-backed pages where import layering matters, run `scripts/trace_module_graph.js <page.html-or-module.js> [extra-module.js...]` to build an import chain, apply local alias mapping for unresolved imports, and rank the most likely request-producing modules before static deep reads.
- For module entry files that mostly bootstrap another runtime, run `scripts/extract_module_entry_contract.js <input.js-or-graph.json>` to capture imports, global exposure, bootstrap hints, and request-field hints before chasing packed internals.
- For entry modules using `eval(function(...))` or similar packed bootstrap, run `scripts/extract_packed_eval_payload.js <input.js-or-graph.json>` to peel off the wrapper head and payload excerpt before using generic deobfuscation.
- After identifying a packed wrapper, run `scripts/decode_eval_wrapper.js <input.js-or-graph.json>` to attempt a first-layer expansion and decide whether you are looking at readable JS or a second-stage VM.
- If first-layer decode fails on `bind`, `call`, or `apply`, inspect the `provenance_candidates`, `runtime_stack_head`, and `runtime_fault_excerpt` emitted by `scripts/decode_eval_wrapper.js`, then run `scripts/extract_vm_object_provenance.js <decoded-first-layer.json>` to recover bootstrap slot aliases before adding more sandbox shims.
- If the likely failure origin is the bind slot, run `scripts/validate_vm_bind_patch.js <input.js-or-graph.json>` to test a minimal bootstrap-slot replacement before attempting broader runtime patches.
- If bind-slot patching does not move the error, run `scripts/validate_vm_trampoline_patch.js <input.js-or-graph.json>` to test whether the bootstrap call trampoline or dispatch adapter is the next blocker.
- After trampoline patching, run `scripts/trace_vm_receiver_flow.js <object-provenance.json> --trampoline <trampoline-validation.json>` to map the current failure stage across dispatch key, trampoline, adapter, and bind slot.
- Run `scripts/extract_dispatch_adapter_contract.js <object-provenance.json>` to recover the adapter signature and branch forwarding contract before attempting local execution.
- Run `scripts/simulate_vm_slots.js <object-provenance.json>` to convert bootstrap slots into a stable slot-state model before emulating adapter branches.
- Run `scripts/execute_adapter_branches.js <slot-simulation.json> <adapter-contract.json> [--runtime <default-receiver-runtime.json>]` to test which adapter branches already resolve to callable bootstrap receivers under the current static model and to fold in runtime-confirmed default-branch captures.
- When the unresolved branch is still the default `Z.$[o]` receiver path, run `scripts/generate_default_receiver_probe.js <slot-simulation.json> <adapter-contract.json>` to emit a runtime probe that logs candidate default-branch receivers.
- If probe injection does not land because the target uses direct eval or module-scoped bootstrap, set a breakpoint on the default branch callsite and capture `o`, receiver, trampoline base, dispatch key, and resolved callee from the paused frame as a runtime receiver artifact.
- Run `scripts/capture_default_receiver_runtime.js <callframe-result.json> --output <default-receiver-runtime.json>` to normalize one or more paused-frame captures into a reusable runtime artifact.
- Run `scripts/summarize_default_branch_helpers.js <default-receiver-runtime.json> --output <helper-map.json>` to turn repeated default-branch runtime captures into a stable `opcode -> helper` table.
- Run `scripts/augment_vm_opcode_semantics.js <vm-opcode-semantics.json> <helper-map.json> --output <augmented-semantics.json>` to merge runtime-backed default-branch helpers into the broader VM opcode semantics artifact.
- After augmentation, rerun `scripts/label_vm_semantics.js <dispatcher.json>` so labeled excerpts and downstream artifacts inherit runtime-backed default-branch helper labels.
- When runtime-backed labels are stable, run `scripts/run_ast_pipeline.js <input.js> <output.js> --passes runtime-opcode-labels,computed-to-static --labels <labeled-semantics-runtime.json>` so deobfuscated artifacts inherit concrete helper identifiers and structure names such as `DEFAULT_BRANCH_OPCODE_3_ARRAY_PUSH`, `APPLY_SLOT`, `CALL_SLOT`, `BIND_SLOT`, `ARRAY_PUSH`, `ARRAY_POP`, and `DISPATCH_ADAPTER`.
- For known default-branch opcodes, prefer an emitted helper such as `DEFAULT_BRANCH_RECEIVER(table, opcode)` with explicit `case 3` / `case 4` mappings over leaving the artifact at raw `table[opcode]`.
- When multiple known default opcodes collapse to one semantic family, emit a companion helper such as `DEFAULT_BRANCH_FAMILY(opcode)` so the artifact preserves both exact helper mapping and family-level meaning.
- If the wrapper still behaves like a VM or dispatch runtime, run `scripts/extract_second_stage_dispatcher.js <input.js-or-json>` to isolate q/Q-style dispatchers and XOR/string decoders.
- For second-stage VMs, run `scripts/extract_vm_string_corpus.js <input.js-or-json>` to capture quoted strings, pipe-order tables, and identifier corpora before custom transforms.
- For second-stage VMs with object-backed dispatch or flag math, run `scripts/extract_vm_state_table.js <input.js-or-json>` to collect state strings, numeric ladders, bitmask branches, and jump assignments.
- If the VM uses bit flags for optional fields or branch selection, run `scripts/extract_vm_flag_schema.js <input.js-or-json>` to summarize bit positions and nearby semantics.
- After flag and state extraction, run `scripts/extract_vm_opcode_semantics.js <dispatcher.json>` to merge dispatcher, flag, and state signals into opcode-family and branch-layout hypotheses.
- After opcode semantics are available, run `scripts/label_vm_semantics.js <dispatcher.json>` to create a stable label map and labeled excerpts for reading and later AST renaming.
- After labeling, run `scripts/render_labeled_vm_snippet.js <labeled-semantics.json>` to emit a compact text view for manual reading, review notes, or downstream patch planning.
- When a stable label map exists, run `scripts/apply_vm_labels.js <source.js> <labeled-semantics.json> --output <labeled.js>` to generate a labeled code artifact for further slicing and AST work.
- After slot simulation is stable, run `scripts/annotate_vm_slots.js <labeled.js> <slot-simulation.json> --output <slot-annotated.js>` to merge semantic labels and bootstrap slot meaning into one review artifact.
- After graph ranking or string-table recovery, run `scripts/extract_request_neighborhood.js <input.js-or-graph.json>` to cut the highest-signal request neighborhoods before reading the whole artifact.
- When routing is unclear, run `scripts/classify_reverse_pattern.js <target>` and follow the highest-signal family.

Capture these facts before deeper work:

- target URL or file path
- likely bundler or framework
- obfuscation markers
- candidate request names, headers, or params
- candidate scripts and entrypoints

### 2. Observe Runtime

When the target runs in a browser, use the `js-reverse` MCP tooling in this order:

1. `check_browser_health`
2. `new_page` or `select_page`
3. `analyze_target`
4. `list_network_requests` and `get_request_initiator`
5. `search_in_sources` for `sign|token|nonce|encrypt|md5|sha|aes|rsa|subtle|crypto`
6. `create_hook` or `hook_function` for `fetch`, `XMLHttpRequest.prototype.open`, `XMLHttpRequest.prototype.send`, target functions, or storage access
7. `inject_preload_script` if logic happens during initial bootstrap
8. `get_hook_data(summary)` before requesting raw payloads

If DOM or clickable-element inspection times out on a heavy page, do not block on UI probing. Fall back to breakpoint-driven sample expansion on the active adapter branch.

Before treating a default-branch helper table as complete, try one or two low-cost alternate trigger paths such as query-parameter pagination or lightweight global actions. If pagination-depth checks like `?page=2` through `?page=5` still fail to expose new helper slots, stop sampling and continue the semantic pipeline instead of over-investing in UI automation.

If the page exposes a generic business action such as `submit()` from a common site script, verify whether triggering it falls into module/wasm stack frames before assuming it bypasses the protected runtime. Treat a `main.min.js -> module glue -> wasm` stack as evidence that the business action is still part of the protected path.

If the source-level business helper advertises one contract but runtime capture emits a different protected request, trust the paused-frame and network capture. Use the source helper only as an entrypoint hint, not as the final request contract.

If `extract_page_contract.js` reports a helper endpoint such as `/api/answer` while the page also loads an external challenge script or runtime bundle, treat that endpoint as helper-only until runtime capture proves it is the protected data request.

If a public challenge page loads successfully in a normal browser but injects a delayed login modal, auth redirect, or gated challenge launcher, preserve that as `auth_gate_risk` instead of forcing a fake runtime path. This is valid family evidence and should keep the bundle at `static-analysis-generated` until real authenticated runtime evidence exists.

If a form-driven challenge page also publishes a `pcap` and the inline transform writes hidden fields before clearing visible inputs, treat the packet capture as runtime truth for credential recovery and make the replay scaffold carry both transformed fields and cleared source fields. This is a valid route to `replay-verified` when the remote target accepts the rebuilt submission.

When a business helper such as `submit()` is still useful, capture its frame-local values and the protected request body into a durable artifact before leaving the browser. Do not rely on memory or conversational notes for `page/token/t/x/y` style fields.

For module or wasm hybrids where loaded-source search does not reveal the endpoint string or request-field names, treat that as expected behavior. Freeze the verified request body first, then recover upstream locals from paused frames or runtime hooks.

If the browser bridge fails before upstream variables are fully recovered, generate a request-variable capture template from the protected-request artifact and use it as the starting checklist for the next healthy session.

If DevTools still responds but both `js-reverse` and `chrome-devtools` return `Transport closed`, verify the local bridge with `python3 scripts/check_local_js_reverse_mcp.py` before blaming the target browser.

Do not jump to local rebuilding until the target request, script, and runtime evidence are captured.

### 3. Stabilize and Deobfuscate

Use the least destructive transformation that improves readability.

- Prefer source maps if available.
- Use existing tooling such as `webcrack`, `wakaru`, or custom AST transforms only after preserving original artifacts.
- For custom patterns, use [references/pattern-signatures.md](references/pattern-signatures.md) and [references/advanced-pipeline.md](references/advanced-pipeline.md).

Keep both the original file and every transformed derivative.

### 4. Rebuild

If the task requires offline reproduction:

- export runtime evidence and minimal environment assumptions
- rebuild the flow in Node first if browser semantics matter
- generate Python only after the algorithm is stable enough to replay
- for site-signature handoff, follow [references/signature-delivery.md](references/signature-delivery.md)
- use `scripts/replay_scaffold.py` to scaffold a replay module from captured evidence

Do not invent browser globals. Every patch must come from observed evidence or explicit divergence logs.

### 5. Verify

Every serious reverse-engineering result must include at least one validation path.

- compare request payloads against a browser capture
- compare generated signatures or encrypted blobs against known-good samples
- confirm timing, ordering, and dependent fields
- record whether the server accepted or rejected the replayed request
- document any missing server-side secret or unverifiable branch

### 6. Report

Generate durable outputs instead of free-form notes.

- use [references/output-contract.md](references/output-contract.md)
- use `scripts/generate_report.py` to turn evidence JSON into a Markdown report
- use `scripts/export_runtime_evidence.js` for a single verified runtime sample
- use `scripts/run_live_validation.js` when a family needs repeatable multi-page regression checks
- use `scripts/normalize_task_artifacts.js` so original inputs, derived artifacts, and evidence are stored in predictable locations
- use `scripts/benchmark_reverse_skill.js` to measure family-level success and risk rates
- use `scripts/build_benchmark_corpus.js` to turn an existing bundle directory into a reusable benchmark corpus index
- use `scripts/operator_review.js` to produce a compact human review surface for a task bundle
- use `scripts/drift_summary.js` and `scripts/diff_claim_sets.js` when comparing old and new bundle states
- keep code artifacts, evidence JSON, and the report in the same task directory

