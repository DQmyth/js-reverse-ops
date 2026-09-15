---
description: Deobfuscate a JS bundle (string arrays, eval packing, control-flow flattening, JSVMP payloads)
argument-hint: [file]
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
---

Route through js-reverse-ops Recover stage: run scripts/inspect_obfuscation_family.js
first, then the matching pipeline (recover_string_table.js / decode_eval_wrapper.js /
run_ast_pipeline.js — see references/standard-workflow-cookbook.md stage 3). For
JSVMP shells, prefer verbatim execution (references/env-rebuild-recipes.md) over
opcode-level restoration unless the verbatim route is blocked.
