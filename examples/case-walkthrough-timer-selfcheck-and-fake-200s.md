# Case Walkthrough: Timer Self-Checks, Time-Derived Keys, and the 200-Fake-Data Maze

A sanitized walkthrough of two practice-set targets whose failures looked
like "environment fingerprint mismatch" but were actually **clock and
self-check problems**. Techniques: `../references/env-rebuild-recipes.md`
cards 4 and 9; playbook steps 5c and 5e; full pattern list in
`../references/misdiagnosis-patterns.md`.

## Target A: byte-code VM whose later tokens silently go empty

Symptoms: the harness produced a valid first token (server 200) but every
pagination call emitted an empty token. No exceptions were visible; diffing
sandbox globals before/after the failing call showed no change at all.

What localized it:

- runtime-patch the VM interpreter's own catch
  (`catch(e){ if(!s.length) throw e;` → insert logging) to dump every
  bytecode-swallowed exception: **zero entries**, proving the empty token
  was a branch, not an exception.
- then compare what the sandbox *fails to do over time*: the shell runs its
  environment self-check inside `setTimeout`/`setInterval` callbacks —
  enumerating deliberate `Error`/`TypeError`/... constructor messages and
  URI-malformed probes as fingerprint input. A harness with synchronous or
  no-op timer stubs never runs the self-check, and the token branch
  degrades to empty.

Fix: hand the sandbox the host's real timers (each callback wrapped in
try/catch), wait a few seconds after boot, and install
`process.on('uncaughtException'/'unhandledRejection')` no-ops — the
deliberate probe throws escape function-level try/catch via Promise
microtasks.

## Target B: "different derived key strings" that were just clocks

Symptoms: two environments produced byte-identical evidence streams except
for one trailing "derived key string" — different lengths, different
digits. Four working sessions were spent hunting a missing environment
fingerprint.

What disproved it:

- key-name-level diff of the preserved charCode streams showed **both**
  sides reading the same trailing string near the end — the "mismatched
  key" of each side sat right next to it;
- each side's "key" matched its own wall-clock moment (the browser baseline
  ran minutes after the sandbox's frozen clock).

The digits were time-derived data stored as number-as-charcode strings.
The sandbox froze the server-time endpoint days in the past, so every
token embedded an expired now: the 403s were TTL expiries, not fingerprint
failures. Fix: refresh the clock before every page and forward each request
the instant its token is computed.

## The maze: 200 with random fake data

Both targets' platforms defend against mistimed or replayed tokens with a
final trap: the server answers **200 with random plausible data**. One
accepted submission recorded "every page 200 yet wrong answer". The honest
success metric is a **cross-run stable total** — real challenge data is
identical between clean runs, maze data differs every time.

## Takeaway checklist

1. Freeze clocks; run the same environment twice; label stream segments as
   random-IV vs deterministic before diffing anything.
2. Re-capture one side minutes apart: strings that track wall-clock time
   are time-derived, not environment gates.
3. Verify timers are real and the boot waited before blaming branches.
4. Trust totals that repeat, not responses that return.
