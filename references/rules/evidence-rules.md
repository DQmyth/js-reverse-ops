# Evidence Rules

These rules apply across every `js-reverse-ops` workflow, regardless of family.

## Core Rules

- Prefer verified runtime evidence over plausible static interpretation.
- Prefer durable on-disk artifacts over conversational memory.
- Label conclusions as `verified`, `inferred`, `weak`, or `unknown`.
- Do not upgrade a bundle because it is structurally complete. Bundle completeness and reverse completion are separate.
- When one theory is disproved by browser-truth parity checks, retire it explicitly in the bundle instead of leaving it as a live branch.
- Do not keep citing an older transport, cookie, crypto, or timing theory after preserved runtime evidence has ruled it out.

## Promotion Rules

- `bootstrap-only` means the bundle only has scaffold-derived structure.
- `source-snapshot-imported` means local source material exists, but reverse conclusions are still thin.
- `static-analysis-generated` means source-driven extraction exists, but protected contract or replay parity is still unverified.
- `runtime-captured` means runtime request evidence exists, but acceptance or parity is not yet established.
- `runtime-accepted` means runtime evidence includes accepted server behavior.
- `replay-scaffolded` means replay code exists, but replay parity is not yet demonstrated.
- `replay-attempted` means replay validation artifacts exist, but verification criteria are not met.
- `replay-verified` requires non-synthetic replay evidence, accepted replay behavior, and parity checks strong enough to trust the replay.

## Validation Rules

- Synthetic runtime or replay artifacts are useful for pipeline testing, but they must never be treated as real acceptance proof.
- A `403` or equivalent rejection is still evidence, but it does not justify promotion beyond `runtime-captured` or `replay-attempted`.
- Accepted replay and replay parity should be supported by preserved validation artifacts, not only a final flag.
- When replay parity fails, preserve at least one browser-known input/output pair for the disputed helper or request boundary, so later sessions can compare local output against browser truth instead of restarting from source reading.
- Preserve replay-negative evidence with the same care as replay-positive evidence. A ruled-out cookie seed, timestamp theory, RNG theory, or helper branch is part of the evidence closure.
