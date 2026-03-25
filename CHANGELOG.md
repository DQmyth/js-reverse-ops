# Changelog

All notable changes to the public `js-reverse-ops` repository will be recorded in this file.

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
