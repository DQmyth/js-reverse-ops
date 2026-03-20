# Routing Rules

Use the strongest observable signal first. Do not route by aesthetics.

## Family Routing

- `match*.js` tail looks request-like: start with request-contract extraction, then verify at runtime.
- inline `call(...)` or `submit(...)` without deeper bundle signals: treat as `inline-page-challenge`.
- launcher page handing off to `/data` or app shell: capture both pages and route to `app-bundle-hybrid` or `module-or-wasm-hybrid`.
- `type="module"`, `modulepreload`, wasm hints, Yew, Rust glue: route to `module-or-wasm-hybrid`.
- Flutter, CanvasKit, `main.dart`, or manifest-driven shell: route to `app-bundle-hybrid`.

## Misleading Signals

- `/api/loginInfo`, `/api/logout`, `/api/answer`, and asset-like `/api/*.png` paths are helper or misleading until proven otherwise.
- A clean-looking static endpoint guess is not a win if the live request still rejects.
- Absence of `/api/...` strings is normal in some module or wasm families.
