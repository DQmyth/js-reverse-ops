---
description: Recover a request-signing algorithm (sign/token/nonce headers or params) and produce replay-ready code
argument-hint: [target-url-or-file | HAR file]
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Task, WebFetch, WebSearch
---

Route this task through the js-reverse-ops skill: classify the target with
`node scripts/js_reverse_ops.js <target> --json`, then follow the signature-recovery
task type (references/task-types.md). Prefer runtime truth before static guessing;
if the signer is environment-gated (tokens valid in browser but rejected from the
sandbox), switch to references/env-rebuild-recipes.md instead of hand-porting.
Validate with a cross-run stable result, never a single 200
(references/misdiagnosis-patterns.md M2).
