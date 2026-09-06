# Changelog

All notable changes to the public `js-reverse-ops` repository will be recorded in this file.

## [0.1.24] - 2026-09-06

### Added

- `scripts/scaffold_verbatim_harness.js`: parameterized verbatim-execution harness generator (vm/jsdom sandbox; call/handler/click pagination) encoding the verified rules — no host builtins in vm contexts, real timers with exception no-ops, per-page fresh clock, inline-proxy forwarding, explicit exit
- `run_playbook.js` now emits `misdiagnosis-checklist.json` and an Operator Review quick-check section re-surfacing the seven recurring wrong attributions from `references/misdiagnosis-patterns.md`

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
