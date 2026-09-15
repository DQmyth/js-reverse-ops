# js-reverse-ops

[中文说明](README.md)

A production-grade JavaScript reverse-engineering **skill package** for coding
agents (Codex / Claude-style harnesses). The goal is not "understand some
obfuscated code" — it is to take a real web target from page triage, runtime
forensics, deobfuscation, and signature recovery all the way to a
reproducible Node/Python replay, with evidence on disk at every step.

## Install
[5-minute tutorial](TUTORIAL.md) — zero to first solve using gym targets as safe teaching material.



```bash
# Claude Code (plugin marketplace)
/plugin marketplace add DQmyth/js-reverse-ops
/plugin install js-reverse-ops@js-reverse-ops

# or the generic Agent Skills way (npx skills)
npx -y skills add DQmyth/js-reverse-ops

# or plain git clone (works with any SKILL.md-capable agent)
git clone https://github.com/DQmyth/js-reverse-ops ~/.agents/skills/js-reverse-ops
```

Requires Node.js >= 18 and Python 3 with requests; a debug Chrome (CDP 9222)
is optional and only needed for runtime-truth capture.

## Why this is different

Most reverse-engineering notes stop at "this code probably does X". This package is an engineering pipeline:

- **Four stages with hard gates**: `Locate → Runtime → Recover → Replay`, each with entry/exit evidence conditions, time-boxes, and an ordered fallback chain — no replay work before runtime truth, structured retreat instead of grinding
- **Verbatim-execution philosophy**: local reproduction never hand-ports the algorithm; the target's own code runs in a precisely stubbed sandbox with an in-process calibration oracle — combinatorial environment gates (per-word IV ternaries, per-character encoder branches) always leak branches under hand-porting
- **Misdiagnosis immunity**: 8 field-proven wrong-attribution patterns (time-derived keys, 200-fake-data mazes, timer-driven self-checks, host-eval scope leaks, class-source leaks, random-IV vs gate, helper traps, execution-surface fingerprints), each with symptom → fast disproof → real cause, plus executable triage tooling
- **Evidence on disk**: every run emits evidence / claim-set / risk-summary / misdiagnosis-checklist / provenance / replay-status artifacts with verified/inferred/unknown labels
- **Gets stronger with use**: pattern-outcome telemetry feeds back into ranking weights; real-target symptoms harvest into review-gated regression drafts

## Capabilities not yet seen in this tool class

- **Capability gym**: one self-contained synthetic challenge per misdiagnosis pattern, solved end-to-end with the standard recipes only, with control groups asserting the wrong approach fails exactly as documented — regression testing for **problem-solving ability itself**, not just code:
  ```bash
  node scripts/gym_generate_targets.js --out gym-targets && node scripts/gym_run.js
  ```
- **Divergence auto-triage**: feed run captures (clock + key strings); classifies random-IV vs time-derived vs timer-self-check vs real environment gate; `--plan` prints the ordered control experiments first
- **JSVMP interpreter-catch hook**: one command makes a bytecode VM log every exception it swallows — separating exceptions from silent branches
- **Obfuscation family fingerprints**: 6 families (commercial JSVMP, eval-packing, opaque-predicate bloat, string-array rotation, env-gated constants, timer-selfcheck shells) with lexical signatures and a detector — fingerprint-driven routing instead of code-reading guesses
- **Three test layers + dual evals**: unit/property/integration on node:test (zero deps; property layer validates generator iron-rule invariants under randomized parameters) + 49 routing benchmarks + 24 trigger evals — `make check` green in one command
- **Release safety gate**: export allowlist + sensitive-token scanning (with an end-to-end blocking test: planted dirty content must fail the export) + cross-run stable-total acceptance criteria
- **Zero-dependency execution surface**: built-in CDP minibrowser (list/new/eval/capture) and a harness scaffold generator (vm/jsdom × call/handler/click) cover the minimal loop without any MCP; community reverse MCPs slot in as the execution surface with this skill owning methodology

## Layout

| Path | Contents |
|---|---|
| `SKILL.md` | public skill entry: scope, core workflow, best-tool baseline |
| `references/` | deep references: task types, stages, hooks, env-rebuild recipes, misdiagnosis patterns, stage gates, toolchain bootstrap, workflow cookbook |
| `playbooks/` | 19 battle-tested playbooks (fresh-reload ladders, env-gated crypto, XHR-rewrite signer, wasm signers, grid challenges, ...) |
| `scripts/` | 130+ scripts: triage, string-table recovery, VM opcode pipelines, hook scaffolds, CDP minibrowser, evidence normalization |
| `assets/` | pattern index, benchmark cases, trigger evals, anti-detection profiles, capability models |
| `examples/` | sample inputs/outputs, MCP execution records, sanitized case walkthroughs, a runnable env-gate demo |

## Highlights

- **Env-rebuild recipe cards** (`references/env-rebuild-recipes.md`): 10
  verified cards — native-masked classes, `Symbol.toStringTag` class-tag
  probes, "no host builtins/eval into vm contexts", real timers with
  microtask-exception no-ops, getter-only redefinition, fresh-context
  per-page signers, inline proxy, in-process calibration oracles.
- **Misdiagnosis patterns** (`references/misdiagnosis-patterns.md`): the
  fastest way to stop burning sessions on the wrong theory.
- **Divergence triage** (`scripts/detect_env_divergence.js`): feed run
  captures, get a verdict — random-IV vs time-derived-key vs
  timer-self-check vs environment-gate; `--plan` prints the ordered control
  experiments before you run anything.
- **JSVMP interpreter-catch hook**
  (`scripts/hook_vm_interpreter_catch.js`): one command makes a bytecode VM
  log every exception it swallows.
- **Runnable gate demo** (`examples/sample-verbatim-harness.js`):
  experience in one file why verbatim execution with precise stubs beats
  hand-porting a gated signer.

## Quick start

```bash
# dependency health
python3 scripts/check_js_reverse_ops_deps.py

# triage a target file or URL
node scripts/js_reverse_ops.js <target-url-or-file> --json

# trigger-description eval smoke pass
node scripts/run_trigger_evals.js

# run the public regression suite
node scripts/run_public_benchmarks.js
```

## Publication safety

Site names, credentials, captured fixtures, and per-site case notes are
intentionally excluded from this repository by an export manifest plus a
sensitive-token scan. See [PUBLISHING.md](PUBLISHING.md).

## Changelog

See [CHANGELOG.md](CHANGELOG.md). Recent releases: v0.1.19–v1.0.0 (2026-09).
