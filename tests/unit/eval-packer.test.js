'use strict';
// The eval-packer tools on a classic `eval(function(p,a,c,k,e,d){…})` payload.
// Until v1.9.0 neither had a test, and both located the shell by the exact string 'eval(function(':
// a shell written with spaces, or reached as `window.eval ( function…`, was "not found" — and
// decode_eval_wrapper.js then exited 0 with nothing written. The shell is now recognised by shape
// and unpacked by arithmetic (nothing from the sample is executed); other packers still go
// through the vm route. Pinned here:
//   - the payload comes back byte-identical to its source, and behaves like it
//   - nested shells: one layer per call
//   - the spaced / window.eval form decodes the same way (the old build: exit 0, no file)
//   - nothing to unpack is exit 1 with a reason, never a silent success
//   - extract_packed_eval_payload.js names the family, the base and the dictionary size
// The payload is built by tests/helpers/packer.js (a reimplementation of the public algorithm).
// MUTATOR_DECODE / MUTATOR_EXTRACT swap the tools under test.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { pack } = require('../helpers/packer');

const SCRIPTS = path.join(__dirname, '..', '..', 'scripts');
const DECODE = process.env.MUTATOR_DECODE || path.join(SCRIPTS, 'decode_eval_wrapper.js');
const EXTRACT = process.env.MUTATOR_EXTRACT || path.join(SCRIPTS, 'extract_packed_eval_payload.js');
const ST = path.join(__dirname, '..', 'fixtures', 'static-toolchain');
const SOURCE = fs.readFileSync(path.join(ST, 'src', 'lib.js'), 'utf8');
const SHELL = fs.readFileSync(path.join(ST, 'packer-62.js'), 'utf8');
const OPT = { timeout: 60000 };

const run = (args, cwd) => spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 40000, cwd });
const exportsProbe = (file) => run(['--eval', `const m = require(${JSON.stringify(file)}); console.log(JSON.stringify([m.route('x'), m.header('T'), m.classify({ ready: 1 }), m.MESSAGES]))`]);

test('the fixture is what the helper builds from the source: regeneration is a defined procedure', () => {
  assert.strictEqual(pack(SOURCE), SHELL);
  // …and the shell really is the classic one and really runs
  assert.match(SHELL, /^eval\(function\(p,a,c,k,e,d\)\{/);
  assert.strictEqual(exportsProbe(path.join(ST, 'packer-62.js')).stdout, exportsProbe(path.join(ST, 'src', 'lib.js')).stdout);
});

test('a classic shell is unpacked to its source, byte for byte, without running the sample', OPT, (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-packer-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = path.join(dir, 'decoded.js');
  const report = path.join(dir, 'report.json');
  const r = run([DECODE, path.join(ST, 'packer-62.js'), '--output', out, '--json', report]);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(fs.readFileSync(out, 'utf8'), SOURCE);
  assert.strictEqual(exportsProbe(out).stdout, exportsProbe(path.join(ST, 'src', 'lib.js')).stdout);
  const j = JSON.parse(fs.readFileSync(report, 'utf8'));
  assert.strictEqual(j.inferred.has_eval_wrapper, true);
  assert.strictEqual(j.inferred.method, 'static', 'nothing of the sample was executed');
  assert.deepStrictEqual(j.inferred.packer, { family: 'classic-eval-packer', base: 62, dictionary_size: 38 });
  assert.strictEqual(j.inferred.shim_event_count, 0);
});

test('nested shells: one layer per call, and the last layer is the source', OPT, (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-packer-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const outer = path.join(dir, 'outer.js');
  fs.writeFileSync(outer, pack(pack(SOURCE)));
  assert.strictEqual(run([outer]).status, 0, 'the double shell itself runs');
  const first = path.join(dir, 'first.js');
  assert.strictEqual(run([DECODE, outer, '--output', first]).status, 0);
  assert.strictEqual(fs.readFileSync(first, 'utf8'), pack(SOURCE));
  const second = path.join(dir, 'second.js');
  assert.strictEqual(run([DECODE, first, '--output', second]).status, 0);
  assert.strictEqual(fs.readFileSync(second, 'utf8'), SOURCE);
});

test('a shell with other spacing, buried inside another function, decodes the same way', OPT, (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-packer-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const spaced = path.join(dir, 'spaced.js');
  // the same unpacker and call, written with spaces, from inside another function
  const shellBody = SHELL.slice(SHELL.indexOf('{') + 1);
  fs.writeFileSync(spaced, `(function () {\n  var boot = 1;\n  eval ( function ( p , a , c , k , e , d ) {${shellBody}})();\n`);
  // it is still a working shell — then compare what it defined with the source's exports
  const PROBE = (file) => `const m = require(${JSON.stringify(file)}); console.log(JSON.stringify([m.route('x'), m.header('T'), m.classify({ ready: 1 }), m.MESSAGES]));`;
  assert.strictEqual(run(['--eval', PROBE(spaced)]).stdout, run(['--eval', PROBE(path.join(ST, 'src', 'lib.js'))]).stdout);
  const out = path.join(dir, 'decoded.js');
  const r = run([DECODE, spaced, '--output', out]);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(out), 'a file was written');
  assert.strictEqual(fs.readFileSync(out, 'utf8'), SOURCE);
});

test('nothing to unpack is exit 1 with a reason and no file — not a silent success', OPT, (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-packer-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = path.join(dir, 'decoded.js');
  const r = run([DECODE, path.join(ST, 'src', 'entry.js'), '--output', out]);
  assert.strictEqual(r.status, 1, r.stderr);
  assert.match(r.stderr, /nothing decoded/);
  assert.strictEqual(JSON.parse(r.stdout).inferred.has_eval_wrapper, false);
  assert.ok(!fs.existsSync(out));
});

test('usage is 2, a value-less option is 2, a missing file is 1 — for both tools', OPT, (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-packer-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const tool of [DECODE, EXTRACT]) {
    assert.strictEqual(run([tool]).status, 2, tool);
    assert.match(run([tool]).stderr, /^Usage: /);
    const flag = tool === DECODE ? '--output' : '--output';
    const bare = run([tool, path.join(ST, 'packer-62.js'), flag]);
    assert.strictEqual(bare.status, 2, `${tool}: ${flag} without a path`);
    assert.match(bare.stderr, /--output needs a path/);
    assert.strictEqual(run([tool, path.join(dir, 'none.js'), flag, path.join(dir, 'x')]).status, 1, `${tool}: missing input`);
  }
});

test('extract_packed_eval_payload.js names the classic family, the base and the dictionary size', OPT, (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-packer-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const report = path.join(dir, 'report.json');
  const r = run([EXTRACT, path.join(ST, 'packer-62.js'), '--output', report]);
  assert.strictEqual(r.status, 0, r.stderr);
  const j = JSON.parse(fs.readFileSync(report, 'utf8'));
  assert.strictEqual(j.inferred.has_packed_eval, true);
  assert.strictEqual(j.inferred.eval_offset, 0);
  assert.strictEqual(j.inferred.packer_family, 'classic-eval-packer');
  assert.strictEqual(j.inferred.packer_base, 62);
  assert.strictEqual(j.inferred.dictionary_size, 38);
  // a plain file is reported as such, not as a packed one
  const plain = JSON.parse(run([EXTRACT, path.join(ST, 'src', 'entry.js')]).stdout);
  assert.strictEqual(plain.inferred.has_packed_eval, false);
  assert.strictEqual(plain.inferred.packer_family, 'none');
});
