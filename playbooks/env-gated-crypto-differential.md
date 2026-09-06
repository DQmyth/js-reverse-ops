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
   - global-class probes such as `window instanceof EventTarget`, `window instanceof Window`, or `document instanceof Document`, typically selecting hash init vectors or constant tables word by word; read the leaked result globals first, because the chosen words are often parked on `window` after the first run
   - environment-keyed constant tables such as base64 alphabets, hash init vectors, or round shift amounts
   - signer inputs that come from the page DOM itself, for example a meta tag read through `document.querySelector(...).content`; the sandbox document must carry the real page head or the input silently diverges
5. Align the sandbox minimally, in this order of preference:
   - satisfy the gate honestly when cheap (define the missing global class, add the page meta tag, keep the real `location.href` shape)
   - otherwise patch the probe at source level: replace the whole environment-selection expression with the browser-verified literal values, and log one divergence entry per patch
   - make `window` and `globalThis` non-configurable when the gate is a configurability probe
   - when the shell defuses analysis through a `Function('while(true){}')` constructor escape, replace the Function constructor with a guarded shim that still compiles normally (so `"return this"` keeps returning the sandbox global) but returns an empty function for infinite-loop or debugger bodies, and mask the shim's `toString` as native code
5b. When gates are **combinatorial** (every init-vector word or per-character mask selected by its own `typeof`+`String(X)` ternary chain), do NOT hand-transcribe the chosen constants: five rounds of "modified SM3 with the right IV/T/masks" still failed because two gates were missed (`String(print)` native-code check silently switching per-char `&254`/`&255`, and `typeof require` selecting a different IV word in Node). Instead extract the whole obfuscated signer verbatim into a vm sandbox with browser-equivalent stubs (native-`toString` classes, no `require`/`__dirname`, a native `print`), let the code pick its own constants, then **calibrate against a browser-captured oracle** (dump the post-`reset()` register array and compare word by word) before computing any token. Server 200/403 is only the final oracle; the in-process IV dump is the fast one.
5c. When a vm sandbox produces a valid first token but **empty/mismatched tokens on every later call** with zero observable exceptions and zero global-state change, suspect a **timer-driven self-check**: JSVMP shells commonly run their fingerprint sampling (enumerating `Error`/`TypeError`/`RangeError`/... constructor messages, `decodeURIComponent('%')` → "URI malformed", `null.foo` probes) inside `setTimeout`/`setInterval` callbacks. A synchronous or no-op timer stub means the self-check never runs and the token branch silently returns `''`. Fix: hand the sandbox the host's real timers (wrapping each callback in try/catch), wait a few seconds after boot, and install `process.on('uncaughtException'/'unhandledRejection')` no-ops because the deliberate probe throws escape function-level try/catch via Promise microtasks. To prove the branch-vs-exception split fast, runtime-patch the interpreter's own catch (`catch(e){if(!s.length)throw e;`) to log swallowed exceptions, and diff sandbox globals before/after the failing call.
5d. Never pass host `eval`/`Function`/builtins into a `vm.createContext` sandbox when the target runs code via **indirect eval** (`eval(payload)`): the host eval's scope chain stays bound to the host global, so the payload sees no `document` and every environment probe fails, while the same code in context-internal builtins passes cleanly. Inject only BOM/DOM stubs; let the context provide ECMAScript builtins (`Object.prototype.constructor === Object`, `Function.prototype.constructor === Function` probes then pass for free). For `Object.prototype.toString.call(x)` class-tag probes, stubs satisfy them with `{ [Symbol.toStringTag]: 'HTMLDocument' }`.
5e. Before blaming environment fingerprints for a "different derived key string" across two runs, check whether the string **tracks wall-clock time**: re-diff captures taken minutes apart, and diff the trailing reads of both charCodeAt streams (the same trailing string on both sides was the giveaway that the "mismatched keys" were time-derived number-as-charcode data — a frozen-clock sandbox will always differ from a live browser). Related trap: a server under a TTL/fingerprint maze may answer **200 with random plausible data** for mistimed tokens; the only honest success metric is a total that stays identical across repeated clean runs, never a single 200.
6. Deliver as a long-running local helper process (one stdin line in, one JSON token out per line) so the heavy bundle boots once, then drive the transport from Python page by page.

## Artifacts To Preserve

- a fingerprint JSON per environment: base64 alphabet, known-vector digests, single-block ciphertext with a fixed key, random-generator sample, derived key bytes
- the paused-frame capture snippet used to export the module from the live bundle
- the list of environment gates and the minimal alignment patch
- one server-accepted token sample produced by the local helper
