# Short-TTL Inline Proxy

Use this playbook when request tokens expire within seconds, so any pipeline that computes the token in one process and sends the request from another loses the window.

## Trigger Signals

- an immediately replayed captured token returns `200` but the same replay after a few seconds returns `403 token failed`
- a local oracle produces structurally valid tokens that fail validation even though every observable stream matches the browser
- the token embeds its own generation timestamp (`+new Date()` digit arrays are a common variant)

## Common Failure Modes

- assuming the local token is invalid when it is actually valid but expired by the time the validation request fires
- building a two-process pipeline (token generator writes a file/stdout, HTTP client reads and sends) where process handoff alone exceeds the TTL
- probing TTL by replaying the same token with long gaps and concluding "no replay allowed" from the late-replay failure only

## Operating Sequence

1. Probe the TTL boundary: replay one captured token immediately (expect `200`), then again after increasing delays. The delay that flips the result is the TTL.
2. If a local VM/DOM harness can compute tokens, move the HTTP send INTO the harness: intercept the challenge request at the resource-loader layer and, inside the interceptor's returned Promise, perform the real request to the target with the auth cookie and per-page user-agent, then hand the real response back to the page.
3. The page keeps running unmodified (it renders the real response), the token travels zero distance, and the driver collects per-page data from the interceptor's capture array.
4. For the last-page user-agent gate, switch the UA header inside the proxy per page number — the page-side request never needs to know.
5. Sum and submit from the outer language; the harness only computes tokens and fetches pages.

## Artifacts To Preserve

- the TTL probe result (immediate vs delayed replay)
- the inline-proxy interceptor with per-page UA switching
- the per-page data capture and final sum
