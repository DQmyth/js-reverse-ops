# Local Rebuild

Rebuild only after runtime evidence exists.

## Rules

- Do not invent browser globals from memory.
- Patch from observed requirements, one causal decision at a time.
- Keep a divergence log after every run.
- Keep browser capture samples as the oracle.

## Recommended Flow

1. Export or collect runtime evidence.
2. Isolate the smallest function chain that produces the target field.
3. Rebuild in Node if browser semantics matter.
4. Patch environment gaps minimally.
5. Verify output against captured browser samples.
6. Generate Python only after Node output is stable or browser semantics are fully understood.

## Common Minimal Patches

- `atob` / `btoa`
- `TextEncoder` / `TextDecoder`
- `crypto.getRandomValues`
- `crypto.subtle`
- `localStorage` / `sessionStorage`
- selected `navigator` properties
- time sources and locale settings

Patch contracts, not entire browsers.
