# jshookmcp Notes 2026-03-16

This note records what was worth absorbing from `vmoranv/jshookmcp` into `js-reverse-ops`.

## Worth Copying

- `search-first` tool scaling
  - start with broad search and light capture before activating heavier hook surfaces
- workflow-first entrypoints
  - package repeated runtime tasks as named workflows instead of expecting the operator to remember every step
- stronger doctor surface
  - distinguish core requirements from optional tooling such as packet, proxy, and wasm helpers

## Not Worth Copying Literally

- very broad one-tool-surface activation
  - `js-reverse-ops` works better when hooks, provenance, replay, and maturity stay explicit and evidence-backed
- product-style breadth without evidence promotion rules
  - this skill should keep strict boundaries between `runtime-captured`, `runtime-accepted`, and `replay-verified`

## Concrete Absorptions

- dependency doctor now records optional profiles for:
  - packet capture
  - proxy delivery
  - wasm recover
  - android or hybrid analysis
  - runtime mobile bridge
- `search-first` escalation is now documented as a composite workflow
- packet-capture-guided form replay is now a first-class composite workflow

## Remaining Gap

The main remaining advantage of `jshookmcp` is convenience around turnkey workflow activation. If needed later, the next step for `js-reverse-ops` is a thin dispatcher that can choose and emit one of the named composite workflows automatically.
