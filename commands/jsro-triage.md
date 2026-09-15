---
description: Triage a target (page/bundle/HAR) — family, entrypoint, protected request, recommended route
argument-hint: [url-or-file]
allowed-tools: Bash, Read, Glob, Grep, WebFetch
---

Route through js-reverse-ops Locate stage: run
`node scripts/js_reverse_ops.js <target> --json` and follow the returned stage,
playbook, and first moves. For HTML pages run scripts/profile_page_family.js;
for bundles run scripts/extract_request_contract.js. Record findings in a bundle
before moving to Runtime (references/stage-gates.md).
