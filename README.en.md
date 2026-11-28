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

Requires Node.js >= 18 and Python 3 with requests; run `npm install` once in the
cloned folder — a few tools need three small parser packages (esprima, estraverse,
escodegen), and webcrack is an optional dependency for obfuscator.io string tables
(Node 22 or 24). A debug Chrome (CDP 9222) is optional and only needed for
runtime-truth capture.

## Why this is different

Most reverse-engineering notes stop at "this code probably does X". This package is an engineering pipeline:

- **Four stages with hard gates**: `Locate → Runtime → Recover → Replay`, each with entry/exit evidence conditions, time-boxes, and an ordered fallback chain — no replay work before runtime truth, structured retreat instead of grinding
- **Verbatim-execution philosophy**: local reproduction never hand-ports the algorithm; the target's own code runs in a precisely stubbed sandbox with an in-process calibration oracle — combinatorial environment gates (per-word IV ternaries, per-character encoder branches) always leak branches under hand-porting
- **Misdiagnosis immunity**: 16 field-proven wrong-attribution patterns (M1–M15 plus two variants; the first eight: time-derived keys, 200-fake-data mazes, timer-driven self-checks, host-eval scope leaks, class-source leaks, random-IV vs gate, helper traps, execution-surface fingerprints), each with symptom → fast disproof → real cause, plus executable triage tooling
- **Evidence on disk**: every run emits evidence / claim-set / risk-summary / misdiagnosis-checklist / provenance / replay-status artifacts with verified/inferred/unknown labels
- **Gets stronger with use**: pattern-outcome telemetry feeds back into ranking weights; real-target symptoms harvest into review-gated regression drafts

## Capabilities not yet seen in this tool class

- **Capability gym**: one self-contained synthetic challenge per misdiagnosis pattern, solved end-to-end with the standard recipes only, with control groups asserting the wrong approach fails exactly as documented — regression testing for **problem-solving ability itself**, not just code:
  ```bash
  node scripts/gym_generate_targets.js --out gym-targets && node scripts/gym_run.js
  ```
- **Divergence auto-triage**: feed run captures (clock + key strings); classifies random-IV vs time-derived vs timer-self-check vs real environment gate; `--plan` prints the ordered control experiments first
- **JSVMP interpreter-catch hook**: one command makes a bytecode VM log every exception it swallows — separating exceptions from silent branches
- **What a file is, by structure — and an unbundler that needs no parser**: `inspect_obfuscation_family.js` decides from what each tool actually emits — javascript-obfuscator string tables (layout, plain / base64 / rc4), control-flow flattening, the classic eval packer, webpack 4 / 5 bundles and chunk files, esbuild output around them, browserify bundles — held by its test to 53 files; `unbundle.js` cuts a bundle — or a bundle with the chunk files it loads, its runtime file included — into one file per module and a tree that does what the inputs did (webpack 4.47 and 5.113 in production, development, as ES module, with lazy chunks, a shared chunk and runtimeChunk; browserify 17; esbuild 0.27 around one bundle; and one bundle nobody here built, esprima's distribution file, whose tree parses to the same AST)
- **Three test layers + dual evals**: unit/property/integration on node:test (no test framework of its own; the tools under test need three small parser packages via `npm install`; the property layer validates generator iron-rule invariants under randomized parameters) + 50 public regression benchmarks + 24 trigger evals — `make check` green in one command
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
# the few dependencies the tools have
npm install

# dependency health
python3 scripts/check_js_reverse_ops_deps.py

# triage a target file or URL
node scripts/js_reverse_ops.js <target-url-or-file> --json

# trigger-description eval smoke pass
node scripts/run_trigger_evals.js

# run the public regression suite
node scripts/run_public_benchmarks.js

# a bundle: what it is, then one file per module (the shipped samples work as they are)
node scripts/inspect_obfuscation_family.js tests/fixtures/static-toolchain/split-webpack-5/main.js
node scripts/unbundle.js tests/fixtures/static-toolchain/webpack-5.production.js --out /tmp/tree
node /tmp/tree/runtime.js          # prints what node tests/fixtures/static-toolchain/src/entry.js prints
# a bundle that loads chunks: the bundle first, the chunk files after it — one tree
node scripts/unbundle.js tests/fixtures/static-toolchain/split-webpack-5/main.js \
  tests/fixtures/static-toolchain/split-webpack-5/lazy-a.js tests/fixtures/static-toolchain/split-webpack-5/lazy-b.js --out /tmp/tree-split
node /tmp/tree-split/runtime.js    # prints what node tests/fixtures/static-toolchain/srcsplit/entry.mjs prints
```

## Publication safety

Site names, credentials, captured fixtures, and per-site case notes are
intentionally excluded from this repository by an export manifest plus a
sensitive-token scan. See [PUBLISHING.md](PUBLISHING.md).

## Changelog

See [CHANGELOG.md](CHANGELOG.md) — the entry on top is the latest release.
