# Local Rebuild

Rebuild only after runtime evidence exists.

## Rules

- Do not invent browser globals from memory.
- Patch from observed requirements, one causal decision at a time.
- Keep a divergence log after every run.
- Keep browser capture samples as the oracle.

## Recommended Flow

1. Export or collect runtime evidence.
2. Isolate the smallest function chain that produces the target field.
3. Rebuild in Node if browser semantics matter.
4. Patch environment gaps minimally.
5. Verify output against captured browser samples.
6. Generate Python only after Node output is stable or browser semantics are fully understood.

## Common Minimal Patches

- `atob` / `btoa`
- `TextEncoder` / `TextDecoder`
- `crypto.getRandomValues`
- `crypto.subtle`
- `localStorage` / `sessionStorage`
- selected `navigator` properties
- time sources and locale settings

Patch contracts, not entire browsers.

## XHR Open Rewrite Signers

Use this pattern when local helpers produce plausible intermediate values but the accepted signer only appears after a transport hook runs.

Signals:

- a visible request URL lacks the final signer until runtime
- `window.token` or similar globals are absent or misleading
- `XMLHttpRequest.prototype.open` receives one URL but downstream code observes a signed URL
- manually concatenated prefix/suffix candidates have the right length but fail server validation

Rebuild approach:

1. Preserve live script order and server-issued state scripts.
2. Wrap `XMLHttpRequest.prototype.open` before target scripts execute.
3. Trigger the smallest matching protected URL open call.
4. Extract signer fields from the rewritten URL.
5. Carry runtime-written cookies and response state into the next replay round.
6. Validate each page or round against the protected endpoint before promoting Python delivery.

For public-safe workflow details, use `public/playbooks/xhr-open-url-rewrite-runtime-replay.md`.
