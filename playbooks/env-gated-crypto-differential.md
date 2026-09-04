# Env-Gated Crypto Differential

Use this playbook when a bundle embeds a standard crypto library whose primitives are modified and take different branches in real browsers versus local sandboxes, so locally computed request tokens are rejected even though every visible call argument matches.

## Trigger Signals

- the bundle `require`s a bundled crypto library inside a flattened or packed wrapper
- the request token is deterministic for identical inputs in the real browser
- the same computation in a Node vm sandbox produces a different token from identical inputs
- the server rejects sandbox tokens while browser-produced tokens pass
- function sources, lookup tables, and call arguments all match across environments, yet output still differs

## Common Failure Modes

- assuming identical function source means identical behavior (environment-gated branches live inside the same source)
- comparing only the outer call shape (message, passphrase, mode, padding) without comparing the derived key schedule
- trusting default alphabets or constants inside a modified encoder
- patching environment globals broadly instead of finding the one causal gate
- falling back to full browser automation without bisecting the divergence first

## Operating Sequence

1. Freeze the seed input: wrap the time or seed endpoint (XHR or ajax level) so the browser-side computation becomes deterministic, then harvest input/output token pairs in the real browser.
2. Build the same oracle in a hardened vm sandbox (see the local rebuild checklist) and record the divergence.
3. Bisect the divergence in this order:
   - source: at a paused frame inside the bundle, capture the bundled crypto module by calling the bundle's internal `require` through `evaluateOnCallFrame`, stringify candidate functions, and compare with sandbox copies
   - data: if sources match, breakpoint inside a table-consuming routine and dump closure-scope tables (S-box and friends) on both sides
   - behavior: if tables match, call pure functions with crafted identical inputs on both sides, such as the cipher-params stringifier or a single-block encrypt with a fixed key
   - inputs: if a pure function still diverges, wrap its internal callees (for example the base64 encoder) to capture the exact inputs it receives; identical inputs with different output localize the divergence inside that callee
4. Inspect the diverging unit for environment gates. Known gates:
   - `delete window` or `delete globalThis` probes, because global configurability differs between vm contexts and real browsers
   - `typeof document` branches and try/catch ReferenceError traps around unresolved closure names
   - `location.href.indexOf(...)` selectors feeding round-function selection
   - environment-keyed constant tables such as base64 alphabets, hash init vectors, or round shift amounts
5. Align the sandbox minimally: make `window` and `globalThis` non-configurable, override the environment-keyed constant with the browser-verified value, and log one divergence entry per patch.
6. Deliver as a long-running local helper process (one stdin line in, one JSON token out per line) so the heavy bundle boots once, then drive the transport from Python page by page.

## Artifacts To Preserve

- a fingerprint JSON per environment: base64 alphabet, known-vector digests, single-block ciphertext with a fixed key, random-generator sample, derived key bytes
- the paused-frame capture snippet used to export the module from the live bundle
- the list of environment gates and the minimal alignment patch
- one server-accepted token sample produced by the local helper
