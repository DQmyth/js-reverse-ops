# Tests

Three-layer suite on Node's built-in `node:test` (zero dependencies), aligned
with the four-layer practice of the strongest community MCP repos
(unit / property / integration; performance is covered by the benchmark
runner's timing assertions instead).

```bash
make tests                 # all three layers
node --test tests/unit/*.test.js
node --test tests/property/*.test.js        # randomized inputs x iron-rule invariants
node --test tests/integration/*.test.js     # isolated copies only, never the real tree
```

## What each layer guarantees

- **unit**: pure-logic surfaces — leak-scanner flagging, router scoring,
  indirect-eval detection on synthetic samples
- **property**: verified-rule invariants under randomized parameters —
  every valid harness-generator combination must compile and carry the iron
  rules; invalid combinations must be rejected; the interpreter-catch hook
  may only grow its input (payload bytes untouched)
- **integration**: end-to-end on isolated copies — the export leak gate
  actually BLOCKS planted banned tokens; playbook runs emit the complete
  artifact set (incl. the M1-M8 checklist); benchmarks and trigger evals stay
  green from the workspace root

## Conventions

- integration tests copy the tree to a temp dir; never mutate the workspace
- property tests use a seeded PRNG (reproducible failures)
- when a doc/pattern is added (e.g. a new misdiagnosis), sync the code
  surfaces in the same commit — the integration layer exists to catch that
  drift (it caught M8 missing from run_playbook on its first run)
