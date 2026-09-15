---
description: Make browser-only JS run locally (Node sandbox stubs, timers, probes, calibration)
argument-hint: [challenge.js or page dir]
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
---

Route through js-reverse-ops environment rebuild: read
references/env-rebuild-recipes.md (10 verified cards) before writing any stub.
Generate a collector skeleton with
`node scripts/scaffold_verbatim_harness.js <name> --sandbox vm|jsdom --pagination call|handler|click`.
Never pass host eval/Function/builtins into vm contexts (card 3); arm real
timers with microtask-exception no-ops (card 4); calibrate against an in-process
oracle before trusting tokens (card 10).
