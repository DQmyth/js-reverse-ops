# Stage Gates & Fallbacks

Hard entry/exit conditions for the four stages, time-boxes, and the fallback
chain to climb when a stage stops producing progress. Inspired by community
RE agent workflows (stage latches, time-boxed replanning) but verified
against the practice-set corpus (topics 22-29, 24).

## Why gates matter

The most expensive failures in the recorded cases were **stage-latch
violations**: replay work started before runtime truth existed (topic 24,
four sessions), or fingerprint hunting continued after the evidence had
already exonerated the environment (topic 24, misdiagnosis M1). A gate is a
cheap written check that stops the drift.

## Stage gates

### Locate → Runtime/Recover

- MUST have: the real protected request captured (URL + method + response
  shape), or an explicit "no protected request; it is computed client-side"
  verdict with evidence.
- MUST have: family classification (remote-corejs monolith, inline page,
  JSVMP, module/wasm, ...) recorded in the bundle.
- MUST NOT: claim "static analysis done" before the entry script is
  identified; a decoded-looking tail is not an entrypoint.

### Runtime → Recover

- MUST have: at least one captured request with its triggering call path
  (initiator stack, hook trace, or paused frame), or proof the request is
  assembled without user interaction.
- MUST have: signer input fields labeled with provenance (`verified` /
  `inferred` / `unknown`) — unproven fields MUST be listed, not guessed.
- MUST NOT: enter Recover while a hook can still answer the question
  cheaper (hook-preferred principle).

### Recover → Replay

- MUST have: either (a) readable artifacts that a maintainer can re-derive
  the signer from, or (b) a decision to run the target **verbatim** with a
  stub harness (recipes: [env-rebuild-recipes.md](env-rebuild-recipes.md))
  — including a calibration oracle wired before first use.
- MUST have: the divergence class named (random-IV / time-derived /
  timer-self-check / env-gate / unknown) if a previous replay attempt
  failed. "Unknown" is allowed but must be recorded.
- MUST NOT: hand-transcribe combinatorial env-gated constants (step 5b of
  the env-gated playbook).

### Replay → Report

- MUST have: a **cross-run stable** result (totals identical between two
  clean runs) — a single 200 is not acceptance (misdiagnosis M2).
- MUST have: token freshness discipline verified (per-page fresh clock,
  inline forwarding).
- MUST have: answers/claims labeled `verified-live`, `verified-local`, or
  `inferred`; server-accepted samples preserved.

## Time-boxes

| Stage | First-pass budget | On timeout |
|---|---|---|
| Locate | 30-45 min | switch to runtime-first evidence capture (stop static guessing) |
| Runtime | 45-60 min | narrow to the single smallest request; drop UI probing |
| Recover | 60-90 min | prefer verbatim execution; only enter opcode semantics if the verbatim route is blocked |
| Replay | 45 min | reduce to parameterized transport; leave unresolved signers explicit |

Timeouts are budgets, not deadlines: if a stage is still producing new
verified evidence, continue — the box applies when it is **not**.

## Fallback chain (climb in this order when stuck)

1. breakpoints/paused frames → back to request observation + hooks
2. source-code guessing → back to runtime evidence
3. Node environment rebuild → back to page-side forensics (JSRPC / proxy)
4. deep deobfuscation → back to the minimal verifiable chain (verbatim
   harness; parameterized transport)
5. a "different value in the same step" divergence → check
   [misdiagnosis-patterns.md](misdiagnosis-patterns.md) M1/M3 first (clock,
   timers) before adding any stub

## Deadlock rule

If two consecutive moves in a stage produced no new verified evidence and no
new captured artifact: (a) write the dead end into `dead-ends.md`, (b) pick
the next fallback above, (c) if every fallback is exhausted, stop and report
with the explicit blocker — do not keep iterating the same probe.
