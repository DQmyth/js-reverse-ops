# Browser Hooks

Prefer hooks that preserve flow and timing.

Use preset definitions from [assets/hook-presets.json](/Users/liqiuhui/Desktop/code/zhipu/codex/skills/js-reverse-ops/assets/hook-presets.json) and mode guidance from [hook-capture-modes.md](/Users/liqiuhui/Desktop/code/zhipu/codex/skills/js-reverse-ops/references/hook-capture-modes.md) when a target needs a durable hook plan instead of ad hoc notes.

## Default Hook Order

1. `fetch`
2. `XMLHttpRequest.prototype.open`
3. `XMLHttpRequest.prototype.send`
4. storage access if tokens or seeds are persisted
5. crypto surfaces when signatures are not obvious
6. specific business functions after request initiator analysis

## Search-First Escalation

Do not activate the heaviest hook surface first just because it exists.

Preferred escalation:

1. source and endpoint search
2. request initiator capture
3. summary-mode hook profile
4. priority-mode hook plan
5. raw hook payloads or paused frames only for the branch that matters

This keeps runtime work closer to the `search_tools -> activate_tools` style advantage that dedicated hook MCPs have, without losing evidence discipline.

## Preload Rule

If the target logic runs during bootstrap, register preload instrumentation before reload. Do not wait until after page scripts have already executed.

## When to Trace Functions

Use `trace_function` for internal functions that are not easy to hook globally but can be located by name or nearby source text.

## When to Break

Use breakpoints only if you need:

- local closure state
- temporary variables not visible through hooks
- exact branch conditions at one narrow location

Hooks remain the default because they are less fragile under anti-debug checks.

## Evidence Discipline

Capture summary data first. Request raw payloads only for the matching event or request window. This keeps the signal high and avoids drowning in noise.

## Preset Rule

Before hand-writing hook notes for a substantial task, prefer scaffolding a hook profile:

```bash
node skills/js-reverse-ops/scripts/scaffold_hook_profile.js --preset cookie-write,fetch-signature --mode priority --out <bundle-dir>
```

This turns the target into a durable hook plan instead of a one-off conversational tactic.

After the profile is stable, compile it into a tool-facing plan with:

```bash
node skills/js-reverse-ops/scripts/build_hook_action_plan.js <hook-profile.json> --out <bundle-dir>
```

The resulting action plan should be the source of truth for which `hook_function`, `create_hook`, `trace_function`, and preload steps are attempted first.

After execution, normalize the captured hook result into bundle evidence with:

```bash
node skills/js-reverse-ops/scripts/ingest_hook_evidence.js <evidence.json> <hook-evidence.json> --output <evidence.json>
```

Then rerun claim, provenance, and risk builders so hook observations become part of the bundle's durable reasoning surface.
