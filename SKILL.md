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
- accepted response plus confusing browser-visible values: inspect page-side render and suppression logic before escalating into signer recovery, and use `playbooks/accepted-response-hidden-dom.md`
- accepted response plus page-local embedded font or glyph entities: extract the current response font, solve the glyph map at page scope, and use `playbooks/embedded-runtime-font-mapping.md`
- replay still fails even after one accepted digest is recovered: inspect bootstrap-time cookie write order, digest collectors, and wrapped-cookie assembly, then use `playbooks/bootstrap-digest-ladder.md`
- signer depends on one server-issued time and one wasm or module helper: freeze the time source, prove the exact signer input shape, and use `playbooks/server-time-gated-wasm-signer.md`
- one large bundle hides a tiny runtime helper you actually need for replay: extract that helper first instead of emulating the whole page, and use `playbooks/runtime-bundle-signer-extraction.md`
- verify response looks noisy or pessimistic while data requests still succeed: treat the data endpoint as the acceptance oracle, and use `playbooks/lenient-verify-data-gate.md`
- visible request contract is stable but different HTTP clients diverge: escalate through a transport ladder before inventing more signer state, and use `playbooks/transport-profile-ladder.md`
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
