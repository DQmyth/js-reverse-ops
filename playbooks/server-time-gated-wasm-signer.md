# Server-Time-Gated WASM Signer

Use this playbook when the protected request depends on one server-issued time value and one `wasm` or module-backed signer.

## Trigger Signals

- one small endpoint returns a bare timestamp or time-like string before the main request
- the page or bundle loads `wasm`, `modulepreload`, or one local signer helper
- the final request uses `t`, `time`, `sign`, or similar paired fields
- local `Date.now()` or wall-clock replay keeps failing even when the signer body looks correct

## Common Failure Modes

- treating the problem as "just recover the wasm sign function"
- using client wall-clock time instead of the server time source
- assuming the time endpoint is only a helper or cosmetic sync
- recovering the signer but not the exact input string shape, such as `page|t`

## Operating Sequence

1. capture one accepted request and preserve the exact `signer_input -> sign` contract
2. isolate whether the time source is server-issued, browser-issued, or mixed
3. prove the input join rule, including delimiters, page binding, and byte encoding
4. recover the wasm or module signer into one local callable helper
5. validate one page with a fresh server time value before widening into multi-page replay

## Artifacts To Preserve

- one accepted request URL or body
- the time-source response body
- the signer input shape
- the local replay helper used to compute `sign`
- one accepted live replay sample
