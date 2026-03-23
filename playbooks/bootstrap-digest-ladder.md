# Bootstrap Digest Ladder

Use this playbook when a target does not accept a request from one obvious signer alone, but instead depends on a short bootstrap-time chain of transitional digests and a wrapped cookie assembled from that chain.

## Reach For This Playbook When

- the final request shape looks simple, but replay still fails without one extra cookie
- the page writes the same cookie key multiple times during bootstrap before the accepted request
- a second cookie appears only after those repeated writes and disappears with the same short acceptance window
- one accepted replay proves that `session + accepted-digest + wrapped-cookie` works, but direct replay with only the accepted digest still fails

## Core Idea

Treat the target as a staged bootstrap-token family, not as a single-field signer.

The practical shape is usually:

1. bootstrap computes several transitional digests
2. those digests are pushed into an array, queue, or builder list
3. bootstrap writes one final accepted digest
4. bootstrap wraps the whole digest chain into a second cookie
5. the protected request only succeeds while that staged bundle is still fresh

## Typical Failure Pattern

The common mistake is:

- recover the accepted digest
- ignore the earlier transitional writes
- ignore the wrapped cookie
- conclude the transport or headers are still wrong

That is usually backwards. The missing piece is often the bootstrap digest chain itself.

## First Actions

1. hook `document.cookie` before page scripts execute
2. hook the collector structure that receives transitional digests
3. capture the exact write order for:
   - transitional cookie writes
   - accepted cookie write
   - wrapped-cookie write
4. save the runtime values that stay stable across the chain, such as:
   - one shared bootstrap timestamp bucket
   - per-phase constants
   - carry-over values derived from previous writes
5. test the minimal acceptance contract:
   - accepted digest only
   - accepted digest plus wrapped cookie
   - full raw cookie header if needed

## What To Preserve

- exact cookie write order
- transitional digest list in emitted order
- accepted digest
- wrapped-cookie plaintext model if recoverable
- wrapped-cookie key derivation if recoverable
- acceptance window or TTL
- the smallest contract that still returns `200`

## Modeling Guidance

Do not assume each transitional digest uses a different raw timestamp input.

Often the real model is:

- one shared bootstrap anchor, such as a second-aligned timestamp
- one or two phase-mutated constants
- one carry-over field, such as the previous write time or previous digest source
- one final accepted digest model distinct from the transitional model

Build the chain from those anchors first. Only widen into per-write timestamp search if the anchored model fails.

## Verification Standard

Promote a pure replay path only after all of the following are true:

- the transitional digest sequence is reproducible
- the wrapped cookie is reproducible
- the minimal cookie contract is proven
- live replay returns accepted responses without browser bootstrap

If replay still fails, keep the sample as a runtime-risk artifact instead of overclaiming a solved signer.
