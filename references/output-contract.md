# Output Contract

A substantial reverse-engineering result must include:

- target context: URL, action, and objective
- classification: task type and why
- target request or function path
- evidence summary: hooks, requests, script IDs, or file paths
- verified findings
- inferred findings
- unknowns and blockers
- artifact list
- replay status: not started, partial, or verified
- validation method and sample count
- server acceptance status: accepted, rejected, or not tested
- risk labels when helper endpoints, launcher pages, or partial runtime failures could mislead follow-up work

## Recommended Artifact Set

- `task.json`
- `evidence.json`
- `report.md`
- `notes.md`
- `family-decision.json`
- `artifact-index.json`
- `claim-set.json`
- `risk-summary.json`
- `provenance-graph.json`
- `provenance-summary.md`
- `operator-review.md`
- `workflow-dispatch.json`
- `workflow-run.json`
- `workflow-run.md`
- `workflow-action-list.json`
- `workflow-mcp-batch.json`
- `workflow-mcp-context.json`
- `workflow-mcp-exec-plan.json`
- `workflow-mcp-call-payload.json`
- `workflow-mcp-execution-guide.json`
- `workflow-mcp-execution-guide.md`
- `workflow-mcp-execution-template.json`
- `workflow-mcp-execution-record.json`
- `workflow-mcp-execution-record.md`
- `local-harness-plan.json`
- `local-harness-plan.md`
- `local-harness-result-template.json`
- `local-harness-result.json`
- `local-harness-result.md`
- `archival-evidence-package.json`
- `archival-evidence-package.md`
- `archival-antidebug-report.json`
- `archival-antidebug-report.md`
- `solver-provenance-report.json`
- `solver-provenance-report.md`
- `replay.py` or `replay.js`
- `artifacts/original/*`
- `artifacts/derived/*`
- `artifacts/evidence/*`

## Normalized Layout

Use `scripts/export_runtime_evidence.js` to generate the root task files and `scripts/normalize_task_artifacts.js` to place the rest of the artifacts into a stable layout.

- `task.json`: task manifest and high-level contract
- `evidence.json`: verified and inferred findings plus runtime/static evidence blocks
- `report.md`: concise human-readable summary
- `notes.md`: operator notes and workflow reminders
- `family-decision.json`: routing choice, risks, misleading signals, and preferred workflow
- `artifact-index.json`: copied-file manifest for original, derived, and evidence groups
- `claim-set.json`: explicit claims, evidence sources, and confidence labels
- `risk-summary.json`: runtime, routing, and maintenance risks for the task
- `provenance-graph.json`: machine-readable field and cookie provenance graph
- `provenance-summary.md`: compact field-level provenance status
- `operator-review.md`: fastest human review surface for the task

`provenance-graph.json` should expose a top-level `status` that can be consumed by bundle assessors. At minimum, keep it aligned with the strongest currently supported evidence layer:

- `runtime-accepted`
- `runtime-captured`
- `static-analysis-generated`
- `source-snapshot-imported`
- `bootstrap-only`

If request-variable capture templates or paused-frame runtime captures exist, they should be folded into provenance rather than left as orphan artifacts.

Recommended paused-frame side artifacts:

- `*-paused-frame-locals.json`
- `*-paused-frame-locals.md`

When validating a site family or many related pages, use `scripts/run_live_validation.js` so every case gets the same directory contract.

That contract is not limited to one naming scheme. Corpora that use route-backed case
IDs should preserve stable per-case directory names and carry `case_kind` / `case_id`
through evidence, benchmark, and corpus outputs.

For external benchmark samples, a scaffold-first `bundles/baseline/` bundle is allowed before any runtime capture exists. That bundle must still satisfy the normalized layout, but it should explicitly mark itself as `bootstrap-only` until scaffold-derived placeholders are replaced with verified evidence.

External bundles should also carry a maturity assessment, typically via `maturity-summary.json` and `maturity-summary.md`, so bundle completeness is not confused with reverse-engineering completion.

`maturity-summary.json` should also expose a coarse evidence grade for corpus-level comparison:

- `verified-live`
- `verified-archival`
- `verified-local`
- `inferred`

`maturity-summary.json` should also expose bundle capability dimensions so corpus-level summaries can answer how a sample was solved, not only how far it progressed:

- `solver_backed`
- `hook_backed`
- `pcap_backed`
- `local_harness_backed`
- `antidebug_backed`
- `archival_backed`

`archival_backed` is not limited to archival challenge-success. It should also become true when the bundle preserves first-class archival support evidence such as `public_writeup_facts`.

`maturity-summary.json` should also expose bundle-native MCP policy signals when they exist, so bundle review and corpus summaries can distinguish "not executed yet" from "intentionally suppressed or narrowed by policy":

- `mcp_policy_suppressed`
- `mcp_policy_depth_first`

When these signals are present, `recommendation` should prefer the policy-aware interpretation over a generic maturity-based suggestion. For example:

- archival or solver-backed bundles may suppress MCP execution on purpose
- hook-backed bundles may narrow MCP work to depth-first runtime follow-up

## Workflow Action Files

Workflow automation outputs are intentionally split into three layers:

- `workflow-run.json`: what the runner already executed plus remaining manual work
- `workflow-action-list.json`: every follow-up action, including local scripts and MCP-oriented steps
- `workflow-mcp-batch.json`: only MCP-safe tool actions, normalized for later execution
- `workflow-mcp-context.json`: normalized execution context for MCP gating and action unlock checks
- `workflow-mcp-exec-plan.json`: conservative classification of batch actions into executable vs blocked under the current context
- `workflow-mcp-call-payload.json`: ready-to-consume MCP tool payload grouped into serial or parallel-safe execution chunks
- `workflow-mcp-execution-guide.json`: assistant-side execution guide that maps groups to single-tool or `multi_tool_use.parallel` invocations
- `workflow-mcp-execution-guide.md`: compact human-readable execution guide
- `workflow-mcp-execution-template.json`: empty step-by-step template for recording live MCP execution outcomes
- `workflow-mcp-execution-record.json`: normalized record of completed or partial live MCP execution
- `workflow-mcp-execution-record.md`: compact human-readable execution record
- `local-harness-plan.json`: normalized plan for minimal local-harness reconstruction work
- `local-harness-plan.md`: compact human-readable local-harness plan
- `local-harness-result-template.json`: empty template for recording local-harness execution outcomes
- `local-harness-result.json`: normalized local-only harness result, intended to be compatible with challenge-success ingest
- `local-harness-result.md`: compact human-readable local-harness result
- `archival-evidence-package.json`: normalized package view for archival hard-case evidence, workflow, and promotion boundary
- `archival-evidence-package.md`: compact human-readable archival evidence package
- `archival-antidebug-report.json`: normalized report for archival anti-debug or unlock-route bundles
- `archival-antidebug-report.md`: compact human-readable archival anti-debug report

If an MCP execution record exists, it should be ingested back into `evidence.json` rather than left as an orphan workflow artifact.

Recommended fields for `workflow-action-list.json` entries:

- `id`
- `kind`
- `order`
- `stage`
- `recipient_name`
- `parameters`
- `guards`
- `requirements`
- `effects`
- `safe_auto_execute`
- `note`
- `dispatch_rationale`
- `capability_focus`

`workflow-mcp-batch.json` should preserve the same ordering and guard semantics for MCP actions so a later session does not need to re-derive:

- whether a selected page is required
- whether preload must already be injected
- whether the action mutates page state
- whether the action is observation-only

`workflow-mcp-exec-plan.json` should explain why actions are currently blocked, for example:

- missing selected page context
- placeholder request IDs
- page-mutation not allowed in the current execution mode

`workflow-mcp-exec-plan.json` may also include policy-level interpretation that is not a hard blocker but still explains why actions were omitted or why the current bundle should avoid widening work:

- `policy_summary`
- `dispatch_rationale`
- `capability_focus`
- `action_generation_summary`
- per-action `policy_notes`

`workflow-mcp-context.json` may also carry session-profile flags such as:

- `allow_mutating_page_state`
