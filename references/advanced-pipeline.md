# Advanced Static Pipeline

Use the shortest path from opaque code to a verified algorithm.

## Priority Order

1. Source maps or original modules
2. Bundle unpacking
3. Unminify and structural normalization
4. Targeted deobfuscation
5. Semantic naming
6. AST-level reduction
7. Runtime verification

## Modern Techniques

### Source-map-first recovery

If a source map or original module graph is available, prefer it over any deobfuscation effort.

### Multi-pass normalization

Do not rely on one formatter. Use staged cleanup:

- preserve original bytes
- unpack bundle boundaries
- normalize syntax noise
- fold constants and remove dead branches
- collapse proxy wrappers, object maps, computed property noise, and simple switch-loop dispatchers

### IOC-driven targeting

Before reading large files manually, extract indicators of compromise or interest:

- URLs and route fragments
- header names
- crypto APIs and library markers
- `eval`, `Function`, WebAssembly, WebSocket, workers
- string-array or control-flow markers

If IOC extraction is too noisy or the file is a packaged dependency bundle, switch to full-file contract extraction:

- `scripts/extract_request_contract.js`: recover endpoint, request keys, and nearby snippets from the entire file, not just the tail.
- `scripts/inspect_obfuscation_family.js`: decide whether you are dealing with browserify, string-table indirection, numeric-ASCII encoding, or control-flow flattening before choosing a cleanup path.
- `scripts/recover_string_table.js`: recover decoded samples and recursively inline simple wrapper neighborhoods for classic `_0x` array-rotation bundles.

### Function-neighborhood analysis

Rather than reading a whole minified bundle, center analysis around:

- the request initiator function
- nearby helpers
- the function producing the final field
- the last pure transform before I/O

### Behavior-preserving renaming

Rename only after control flow is readable enough. Keep changes semantic-preserving and diffable.

## Version Diffing

For algorithm drift between builds:

- extract IOC inventories from both versions
- diff suspicious functions or neighborhoods
- compare runtime payloads for the same input corpus
- separate formatting drift from logic drift


## Built-in Workspace Tools

- `scripts/run_ast_pipeline.js`: remove common literal noise, inline simple string tables, split sequence expressions, inline proxy wrappers, and normalize member access.
- `scripts/diff_builds.js`: compare IOC inventories and structural drift between old and new builds before reading raw minified diffs.

- `scripts/function_diff.js`: rank changed, added, and removed functions by reverse-engineering relevance so drift analysis starts from helpers that actually matter.

## Remote CoreJS Monoliths

When the page HTML is thin and loads an external challenge script, analyze the remote script as the primary artifact. For huge single-line files, inspect the tail first to recover the final request contract before attempting broad deobfuscation.
- `scripts/extract_tail_contract.js`: extract endpoint, method, body keys, header keys, and token clues from the tail of a huge one-line core script.

## Browserify and Packaged Crypto Bundles

If the artifact contains a bundle bootstrap and third-party crypto code:

- do not assume the useful request builder is at the tail
- search for explicit route strings first
- extract the request contract from the full file
- isolate the small business module that wraps the library code

## Module and WASM Hybrids

If the page loads `type="module"` scripts, modulepreloads, or wasm-adjacent assets:

- treat the page HTML as a routing artifact
- capture the runtime request contract first
- inspect module entrypoints and glue code separately from monolithic scripts

- `scripts/inspect_module_hybrid.js`: inventory module imports, preloads, wasm hints, and framework markers from HTML or module files.
- `scripts/trace_module_graph.js`: build a local import graph, try alias mapping for unresolved remote modules, and rank request-producing modules before deep reading.
- `scripts/extract_module_entry_contract.js`: capture import bindings, bootstrap hints, and global exposure from module entry files before stepping into packed internals.
- `scripts/extract_packed_eval_payload.js`: peel out the `eval(function(...))` wrapper head and payload excerpt so packer shape is visible before deeper transforms.
- `scripts/decode_eval_wrapper.js`: attempt a first-layer expansion of `eval(function(...))` wrappers in a controlled sandbox.
- `scripts/decode_eval_wrapper.js`: when first-layer decode fails, inspect `provenance_candidates`, `runtime_stack_head`, and `runtime_fault_excerpt` to locate the likely non-callable object source before adding more shims.
- `scripts/extract_vm_object_provenance.js`: recover bootstrap slot aliases such as call/apply/bind trampolines from the packed VM bootstrap before patching runtime behavior.
- `scripts/validate_vm_bind_patch.js`: test a minimal replacement of the bootstrap bind slot so you can tell whether the next blocker is truly downstream.
- `scripts/validate_vm_trampoline_patch.js`: test whether the bootstrap call trampoline or dispatch adapter is the actual blocker when bind-slot replacement changes nothing.
- `scripts/trace_vm_receiver_flow.js`: align the current failure with dispatch key, call trampoline, dispatch adapter, and bind slot so the next patch targets the right stage.
- `scripts/extract_dispatch_adapter_contract.js`: summarize the adapter signature and branch forwarding layout before building a local executor.
- `scripts/simulate_vm_slots.js`: turn bootstrap slots into a stable slot-state model so `Z.$[i]` references can be reasoned about before local execution.
- `scripts/execute_adapter_branches.js`: run a minimal static executor across adapter branches and optionally fold in runtime-captured default-branch receivers.
- `scripts/generate_default_receiver_probe.js`: generate a runtime logging snippet for the unresolved default `Z.$[o]` receiver path once the static model has explained the easy branches.
- If probe injection does not fire because the target uses direct eval or module-scoped bootstrap, break on the default branch callsite and capture `o`, receiver, trampoline base, dispatch key, and resolved callee from the paused frame.
- `scripts/capture_default_receiver_runtime.js`: normalize one or more paused-frame captures into a stable runtime artifact that `execute_adapter_branches.js --runtime` can consume.
- `scripts/summarize_default_branch_helpers.js`: summarize repeated default-branch captures into a runtime-backed `opcode -> helper` table with sample counts.
- `scripts/augment_vm_opcode_semantics.js`: merge the default-branch helper table back into VM opcode semantics so runtime-backed helper slots and static VM families stay in one artifact.
- After augmentation, rerun `scripts/label_vm_semantics.js` so `Z.$[3]`, `Z.$[4]`, and future default-branch helper slots inherit runtime-backed labels in the reading view.
- `scripts/run_ast_pipeline.js --labels <labeled-semantics-runtime.json>`: inject runtime-backed opcode labels, helper labels, and stable structure names directly into transformed JS so AST cleanup artifacts carry concrete names such as `DEFAULT_BRANCH_OPCODE_3_ARRAY_PUSH`, `APPLY_SLOT`, `CALL_SLOT`, `BIND_SLOT`, `ARRAY_PUSH`, `ARRAY_POP`, and `DISPATCH_ADAPTER`, not only sidecar JSON labels.
- If known default-branch opcodes exist, prefer an emitted helper such as `DEFAULT_BRANCH_RECEIVER(table, opcode)` with explicit opcode cases over leaving the transformed artifact at raw dynamic slot reads.
- If several known default opcodes share one behavior class, emit a companion `DEFAULT_BRANCH_FAMILY(opcode)` helper so the transformed artifact carries family-level meaning such as `ARRAY_STACK_MUTATOR` in addition to exact opcode cases.
- If DOM querying or clickable-element discovery times out on a heavy page, switch back to breakpoint-driven sample expansion instead of treating UI automation as mandatory.
- Before concluding the default branch is exhausted, try one or two low-cost alternate triggers such as `?page=2` through `?page=5` navigation or other lightweight entry actions. If those still only hit the same helper slots, stop expanding samples and continue semantic labeling.
- If a common site script exposes a generic action such as `submit()`, inspect its source and then verify whether the runtime call stack falls into module glue or wasm before the final request is emitted. That is evidence the business action still routes through the protected runtime.
- If the helper source suggests a simple request like `/api/answer` but the runtime capture emits a different protected endpoint, trust runtime capture over helper source. Treat the helper source as a routing hint only.
- If you capture a business-helper frame such as `submit()`, persist both the frame-local values and the protected request body into a small JSON artifact so later rebuild work can start from evidence instead of replaying the browser session.
- If the browser bridge breaks before upstream variables are fully mapped, generate a request-variable capture template from the protected request artifact and resume from that checklist in the next healthy session.
- If DevTools still responds but MCP tools return `Transport closed`, run `python3 skills/js-reverse-ops/scripts/check_local_js_reverse_mcp.py`. A passing smoke test means the browser is healthy and only the current client-side MCP binding died.
- `scripts/extract_second_stage_dispatcher.js`: isolate q/Q dispatchers, XOR helpers, and second-stage VM signals when the first layer still looks virtualized.
- `scripts/extract_vm_string_corpus.js`: collect quoted strings, pipe-order tokens, and identifier corpora from the second-stage VM text.
- `scripts/extract_vm_state_table.js`: collect state strings, numeric ladders, bitmask branches, and jump-assignment patterns from second-stage VM text.
- `scripts/extract_vm_flag_schema.js`: summarize bit positions and nearby excerpts for VM flag-based branching.
- `scripts/extract_vm_opcode_semantics.js`: merge dispatcher, string, state, and flag outputs into opcode-family and operand-layout hypotheses.
- `scripts/label_vm_semantics.js`: turn opcode, branch, and bootstrap-slot findings into a stable label map and labeled dispatcher excerpts.
- `scripts/render_labeled_vm_snippet.js`: render the labeled dispatcher view as a compact text artifact for focused reading and review.
- `scripts/apply_vm_labels.js`: apply the label map back onto the source to produce a labeled code artifact for slicing and later AST transforms.
- `scripts/annotate_vm_slots.js`: merge slot-state comments into the labeled VM artifact so semantic and bootstrap-slot views stay aligned.
- `scripts/extract_request_neighborhood.js`: slice the top request-bearing neighborhoods from a candidate script or from a graph result.
