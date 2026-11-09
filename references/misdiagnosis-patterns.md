# Misdiagnosis Patterns (Read Before Deep-Diving)

Recurring wrong turns in JS reverse engineering, each with the **decoy
symptom**, the **wrong attribution** people commit to, the **fast empirical
test** that disproves it, and the real cause. All verified on real targets
(practice-set topics 22-29 and 24). If you have spent more than one working session
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

## M8 — Execution-surface fingerprint changes target behavior

- Decoy: the target site works in a plain-CDP session but a "better"
  anti-detection MCP (Patchright-style silent navigation, hidden
  Runtime.enable) never triggers the protected request.
- Wrong turn: blaming the site, the login state, or the capture tool's
  request filter.
- Fast test: replay the same page via plain CDP (`Page.reload` with our own
  `cdp_minibrowser.js`) and compare — if the token request fires there but
  not under the stealth surface, the shell is probing the execution surface
  itself and silently degrading.
- Real cause (recorded case, practice topic 24): jsvmpzl-family VMs probe
  their execution environment; a silent/stealth navigation profile is a
  DIFFERENT fingerprint, not a safer one. Fix: capture runtime truth with the
  plain surface, and trigger the flow in-page (`evaluate_script` click) when
  you must keep the stealth session.

## M5b — document.all exists in Chrome, is truly undefined in jsdom

- Decoy: a probe like `document.all.someFlag` crashes the harness with
  `Cannot read properties of undefined` although the same code runs fine in
  the browser.
- Wrong turn: assuming the VM is incompatible with jsdom wholesale and
  dropping the full-page verbatim route.
- Fast test: `typeof document.all` — Chrome reports `"undefined"` (the
  [[IsHTMLDDA]] lie) while the object exists and property access works;
  jsdom's is genuinely undefined.
- Fix (recorded case, practice topic 30): prelude-define a Proxy collection
  on `document.all` that resolves string keys via `getElementById` — enough
  for flag probes; accept the typeof difference.

## M2b — stable-but-wrong data from a dead session

- Decoy: cross-run stable totals (the M2 metric!) that still submit wrong,
  because every run used the same EXPIRED session — stable garbage is still
  garbage.
- Wrong turn: trusting the stability metric alone.
- Fast test: BEFORE collecting, hit a cheap identity endpoint
  (`/api/user` style) and assert the login state; re-assert after collecting.
- Recorded case (practice topic 30): an expired session produced a perfectly
  stable wrong total; only the submission response (`not login`) revealed it.

## M10 — expired-token 403s misread as environment-detection failures

- Decoy: every protected-API call returns 403 under your harness; stealth
  surfaces also "fail"; you conclude the target's anti-automation defeated
  the execution surface.
- Wrong turn: escalating stealth/armoring the browser while the real cause is
  a stale page token (the #token/cipher bootstrap has a TTL).
- Fast test: READ THE RESPONSE BODY first — an explicit "Expired or Invalid."
  (or similar) message exonerates the environment instantly. Re-load the page
  for a fresh token and retry before touching any stub.
- Recorded case (spiderbuf c14, external corpus): three "failed stealth"
  conclusions were all expired-token 403s; reload + immediate re-request
  succeeded on the plain CDP surface.

## M11 — S-box environment gating (WASM crypto)

- Decoy: WASM-implemented crypto fails in ANY sandboxed/headless environment;
  UA override + webdriver=false don't help; the key in memory looks correct.
- Wrong turn: assuming the key is wrong (it isn't — it's the S-box being
  silently corrupted by environment-probe import functions).
- Fast test: dump WASM memory after aes_init in both environments; diff the
  S-box area (not the key area). Headless K-values corrupt S-box entries.
- Recorded case (topic 31): K0-K19 import functions modified S-box bytes
  at offsets 40 and 55; non-headless Chrome produced correct values and the
  same key; solution required a visible (non-headless) browser.

## M11 addendum — WASM-VM: the S-box theory was incomplete

WAT decompilation revealed the WASM itself contains an embedded VM interpreter
(func 63, called 25x by encrypt and 43x by aes_init). The K/E import values
don't just modify S-box bytes — they influence the VM's bytecode interpretation
path. "S-box environment gating" (M11) is the observable symptom; the actual
mechanism is VM-path gating.

## M11 resolution — pure-algorithm extraction DID succeed (topic 31 closed)

The "multi-day VM reversal" estimate above was wrong in an important way: the
embedded VM never needs to be reversed, because **verbatim WASM execution makes
the VM irrelevant**. What the offline path actually required:

1. **Plaintext format** — recovered by injecting a CALL-trace into the target's
   own JSVMP interpreter via Fetch-domain response interception (no global
   touched): `/api/question/{n}{now_ms}{n}(kjskj){page}1` — `(kjskj)` is a
   fixed literal, `now_ms` is the full 13-digit `/api/getTime` value.
2. **True K/E stub values** — K0-K19 = [48,240,165,18,82,106,133,245,196,70,
   194,108,232,97,155,65,2,8,32,128], E0-E15 all 0. Feeding these as plain
   `() => i32` imports into a fresh Node instantiation + `aes_init()` reproduces
   the browser's cipher state bit-for-bit.
3. **Calling convention** — `encrypt(inPtr, inLen, outPtr)` returns the base64
   length and writes the base64 token at outPtr.

Node-only collector: 5/5 pages HTTP 200, zero browser. The proportionate
response to a WASM-embedded VM is therefore: trace the JS-side call, snapshot
the import-stub contract, run the module verbatim — see M12 for the trap that
cost the most time on the way there.

## M12 — Hook self-poisoning (the observer changes the key)

- Symptom: offline reproduction matches the browser token **byte-for-byte**,
  yet the server answers 403 token failed.
- Disproof: compare the first 16 base64 chars of tokens across page loads
  (CBC block 1 of a constant plaintext prefix). Different sampling methods
  yield different prefixes → the cipher state itself depends on HOW you
  observe it, not just on the environment.
- Cause: wrapping `WebAssembly.instantiate` (or any global) to sample K/E
  import returns is detectable by the loader (toString is no longer
  `[native code]`). On detection the E-stubs return poisoned values (here:
  E5 → 4096 instead of 0) and the module routes to a **decoy key schedule**.
  The hooked browser and your replica agree with each other — both are wrong
  against the server.
- Fix (sampling side): inject tracing INSIDE the target's own code via
  Fetch-domain response modification — it never touches globals, so the
  loader can't see it.
- Fix (recovery side): when you already hold one genuine (plaintext, token)
  pair, brute-force the single suspect stub (E5 over common values — the
  true value surfaced within ~30 tries) until the offline output matches the
  genuine token prefix. One confirmed stub recovers the whole state.
- Recorded case (topic 31): E5 poison value 4096 produced a fully
  self-consistent cipher that the server rejected; true E5=0 matched the
  unhooked-browser token exactly.
