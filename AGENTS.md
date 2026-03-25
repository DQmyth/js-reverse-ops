# AGENTS.md

This repository is designed to be understandable by coding agents and automation-oriented assistants.

## Primary Goal

Use `js-reverse-ops` as a structured reverse-engineering workflow for JavaScript-heavy browser targets.

The repository is optimized for:

- locating the real protected request
- collecting runtime truth before over-committing to static guesses
- recovering packed or VM-like logic into readable artifacts
- exporting replay-oriented outputs for Node or Python

## First Files To Read

When you are new to the repository, read in this order:

1. `README.md`
2. `SKILL.md`
3. `AI_USAGE.md`
4. `repo-map.json`
5. `references/task-types.md`
6. `references/stages/locate.md`
7. `references/stages/runtime.md`
8. `references/stages/recover.md`
9. `references/stages/replay.md`

## Fast Entry By Task

- local JS or bundle:
  start with `scripts/triage_js.sh`, `scripts/extract_iocs.js`, `scripts/extract_request_contract.js`
- HTML page:
  start with `scripts/profile_page_family.js`, `scripts/extract_page_contract.js`
- browser-backed target:
  verify environment with `scripts/check_js_reverse_ops_deps.py`, `scripts/start_debug_browser.sh`, `scripts/check_debug_browser.sh`
- accepted response but confusing browser-visible values:
  inspect page-side post-response render logic before assuming the transport or signer is still wrong, then read `playbooks/accepted-response-hidden-dom.md`
- accepted response plus page-local embedded font:
  inspect the accepted payload for `woff` or other embedded font blobs, enumerate unique glyphs, and read `playbooks/embedded-runtime-font-mapping.md` before trying row-level OCR or signer recovery
- accepted digest exists but replay still fails without one extra cookie:
  inspect bootstrap-time cookie writes and wrapped-cookie assembly before blaming headers or transport, then read `playbooks/bootstrap-digest-ladder.md`
- packed or VM-like code:
  prefer `Recover` stage references and do not jump directly into replay
- replay delivery:
  use `references/signature-delivery.md` and output scaffold or bundle artifacts

## Working Style

- prefer runtime evidence over plausible static interpretation
- prefer artifact generation over chat-only conclusions
- prefer the smallest stage-appropriate script rather than broad tool usage
- preserve clear boundaries between verified facts and inferred conclusions
- if the page hides one DOM layer or visibly reorders inline elements after the response arrives, treat that as a presentation-decode problem, not as proof that the request contract is incomplete
- if one accepted page ships a new embedded font, treat the glyph map as page-local until you prove otherwise

## Repository Boundaries

This public repository intentionally excludes:

- private fixtures
- target-specific case notes
- credentials, cookies, sessions, live captures
- site-specific replay material

Do not reintroduce target-specific material when extending the public repository.

## Sample Inputs

If you need a harmless dry run target, use files under `examples/`.
