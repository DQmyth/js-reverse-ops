# AI Usage

This file is a compact operator guide for AI systems using this repository.

## One-Sentence Rule

Start small, prefer runtime truth, and only deepen into recovery or replay after the request shape is grounded.

## Recommended Read Order

1. `AGENTS.md`
2. `README.md`
3. `SKILL.md`
4. `references/task-types.md`
5. one matching file under `references/stages/`

## Minimal Task Router

### If the user gives a local JS file

Run:

```bash
bash scripts/triage_js.sh <target.js>
node scripts/extract_iocs.js <target.js>
node scripts/extract_request_contract.js <target.js>
```

### If the user gives an HTML page

Run:

```bash
node scripts/profile_page_family.js <page.html>
node scripts/extract_page_contract.js <page.html>
```

If the network response is accepted but the page still hides or rearranges values, inspect the post-response render path before inventing a transport or signer theory.
Typical signals:

- one class or subtree is hidden immediately after the response arrives
- inline elements reflow after one layer is suppressed
- the final browser-visible order differs from raw DOM order

When that happens, read `playbooks/accepted-response-hidden-dom.md` before continuing.

If the accepted payload ships a fresh `woff` or similar font and the values are encoded as glyph entities, treat it as a page-local font-mapping problem. Enumerate unique glyphs, render them individually, and solve the glyph map before trying row-level OCR. When that pattern appears, read `playbooks/embedded-runtime-font-mapping.md`.

If the request still fails even after you recover one accepted digest, check whether bootstrap writes the same cookie key multiple times and later emits a second wrapped cookie. When that pattern appears, read `playbooks/bootstrap-digest-ladder.md` before widening into transport theories.

If one endpoint keeps returning JavaScript first and only returns arrays after the script is executed and replayed against the same path, treat it as an iterative warmup chain instead of hunting for a second hidden endpoint. When that pattern appears, read `playbooks/iterative-script-warmup-same-endpoint.md`.

If the final request depends on one server time value and one wasm or module-backed signer, freeze the time source before widening the signer theory. When that pattern appears, read `playbooks/server-time-gated-wasm-signer.md`.

If the page exposes a familiar digest helper name such as `sm3Digest` or `md5`, but browser output diverges from both the standard library and the raw local helper, treat it as a patched runtime digest branch. When that pattern appears, read `playbooks/patched-runtime-digest-branch.md`.

If one large bundle contains the signer but replay only needs one small runtime helper, extract the minimum helper instead of emulating the whole page. When that pattern appears, read `playbooks/runtime-bundle-signer-extraction.md`.

If the target is a short stage ladder and the later decrypts only make sense after you first prove one baseline signer from a fresh reload, preserve the first accepted request, verify the seeded signer exactly, and then read `playbooks/fresh-reload-seeded-signer-step-key-ladder.md`.

If desktop HTML keeps falling into verification but a mobile or app request profile lands on a thin shell page, pivot to the shell runtime, recover the route-to-chunk map and request wrapper, and then read `playbooks/mobile-shell-api-pivot.md`.

If a challenge or verify endpoint keeps reporting partial failure but the downstream data endpoint still returns accepted data, treat the data endpoint as the real oracle. When that pattern appears, read `playbooks/lenient-verify-data-gate.md`.

If the visible request contract is stable but only some HTTP clients succeed, escalate through a transport ladder before inventing more signer state. When that pattern appears, read `playbooks/transport-profile-ladder.md`.

If the page exposes one simple request or one tempting helper field, but later pages fail with a token-shaped gate, prove whether the visible request is only a decoy before widening into full VM recovery. When that pattern appears, read `playbooks/decoy-page-request-hidden-token-gate.md`.

If one challenge image is a fixed small grid with one glyph or symbol per cell, solve it as a grid-assignment problem before inventing signer logic. When that pattern appears, read `playbooks/grid-challenge-template-matching.md`.

### If the user needs browser runtime truth

Run:

```bash
python3 scripts/check_js_reverse_ops_deps.py
bash scripts/start_debug_browser.sh
bash scripts/check_debug_browser.sh
```

### If the code is packed, VM-like, or unreadable

Do not force replay first. Read `references/stages/recover.md` and use recovery-oriented scripts before delivery work.

## Output Expectations

Prefer producing:

- extracted contracts
- runtime captures
- normalized artifacts
- replay scaffolds
- concise verified findings

Avoid stopping at vague prose when a concrete artifact can be emitted.

## Examples

Use `examples/` when you want a tiny non-sensitive input set for dry runs, demos, prompt demonstrations, or delivery skeletons.

For H5 shell to JSON API pivots, prefer:

- `examples/mobile-shell-requests-client.py`
- `examples/mobile-shell-scrapy-template.py`
