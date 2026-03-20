# JS Reverse Ops v2 Roadmap

This roadmap is the next capability bar for `js-reverse-ops`. The goal is not "more scripts". The goal is to turn the skill into a reverse-engineering system with stronger evidence closure, stronger anti-analysis resilience, and stronger long-term maintenance value than commodity reverse skills.

## Success Standard

`js-reverse-ops v2` should be able to:

- explain where a protected field or cookie came from
- prove which claims are verified and which are only inferred
- export a stable replay artifact instead of a one-off explanation
- survive common anti-debug and bootstrap hostility
- detect and localize version drift when a target changes
- reuse previous family knowledge without re-learning the same pattern from scratch

## Must Have

These are the highest-value improvements. Without them, the skill is still strong, but not decisively ahead.

### 1. Evidence Scoring and Claim Strength

Add a first-class claim model to every substantial artifact:

- `claim_id`
- `statement`
- `strength`: `verified`, `inferred`, `weak`
- `evidence_sources`: `network`, `hook`, `callframe`, `static`, `server_acceptance`
- `conflicts`
- `last_verified_at`

Why this matters:

- most reverse skills blur observed facts and plausible stories
- evidence scoring makes reports audit-friendly and safer to automate
- drift detection becomes easier when claims are explicit and comparable

Expected outputs:

- `claim-set.json`
- report sections grouped by claim strength
- automatic downgrade when only static evidence remains

### 2. Field and Cookie Provenance Graph

Build a provenance layer for request fields and cookies:

- `token <- sm3(ts + page)`
- `cookie_x <- challenge_response.seed <- /api/preflight`
- `x <- wasm_return <- adapter_branch_7`

This should cover:

- request body fields
- query parameters
- headers
- cookies
- storage-derived values

Expected outputs:

- `provenance-graph.json`
- `provenance-summary.md`
- per-field provenance status: `direct`, `partial`, `unknown`

### 3. Replay Artifact Standardization

Every successful signature or cookie task should be able to produce:

- `replay.js` or `replay.py`
- `env-patch.js` when browser shims are needed
- `sample-corpus.json`
- `divergence-log.json`
- `acceptance-check.json`

Why this matters:

- most skills stop at explanation
- real reverse work usually needs stable replay and regression checks

### 4. Anti-Analysis and Hostility Playbook

Create a dedicated playbook for:

- anti-devtools checks
- anti-hook checks
- timing traps
- one-shot bootstrap closures
- self-defending wrappers
- runtime integrity checks

The output should not only say "anti-debug present". It should say:

- where it is triggered
- what symptom it causes
- which minimally invasive bypass class is appropriate

## Should Have

These are the next wave. They make the skill durable and scalable.

### 5. Drift Detection and Maintenance Workflow

Add a maintenance path for targets that change over time:

- request-contract diff
- IOC diff
- helper-path diff
- bundle family drift
- server acceptance regression

Expected outputs:

- `drift-summary.json`
- `claim-diff.json`
- `risk-regression.md`

### 6. Family Library and Routing Memory

Promote recurring site patterns into reusable family records:

- remote corejs monolith
- helper page plus protected runtime
- launcher page plus app shell
- module or wasm hidden endpoint
- cookie written after challenge response
- header token plus body token split
- runtime non-200 but contract partially correct

Each family should include:

- trigger signals
- common misleading signals
- first 3 actions
- preferred runtime hooks
- expected failure modes

### 7. Runtime Trigger Strategy Library

Some failures are not algorithm failures. They are trigger failures.

Add reusable trigger classes:

- first-load passive capture
- pagination trigger
- button or helper trigger
- reload with preload hook
- alternate route or data-shell trigger

Expected outcome:

- the skill should stop treating a `403` as only a signing problem
- it should explicitly ask whether the trigger path is wrong

### 8. Better Runtime Capture Coverage

Extend the standardized runtime capture layer to include:

- `document.cookie` writes
- storage diffs
- header mutation
- fetch/XHR body snapshots
- high-signal crypto helper calls
- wasm export and import hints

This closes the gap between "request seen" and "generation chain explained".

## Could Have

These are differentiators after the core system is stable.

### 9. Semi-Automatic Anti-VM Diagnosis

Instead of just extracting VM structure, diagnose the current blocker stage:

- dispatcher unresolved
- bind slot wrong
- trampoline wrong
- receiver wrong
- flag math unknown
- helper map incomplete

This should recommend the next smallest action automatically.

### 10. Cross-Language Replay Export

Given one verified runtime bundle, generate:

- Node-first replay
- Python replay
- optional curl-compatible request specimen

Only export Python when the logic is already stable enough.

### 11. Family-Level Benchmark Suite

Keep a benchmark corpus of representative targets and expected outputs.

Measure:

- protected endpoint recovery rate
- accepted replay rate
- claim verification rate
- false helper-endpoint promotion rate
- time-to-first-truth

This turns the skill from "looks capable" into "measurably stronger".

### 12. Operator Review Mode

Add a compact review view for humans:

- top verified claims
- unresolved blockers
- strongest misleading signals
- next best action

This improves collaboration when a reverse job spans multiple sessions.

## Recommended Delivery Order

### Phase 1: Must Do Now

1. claim scoring
2. provenance graph for fields and cookies
3. replay artifact standardization
4. anti-analysis playbook

### Phase 2: Should Do Next

1. drift workflow
2. family library
3. trigger strategy library
4. richer runtime capture coverage

### Phase 3: Differentiators

1. semi-automatic anti-VM diagnosis
2. cross-language replay export
3. benchmark suite
4. operator review mode

## Design Rules

As the skill grows, keep these constraints:

- do not add features that produce more guesses than evidence
- do not add replay export before preserving divergence logs
- do not add anti-analysis bypasses without recording the original hostile signal
- do not store family knowledge only in prose; capture machine-usable trigger signals
- do not promote a new automation step unless it improves verification or maintenance

## Immediate Next Actions

If implementing v2 incrementally, start here:

1. add `claim-set.json` and `risk-summary.json` to the output contract
2. add a provenance artifact for request fields and cookies
3. extend the runtime exporter so every topic bundle can include claim strength and provenance placeholders
4. add a benchmark summary over the existing validation corpus

Progress note:

- `claim-set.json`, `risk-summary.json`, `provenance-graph.json`, and `operator-review.md` are now part of the bundle workflow
- family-level benchmark and corpus indexing now run over the validation corpus
- the next deepening step is tighter callframe-backed provenance, not more heuristic-only edges
