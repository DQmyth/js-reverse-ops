---
name: js-reverse-ops
description: Execute advanced JavaScript reverse-engineering workflows for modern web applications, including signature recovery, runtime instrumentation, deobfuscation, bundle analysis, anti-debug bypass, environment rebuild, and replay validation.
---

# JS Reverse Ops

Use this skill as a structured reverse-engineering workflow, not an ad hoc debugging session.

## Scope

This public release keeps:

- stage-based routing for `Locate`, `Runtime`, `Recover`, and `Replay`
- reusable scripts for extraction, runtime capture normalization, replay scaffolding, and artifact generation
- generic references, rules, and templates for browser-driven JavaScript reverse engineering

This public release intentionally excludes:

- private or site-specific case libraries
- captured test fixtures and validation corpora
- concrete benchmark targets, credentials, and replay notes tied to named sites

## Core Workflow

Start from the smallest reliable context:

- local JS or HTML target: run `scripts/triage_js.sh <path>` and then the smallest extractor that matches the target family
- browser-backed target: verify browser and bridge health before collecting runtime evidence
- packed or VM-like code: preserve the original artifact, recover structure incrementally, and label verified semantics
- replay handoff: export a stable artifact bundle before writing Node or Python delivery code

## Primary References

- `references/task-types.md`
- `references/stages/locate.md`
- `references/stages/runtime.md`
- `references/stages/recover.md`
- `references/stages/replay.md`
- `references/rules/evidence-rules.md`
- `references/rules/runtime-first.md`
- `references/rules/routing-rules.md`
- `references/rules/replay-rules.md`

## Publishing Note

This public variant is intended for sharing as a reusable skill package. Keep private fixtures, live captures, and customer- or site-specific notes in a separate private workspace or repository.
