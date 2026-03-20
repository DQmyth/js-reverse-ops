# Re Loop

Use `re_loop` when a reverse bundle already exists and the question is no longer "what is this site doing?" but "what is the highest-value next move?".

## Commands

Dependency repair suggestion:

```bash
python3 skills/js-reverse-ops/scripts/check_js_reverse_ops_deps.py > /tmp/jsro-deps.json
python3 skills/js-reverse-ops/scripts/suggest_js_reverse_ops_repairs.py /tmp/jsro-deps.json
```

Bundle re-loop:

```bash
node skills/js-reverse-ops/scripts/re_loop_bundle.js --bundle-dir <bundle-dir>
```

## What Re Loop Updates

- `NEXT.md`
- `WORKLOG.md`
- `dead-ends.md` when synthetic or known-bad paths are still blocking verification

## Heuristic Priorities

- bootstrap-only -> import source and analyze statically
- static-analysis-generated -> get runtime truth
- runtime-captured -> scaffold and compare replay
- replay-attempted -> replace synthetic or rejected replay with accepted replay
- runtime-first-required -> favor live capture over more static guessing

## Rule

Do not use `re_loop` to invent work. Use it to rank the next action from the bundle's current evidence surface.
