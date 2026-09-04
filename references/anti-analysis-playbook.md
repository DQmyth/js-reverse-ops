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

## Required Artifacts

- hostile signal excerpt
- observed symptom
- bypass class selected
- post-bypass divergence result
- whether the protected request became visible or remained hidden
