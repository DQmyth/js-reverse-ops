# Tutorial: from zero to your first solved target in ~5 minutes

This walkthrough uses the skill's own **capability gym** targets as teaching
material — self-contained, safe to run anywhere, and each one encodes a real
failure mode. You will walk all four stages (`Locate → Runtime → Recover →
Replay`) on a synthetic target, then a composite one.

## 0. Health check (30 seconds)

```bash
make check          # benchmarks + trigger evals + tests + gym + release checks
```

Everything green? You are ready.

## 1. Generate a practice target (Locate)

```bash
node scripts/gym_generate_targets.js --out gym-targets --flavors m5
cat gym-targets/m5/challenge.json   # symptom, wrong approach, oracle
```

The `challenge.json` contract is what a real triage produces: the symptom an
operator would see, the trap they would fall into, and the oracle that proves
the solve.

## 2. Fingerprint the family (Recover-side triage)

```bash
node scripts/detect_obfuscation_family.js gym-targets/m5/target.js
node scripts/detect_indirect_eval_scope.js gym-targets/m5/target.js
```

For real targets these two commands tell you the obfuscation family and
whether the payload executes through indirect eval — which decides the
sandbox rules before you write a single stub.

## 3. Solve it with the standard recipe (Recover + Replay)

Open `gym-targets/m5/target.js`. The IV is gated on `String(Document)`
containing `native code`. The recipe is card 1 of
`references/env-rebuild-recipes.md` — never hand-port the algorithm:

```js
// run in node: the target verbatim, in a realm with ONE precise stub
const vm = require('vm');
const fs = require('fs');
function nativeFn(name) {
  const f = { [name]: function () {} }[name];
  f.toString = () => `function ${name}() { [native code] }`;
  return f;
}
const sb = { console, Document: nativeFn('Document') };
sb.globalThis = sb;
vm.createContext(sb);
vm.runInContext(fs.readFileSync('gym-targets/m5/target.js', 'utf8'), sb);
console.log(sb.IV.map(Number)); // [12189, 6081] = [0x2f9d, 0x17c1] — the gate opened
```

Flip the stub to a transpiled `class Document {}` and watch the IV degrade —
that control experiment is the whole lesson: **the code picks its own
constants when the environment is right; hand-porting loses branches.**

## 4. Verify like you mean it (misdiagnosis discipline)

```bash
node scripts/gym_run.js --targets gym-targets          # your solve, asserted
node scripts/detect_env_divergence.js --plan --symptom key-differs
```

Two rules to internalize before touching a real site:

1. **Never trust a single 200** — some platforms answer wrong tokens with
   200 + plausible fake data (gym challenge m2). The honest metric is a
   cross-run stable result.
2. **Diagnose before probing** — when a rebuilt flow almost works, run the
   divergence plan (`--plan`) before adding more stubs. Most "environment
   fingerprint" hunts turn out to be frozen clocks or timer-driven
   self-checks.

## 5. Graduate to the composite target

```bash
node scripts/gym_generate_targets.js --out gym-targets --flavors combo_all
node scripts/gym_run.js --targets gym-targets
```

`combo_all` stacks an env-gated IV, a timer self-check, a random-IV tail,
and a helper decoy into ONE target — the honest approximation of a
commercial shell. The gym runner solves it with the same recipes in
combination; read its `combo_all` solver in `scripts/gym_run.js` to see each
recipe applied in order.

## 6. Bring it to a real target

When a real site lands on your desk:

1. `node scripts/js_reverse_ops.js <url-or-file> --json` — stage, playbook,
   first moves
2. follow the stage gates in `references/stage-gates.md` — no replay before
   runtime truth
3. scaffold a collector with
   `node scripts/scaffold_verbatim_harness.js <name> --sandbox vm|jsdom --pagination call|handler|click`
   (ships with the full edition; the recipe cards carry the same rules)
4. after you solve or fail: `node scripts/harvest_pattern_case.js --symptom
   "..." --pattern <id> --outcome solved` — the loop that makes the skill
   stronger for the next run

## Cheat sheet

| Situation | Do |
|---|---|
| obfuscated bundle, unknown kind | `detect_obfuscation_family.js` |
| indirect eval / dynamic code | realm-local stubs only — never host builtins (card 3) |
| first token works, later ones empty | real timers + wait (card 4, pattern M3) |
| "key string differs across environments" | `detect_env_divergence.js --plan` (pattern M1) |
| 200 but wrong answers | require cross-run stability (pattern M2) |
| need live capture, no MCP installed | `scripts/cdp_minibrowser.js` |

Full references: `references/env-rebuild-recipes.md`,
`references/misdiagnosis-patterns.md`, `references/stage-gates.md`.
