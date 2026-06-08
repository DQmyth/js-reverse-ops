---
name: js-reverse-ops
description: Execute advanced JavaScript reverse-engineering workflows for modern web applications, including signature recovery, runtime instrumentation, deobfuscation, bundle analysis, anti-debug bypass, environment rebuild, and replay validation.
---

# JS Reverse Ops

Use this skill as a structured reverse-engineering workflow, not an ad hoc debugging session.

## Scope

This public release keeps:

- stage-based routing for `Locate`, `Runtime`, `Recover`, and `Replay`
- reusable scripts for extraction, runtime capture normalization, replay scaffolding, and artifact generation
- generic references, rules, and templates for browser-driven JavaScript reverse engineering

This public release intentionally excludes:

- private or site-specific case libraries
- captured test fixtures and validation corpora
- concrete benchmark targets, credentials, and replay notes tied to named sites

## Core Workflow

Start from the smallest reliable context:

- unknown target: run `node scripts/js_reverse_ops.js <target-url-or-file> [--json]`
- existing notes, hook logs, or failure summaries: run `node scripts/map_case_to_pattern.js <notes.md>` and pass `--notes <notes.md>` to `scripts/js_reverse_ops.js`
- actionable playbook run: run `node scripts/run_playbook.js <target> --notes <notes.md> --out runs/current` to emit a runbook, route plan, bootstrap claim/provenance/risk/replay artifacts, and hook scaffold
- next operator command: run `node scripts/recommend_next_action.js runs/current --json` when a run directory exists but runtime, replay, or readiness blockers make the next step unclear
- local JS or HTML target: run `scripts/triage_js.sh <path>` and then the smallest extractor that matches the target family
- browser-backed target: verify browser and bridge health before collecting runtime evidence
- anti-analysis symptoms: run `node scripts/select_anti_detection_profile.js --symptoms "<symptoms>"` before changing hook or browser strategy; profile selection changes observation strategy only and must still be followed by runtime/replay verification
- public quality check: run `node scripts/run_public_benchmarks.js` before publishing or after changing router, pattern memory, examples, or playbooks
- public release risk audit: run `node scripts/explain_public_release_risk.js --json --strict` to explain tracked-file, secret, path, capture, and generated-artifact risk before pushing
- public capability summary: run `node scripts/generate_capability_scorecard.js` when comparing this skill against other reverse-engineering packages
- market-gap summary: run `node scripts/generate_market_gap_scorecard.js` when deciding how to improve this skill against advanced reverse-engineering skills and MCP toolchains
- external regression matrix: run `node scripts/compare_external_skill_matrix.js --json` to compare this skill against browser MCP, static decompiler, agentic JS reverse, and cross-domain RE profiles
- browser MCP smoke planning: run `node scripts/plan_browser_mcp_smoke.js --server-family chrome_devtools_mcp --json` before executing adapter-specific browser smoke checks
- browser MCP smoke verification: run `node scripts/verify_browser_mcp_smoke_record.js --record <mcp-execution.json> --json` before claiming adapter smoke observations
- browser MCP delivery loop: run `node scripts/run_mcp_delivery_loop.js <target> --record <mcp-execution.json> --out runs/current --json` to scaffold, verify, promote, validate, and assess readiness in one pass
- replay failure diagnosis: run `node scripts/diagnose_replay_failure.js --run-dir runs/current --json` or pass `--replay-record <record.json>` before changing signer code
- replay client generation: run `node scripts/generate_replay_delivery_client.js --record <accepted-replay.json> --out runs/current/replay-client --json` to produce sanitized Node and Python replay clients
- replay client validation: run `node scripts/validate_replay_delivery_client.js runs/current/replay-client --json` before treating generated clients as handoff artifacts
- static truth gate: run `node scripts/assess_static_recovery_truth.js --original <input.js> --recovered <output.js> --json` before promoting readable static output
- source-map-first static planning: if a bundle has `sourceMappingURL`, `sourceURL`, inline maps, or `X-SourceMap` notes, run `node scripts/plan_static_toolchain.js <bundle.js> --json` before AST cleanup
- domain handoff validation: run `node scripts/validate_domain_handoff_record.js --record <handoff-record.json> --json --strict` before merging WASM, packet, mobile, native, or debugger findings back into JS evidence
- CLI wrapper: use `node scripts/jsro.js <command>` or the `jsro` package bin for route, run, validate, next, benchmark, scorecard, marketgap, releaserisk, externalmatrix, mcpsmoke, mcpsmokeverify, mcploop, replaydiagnose, replayclient, replayclientcheck, statictruth, handoff, handoffcheck, install, and publish commands
- one-command install or release: use `bash scripts/install_local.sh` and `bash scripts/publish_release.sh`
<!-- BEGIN PLAYBOOK_CORE_WORKFLOW -->
- accepted response plus confusing browser-visible values: inspect page-side render and suppression logic before escalating into signer recovery, and use `playbooks/accepted-response-hidden-dom.md`
- accepted response plus page-local embedded font or glyph entities: extract the current response font, solve the glyph map at page scope, and use `playbooks/embedded-runtime-font-mapping.md`
- replay still fails even after one accepted digest is recovered: inspect bootstrap-time cookie write order, digest collectors, and wrapped-cookie assembly, then use `playbooks/bootstrap-digest-ladder.md`
- one endpoint keeps returning JavaScript first and only returns arrays after the script is executed and replayed against the same path: treat it as an iterative warmup chain instead of hunting for a second hidden endpoint, and use `playbooks/iterative-script-warmup-same-endpoint.md`
- signer depends on one server-issued time and one wasm or module helper: freeze the time source, prove the exact signer input shape, and use `playbooks/server-time-gated-wasm-signer.md`
- digest helper name looks standard, but browser output diverges from both the standard library and the raw local helper: isolate the smallest runtime patch surface first, and use `playbooks/patched-runtime-digest-branch.md`
- one large bundle hides a tiny runtime helper you actually need for replay: extract that helper first instead of emulating the whole page, and use `playbooks/runtime-bundle-signer-extraction.md`
- global token helpers are absent or misleading, but `XMLHttpRequest.open` rewrites the protected URL with the signer field: treat the rewritten URL as the signer output, preserve script order and runtime state, and use `playbooks/xhr-open-url-rewrite-runtime-replay.md`
- visible request contract is stable but different HTTP clients diverge: escalate through a transport ladder before inventing more signer state, and use `playbooks/transport-profile-ladder.md`
- verify response looks noisy or pessimistic while data requests still succeed: treat the data endpoint as the acceptance oracle, and use `playbooks/lenient-verify-data-gate.md`
- page exposes one simple request or one helper field, but later pages fail with a token-shaped gate: prove whether the visible request is a decoy before widening into full VM recovery, and use `playbooks/decoy-page-request-hidden-token-gate.md`
- one challenge image is a fixed small grid with one glyph or symbol per cell: solve the grid-assignment path first, and use `playbooks/grid-challenge-template-matching.md`
- multi-stage challenge needs fresh reload, one seeded signer proof, and then uses one accepted stage value as the next key: validate the first baseline request before solving downstream decrypts, and use `playbooks/fresh-reload-seeded-signer-step-key-ladder.md`
- one replay path works for round one, but later rounds only regain parity after prior-round replay: preserve the explicit same-page round ladder, and use `playbooks/same-page-prior-round-signer-replay.md`
- desktop HTML is unstable but a mobile or app request profile lands on a shell page with later JSON hydration: recover the shell request wrapper and route map first, then use `playbooks/mobile-shell-api-pivot.md`
<!-- END PLAYBOOK_CORE_WORKFLOW -->
- packed or VM-like code: preserve the original artifact, recover structure incrementally, and label verified semantics
- replay handoff: export a stable artifact bundle before writing Node or Python delivery code

## Best-Tool Baseline

Use built-in scripts for routing, evidence, artifacts, and repeatability. Use specialist tools only for the narrow job they are good at:

- source maps or original modules first, before any deobfuscation pass
- `webcrack` for common obfuscator.io, webpack-like bundles, string arrays, and first-pass unbundling
- `wakaru` for modern minified output where syntax normalization and readability matter more than runtime truth
- `ast-grep`, Babel, or `recast` for small targeted structural transforms
- `humanify` or another LLM renamer only after sanitizing code and only when identifier recovery is worth sending snippets outside the workspace

Do not let external deobfuscators replace evidence. Every recovered field, cookie, signer input, or replay helper still needs a verified browser observation or a local replay artifact.

For broader comparison against adjacent reverse-engineering skills and tools, use `references/external-skill-comparison-2026-06-04.md`.

## Publication Safety Gate

Before publishing this public skill, run `bash scripts/check_public_release.sh` from the public repository root. The public package must not contain:

- private site notes, live captures, credentials, cookies, tokens, or customer-specific paths
- generated `tmp/`, cache, `__pycache__`, `.pyc`, or local benchmark output tracked by git
- absolute local user paths, bearer tokens, GitHub tokens, cloud keys, JWTs, or private keys
- unsanitized snippets that identify a live target beyond generic examples

Keep private corpora and local validation bundles in the private workspace. Publish only generic playbooks, scripts, templates, and sanitized examples.

## Primary References

- `references/task-types.md`
- `references/stages/locate.md`
- `references/stages/runtime.md`
- `references/stages/recover.md`
- `references/stages/replay.md`
- `references/rules/evidence-rules.md`
- `references/rules/runtime-first.md`
- `references/rules/routing-rules.md`
- `references/rules/replay-rules.md`

## Publishing Note

This public variant is intended for sharing as a reusable skill package. Keep private fixtures, live captures, and customer- or site-specific notes in a separate private workspace or repository.
