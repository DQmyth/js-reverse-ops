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

## Browserified Bundle Sandbox Checklist

When replaying a page bundle (browserify-style IIFE that pulls jQuery and a bundled crypto library) inside `vm.createContext`, apply this hardening list before debugging output divergence:

- define `window`, `globalThis`, and `self` as the sandbox itself, then redefine `window` and `globalThis` via `Object.defineProperty(..., { get() { return sandbox; }, set() {}, configurable: false })` so `delete window` probes fail like a real browser
- expose jQuery twice: `$` and `window.jQuery` (bundles commonly resolve only the long name)
- stub jQuery statics the bundle may call directly: `$.ajax` (return the frozen seed value synchronously through `opts.success`), `$.trim`, `$.param`, `$.each`, `$.extend`, `$.type`
- make `$()` return one chainable Proxy whose every property is itself and whose `toPrimitive` is empty-string, so DOM reads degrade to falsy instead of throwing
- provide `crypto.getRandomValues` backed by real randomness, plus `msCrypto`
- stub constructor classes used for environment sniffing: `Navigator`, `Window`, `Document`, `HTMLDocument`, `Element`, `HTMLElement`, `Location`, `Screen`, `Storage`, `Event`, `CustomEvent`
- keep `location.href` shaped like the real page, including path segments the target probes (`location.href.indexOf(...)` selectors are a known round-function gate)
- `document` can stay a Proxy that returns `''` for `cookie` and `'complete'` for `readyState`
- capture the bundled crypto module by patching one bundle-specific `require(name)` call site into `globalThis.__CJS = <module>`, then fingerprint it with `scripts/fingerprint_env_gated_crypto.js` instead of re-deriving primitives by hand

If sandbox output still diverges from the browser while sources and tables match, route to the env-gated crypto differential playbook before adding more shims.

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
