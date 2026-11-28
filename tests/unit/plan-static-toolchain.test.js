'use strict';
// plan_static_toolchain.js on REAL files: the plan follows what the inspector established about
// the file, and every local script it names carries what the suite proves about it.
//   a bundle whose modules are all in the file  → bundle-splitting is the first step, with
//                                                 scripts/unbundle.js at its head
//   a bundle that loads chunks at run time      → scripts/unbundle.js is named nowhere; the
//                                                 step's note says it is refused, and which chunk
//   a webpack chunk file                        → scripts/unbundle.js is named (it splits those)
// v1.9.0 planned "webcrack, debundle, retidy" for every bundle, named two local scripts that no
// test starts, never mentioned unbundle.js, and ranked bundle splitting under three steps that
// had matched on words.
// MUTATOR_TOOL=<path> swaps the tool under test (it needs the inspector and assets next to it).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const TOOL = process.env.MUTATOR_TOOL || path.join(ROOT, 'scripts', 'plan_static_toolchain.js');
const ST = path.join(__dirname, '..', 'fixtures', 'static-toolchain');
const OPT = { timeout: 60000 };
const LABELS = ['real sample', 'not from a tool', 'untested'];

function plan(file, json = true) {
  const r = spawnSync(process.execPath, [TOOL, file, ...(json ? ['--json'] : [])], { encoding: 'utf8', timeout: 50000 });
  assert.strictEqual(r.status, 0, r.stderr);
  return json ? JSON.parse(r.stdout) : r.stdout;
}
const step = (p, id) => p.selected_steps.find((s) => s.id === id);
const namesUnbundle = (p) => p.selected_steps.some((s) => (s.local_scripts || []).includes('scripts/unbundle.js'));

for (const file of ['webpack-5.production.js', 'webpack-4.development.js', 'browserify-17.js']) {
  test(`plan ${file}: every module in the file — bundle-splitting first, scripts/unbundle.js at its head`, OPT, () => {
    const p = plan(path.join(ST, file));
    assert.strictEqual(p.inspection.family, /browserify/.test(file) ? 'browserify-bundle' : 'webpack-bundle');
    assert.strictEqual(p.recommended_step.id, 'bundle-splitting');
    assert.ok(p.inspection.next_tools.some((t) => t.script === 'scripts/unbundle.js'), 'the inspector offers it');
    const splitting = step(p, 'bundle-splitting');
    assert.strictEqual(splitting.local_scripts[0], 'scripts/unbundle.js');
    assert.strictEqual(splitting.local_script_evidence['scripts/unbundle.js'], 'real sample');
    for (const label of Object.values(splitting.local_script_evidence)) assert.ok(LABELS.includes(label), label);
    assert.match(splitting.tools_measured, /returns no bundle for webpack 5\.113/);
    assert.match(splitting.note, /all modules are in this file/);
  });
}

test('plan: the markdown says what was measured on the third-party tools and what is proven about each local script', OPT, () => {
  const text = plan(path.join(ST, 'webpack-5.production.js'), false);
  assert.match(text, /- From the inspector:\n  - `scripts\/unbundle\.js` — /);
  assert.match(text, /- Local scripts: `scripts\/unbundle\.js` \(real sample\)/);
  assert.match(text, /- Measured here: webcrack 2\.16 unpacks a browserify 17 bundle/);
});

for (const file of ['webpack-4.multichunk.js', 'webpack-5.multichunk.js']) {
  test(`plan ${file}: loads chunks at run time — the unbundler is named, to be handed the bundle with those files`, OPT, () => {
    const p = plan(path.join(ST, file));
    assert.strictEqual(p.inspection.family, 'webpack-bundle');
    assert.strictEqual(p.recommended_step.id, 'bundle-splitting');
    const splitting = step(p, 'bundle-splitting');
    assert.strictEqual(splitting.local_scripts[0], 'scripts/unbundle.js');
    // the note says what to pass: the chunk files the bundle asks for, to cut all of them into one tree
    assert.match(splitting.note, /it asks for chunk \d+/);
    assert.match(splitting.note, /cut it together with those chunk files/);
    assert.match(splitting.note, /handed the bundle alone the tool refuses/);
  });
}

for (const file of ['webpack-5.multichunk.lazy.js', 'webpack-4.multichunk.lazy.js']) {
  test(`plan ${file}: a chunk file — bundle-splitting is the step, scripts/unbundle.js is named, the note says what it is`, OPT, () => {
    const p = plan(path.join(ST, file));
    assert.strictEqual(p.inspection.family, 'webpack-chunk');
    assert.ok(namesUnbundle(p));
    assert.strictEqual(p.recommended_step.id, 'bundle-splitting');
    assert.match(step(p, 'bundle-splitting').note, /a webpack chunk file \(chunk \d+\)/);
    assert.match(step(p, 'bundle-splitting').note, /it does nothing on its own/);
  });
}

test('plan: "Function(" is the dynamic constructor — a plain function declaration is not one', OPT, (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const plain = path.join(dir, 'plain.js');
  const dynamic = path.join(dir, 'dynamic.js');
  fs.writeFileSync(plain, 'function add(a, b) {\n  return a + b;\n}\nconsole.log(add(1, 2));\n');
  fs.writeFileSync(dynamic, 'function run(src) {\n  return Function("return (" + src + ")")();\n}\nconsole.log(run("1 + 2"));\n');
  for (const p of plan(plain).selected_steps) assert.ok(!p.matched_signals.includes('Function('), p.id);
  // …and the control: the same word, capital F, is seen
  assert.ok(plan(dynamic).selected_steps.some((s) => s.id === 'obfuscator-cleanup' && s.matched_signals.includes('Function(')));
});
