# Anti-Analysis Playbook

Use this playbook when the target appears to resist observation rather than simply hide logic.

## Common Signals

- DevTools-open checks
- `debugger` loops or timer jitter checks
- function tamper checks on `fetch`, XHR, or `console`
- one-shot bootstrap closures that disappear after first load
- self-defending wrappers that fail after source formatting or hook injection
- runtime integrity checks around `Function.prototype.toString`

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

## Required Artifacts

- hostile signal excerpt
- observed symptom
- bypass class selected
- post-bypass divergence result
- whether the protected request became visible or remained hidden
