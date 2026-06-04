# External Skill Comparison 2026-06-04

This note compares `js-reverse-ops` against adjacent public reverse-engineering skills and tools. It is a routing and roadmap artifact, not a vendor leaderboard.

## Comparison Set

### Local Skills

| Skill | Strength | Gap vs `js-reverse-ops` | Absorption decision |
| --- | --- | --- | --- |
| `spider-js-mcp-skills` | Direct website-signature workflow, report template, Python implementation expectation. | Treats MCP tools as optional helpers but does not standardize evidence strength, provenance, replay acceptance, or public release hygiene. | Keep the "report + Python handoff" expectation, but require claim labels, sanitized artifacts, and replay acceptance before delivery claims. |
| `mcp-js-reverse-playbook` | Strong operational rule set: observe first, hook preferred, breakpoint last, first-divergence-driven environment rebuild. | Narrower than `js-reverse-ops`; it is a playbook rather than a full public package with benchmarks, release gates, scorecards, and delivery artifacts. | Keep as the core runtime mindset. `js-reverse-ops` should continue turning these rules into scripts, bundle artifacts, and benchmarks. |
| `js-reverse-engineering` | Clean static-tool decision matrix for source maps, unbundling, deobfuscation, naming, and AST transforms. | Static-first and lighter on browser truth, anti-detection, provenance, continuation, and replay verification. | Already absorbed into `advanced-pipeline.md`; keep external tools as helpers, not sources of truth. |

### Public Tooling Pressure

| Tool or project | What it does well | `js-reverse-ops` response |
| --- | --- | --- |
| `vmoranv/jshookmcp` | Broad MCP server surface for browser automation, CDP debugging, network interception, JS hooks, source-map reconstruction, AST transforms, WASM, process/memory forensics, and composite workflows. | Do not copy the broad one-surface model directly. Add convenience through dispatchers, runbooks, and MCP execution templates while keeping evidence promotion explicit. |
| `JSReverser-MCP` style skills | Browser-native JS reverse workflow with script retrieval, runtime hooks, breakpoint debugging, network tracing, call-chain analysis, deobfuscation, and task artifacts. | This validates the `observe-first`, `hook-preferred`, `breakpoint-last` model. `js-reverse-ops` should stay compatible with this workflow but add stronger replay acceptance, claim strength, and release hygiene. |
| `zhizhuodemao/js-reverse-mcp` | Agent-first JS reverse MCP server with built-in anti-detection and a Chrome DevTools-derived runtime surface. | Treat anti-detection as a named runtime profile and record which profile was used. Do not mark bypass success as signer correctness unless replay or server acceptance proves it. |
| `zhizhuodemao/ai-reverse-toolkit` | Separate skills for AST deobfuscation, environment patching, crypto-entry discovery, and reverse prompt/rule reuse. | Useful decomposition model. `js-reverse-ops` should keep one primary router, but expose sub-lanes for AST cleanup, env patching, and crypto entrypoint search. |
| `reverse-craft/rc-devtools-mcp` | Browser debugging, JavaScript debugging, automation, and network analysis via MCP. | Keep as a browser-tooling baseline. `js-reverse-ops` should consume this class of tool through runbooks and evidence ingestion rather than assuming a specific MCP server. |
| `webcrack` | Fast deobfuscation for obfuscator.io-style code, unminification, transpilation cleanup, and webpack/browserify unpacking. | Keep as a first-pass static helper for packed or string-array bundles, then verify request contracts and signer parity through runtime capture or replay. |
| `wakaru` | Modern frontend decompiler and bundle splitter, including webpack, esbuild, Browserify, and transpiler output recovery. | Use for readable structure after request neighborhoods are isolated; avoid treating restored names or syntax as verified behavior. |
| `humanify` | LLM-assisted semantic naming with AST-level rewrite controls and local-provider options. | Use only after sanitization and only for naming. Label output as inferred until the renamed code is tied back to runtime or replay evidence. |

### Cross-Domain Reverse Skills

| Tool or skill | What it does well | Boundary for `js-reverse-ops` |
| --- | --- | --- |
| `ghidra-mcp-skill` | Gives agents a workflow and helper CLI around Ghidra MCP for local binaries, Docker/headless flows, program loading, analysis, and raw endpoint calls. | Do not merge binary reversing into this JS skill. Copy the helper-CLI pattern: health check, load target, run analysis, emit artifacts, and keep workflow steps reproducible. |
| `ghidra-mcp` / `pyghidra-mcp` | Exposes Ghidra analysis APIs to agents for binary decompilation, symbols, functions, references, data types, and program navigation. | Treat as a separate skill family. For JS/WASM hybrids, only hand off to binary tooling after the JS glue and wasm/module boundary are evidenced. |
| ReVa / binary RE agents | Multi-agent binary reverse workflows can specialize roles such as function analysis, call graph exploration, and vulnerability triage. | Use as a design signal for role separation, not as a direct dependency. JS reverse tasks still need browser truth and request replay before static conclusions. |

## Current Position

`js-reverse-ops` is strongest where commodity skills usually stop early:

- artifact model: `claim-set.json`, `risk-summary.json`, `provenance-graph.json`, `operator-review.md`, and `replay-status.json`
- public benchmark and scorecard loops
- release gate and sensitive-content filtering
- runtime-first routing with replay acceptance checks
- preserved continuation state across long reverse sessions

Its main remaining competitive gap is not another static extractor. The gap is turnkey operator convenience around live MCP execution: choosing the smallest browser workflow, emitting the exact tool-call batch, ingesting the execution record, and updating claims without re-deriving context.

## Priority Updates

1. Improve MCP workflow activation:
   - keep `dispatch_composite_workflow.js` and `run_composite_workflow.js` as the public entrypoints
   - emit grouped MCP call payloads, preconditions, blockers, and ingestion instructions
   - mark unexecuted MCP plans as planned, never as observed

2. Improve semantic naming safety:
   - add an explicit `humanify` lane to static recovery docs
   - require snippet minimization and secret stripping before cloud or LLM providers
   - preserve original bytes and diff renamed output

3. Improve runtime breadth without losing evidence boundaries:
   - hook cookie writes, storage diffs, header mutations, fetch/XHR bodies, crypto helper calls, wasm imports/exports
   - promote only after runtime capture or replay acceptance

4. Improve report delivery:
   - preserve the `spider-js-mcp-skills` expectation that a finished signer task should include a Python or Node handoff
   - keep the handoff parameterized when signer recovery is incomplete
   - state exactly which fields are verified, inferred, weak, or unknown

5. Improve tool-server portability:
   - keep MCP execution plans adapter-neutral where possible
   - record which server executed a plan, which tools actually ran, and which artifacts were produced
   - separate `planned`, `executed`, `observed`, and `accepted` states

6. Improve domain boundary handling:
   - keep browser JS, WASM glue, native binary analysis, packet analysis, and mobile shell analysis as separate lanes
   - hand off across lanes only with a concrete artifact boundary such as wasm import/export evidence, pcap request samples, or a native library identifier
   - avoid pulling binary RE terminology into normal signer recovery reports unless it explains an observed blocker

## Do Not Copy

- Broad tool activation that hides which evidence was actually collected.
- Full-bundle cloud upload workflows.
- Static deobfuscation outputs presented as accepted runtime truth.
- Python "solver" code that invents unresolved signers or tokens.
- Case notes that embed private hosts, cookies, tokens, local paths, HARs, PCAPs, or raw customer bundles.

## Next Best Work

The next high-leverage increment is a public "compare mode" scorecard that evaluates this skill against external capability categories:

- static deobfuscation and unbundling
- runtime capture and hook orchestration
- anti-detection profile selection and evidence labeling
- environment rebuild and first-divergence logging
- replay acceptance and divergence gates
- provenance and claim strength
- MCP-server portability and execution-record ingestion
- data-safety release gates
- delivery handoff quality

This should be machine-readable so benchmark results can drive the public roadmap instead of relying on prose comparisons.
