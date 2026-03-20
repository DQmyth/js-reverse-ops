# Proxy and RPC Integration

Use this layer when reverse results must be handed off into an operational delivery path, not just explained.

## Delivery Modes

- `python-replay`: standalone replay script for direct batch or CLI use
- `jsrpc-bridge`: keep the critical signing or browser logic in a live JS or browser-connected service
- `proxy-injector`: drive request patching from a traffic interception tool such as Burp or mitmproxy

## Required Inputs

- current bundle maturity
- replay scaffold or runtime capture
- target request method, path, and fields
- known missing pieces such as cookies, headers, signatures, or time fields

## Recommended Outputs

- `delivery-plan.json`
- `delivery-notes.md`
- `proxy-integration.md`
- `jsrpc-bridge.js` when browser-connected signing is required
- `mitmproxy-addon.py` for interception-driven delivery
- `burp-match-and-replace.json` as a Burp-side handoff manifest

## Rules

- Do not claim a delivery mode is production-ready if the bundle is below `runtime-accepted`.
- If replay is still synthetic or attempted-only, delivery artifacts must say so explicitly.
- Prefer the smallest operational mode that satisfies the user goal.

## Practical Output Expectations

- `jsrpc-bridge` should expose a minimal local HTTP signing service shape, not just a placeholder function.
- `proxy-injector` should emit a usable mitmproxy addon skeleton with target URL, method, and default field completion.
- Burp-facing output can stay manifest-style, but it should contain target URL, method, and the intended handoff shape so an operator can wire it quickly.
