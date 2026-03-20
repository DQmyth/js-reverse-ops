# Runtime Stage

Use this stage when the target request, cookie, or signature depends on browser execution.

## Goals

- capture the real request
- correlate hooks, paused frames, and network truth
- preserve runtime artifacts that can feed provenance and replay

## Preferred Tools

- browser preflight and bridge health checks
- `analyze_target`
- request listing and initiator tracing
- function hooks and preload scripts
- paused-frame capture and normalization
- `export_runtime_evidence.js`

## Exit Criteria

- runtime request is captured or runtime-first failure is documented
- request method, path, and field set are durable on disk
- runtime artifacts are sufficient for provenance or replay scaffolding
