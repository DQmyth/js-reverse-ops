# Misdiagnosis Patterns (Read Before Deep-Diving)

Recurring wrong turns in JS reverse engineering, each with the **decoy
symptom**, the **wrong attribution** people commit to, the **fast empirical
test** that disproves it, and the real cause. All verified on real targets
(yuanrenxue match 22-29, 24). If you have spent more than one working session
blaming "environment fingerprints", read this file top to bottom before
writing more probes.

## M1 — Time-derived data mistaken for an environment gate

- Decoy: two environments produce "different derived key strings"; streams
  are byte-identical everywhere else.
- Wrong turn: hunting a missing fingerprint for days (four rounds in the
  recorded case).
- Fast test: **re-capture one side minutes apart and diff again.** If the
  "key" tracks wall-clock time, it is time-derived data, not an environment
  gate. Also compare the trailing reads of both charCode streams — the same
  trailing string on both sides is the giveaway.
- Real cause (recorded case): the harness froze `getTime` days in the past;
  tokens embedded an expired now. Fix was refreshing the clock per page, not
  fixing the environment.

## M2 — HTTP 200 with random fake data

- Decoy: every page returns 200 with well-formed, plausible payloads — yet
  the submitted total is "wrong answer".
- Wrong turn: treating a single 200 as success and moving to reporting.
- Fast test: **run the full capture twice and compare totals.** Real
  challenge data is stable; maze/fake data differs every run.
- Real cause: TTL/fingerprint mazes answer mistimed or replayed tokens with
  200 + random plausible payloads. Success metric = cross-run stable total,
  plus token-freshness discipline (inline proxy, per-page clock refresh).

## M3 — Timer-driven self-check never ran

- Decoy: first token valid, every later token empty/divergent; zero
  exceptions, zero global-state change.
- Wrong turn: concluding "branch logic is broken" and hand-patching the
  branch.
- Fast test: hand the sandbox the host's real timers (callbacks wrapped in
  try/catch), wait seconds after boot, retest. Also runtime-patch the
  interpreter's own `catch(e){if(!s.length)throw e;` to log swallowed
  exceptions — zero entries proves it is a branch, not an exception.
- Real cause: fingerprint self-checks (Error-constructor enumeration, URI
  probes) run inside `setTimeout`/`setInterval` callbacks; deliberate probe
  throws escape via Promise microtasks, so `uncaughtException` no-ops are
  required.

## M4 — Host eval / builtins leaked into the sandbox

- Decoy: `ReferenceError: document is not defined` from `eval` frames; all
  environment probes fail despite complete stubs.
- Wrong turn: adding more and more stubs for globals that clearly exist.
- Fast test: inspect where the payload executes — indirect `eval(payload)`
  with a host `eval` passed into the sandbox resolves free variables against
  the **host global**.
- Real cause: scope-chain binding. Fix: sandbox holds only BOM/DOM stubs;
  ECMAScript builtins come from the vm context itself.

## M5 — jsdom class-source leakage

- Decoy: environment probes pass superficially but fingerprint hashes
  differ; or the page aborts with a bytecode-level throw (`Normal Error #0`
  family).
- Wrong turn: aligning yet another visible property and re-trying.
- Fast test: print `String(window.Document)` inside the harness — class
  transpilers emit source, Chrome emits `function Document() { [native code] }`.
  Same for `Object.prototype.toString.call(document)` tags.
- Real cause: probe compares constructor stringification. Fix: replace
  globals with plain functions whose `toString` is native-masked, and satisfy
  class-tag probes with `{ [Symbol.toStringTag]: 'HTMLDocument' }`.

## M6 — Random IV mistaken for an environment gate (and vice versa)

- Decoy: two runs of the same harness produce different tokens.
- Wrong turn: either chasing the difference as an environment gate (it may be
  a random IV) or dismissing a real gate as randomness.
- Fast test: run the **same** environment twice, then two **different**
  environments with a frozen clock. Same-env divergence = random IV
  (deterministic filler should match in the non-IV segments); cross-env
  divergence under a frozen clock = real gate.
- Recorded lesson: label every stream segment as `random-iv` or
  `deterministic` before diffing.

## M7 — Helper endpoints and 200s accepted as the protected request

- Decoy: page exposes `/api/answer` (or similar) and it returns data.
- Wrong turn: solving the helper and ignoring the protected request.
- Fast test: check whether the helper survives with scripts blocked; the
  protected request is whatever a paused frame or network initiator proves.
- Real cause: training pages deliberately ship helper endpoints and, per M2,
  may fake 200s for wrong tokens. Verify data authenticity by cross-run
  stability before solving toward it.

## Quick triage order when a rebuilt flow "almost works"

1. Freeze clocks and diff same-env twice (M6) → classify segments.
2. Diff streams key-name-level, not line-level (M1).
3. Check timers are real and the boot waited (M3).
4. Check no host builtins/eval entered the sandbox (M4).
5. Only then add more environment alignment (M5, getter-only properties).
6. Validate data authenticity per M2 before summing or submitting.
