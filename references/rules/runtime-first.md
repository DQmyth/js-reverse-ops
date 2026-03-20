# Runtime-First Rules

Use these rules whenever the target runs in a browser or appears to derive signatures, cookies, or request fields at runtime.

## Trust Order

1. live network request
2. paused-frame or hook evidence
3. runtime request-body or request-header artifacts
4. static extraction outputs
5. helper functions or inline business handlers

## Required Behaviors

- Treat helper endpoints such as `/api/answer` or inline `submit()` logic as hints until runtime proves they are the protected request.
- If static extraction finds nothing or only asset-like endpoints, stop broad guessing and switch to runtime capture.
- If module or wasm code hides endpoint strings, freeze the request body first and recover upstream values second.
- If a runtime request is accepted by the server, treat it as canonical source-of-truth for path, method, and field set.

## Failure Rules

- If runtime bridge health is bad, fix the bridge before spending more time on static speculation.
- If runtime and static outputs disagree, keep the runtime result and downgrade the static result to inferred or weak.
