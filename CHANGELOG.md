# Changelog

All notable changes to the public `js-reverse-ops` repository will be recorded in this file.

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
