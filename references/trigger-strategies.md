# Trigger Strategies

Not every reverse failure is an algorithm failure. Many are trigger failures.

## Trigger Classes

### First-Load Passive Capture

Use when the protected request happens during bootstrap without user input.

### Pagination Trigger

Use when page number, route query, or next-page navigation causes a new protected request.

### Helper Trigger

Use when a generic business helper such as `submit()` or `call(...)` is available but still needs runtime verification.

### Reload With Preload Hook

Use when bootstrap logic runs too early for normal post-load hooks.

### Alternate Route or Data Shell

Use when the visible page is only a launcher and a secondary route contains the real runtime.

## Selection Rules

- if the page already makes the request on first render, do not over-automate clicks
- if a request only appears after route or page changes, treat navigation as part of the contract
- if a runtime sample returns `403`, inspect trigger and prerequisite state before rewriting crypto
- if a helper action lands in module or wasm frames, keep it as an entry trigger, not a bypass

## Required Notes

Every task bundle should preserve:

- which trigger was used
- which triggers were tried and failed
- whether the trigger changed request fields, headers, cookies, or status
