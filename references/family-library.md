# Family Library

This library turns recurring reverse targets into reusable operating patterns.

## Remote CoreJS Monolith

- trigger signals: thin HTML shell, external `match*.js`, tail-heavy request builder
- misleading signals: page helpers, login info endpoints
- first actions:
  1. extract request contract
  2. inspect tail neighborhood
  3. verify runtime endpoint

## Helper Page Plus Protected Runtime

- trigger signals: page HTML exposes `/api/answer` or similar helper endpoint while external challenge script loads
- misleading signals: helper endpoint looks complete enough to be mistaken for the protected request
- first actions:
  1. mark helper risk
  2. capture runtime request
  3. compare helper contract against runtime endpoint

## Launcher Page Plus App Shell

- trigger signals: outer page links into `/data`, Flutter, CanvasKit, generated bundle runtime
- misleading signals: launcher page looks like an inline challenge
- first actions:
  1. capture launcher page
  2. open data shell
  3. treat app shell runtime as the protected path

## Module or WASM Hidden Endpoint

- trigger signals: module scripts, `modulepreload`, Yew, wasm, but no obvious `/api/...` string
- misleading signals: absence of endpoint strings in loaded source
- first actions:
  1. freeze live request body
  2. record module and wasm artifacts
  3. recover upstream locals from paused frames or hooks

## Cookie Written After Challenge Response

- trigger signals: request uses cookie that is absent on first load and appears after challenge or preflight
- common variant: the helper or preflight response body is itself a JavaScript cookie-writer snippet rather than a JSON seed
- misleading signals: assuming every cookie is front-end generated
- first actions:
  1. instrument `document.cookie`
  2. capture helper/preflight responses, including raw JavaScript bodies that directly assign cookies
  3. prove write timing against consuming request
  4. if the first replay still fails, preserve the cookie shape and rejection as a runtime-risk sample instead of promoting a solved signer

## Bootstrap Digest Ladder Plus Wrapped Cookie

- trigger signals: the final protected request looks simple, but acceptance depends on a short-lived cookie bundle produced during page bootstrap rather than on one standalone signer field
- common variant: the page writes the same cookie name multiple times before the accepted request, collects those transitional digests in an array or queue, then emits a second cookie that wraps the whole digest chain
- misleading signals: assuming the last visible digest is the whole answer, or assuming every transitional digest must use its own wall-clock timestamp as input
- first actions:
  1. hook `document.cookie` and the digest-collector array before page scripts execute
  2. preserve the exact write order for transitional cookies, accepted cookie, and wrapped-cookie assembly
  3. separate stable anchors from phase-dependent state, such as one shared bootstrap timestamp versus per-phase constants or carry-over fields
  4. prove the minimal acceptance contract, including whether the request needs the wrapped cookie in addition to the accepted digest
  5. validate the reconstructed chain against live acceptance before promoting a pure replay path

## Iterative Script-Warmup Same Endpoint

- trigger signals: one stable endpoint first returns executable script or encoded bootstrap logic, then returns real data only after the client executes that script and replays the same endpoint with one fresh cookie or field
- common variant: the page itself does not switch to a second `/api/...` route; instead it retries the same `question` endpoint after `eval(res.data)` writes a cookie
- misleading signals: assuming the endpoint is only a "hint" API, assuming the old second data endpoint still exists, or assuming one returned script is the final answer rather than one stage in a short chain
- first actions:
  1. capture two consecutive accepted-or-near-accepted responses from the same endpoint and classify whether `data` changes from script to array
  2. preserve the exact cookie or field written by the returned script, including write order and whether the next request hits the same path
  3. test the endpoint iteratively before inventing a second hidden transport
  4. promote the replay contract only after proving how many rounds are needed and which round first returns data

## Server-Time-Gated WASM Signer

- trigger signals: one small time endpoint precedes the protected request, and the final signer is delivered through `wasm` or one module-backed helper
- misleading signals: assuming client wall-clock time is acceptable once the signer body is recovered
- first actions:
  1. capture the server time source
  2. prove the exact signer input shape, including delimiters and page binding
  3. recover the wasm or module helper into one local callable signer

## Patched Runtime Digest Branch

- trigger signals: the page exposes a familiar digest name such as `sm3Digest`, `md5`, or `sha*`, but browser output diverges from the standard library and from the unpatched helper in a plain local JS runtime
- common variant: one external bundle or CoreJS file installs the digest helper, while the accepted token still looks simple, such as `digest(server_time + page)` or `digest(timestamp + page)`
- misleading signals: treating the target as standard SM3/MD5 because the function name looks familiar, or emulating the full page when only a few digest patch points matter
- first actions:
  1. freeze one browser-known input/output pair for the digest helper
  2. compare browser output against both the standard library and the raw local helper
  3. isolate the smallest runtime patch surface, such as IV, byte transform, or round constants
  4. promote a minimal local JS helper that applies only the proved patches before handing the accepted digest back to Python or Node replay code

## Host-Object Drift Inside Local Helper

- trigger signals: browser replay accepts, but a minimal local helper built from the same runtime source still diverges under `jsdom` or another local JS host
- common variant: one host object read, such as `console.memory`, getter-backed DOM property, or identity-sensitive descriptor, changes control flow even though function source and visible arguments match
- misleading signals: assuming the algorithm itself is wrong because browser and local helper disagree on one byte or one branch
- first actions:
  1. freeze one browser-known helper input/output pair before editing algorithm logic
  2. compare helper entry arguments and free-variable constants between browser and local host
  3. inspect host semantics that affect identity or branching, such as getter vs value property, repeated-read identity, property descriptors, and own-property placement
  4. patch the smallest host-like behavior needed to recover the browser-known pair before promoting the helper

## Runtime Bundle Signer Extraction

- trigger signals: one large bundle or chunk contains the signer, but replay only needs one small runtime helper such as a custom `btoa`, `md5`, or bridge function
- misleading signals: emulating the full page when one extracted helper would be enough
- first actions:
  1. preserve the bundle that installs the runtime helper
  2. isolate the minimum module set that exposes the needed helper
  3. replay that helper locally before rebuilding the request path

## Lenient Verify, Strict Data Gate

- trigger signals: verify or captcha endpoints can return partial-failure status while the downstream data endpoint still returns accepted data
- misleading signals: assuming verify `ok:false` means the whole attempt failed
- first actions:
  1. preserve challenge, verify, and data responses from the same attempt
  2. prove which endpoint is the real acceptance oracle
  3. keep verify signals for debugging but gate automation on the data response

## Grid Challenge Template Matching

- trigger signals: one challenge payload returns image plus target list, and the image is a fixed small grid with one glyph or symbol per cell
- misleading signals: treating the target as a signer problem or jumping straight to full-image OCR
- first actions:
  1. preserve one full challenge payload and decoded image
  2. prove the grid layout and crop cells with stable margins
  3. solve target-to-cell assignment from per-cell masks or templates before submitting clicks

## Transport-Profile-Gated Direct Fetch

- trigger signals: the request contract is simple and stable, but acceptance depends on HTTP client profile, protocol stack, or browser-like transport behavior
- misleading signals: inventing new signer fields before exhausting transport differences
- first actions:
  1. freeze one accepted and one rejected request with the same visible contract
  2. test the client ladder from plain HTTP to HTTP/2 to browser-profiled stacks
  3. preserve the minimum transport rung that first succeeds

## Direct Question Fetch

- trigger signals: page data request lands directly on a stable `/api/question/...` style endpoint with only `page`, `pageSize`, or similarly plain query keys
- common variant: one visible prep ping or one older writeup makes the target look more complicated than it currently is, but the live data path is still a plain direct fetch once a tiny prerequisite is preserved
- misleading signals: assuming every challenge still hides a second protected transport, over-trusting stale writeups, or preserving outdated bootstrap steps after the live page already proves a smaller contract
- first actions:
  1. capture one accepted request and response body
  2. strip the replay down to the smallest live contract that still succeeds, for example one cookie plus one visible prep ping plus the direct question request
  3. verify whether later pages only add pagination or user-agent constraints
  4. preserve the request shape as a baseline family artifact before overcomplicating signer recovery

## Page-Derived Trivial Query Signer

- trigger signals: request carries one lightweight query field derived directly from page number, timestamp bucket, or a short deterministic transform
- misleading signals: over-modeling the target as a heavy crypto flow just because the page advertises "js encryption"
- first actions:
  1. freeze one accepted request URL
  2. test whether the field is derived from page, time, or a fixed prefix-plus-page transform
  3. preserve the exact encoding rule as a minimal replay contract

## Response Presentation Noise

- trigger signals: network response is accepted but the visible values are obscured by HTML fragments, sprite offsets, embedded fonts, or other rendering-layer transforms
- misleading signals: treating the fetch itself as the hard part and missing that the real work is response decoding
- first actions:
  1. preserve the raw accepted payload
  2. classify the rendering layer (sprite, font, canvas, html fragments)
  3. save decode-oriented artifacts separately from transport artifacts

### Embedded Runtime Font Mapping

- trigger signals: accepted payload embeds one page-local `woff` or similar font blob and returns rows encoded as glyph entities or other font-backed symbols
- common variant: each page ships a different font, so the glyph-to-digit mapping changes per response
- misleading signals: assuming one static mapping works across pages, or OCRing full rows before proving single-glyph identities
- first actions:
  1. extract the embedded font from one accepted payload and preserve it as a standalone artifact
  2. enumerate the unique glyphs actually used in the encoded rows
  3. render glyphs individually and collect candidate digits or symbols per glyph
  4. solve the page-local map as a one-to-one assignment before decoding rows or totals

### DOM-Hidden Noise Layer

- trigger signals: response `info` or equivalent already contains the rendered fragment tree, but page-side JavaScript immediately hides one class or subtree before the user sees it
- common variant: the hidden layer is selected from response metadata such as `key`, `value`, checksum fields, or a short page-local transform, and the remaining inline elements reflow after hiding
- misleading signals: assuming the "primary" class is discoverable from counts alone, or assuming pre-hide DOM order is the same as final visible order
- first actions:
  1. capture the page-side post-response render code, not only the network payload
  2. recover the exact hide rule that maps response metadata to the suppressed class or subtree
  3. recompute ordering from the visible DOM after the hide step, including any inline reflow or slot-width layout behavior
  4. validate one page against browser-visible output before promoting the decode rule to a reusable artifact

## Runtime Non-200 but Contract Partially Correct

- trigger signals: runtime endpoint and fields look plausible, server still rejects
- misleading signals: assuming the algorithm alone is wrong
- first actions:
  1. inspect trigger path
  2. inspect prerequisite state
  3. preserve rejected sample as a risk-bearing artifact
