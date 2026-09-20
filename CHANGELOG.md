# Changelog

All notable changes to the public `js-reverse-ops` repository will be recorded in this file.

## [1.1.0] - 2026-09-15

### Added — capability expansion (intake, session, supply, wasm)

- `scripts/scaffold_signer_service.js`: turn a solved signer into a long-running local signing service (zero-dep HTTP wrapper: POST /sign, /health, /stats; realm rules honored; fail-fast calibration hook) — production supply for crawlers instead of one-shot collectors
- `scripts/har_to_bundle.js`: import devtools/burp HAR captures into runtime-summary bundles (candidate protected requests by url/header signish markers, cookie-write timeline, full requests.jsonl)
- `scripts/session_snapshot.js`: dump/restore cookies + localStorage + sessionStorage from a debug Chrome tab — reusable login state without re-doing auth flows
- `scripts/wasm_triage.js`: zero-dependency wasm binary reconnaissance (native section parser: imports/exports/classification into crypto-ish / time-dependent / randomness / signer-shaped; wabt optional for wat output)
- three new integration tests (real HTTP round-trip for the signing service; synthetic HAR; synthetic wasm module with time import + sign export) — caught a real CommonJS `exports` shadowing bug in wasm_triage on first run

## [1.0.2] - 2026-09-15

### Fixed

- embedded-font-mapping pattern: added shorter generic signals so woff-blob queries route correctly; regression case added to the public benchmarks (50 cases now)

## [1.0.1] - 2026-09-15

### Fixed

- pattern index now routes to ALL 19 playbooks (10 were unreachable dead assets): added patterns for hidden-DOM scrambling, decoy token gates, embedded font mapping, seeded-signer ladders, grid challenges, script-warmup chains, verify/data gate splits, mobile-shell pivots, patched digest branches, and prior-round stateful replay

### Added

- battle telemetry backfilled from real solved targets (15 recorded solves across five patterns) — ranking weights now reflect the full solved history from day one
- obfuscation fingerprint library extended to 9 families (+ Huffman-window tokens, RSA-chained tokens, webpack module bundles)

## [1.0.0] - 2026-09-07

Stability milestone: capability, testing, and distribution surfaces are complete.

### Added

- **level-2 composite gym challenge** (`combo_all`): one target stacking an env-gated IV, timer self-check, random-IV tail, and helper decoy — the standard recipes must be applied in combination; 9/9 gym challenges green
- **TUTORIAL.md**: zero-to-first-solve walkthrough (~5 min) using gym targets as safe teaching material — every code sample is executed and verified, including the control experiment

### Changed

- SKILL.md compressed to 475 lines (within the official <500 guidance) by linking out sections duplicated in references

### Why 1.0.0 now

- capability: 9 gym challenges, 8 misdiagnosis patterns, 6-family fingerprint library, 19 playbooks, 130+ scripts
- testing: three test layers + 49 routing benchmarks + 24 trigger evals + leak-gate blocking test, all in `make check` and CI
- distribution: plugin marketplace, npx-skills, git-clone paths; bilingual README + tutorial; 40 tagged releases

## [0.1.40] - 2026-09-07

### Changed

- README (zh + en): full capability-positioning rewrite — differentiation and the unique-in-class capabilities (capability gym, divergence auto-triage, JSVMP catch hook, family fingerprints, three test layers, release safety gate, zero-dependency execution surface) stated as capability claims without naming any specific external project
- changelog history entries neutralized (no project names / star counts); the internal skill-comparison research doc is no longer part of the public export; adapter-map descriptions stay adapter-factual

## [0.1.39] - 2026-09-07

### Added

- **reverse gym** (first of its kind in this tool class): `scripts/gym_generate_targets.js` synthesizes one self-contained challenge per misdiagnosis pattern M1-M8; `scripts/gym_run.js` solves each end-to-end with the standard recipes only (verbatim vm realm, real timers, native-masked classes, controlled require surface) and asserts the control groups — the wrong approach must fail exactly as documented. 8/8 green, wired into `make check` and CI
- **obfuscation family fingerprints**: `assets/obfuscation-family-signatures.json` (6 families: jsvmpzl VM, eval-packer, opaque-predicate bloat, string-array rotation, env-gated constants, timer-selfcheck shells) + `scripts/detect_obfuscation_family.js` — validated against two real solved targets (exact family hits, score 6 and 5)
- **learning-loop harvester**: `scripts/harvest_pattern_case.js` turns a solved/failed real target into telemetry + a sanitized benchmark draft (review-gated, never auto-committed)

### Learned

- gym construction surfaced a portable pitfall: Math members are non-enumerable, so `{...Math}` copies nothing — now asserted in the m6 solver with an inline note

## [0.1.38] - 2026-09-07

### Added

- three-layer test suite on Node's built-in `node:test` (zero dependencies), closing the engineering gap to the strongest community MCP repos:
  - `tests/unit/`: leak-scanner flagging, router scoring, indirect-eval detection on synthetic samples (exporter-dependent cases skip gracefully in the public bundle)
  - `tests/property/`: randomized-parameter iron-rule invariants — every valid harness-generator combination must compile and carry the rules; invalid ones must be rejected; the interpreter-catch hook may only grow its input
  - `tests/integration/`: the export leak gate BLOCKS planted banned tokens end-to-end on isolated copies; playbook runs emit the complete artifact set; benchmarks/trigger evals stay green
- `make tests` wired into `make check`; CI runs unit+property layers
- the suite caught a real doc-code drift on its first run (M8 missing from the playbook checklist) and a scanner-by-design tension (test fixtures must assemble banned tokens at runtime)

## [0.1.37] - 2026-09-06

### Added

- live validation of the community reverse-MCP pairing (against a real target): handshake via a hand-rolled stdio probe, 24-tool enumeration, page control, in-page triggered token-request capture, XHR-breakpoint hit confirmation; findings folded into the adapter map
- misdiagnosis pattern M8: execution-surface fingerprints — stealth (Patchright-style) navigation can itself be probed by VM shells, silently suppressing the protected request; plain-CDP comparison is the fast disproof

## [0.1.36] - 2026-09-06

### Added

- market-research-backed MCP pairing: `mcp-server-adapter-map.json` now documents the actual JS-reverse MCP leaders (community CDP reverse-engineering MCP servers — minified-safe breakpoints, XHR breakpoints with paused-frame inspection, logpoint tracing, stealth/anti-detection modes, browser takeover) plus a new `parameter_blueprint_mcp` family (knowledge-base MCPs with verified pure-Node parameter blueprints)
- `references/mcp-playbooks.md`: pairing section defining division of labor — market MCPs pull triggers, this skill owns stage gates, misdiagnosis triage, verification, and delivery; `cdp_minibrowser.js` remains the zero-dependency fallback

## [0.1.35] - 2026-09-06

### Added

- `Makefile` mirroring every CI job (`make check` = benchmarks + trigger evals + syntax + release checks), Trail-of-Bits style: local signal must stay trustworthy
- `AGENTS.md` contributor guide: official doc references, external complexity-ladder examples, development loop, and authoring conventions (evidence labels, catalog registration, sanitized-language rule, telemetry recording)
- SKILL.md "When NOT to Use" section (positive + negative trigger boundaries, gold-standard pattern)
- `plugin.json` author block

### Benchmarked against the actual market leaders (research, not shipped code)

- skills.sh top-installed leaderboard: zero reverse-engineering skills (the niche is open)
- gold-standard security skill collections: monorepo plugin structure, Makefile-as-CI-mirror, validator self-tests, contributor ladder — patterns absorbed above
- closest community JS-RE skill packs are prompt-only; their slash-command UX was absorbed in 0.1.34

## [0.1.34] - 2026-09-06

### Added

- slash-command thin entries (`commands/jsro-triage|jsro-sign-crack|jsro-deobfuscate|jsro-env-rebuild.md`) with `argument-hint` frontmatter — scene-direct entrypoints for Claude Code users that route into the full skill, closing the UX gap observed in the closest community competitor (prompt-only skill packs)

## [0.1.33] - 2026-09-06

### Added

- **Agent Skills spec alignment**: SKILL.md frontmatter now carries `license` / `compatibility` / `allowed-tools` / `metadata` per the official anthropics/skills convention, plus a negative clause in the description (no crawler-writing, no general frontend dev, no binary/APK RE) for trigger accuracy
- **trigger evals** (`assets/skill-trigger-evals.json` + `scripts/run_trigger_evals.js`): 24 should-trigger / should-not-trigger user queries with a lexical smoke runner (word-boundary matching, out-of-scope target detection) — the eval already caught and fixed a `design`-matches-`sign` false positive; wired into CI
- **distribution**: `.claude-plugin/marketplace.json` + `plugin.json` (installable via `/plugin marketplace add DQmyth/js-reverse-ops`), bilingual README install sections covering the three install paths (plugin marketplace, `npx -y skills add`, plain git clone)
- `README.en.md` restored into the public source tree (was previously dist-only and lost to an export overwrite)

### Changed

- `references/external-corpus-manifest.json`: 14 absolute workspace paths replaced with a `${SKILL_ROOT}` placeholder for portability

## [0.1.32] - 2026-09-06

### Added

- `scripts/cdp_minibrowser.js`: minimal zero-dependency CDP client (`list` / `new` / `eval` / `capture`) — the minimal trigger-pulling surface for runtime-truth capture without a full MCP setup
- `scripts/scaffold_env_prelude.js` + the `chrome-verbatim-sandbox` anti-detection profile: pick a profile, emit the verified environment-alignment prelude (UA/cookie shape/plugins/chrome keys/viewport/rects/...) for jsdom verbatim harnesses
- capability scorecard: new `battle_tested_outcomes` dimension driven by `pattern-outcome-stats.json` — with no telemetry recorded the completeness score is capped at 0.2 (self-report guard); recorded solve-rate scales it honestly

### Changed

- practice solution shells now record pattern outcomes back into `pattern-outcome-stats.json` after submission (solved on code 1/2, failed otherwise), closing the telemetry loop end to end

## [0.1.31] - 2026-09-06

### Added

- `references/stage-gates.md`: hard entry/exit evidence conditions per stage (Locate/Runtime/Recover/Replay), stage time-boxes with continue-vs-stop rule, and the ordered fallback chain for stuck stages — closes the "replay before runtime truth" class of failures recorded in the practice corpus
- `references/decision-handoff.md`: delta-only handoff protocol (`decision_delta` + `carry_forward_refs`) between stages and sessions, plus the user-instruction feasibility gate (obey goals, not step orders; explicit evidence-quality labels like `unreadable`/`expired`/`fake-data`)

## [0.1.30] - 2026-09-06

### Added

- runnable gate demo in `examples/`: `sample-env-gated-signer.js` (a mini signer with a native-print IV gate and a per-byte encoding branch) + `sample-verbatim-harness.js` (browser-like vs host-flavored sandboxes, calibration assertions) — demonstrates in one file why verbatim execution with precise stubs beats hand-porting, and surfaces the cross-realm array-comparison pitfall on the way
- `README.en.md` linked from the Chinese README; public README gained a latest-capabilities section

## [0.1.29] - 2026-09-06

### Fixed

- removed compiled `__pycache__` artifacts (some were previously tracked in the public bundle) from both the workspace and the export; export policy now also ignores `__pycache__/`
- refreshed the hand-curated scripts catalog (counts and the six divergence-triage / harness tools)
- public SKILL.md now indexes the sanitized case walkthroughs

### Changed

- SKILL.md: folded the Scripts Catalog section into Tooling Guidance (489 lines, was 565 at v0.1.22)

## [0.1.28] - 2026-09-06

### Added

- private workspace now version-controlled (git); tmp_cases validation corpus archived out of the tree
- `run_playbook.js`: `--playbook <path>` override and per-run recommended-scripts list parsed from the selected playbook's own references (zero-maintenance: playbook edits update recommendations automatically)
- `detect_env_divergence.js`: `--plan` mode prints ordered control-experiment plans (what to re-capture, what to observe, which misdiagnosis each outcome confirms) for empty-later-tokens / key-differs / total-unstable symptoms
- public README: English overview (`README.en.md`)

## [0.1.27] - 2026-09-06

### Added

- outcome telemetry loop: `map_case_to_pattern.js` reads `assets/pattern-outcome-stats.json` and biases pattern ranking by solve rate (0.8x all-failed .. 1.2x all-solved)
- stage references (`replay`, `recover`) now link `references/misdiagnosis-patterns.md` for "almost works" flows
- public README: latest-capabilities section (recipe cards, misdiagnosis patterns, divergence triage, case walkthroughs)

## [0.1.26] - 2026-09-06

### Added

- `scripts/detect_env_divergence.js`: executable misdiagnosis triage — feed run captures (`{clock, keys[]}`) and get a verdict classifying random-IV vs time-derived-key vs timer-selfcheck vs environment-gate divergence (patterns M6/M1/M3)
- `scripts/hook_vm_interpreter_catch.js`: runtime-patches JSVMP interpreter catch clauses to log bytecode-swallowed exceptions to a global, separating exceptions from silent branches (patterns M3/M4); canonical + bracket-variant patterns with custom override
- `scripts/detect_indirect_eval_scope.js`: static heuristic flagging indirect-eval / Function-constructor bootstraps and printing the sandbox rule they impose (pattern M4)
- `scripts/update_pattern_index_stats.js` + `assets/pattern-outcome-stats.json`: pattern outcome telemetry (applied/solved/failed) kept out of the benchmark schema
- `scripts/test_scaffold_verbatim_harness.js`: regression tests for the harness generator (compilation, verified-rule presence, invalid-combination rejection)
- 7 misdiagnosis regression benchmark cases (M1-M7) with matching pattern-index signals; router now recognizes timer-self-check, host-eval leak, fake-data maze, and class-leak scenarios
## [0.1.25] - 2026-09-06

### Added

- two sanitized case walkthroughs in `examples/`: combinatorial environment gates (why hand-porting fails, verbatim execution + calibration oracles) and timer self-checks / time-derived keys / the 200-fake-data maze (why stable totals are the only honest success metric)
- the verbatim-harness generator is now distributable: auth-cookie names are parameterized instead of hard-coded

## [0.1.24] - 2026-09-06

### Added

- `run_playbook.js` now emits `misdiagnosis-checklist.json` and an Operator Review quick-check section re-surfacing the seven recurring wrong attributions from `references/misdiagnosis-patterns.md`
- `references/env-rebuild-recipes.md` cards are now directly actionable: the private workspace also ships a parameterized verbatim-execution harness generator built on the same rules

### Changed

- `SKILL.md`: new Harness Scaffolding section documenting the generator and its verified rules; Playbook Runner section lists the misdiagnosis checklist artifact

## [0.1.23] - 2026-09-06

### Added

- `references/env-rebuild-recipes.md`: 10 verbatim-execution recipe cards distilled from practice-set topics 22-29/24 (native-masked classes, class-tag probes, no-host-builtins rule, real timers, getter-only redefinition, fresh-context-per-page, inline proxy, calibration oracles)
- `references/misdiagnosis-patterns.md`: 7 recurring wrong attributions with decoy symptom, fast disproof test, and real cause (time-derived data mistaken for env gates, 200-with-fake-data mazes, timer-driven self-checks, host-eval scope leaks, class-source leakage, random-IV vs gate classification)
- `references/toolchain-bootstrap.md`: dependency health, harness conventions (exit/explicit timers/memory), and offline fallbacks in one page
- `references/standard-workflow-cookbook.md`: the full command-by-command standard workflow, loadable per stage

### Changed

- `SKILL.md`: added a Start Here quick-start block and a Default Sandbox Context statement; Standard Workflow slimmed into a stage-goal table pointing at the cookbook (565 -> 458 lines); Task Router now routes "environment rebuild" and "rebuild almost-works" cases to the new references

## [0.1.22] - 2026-09-06

### Added

- extend `env-gated-crypto-differential` with step 5e: time-derived key strings are not environment gates (re-diff captures minutes apart; frozen-clock sandboxes always differ from live browsers), and TTL/fingerprint mazes answer 200 with random plausible data — only a cross-run stable total is an honest success metric (verified against practice-set topic 24)

## [0.1.21] - 2026-09-06

### Added

- extend `env_gated_crypto_differential` pattern index with timer-self-check and indirect-eval signals plus verbatim-execution avoid rules (verified against public practice-set topics 26/28/29)

## [0.1.20] - 2026-09-06

### Added

- extend `env-gated-crypto-differential` playbook with three verified lessons: combinatorial gates (verbatim vm execution + in-process IV calibration instead of hand-transcribed constants), timer-driven environment self-checks inside `setTimeout`/`setInterval` callbacks (real timers required or later tokens silently go empty; deliberate probe throws escape via Promise microtasks), and never passing host `eval`/builtins into `vm.createContext` when the target uses indirect eval

## [0.1.19] - 2026-09-04

### Added

- new playbook `short-ttl-inline-proxy`: TTL boundary probing (immediate vs delayed replay) and zero-loss delivery by proxying the real request from inside the token-computing harness interceptor, with per-page user-agent switching in the proxy

## [0.1.18] - 2026-09-04

### Added

- new playbook `jsdom-native-vm-differential`: running VM-protected pages natively in a DOM implementation, multi-level runtime diffs (instructions, decoded constants), randomness-versus-gate classification, and the Function-shim / getter-only-global pitfalls

## [0.1.17] - 2026-09-04

### Added

- new playbook `browser-assisted-token-replay`: replay-tolerance probe as the delivery-mode decision gate for stateful VM signers, ordered browser capture across the page set, protocol-level user-agent override for last-page gates

## [0.1.16] - 2026-09-04

### Added

- env-gated crypto playbook: global-class `instanceof` probes and page-DOM signer inputs as known gates, plus a minimal-alignment order (satisfy the gate, then source-level literal patch, then global redefinition)
- anti-analysis classes for Function-constructor escapes (guarded realm-faithful shim) and class-probe alignment

## [0.1.15] - 2026-09-04

### Added

- new playbook `env-gated-crypto-differential`: bisecting crypto primitives that take different branches in real browsers versus local sandboxes (source -> tables -> behavior -> encoder inputs), with the known environment gates list
- hardened-sandbox checklist for replaying browserified bundles in `local-rebuild` guidance
- anti-analysis pattern entries for global-configurability probes (`delete window`) and environment-keyed crypto constants

## 2026-04-30 (0.1.14)

### Added

- `references/scripts-catalog.md` and `references/scripts-catalog.json` as generated indexes for the private script directory, including public-export status and stage grouping
- a manifest-driven public export contract so the published bundle is copied from one explicit allowlist instead of a hard-coded mix of file and directory rules

### Changed

- playbook routing snippets in README, AGENTS, AI usage, SKILL, and repo-map now derive from one shared route configuration instead of being hand-maintained in multiple files
- public release checks now scan the full public repository tree and include broader generic secret markers
- bumped public repository version from `0.1.13` to `0.1.14`

## 2026-04-30 (0.1.13)

### Added

- `playbooks/decoy-page-request-hidden-token-gate.md` as a dedicated operator guide for targets where the page advertises one simple request or helper field, but real acceptance depends on a second hidden token contract
- generic family-library guidance for decoy request surfaces, host-object mutation checks, and hidden token gates that only appear after the easiest route

### Changed

- README, AGENTS, AI usage, SKILL, and repo-map now route decoy-request hidden-token targets into a dedicated playbook instead of collapsing them into generic VM or transport work
- bumped public repository version from `0.1.12` to `0.1.13`

## 2026-04-28 (0.1.12)

### Added

- `playbooks/same-page-prior-round-signer-replay.md` as a dedicated operator guide for targets where round one is reproducible but later rounds require prior-round replay inside the same page-state timeline
- expanded generic family-library guidance for host-object drift inside minimal local JS helpers, including destructive-looking dynamic global assignments
- generic family-library guidance for stateful signers that only regain parity after replaying earlier rounds in order

### Changed

- README now calls out stateful same-page multi-round signers as a first-class reverse pattern and links the new playbook in the reading order
- the fresh-reload step-key ladder playbook now explicitly tells operators to test prior-round replay and browser-like interception of destructive dynamic global assignments before rewriting downstream crypto
- evidence rules now explicitly require retiring disproved theories and preserving browser-known parity pairs plus replay-negative evidence
- bumped public repository version from `0.1.11` to `0.1.12`

## 2026-03-26 (0.1.11)

### Added

- `playbooks/patched-runtime-digest-branch.md` for targets where a familiar digest helper name such as `sm3Digest` or `md5` actually resolves to a browser-specific patched runtime branch instead of a standard library primitive
- generic family-library guidance for proving browser-known digest input/output pairs, isolating patch points such as IV or round constants, and promoting a minimal local JS helper instead of full-page emulation

### Changed

- README, AGENTS, AI usage, SKILL, and repo-map now route patched-runtime digest targets into a dedicated playbook instead of collapsing them into generic signer or transport failures
- bumped public repository version from `0.1.10` to `0.1.11`

## 2026-03-26 (0.1.10)

### Added

- `playbooks/grid-challenge-template-matching.md` for fixed small-grid click challenges where target glyphs or symbols must be mapped onto cells before submission
- generic family-library guidance for grid-based challenge matching instead of collapsing these targets into generic signer or OCR work

### Changed

- README, AGENTS, AI usage, SKILL, and repo-map now route fixed-grid challenge targets into a dedicated template-matching playbook
- bumped public repository version from `0.1.9` to `0.1.10`

## 2026-03-26 (0.1.9)

### Added

- `playbooks/server-time-gated-wasm-signer.md` for targets where one server-issued time value gates a wasm or module-backed signer
- `playbooks/runtime-bundle-signer-extraction.md` for extracting one minimal runtime helper from a large bundle instead of emulating the full page
- `playbooks/transport-profile-ladder.md` for targets where acceptance diverges by HTTP client profile or protocol stack
- `playbooks/lenient-verify-data-gate.md` for challenge chains where verify responses are noisy but the downstream data endpoint is the real acceptance oracle
- generic family-library guidance for server-time-gated wasm signers, runtime bundle signer extraction, transport-profile-gated direct fetches, and lenient verify/data split targets

### Changed

- README, AGENTS, AI usage, SKILL, and repo-map now route these four newer reverse patterns into dedicated playbooks instead of collapsing them into generic signer or transport failures
- bumped public repository version from `0.1.8` to `0.1.9`

## 2026-03-25 (0.1.8)

### Added

- `playbooks/iterative-script-warmup-same-endpoint.md` as a dedicated operator guide for targets where one stable endpoint returns script first and real data only after replaying the same path with one newly emitted cookie or field
- generic family-library guidance for same-endpoint iterative warmup chains that would otherwise be mistaken for stale or missing second endpoints

### Changed

- README, AGENTS, AI usage, and repo-map now route same-endpoint script-then-data targets into a dedicated iterative warmup playbook instead of collapsing them into generic cookie or transport failures
- bumped public repository version from `0.1.7` to `0.1.8`

## 2026-03-25 (0.1.7)

### Added

- `playbooks/embedded-runtime-font-mapping.md` as a dedicated operator guide for accepted-response targets that encode values through one page-local embedded font
- generic family-library guidance for response-decoding targets that require per-page glyph enumeration and one-to-one glyph mapping

### Changed

- README, AGENTS, AI usage, SKILL, and repo-map now route accepted-response font-encoding targets into a dedicated embedded-font decode path instead of collapsing them into generic OCR or signer work
- bumped public repository version from `0.1.6` to `0.1.7`

## 2026-03-23 (0.1.6)

### Added

- `playbooks/bootstrap-digest-ladder.md` as a dedicated operator guide for bootstrap-time multi-digest token chains that later emit a wrapped cookie
- generic family-library guidance for replay targets that depend on transitional digest writes plus one wrapped-cookie contract

### Changed

- README, AGENTS, AI usage, SKILL, repo-map, and release checks now treat staged bootstrap token chains as a first-class reverse family instead of collapsing them into generic signer failures
- bumped public repository version from `0.1.5` to `0.1.6`

## 2026-03-20 (0.1.5)

### Added

- `playbooks/accepted-response-hidden-dom.md` as a dedicated operator guide for accepted-response targets that still hide, filter, or reorder browser-visible DOM

### Changed

- README, AGENTS, AI usage, SKILL, and repo-map entries now route accepted-response presentation-decode work into the dedicated playbook
- bumped public repository version from `0.1.4` to `0.1.5`

## 2026-03-20 (0.1.4)

### Added

- repo-map routing entry for accepted-response targets that still require DOM-side hidden-layer or reorder analysis

### Changed

- AGENTS and SKILL guidance now treat post-response DOM suppression and reflow as a first-class reverse task instead of a transport failure
- bumped public repository version from `0.1.3` to `0.1.4`

## 2026-03-20 (0.1.3)

### Added

- family-library guidance for response-presentation targets that suppress one DOM layer from response metadata and require post-hide reflow-aware ordering

### Changed

- README now calls out DOM-side filtering, style-noise suppression, and visible-layer reordering as first-class `js-reverse-ops` strengths
- AI usage notes now tell operators to inspect post-response render code before escalating accepted-response targets into fake signer theories
- bumped public repository version from `0.1.2` to `0.1.3`

## 2026-03-20 (0.1.2)

### Added

- family-library guidance for cookie-writer helper responses that arrive as raw JavaScript snippets instead of JSON seeds

### Changed

- clarify that cookie-family captures should preserve first-replay rejection evidence when runtime prerequisites are still incomplete
- bumped public repository version from `0.1.1` to `0.1.2`

## 2026-03-20 (0.1.1)

### Added

- generic family-library entries for direct question fetch targets
- generic family-library entries for page-derived lightweight query signers
- generic family-library entries for response-presentation-noise targets

### Changed

- bumped public repository version from `0.1.0` to `0.1.1`

## 2026-03-20

### Added

- `VERSION` 文件，明确公开版版本号
- `RELEASE.md`，明确版本策略和 tag 流程
- 初始公开仓库导出链路
- 中文 README 与项目摘要
- `CONTRIBUTING.md`
- `SECURITY.md`
- `LICENSE`
- `CHECKLIST.md`
- `scripts/check_public_release.sh`
- GitHub Actions 公开版检查工作流
- issue / PR 模板
- README 常用脚本索引与命令速查
- README 新手路径与推荐阅读顺序

### Changed

- 公开导出器改为保留 `.git`
- 文档去站点化，避免公开仓库暴露私有测试语料
