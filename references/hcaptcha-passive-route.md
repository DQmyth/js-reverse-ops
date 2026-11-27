# hCaptcha passive (no-image) route — protocol-level, no captcha service

Source: a full-chain walkthrough (WeChat article, 2026-11; target: a large
airline login).

**Reproduction status (our hands-on, 2026-11-27)**: the first half of the
chain is now level 3 on the live target — request ① returned the login HTML
with the documented container + sitekey; request ② returned the exact config
shape (`c.type=hsw`, `enc_get_req=true`, JWT-shaped `c.req` with `l`/`i`
claims); request ③ downloaded the 1.63MB HSW whose SHA-256→SRI matched
`claims.i` byte-for-byte. The execution leg is PARTIAL: the original HSW
injects and runs in iv8 (`window.hsw` callable, returns a Promise), and the
debug access log shows the PoW wasm actively decoding (1400+ atob calls +
WebAssembly instantiation, probes on navigator.permissions/connection/
devicePixelRatio/plugins) — but `n` did not resolve: the HSW waits on
environment warm-up state the article's author had configured (incl. the
recorded canvas-trace consumption) that we have not built. The unverified
remainder: motionData/vmdata generation (parent-page executor) and the
getcaptcha submission. It corrects a wrong premise in our own family table:
hcaptcha is NOT uniformly a perception gate. The **passive/no-image flow is
a protocol gate** — solvable with request replay + verbatim execution of
the site's own HSW module, no CV and no paid service.

## The five-request chain (single curl_cffi chrome session, fresh per round)

1. **Enter** — OAuth2/PKCE authorize → redirects settle on the login HTML
   (contains the `#ulp-hcaptcha` container). Session keeps redirects+cookies.
2. **checksiteconfig** — `POST api.hcaptcha.com/checksiteconfig?v=&host=&sitekey=&sc=1&swa=1&spst=1`
   → `c = {type:"hsw", req, sig, kid}` + `features.enc_get_req`. `c.req` is a
   dot-separated JWT-shaped string; its middle-segment payload carries
   `l` (HSW path) and `i` (HSW SRI, `sha256-...`). sig/kid are passed through
   unmodified.
3. **Fetch HSW + parent api.js** — `GET newassets.hcaptcha.com<claims.l>/hsw.js`
   and `GET js.hcaptcha.com/1/api.js`. Discipline: compute the file SHA-256,
   Base64 the raw 32 bytes, prefix `sha256-` — must equal `claims.i`
   (SRI binds config to the exact code; URL `/c/<id>/` is NOT the file hash).
4. **Local computation — three engine calls, zero remote traffic**:
   a. parent-page executor (JSDOM on the real login HTML + real api.js,
      iframe postMessage boundaries modeled: site-setup / checkbox-selected
      {action:"mouse"} / create-challenge) → `manifest` (motionData) + `vmdata`
   b. run the **original HSW verbatim**: `hsw(c.req, {href, vm_data, ...})` → `n`
   c. pack inner object `{v, sitekey, host, hl, n, e:null, motionData}` with
      MessagePack, then `hsw(1, bytes)` → encrypted bytes
5. **getcaptcha** — `POST api.hcaptcha.com/getcaptcha/<sitekey>` with
   `Content-Type: application/octet-stream`, body = MessagePack of
   `[JSON.stringify(c), ExtType(18, encrypted)]`. Success = HTTP 200 AND
   `pass===true` AND no `tasklist` AND `generated_pass_UUID` starting `P1_`
   (expiration 120s). Response may be plain JSON **or** encrypted binary —
   binary branch decodes via `hsw(0, responseBytes)` + MessagePack unpack.

## Why this maps onto our existing principles

- HSW runs **verbatim, byte-identical, SRI-bound** — the same doctrine as
  wasm-verbatim (M11 resolution); no reimplementation drift
- Python (curl_cffi transport) × Node (execution) two-shell split — our
  standard delivery shape
- Explicit success predicates (P1_ prefix, pass flag, no tasklist) — the
  page-truth standard, refusing "200 == success"
- Fresh session per round, no imported cookies — evidence-freshness
  discipline; the author explicitly does NOT claim mouse-event equivalence

## Where our new engines slot in

The article's execution shell is bundled Node + Realm + env modules —
exactly the slot **pyv8c / iv8** fill for us now: run the parent api.js and
HSW in the calibrated engine (all jsdom-gap probes green), and use **iv8's
debug-mode API-access logging to discover the HSW's actual environment
dependencies** (its recorded trap: a Wasm canvas trace assertion) instead
of bisecting stubs by hand.

## What stays a perception gate

hcaptcha with an image task (`tasklist` non-empty) remains the CV/service
rung. The passive route's win condition is precisely that the server grades
the passive signals as sufficient — request shape, HSW proof-of-work `n`,
and motionData — and returns `pass:true` with no tasks.
