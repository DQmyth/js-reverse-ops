# js-reverse-ops

[中文说明](README.md)

A production-grade JavaScript reverse-engineering **skill package** for coding
agents (Codex / Claude-style harnesses). The goal is not "understand some
obfuscated code" — it is to take a real web target from page triage, runtime
forensics, deobfuscation, and signature recovery all the way to a
reproducible Node/Python replay, with evidence on disk at every step.

## Install

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

Most reverse-engineering notes stop at "this code probably does X" or "here
is the sign function". This package is an engineering pipeline:

- **Locate → Runtime → Recover → Replay**: four explicit stages with hard
  evidence gates; runtime truth beats static guessing, hooks beat
  breakpoint stepping.
- **Verbatim execution over hand-porting**: when browser JS must run
  locally, run the target's own code in a sandbox with precise stubs — and
  calibrate against a captured oracle before trusting any token.
- **Misdiagnosis first-aid**: 7 recurring wrong attributions (time-derived
  data mistaken for environment gates, 200-with-fake-data mazes,
  timer-driven self-checks, host-eval scope leaks...) each with a fast
  disproof test — encoded as both docs and executable tooling.
- **Evidence on disk**: runs produce `evidence.json`, `claim-set.json`,
  `risk-summary.json`, `provenance-graph.json`, `replay-status.json`, and an
  operator review — not chat conclusions.
- **Benchmarked**: 49 public regression cases (routing, playbooks, pattern
  memory, misdiagnosis triage) plus a description-trigger eval suite, with
  a one-command runner.

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

See [CHANGELOG.md](CHANGELOG.md). Recent releases: v0.1.19–v0.1.33 (2026-09).
