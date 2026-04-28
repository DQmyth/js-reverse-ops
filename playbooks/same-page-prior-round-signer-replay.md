# Same-Page Prior-Round Signer Replay

Use this playbook when a signer looks reproducible for the first request, but later requests drift unless the earlier rounds are replayed inside the same page-state timeline.

## Reach For This Playbook When

- `page 1` or the first accepted request can be reproduced, but `page 2+` or later requests fail
- the same helper source appears to run for every round, yet later signer outputs diverge
- one bootstrap endpoint returns per-round script, blob, or challenge state that feeds the next round
- a fresh local helper can reproduce one browser-known sample, but not the next sample from the same live page session
- static reading suggests "same algorithm every round", while runtime parity says the helper is stateful across rounds

## Core Idea

Treat the signer as a same-page state machine, not as an isolated one-shot function.

The usual shape is:

1. page bootstrap installs helpers
2. round `n` fetches script or challenge state
3. round `n` runs one prelude or signer step
4. round `n` leaves mutated state behind
5. round `n+1` reuses that state when deriving the next signer output

If you rebuild only the current round in a fresh runtime, later outputs can drift even when the visible helper text and direct arguments look correct.

## Typical Failure Pattern

The common mistake is:

- prove that one browser-known round matches locally
- assume later rounds are just "same helper, new timestamp"
- rebuild round `n+1` in a fresh jsdom, VM, or Node context
- keep rewriting crypto or transport code because only later rounds fail

That often hides the real issue: the local runtime skipped one or more prior-round side effects that the browser kept alive.

## First Actions

1. preserve one same-page browser sequence, not just one accepted request
2. record per round:
   - incoming cookie or field state
   - bootstrap script or blob body
   - timestamp or seed source
   - browser-known signer output
3. replay the rounds locally in the original order instead of starting from the failing round
4. test whether parity returns once the local helper executes prior rounds in the same page-state timeline
5. only reopen crypto or transport theories after the prior-round replay model has been tested

## Modeling Guidance

Do not reduce a multi-round target to one helper like "calc current cookie from current blob".

Instead, preserve the replay model explicitly:

- shared page state or helper instance
- round order
- per-round bootstrap input
- per-round signer prelude
- per-round signer output

The important question is not only "what computes this field", but also "what earlier round made this helper enter the correct branch".

## Host-Surface Warning

If same-page replay in the browser works but same-page replay in a local helper still drifts, inspect host-surface semantics before rewriting the algorithm.

Pay special attention to:

- `eval(...)` or `Function(...)` writes that appear to replace `window`, `navigator`, or similar globals
- browser-only objects whose reads influence branch selection
- own-property versus prototype-chain placement
- descriptor visibility, identity stability, and repeated-read behavior

Do not assume that a dynamic assignment which appears destructive in a VM or jsdom runtime has the same effective semantics in a real browser page.

## What To Preserve

- one browser-known multi-round sequence from the same page session
- per-round bootstrap artifact and signer output
- the minimal local replay that restores parity
- any retired theories, for example:
  - "timestamp mismatch"
  - "cookie carry-over only"
  - "RNG drift"
  - "crypto implementation mismatch"

## Promotion Boundary

Promote the replay path only when all of the following are true:

- later-round parity is reproduced with the preserved same-page sequence
- the required prior-round steps are explicit in the replay artifact
- the final accepted request no longer depends on hidden manual browser state

If only the first round matches, keep the result as partial replay evidence rather than claiming the signer is solved.
