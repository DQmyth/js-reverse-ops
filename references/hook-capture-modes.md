# Hook Capture Modes

Use hook presets and capture modes to reduce noise before requesting raw hook payloads.

## Modes

### `summary`

Default first pass.

- capture compact hook summaries
- prefer event identity over full payloads
- best for unknown or noisy targets

### `priority`

Use when one or two candidate surfaces are already known.

- focus on the matching request path, cookie, or business helper
- allow selected payload fields
- suppress unrelated hook output

### `incremental`

Use when a baseline hook pass already exists.

- capture only new or changed hook evidence
- compare with prior stable surfaces
- avoid repeating already-known hook noise

## Preset Examples

- `cookie-write`
- `jsonp-insert`
- `fetch-signature`
- `xhr-body`
- `storage-bootstrap`
- `crypto-surface`
- `business-function`

## Scaffold Command

```bash
node skills/js-reverse-ops/scripts/scaffold_hook_profile.js \
  --preset cookie-write,jsonp-insert \
  --mode priority \
  --target "dynamic jsonp cookie tracing" \
  --out /tmp/hook-profile
```

This emits:

- `hook-profile.json`
- `hook-profile.md`
- `hook-profile.js`

Use the generated profile as the bundle-level hook plan before live capture.

Then compile it into an MCP-oriented action plan:

```bash
node skills/js-reverse-ops/scripts/build_hook_action_plan.js \
  /tmp/hook-profile/hook-profile.json \
  --out /tmp/hook-profile
```

This emits:

- `hook-action-plan.json`
- `hook-action-plan.md`

Then materialize it into an execution runbook:

```bash
node skills/js-reverse-ops/scripts/build_hook_execution_runbook.js \
  /tmp/hook-profile/hook-action-plan.json \
  --out /tmp/hook-profile
```

This emits:

- `hook-execution-runbook.json`
- `hook-execution-runbook.md`
- `hook-preload.js`
