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

## Direct Question Fetch

- trigger signals: page data request lands directly on a stable `/api/question/...` style endpoint with only `page`, `pageSize`, or similarly plain query keys
- misleading signals: assuming every challenge still hides a second protected transport
- first actions:
  1. capture one accepted request and response body
  2. verify whether later pages only add pagination or user-agent constraints
  3. preserve the request shape as a baseline family artifact before overcomplicating signer recovery

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
