# Legacy Skill Mapping

`js-reverse-ops` is the canonical reverse-engineering skill in this workspace.

Two older skills still exist outside this workspace:

- `js-reverse-engineering`
- `spider-js-mcp-skills`

They should be treated as legacy inputs, not competing primary entrypoints.

## Mapping

### `js-reverse-engineering` -> `js-reverse-ops`

Use its strongest parts inside the `Recover` stage:

- static deobfuscation tool matrix
- source-map-first workflow
- bundler identification
- AST transform patterns
- minified-build diffing

These now map to:

- [stages/recover.md](/Users/liqiuhui/Desktop/code/zhipu/codex/skills/js-reverse-ops/references/stages/recover.md)
- [advanced-pipeline.md](/Users/liqiuhui/Desktop/code/zhipu/codex/skills/js-reverse-ops/references/advanced-pipeline.md)
- [recover-static.md](/Users/liqiuhui/Desktop/code/zhipu/codex/skills/js-reverse-ops/references/recover-static.md)

### `spider-js-mcp-skills` -> `js-reverse-ops`

Use its strongest parts inside the `Runtime` and `Replay` stages:

- website-oriented signature investigation
- concise reverse-analysis report structure
- Python replay delivery expectation
- anti-crawler parameter checklist

These now map to:

- [stages/runtime.md](/Users/liqiuhui/Desktop/code/zhipu/codex/skills/js-reverse-ops/references/stages/runtime.md)
- [stages/replay.md](/Users/liqiuhui/Desktop/code/zhipu/codex/skills/js-reverse-ops/references/stages/replay.md)
- [mcp-playbooks.md](/Users/liqiuhui/Desktop/code/zhipu/codex/skills/js-reverse-ops/references/mcp-playbooks.md)
- [signature-delivery.md](/Users/liqiuhui/Desktop/code/zhipu/codex/skills/js-reverse-ops/references/signature-delivery.md)

## Unification Rule

When a request could fit any of the three legacy descriptions:

1. Enter through `js-reverse-ops`
2. Route by family and stage
3. Pull in static or delivery references only as needed
4. Emit artifacts using the `js-reverse-ops` output contract

## Not Yet Unified

The legacy skill files under `/Users/liqiuhui/.codex/skills/` are not modified here. They remain on disk for compatibility, but the workspace-side source of truth is `js-reverse-ops`.
