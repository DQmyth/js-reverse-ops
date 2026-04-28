# Fresh-Reload Seeded Signer Step-Key Ladder

Use this playbook when a browser challenge is solved as a short stage ladder: one accepted request reveals the next-stage key material, the signer is seeded by fresh runtime state such as `url|ts`, and reruns without a clean reload produce misleading captures.

## Reach For This Playbook When

- the page exposes one stage at a time and each accepted response unlocks the next field or ciphertext
- one request field such as `sign` depends on both sorted payload data and one fresh runtime seed like `path|ts`
- replay attempts keep drifting because the page mutates signer helpers or timestamps during bootstrap
- static reading finds likely crypto helpers, but only runtime evidence tells you which helper instance and seed are actually used
- later decryption steps only make sense if you treat the previous stage output as the raw key candidate

## Core Idea

Treat the target as a fresh-runtime ladder, not as one standalone signer.

The usual shape is:

1. reload into a clean page state
2. freeze the first accepted request assembly path
3. recover the exact signer contract for that stage
4. replay the stage with real values
5. treat the accepted output as candidate key material for the next stage
6. probe the next-stage ciphertext against the smallest plausible crypto family set
7. repeat until the final derived value can be replayed locally

The main mistake is trying to solve every stage with one static theory while ignoring that the runtime seed, helper instance, or cipher family can change across rounds.

## Typical Failure Pattern

The common drift looks like this:

- capture one helper late, after the page has already warmed itself up
- assume `hash(data)` is the whole signer
- miss that the final signer is seeded by `url|ts` or a similar per-request runtime value
- rerun on a dirty page and compare different rounds as if they were one sample
- trigger one more bootstrap request after copying one fresh round and silently replace the original `ts` or accepted request window
- force one crypto family across all stages even though the challenge switches between `ARC4`, `DES-ECB`, or `AES-ECB` style branches

That usually produces "almost right" signatures and fake crypto dead ends.

## First Actions

1. start from a fresh reload and preserve the first stable `KEY`, `CIPHER`, or bootstrap values that appear
2. hook the final request boundary before solving internals:
   - `XMLHttpRequest.send` or `fetch`
   - property writes to `sign`, `ts`, and any stage fields
   - one short stack trace for the last effective field assignment
3. record the accepted-or-near-accepted request body exactly as sent on the wire
4. reconstruct the signer input contract from runtime evidence:
   - field order
   - whether keys are sorted
   - whether one seed such as `path|ts` is mixed in
   - which helper constructor or instance actually performs the final encode
5. validate the signer against one accepted placeholder or baseline request before swapping in real stage values

## Round Hygiene

Treat one fresh page load as one bounded evidence unit.

- preserve `KEY`, `CIPHER`, `ts`, and the accepted baseline request from the same reload
- do not fetch a new time value or bootstrap the page again after you have committed to one round unless you are explicitly proving round rollover behavior
- assume short-lived rounds can expire quickly even when the copied `ts` is technically from the right reload
- if a replay falls back to placeholder data after idle time, test round expiry before rewriting the signer

Many false signer regressions are really round-hygiene failures.

## Runtime Capture Guidance

Prefer small hooks that preserve ordering over deep breakpoint work.

The most useful captures are usually:

- setter traces on `Object.prototype.sign` and `Object.prototype.ts` to show final assignment order
- the final `send(body)` payload or `fetch` request body
- one exported runtime helper pair, for example a digest function plus one seeded encoder constructor
- the exact request path used to build the signer seed

If the target mutates the same field multiple times, keep every write in order and only trust the last write that reaches the real network call.

## Signer Verification Standard

Do not promote a signer formula until it reproduces one accepted baseline sample exactly.

The minimum proof is:

1. preserve one live baseline request
2. recompute the signer locally from the captured field order and seed
3. show byte-for-byte equality between local `calc_sign` and live `sign`
4. only then replace placeholder stage values with real derived values

If the formula does not match the baseline sample, assume one more runtime transform or seed source is missing.

## Local Helper Drift Check

If browser replay accepts but your minimal local JS helper does not, inspect host-object behavior before rewriting the algorithm.

The common shape is:

- browser and local helper share the same visible source text
- browser and local helper enter the same function with the same arguments
- one host object read changes hidden state or branch selection in the browser only

Check tiny browser semantics such as:

- getter versus value property
- whether repeated reads return the same object or a fresh object
- property descriptors and identity equality
- prototype chain and own-property placement

Promote the smallest host-like patch that reproduces browser-known I/O pairs instead of falling back to full-page emulation.

Also test whether the browser is carrying prior-round state that your helper silently reset.

The common shape is:

- round one matches in a fresh helper
- later rounds drift even though the visible source text and direct helper arguments still match
- the browser kept one mutated helper instance, closure state, cookie surface, or bootstrap side effect alive across rounds

Before escalating into "CryptoJS is different" or "transport is blocking replay", preserve one same-page round sequence and replay the earlier rounds locally in order. If parity returns only after prior-round replay, treat the target as a stateful signer ladder rather than a stateless per-round helper.

Also inspect destructive-looking dynamic assignments such as `eval(...)` writes to `window`, `navigator`, or similar globals. In local VM-style runtimes those writes can corrupt the host surface in ways that do not match real browser behavior. Prefer browser-like interception of the proved destructive assignment over broad reimplementation of downstream crypto.

## Step-Key Ladder Guidance

Once one stage is accepted, treat the returned value as next-stage evidence, not as final truth.

For each downstream ciphertext:

- try the previous accepted stage output as raw key material first
- test the smallest symmetric family set that fits the observed key length and block shape
- keep padding and key truncation rules explicit, for example raw key, raw key first `8` bytes, or block-aligned raw key
- prefer printable-result filters and accepted-request validation over speculative deobfuscation

Do not force one family across the whole ladder. Preserve observed family splits as part of the result.

## Artifacts To Preserve

- one fresh-reload baseline sample
- accepted request body and response body per solved stage
- signer input contract, including field order and seed shape
- extracted helper names or runtime offsets
- cipher family candidates tested per stage
- final replayable notes that distinguish verified formulas from inferred ones

## Promotion Boundary

Promote the workflow to replay-ready only when all of the following are true:

- one baseline signer sample is reproduced exactly
- one real-value stage request is accepted under replay
- downstream key usage is validated by a successful decrypt or accepted next-stage request
- family switches are documented instead of silently normalized away

If you only have a plausible signer and one unverified decrypt, keep the result as a runtime-evidence artifact rather than claiming the ladder is solved.
