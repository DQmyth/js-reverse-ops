# Anti-Analysis Playbook

Use this playbook when the target appears to resist observation rather than simply hide logic.

## Common Signals

- DevTools-open checks
- `debugger` loops or timer jitter checks
- function tamper checks on `fetch`, XHR, or `console`
- one-shot bootstrap closures that disappear after first load
- self-defending wrappers that fail after source formatting or hook injection
- runtime integrity checks around `Function.prototype.toString`
- global configurability probes such as `delete window` or `delete globalThis`, which fail silently in real browsers but succeed inside Node vm sandboxes and flip crypto or signer branches onto a tampered path
- environment-keyed constants: the same source resolves a different base64 alphabet, hash init vector, round shift table, or salt depending on browser-versus-sandbox detection
- Function-constructor escapes: the shell builds `Function('while(true){}')` (or similar) through `function(){}['constructor']`, which hangs the host outside the vm timeout budget because the newly compiled function is not covered by `runInContext` timeouts
- global-class identity probes: `window instanceof EventTarget` / `Window`, `document instanceof Document`, `typeof WindowProperties` — each branch usually selects one constant word, so partial matches produce plausible-but-wrong signers

## Response Order

1. record the hostile signal before attempting a bypass
2. classify the symptom:
   - execution pause
   - request suppression
   - fake helper path
   - environment divergence
3. prefer preload instrumentation over late hooks
4. patch the smallest causal unit only
5. preserve a divergence log after every patch

## Minimal Bypass Classes

- `timing`: neutralize jitter-sensitive checks by reducing intrusive stepping
- `surface integrity`: patch `toString` or wrapper identity only when the original check is captured
- `bootstrap survival`: inject before navigation when the hostile code runs only once
- `hook stealth`: move from broad monkeypatching to narrower callframe or initiator capture
- `UI misdirection`: trust network and callframe evidence over visible helper buttons or inline handlers
- `global configurability`: redefine `window` and `globalThis` as non-configurable (`Object.defineProperty` with `configurable: false`) so `delete window` probes fail the same way they do in a real browser; this is usually the causal unit when a sandbox signer diverges while all sources and tables match
- `constructor escape`: replace the sandbox `Function` with a guarded shim that still compiles bodies in the sandbox realm (`vm.compileFunction(..., { parsingContext })`, so `"return this"` keeps working) but returns an empty function for `while(true)` / `debugger` bodies, and mask the shim's `toString` as `function Function() { [native code] }`; a blunt no-op constructor breaks environment detection that legitimately uses `{}.constructor("return this")()`
- `class-probe alignment`: when gates select constants through `instanceof` checks on global classes, prefer patching the selection expression at source level with browser-verified literals over faking class hierarchies, and read any leaked result globals first (init words are often parked on `window` after the first run)

## Required Artifacts

- hostile signal excerpt
- observed symptom
- bypass class selected
- post-bypass divergence result
- whether the protected request became visible or remained hidden
