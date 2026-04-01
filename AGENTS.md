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
- one endpoint returns script first and data only after one local cookie write or field update:
  model it as a same-endpoint iterative warmup chain before inventing a second hidden endpoint, then read `playbooks/iterative-script-warmup-same-endpoint.md`
- signer depends on one server-issued time value and one wasm or module helper:
  freeze the time source and signer input shape before touching replay, then read `playbooks/server-time-gated-wasm-signer.md`
- one digest helper has a familiar name such as `sm3Digest` or `md5`, but browser output diverges from the standard library:
  isolate the smallest patch surface in the local runtime before emulating more of the page, then read `playbooks/patched-runtime-digest-branch.md`
- one large bundle hides a tiny runtime helper you actually need for replay:
  extract the minimum helper instead of emulating the whole page, then read `playbooks/runtime-bundle-signer-extraction.md`
- fresh reload is required, the first signer must be proved against one live baseline sample, and later ciphertexts use previous-stage outputs as keys:
  validate the seeded signer first, then read `playbooks/fresh-reload-seeded-signer-step-key-ladder.md`
- desktop HTML intermittently falls into verification, but a mobile or app request profile lands on a shell page:
  pivot through the shell runtime, recover route chunks and the request wrapper, then read `playbooks/mobile-shell-api-pivot.md`
- verify endpoint looks noisy or pessimistic while data requests still succeed:
  treat the data endpoint as the acceptance oracle until proven otherwise, then read `playbooks/lenient-verify-data-gate.md`
- visible request contract is stable but some clients still fail:
  escalate transport stacks before inventing more signer fields, then read `playbooks/transport-profile-ladder.md`
- one challenge image is a fixed small grid and the target is selecting visible glyphs or symbols:
  crop the grid, solve target-to-cell assignment, and read `playbooks/grid-challenge-template-matching.md`
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
