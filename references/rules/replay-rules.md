# Replay Rules

Use these rules whenever generating replay code or validating replay results.

## Replay Scaffolds

- Replay scaffolds are starting points, not proofs.
- Placeholder payload fields, cookies, headers, timestamps, or signatures must be replaced before replay claims are promoted.
- A replay scaffold can promote bundle maturity to `replay-scaffolded`, but never to `replay-verified`.

## Replay Validation

- Replay validation artifacts must record whether they are synthetic.
- `accepted=true` only if the replay request is truly server-accepted.
- `parity_confirmed=true` only if request contract and behavior match runtime truth closely enough to trust the replay.

## Verification Gate

To reach `replay-verified`, all of these must be true:

- replay validation is non-synthetic
- replay was accepted
- parity is confirmed
- replay/runtime comparison supports the parity claim

If any of those is missing, keep the bundle below `replay-verified`.
