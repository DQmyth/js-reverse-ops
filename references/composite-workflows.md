# Composite Workflows

Use these high-level routes when the target needs a repeatable sequence, not a single extractor.

If `maturity-summary.json` already exposes `capability_dimensions`, prefer those bundle-native signals over free-text target matching when dispatching:

- `solver_backed` or `archival_backed` -> `archival-challenge-success`
- `pcap_backed` -> `pcap-guided-form-replay`
- `hook_backed` -> `hook-to-provenance-loop`

For harder archival public cases, dispatcher should further refine `archival_backed` bundles using preserved public facts:

- WASM plus `checkFlag`/`AES`/loader anchors -> `archival-wasm-solver`
- WASM plus `Module.ccall`/`Module.cwrap` plus `validate`/`checkAuth`/`checkFlag` entrypoints -> `minimal-local-harness`
- anti-debug or unlock-style HTML logic -> `archival-antidebug-html`
- engine or runtime-internals anchors -> `archival-runtime-internals-reference`
- generic solver or challenge-success routes -> `archival-challenge-success`

If `public_writeup_facts` are sparse, dispatcher should still refine these archival routes from static-analysis signals such as:

- `checkFlag`, `AES`, `.wasm`, `WebAssembly`, `free_play.wasm` -> `archival-wasm-solver`
- `WebAssembly.instantiate`, `teen_wasm.wasm`, `Module.ccall`, `Module.cwrap`, `validate`, `checkAuth`, challenge-success reconstruction hints -> `minimal-local-harness`
- `anti-debug`, `unlock(`, `localStorage`, `devtools` -> `archival-antidebug-html`
- `PromiseResolveThenableJob`, `builtin`, `patch target`, engine/runtime markers -> `archival-runtime-internals-reference`

To dispatch one automatically from a bundle or short target description, use:

```bash
node skills/js-reverse-ops/scripts/dispatch_composite_workflow.js --bundle-dir <bundle-dir>
```

or:

```bash
node skills/js-reverse-ops/scripts/dispatch_composite_workflow.js --target "how is this cookie generated"
```

To run the local, deterministic part of a workflow automatically and leave session-bound steps as manual tasks, use:

```bash
node skills/js-reverse-ops/scripts/run_composite_workflow.js --bundle-dir <bundle-dir>
```

This also emits `workflow-action-list.json`, which turns remaining manual steps into concrete suggested tool actions or local follow-up commands.

When the workflow includes MCP-safe tool actions, the runner also emits `workflow-mcp-batch.json` so a later session can execute those actions without re-deriving them from notes.

`workflow-mcp-batch.json` is ordered and guard-aware. Treat it as a batch plan, not an unordered bag of calls.

The runner also emits `workflow-mcp-context.json`, `workflow-mcp-exec-plan.json`, `workflow-mcp-call-payload.json`, `workflow-mcp-execution-guide.*`, and `workflow-mcp-execution-template.json`, which together explain what the current session knows, which MCP actions are executable, how they should be grouped, which adapter shape to use for each step, and how to record the actual live execution outcome.

If you already know the browser-session state, you can also build or override context directly:

```bash
node skills/js-reverse-ops/scripts/build_mcp_execution_context.js \
  --bundle-dir <bundle-dir> \
  --selected-page \
  --active-target-loaded \
  --preload-ready \
  --allow-mutating-page-state \
  --output <workflow-mcp-context.json>
```

## Search-First Runtime Escalation

Start light, then activate heavier tooling only when evidence justifies it.

1. page and source search
2. request initiator capture
3. summary hook profile
4. priority hook action plan
5. paused-frame or raw payload capture only for the matching branch

Typical batch order:

1. request discovery
2. initiator lookup
3. preload injection if needed
4. reload or trigger
5. hook data pull

Use this flow for:

- cookie generation questions
- auth header recovery
- JSONP or script-insert tracing
- heavy pages where broad hooks would drown you in noise

## Pcap-Guided Form Replay

Use this route when a public challenge page ships:

- inline `onsubmit` logic
- hidden output fields
- a downloadable `pcap`

Workflow:

1. import the HTML and `pcap`
2. extract `form action`, method, hidden fields, and inline transform
3. recover the credential pair or transformed payload from the capture
4. scaffold replay, preserving transformed fields and any cleared source fields
5. capture one real browser submission
6. compare replay against browser truth
7. promote only if remote parity is confirmed

Typical batch order:

1. browser capture
2. local compare
3. verification reconcile

## Hook-to-Provenance Loop

Use this route when hook data is the most reliable truth source.

1. scaffold hook profile from presets
2. compile action plan
3. build execution runbook
4. capture hook evidence
5. ingest hook evidence
6. rerun claim, provenance, and risk builders

This keeps runtime observations on disk and stops hook work from degenerating into conversational notes.

When using runner outputs, prefer `workflow-mcp-batch.json` over ad hoc note reading because it preserves:

- execution order
- guard checks
- page mutation flags
- preload dependencies

## Archival Challenge-Success

Use this route when the strongest available proof is:

- a public writeup
- a preserved symbol map
- a local solver
- an archival challenge-success artifact

Workflow:

1. preserve writeup facts and any surviving archival source snapshot
2. materialize symbol maps and solver scaffolds
3. encode the solver-backed route into a provenance report
4. preserve challenge-success as archival evidence
5. keep archival proof separate from live parity or replay verification

Typical batch order:

1. writeup and source preservation
2. solver artifact generation
3. provenance report generation
4. manual decision on whether any surviving live assets still justify runtime work

## Archival WASM Solver

Use this route when the preserved public facts point to:

- `WebAssembly`
- `checkFlag`
- `AES`
- memory-oriented verification

Workflow:

1. preserve archival HTML, loader, and writeup facts
2. materialize symbol maps, solver hints, or memory-oriented notes
3. encode the WASM solver route into provenance
4. keep archival proof separate from live parity

This route is a better fit than generic replay when the strongest surviving anchors are `checkFlag` and WASM-backed verification logic.

## Archival Runtime-Internals Reference

Use this route when the preserved public facts point to:

- V8 or engine internals
- patch targets
- builtins or Promise-job paths
- runtime-heavy POC notes

Workflow:

1. preserve writeup-derived patch or builtin anchors
2. record POC or patch provenance
3. treat the bundle as reference-heavy until a safe reproducible harness exists

Do not route these cases into generic request replay unless the target later gains a safe reproducible live surface.

## Minimal Local Harness

Use this route when preserved public facts point to:

- a browser challenge UI
- challenge-success reconstruction
- a small preserved WASM or loader surface
- no trustworthy request replay target

Workflow:

1. preserve loader and challenge-success anchors
2. generate `local-harness-plan.json/.md` and `local-harness-result-template.json`
3. build the smallest local harness or browser fixture that exercises the preserved logic
4. record the result as local-only challenge-success
5. avoid replay or live parity promotion until a surviving remote target exists

This route is a better fit than archival solver or generic replay when the next honest step is “prove it locally” rather than “pretend a server path exists.”

## Archival Anti-Debug HTML

Use this route when preserved public facts point to:

- anti-debug guards
- unlock-style HTML logic
- `localStorage` gates
- no trustworthy request or replay surface

Workflow:

1. preserve archived HTML and anti-debug or unlock anchors
2. materialize deobfuscated bypass notes and unlock paths
3. emit `archival-antidebug-report.json/.md` as the standard archival route summary
3. preserve any local unlock proof as archival or local-only challenge-success
4. avoid replay or accepted-runtime promotion unless a real remote surface exists

This route is a better fit than generic archival challenge-success when the hard part is bypassing client-side anti-debug logic rather than reconstructing a request.

## Delivery-Ready Replay

Use this route when the user needs operational handoff.

1. runtime capture
2. replay scaffold
3. replay validation
4. compare against browser truth
5. reconcile replay verification
6. scaffold `python-replay`, `jsrpc-bridge`, or `proxy-injector`

Do not mark delivery artifacts as production-ready if the bundle is below `runtime-accepted`.
