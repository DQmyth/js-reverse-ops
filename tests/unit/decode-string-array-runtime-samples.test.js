'use strict';
// decode_string_array_runtime on REAL javascript-obfuscator output.
// The tool's older cases (decode-string-array-runtime.test.js) run hand-written samples and were
// green for months while the tool decoded nothing on any real output: the pattern that finds the
// lookup function had a doubled "(" and so matched only `NAME = function (a, b)`, never the
// `function NAME(a, b)` that every release from 2.x on emits. These cases pin what is claimed in
// the tool's header, each against a sample the obfuscator itself produced:
//   - plain-string and base64 tables are decoded, and nothing of the source is missing
//   - rc4 tables are refused and print no entry (an index-only dump of one is garbage)
//   - a table nested with the program's own code is not run at all
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { stringLiterals } = require('../helpers/string-literals');

const ROOT = path.join(__dirname, '..', '..');
const TOOL = path.join(ROOT, 'scripts', 'decode_string_array_runtime.js');
const FIX = path.join(ROOT, 'tests', 'fixtures', 'decode-string-array-runtime');
const OPT = { timeout: 60000 };

const source = fs.readFileSync(path.join(FIX, 'source.js'), 'utf8');
// the strings the obfuscator puts in its table at all: it leaves anything shorter than three
// characters inline (": " never enters the table, " | " does), so those cannot be expected back
const SOURCE_STRINGS = stringLiterals(source).filter((s) => s.length >= 3);

function sample(name) { return path.join(FIX, name); }
function run(args) { return spawnSync(process.execPath, [TOOL, ...args], { encoding: 'utf8', timeout: 50000 }); }
function decodedValues(report) { return Object.values(report.values).map((v) => v.split('   (raw:')[0]); }

// 0.27.4 keeps the array at the top level; later releases wrap it in a table function
const PLAIN = ['obfuscator-0.27.4-plain-strings.js', 'obfuscator-2.19.1-plain-strings.js',
  'obfuscator-4.1.1-plain-strings.js', 'obfuscator-5.10.1-plain-strings.js'];
const BASE64 = ['obfuscator-2.19.1-base64.js', 'obfuscator-4.1.1-base64.js', 'obfuscator-5.10.1-base64.js'];
const RC4 = ['obfuscator-2.19.1-rc4.js', 'obfuscator-5.10.1-rc4.js'];

test('the source the samples were built from holds enough strings to be a table', () => {
  assert.ok(SOURCE_STRINGS.length >= 15, `${SOURCE_STRINGS.length} strings`);
});

for (const name of PLAIN) {
  test(`plain-string table decoded from real output: ${name}`, OPT, (t) => {
    const r = run([sample(name), '--dump', '--json']);
    assert.strictEqual(r.status, 0, r.stderr);
    const report = JSON.parse(r.stdout);
    const values = decodedValues(report);
    for (const s of SOURCE_STRINGS) assert.ok(values.includes(s), `a string of the source is back: ${JSON.stringify(s)}`);
    assert.match(report.lookup, /^(?:a0)?_0x[0-9a-f]+$/, 'the lookup is one of the obfuscator\'s functions');
    if (name.startsWith('obfuscator-0.27.4')) assert.strictEqual(report.wrapper, null, 'the 2019 layout keeps the array at the top level');
    else assert.match(report.wrapper, /^a0_0x[0-9a-f]+$/, 'the array sits inside a table function');
    t.diagnostic(`${values.length} entries, lookup ${report.lookup}`);
  });
}

for (const name of BASE64) {
  test(`base64 table decoded from real output: ${name}`, OPT, () => {
    const r = run([sample(name), '--dump', '--json']);
    assert.strictEqual(r.status, 0, r.stderr);
    const report = JSON.parse(r.stdout);
    // the obfuscator's own lookup does the base64 step, so what arrives is plaintext already
    const values = decodedValues(report);
    for (const s of SOURCE_STRINGS) assert.ok(values.includes(s), `a string of the source is back: ${JSON.stringify(s)}`);
  });
}

for (const name of RC4) {
  test(`an rc4 table is refused and prints nothing: ${name}`, OPT, () => {
    const r = run([sample(name), '--dump', '--json']);
    assert.strictEqual(r.status, 1, r.stderr);
    assert.match(r.stderr, /rc4 string table/);
    assert.match(r.stderr, /recover_string_table\.js/);
    assert.strictEqual(r.stdout, '', 'no entry may be printed for a keyed table');
    const forced = run([sample(name), '--indexes', '0x140,0x141', '--json']);
    assert.strictEqual(forced.status, 1);
    assert.strictEqual(forced.stdout, '');
  });
}

test('a table nested with the program\'s own code is not run', OPT, (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sar-nested-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const strings = SOURCE_STRINGS.slice(0, 16).map((s) => `'${s.replace(/\\/g, '\\\\')}'`).join(',');
  // one wrapper IIFE holding the table AND the program: running the table would run the program
  const file = path.join(dir, 'nested.js');
  fs.writeFileSync(file, `(function () {
  function a0_0x2b91() { const a0_0x77c0 = [${strings}]; a0_0x2b91 = function () { return a0_0x77c0; }; return a0_0x2b91(); }
  (function (a, b) { const c = a0_0x2b91; for (; a0_0x2b91()[0] !== String(b);) { const x = a0_0x2b91(); x.push(x.shift()); } })(1, 7);
  function a0_0x1d44(index, key) { index = index - 0x100; return a0_0x2b91()[index]; }
  globalThis.__RAN__ = true;
  const padding = '${'p'.repeat(40000)}';
})();
`);
  const r = run([file, '--dump', '--json']);
  assert.strictEqual(r.status, 1, r.stderr);
  assert.match(r.stderr, /table cannot be isolated from the rest of the file/);
  assert.strictEqual(r.stdout, '');
});

test('a file without a table, an unknown option, an incomplete option', OPT, () => {
  const none = run([sample('source.js'), '--dump']);
  assert.strictEqual(none.status, 1);
  assert.match(none.stderr, /string array not found/);
  const unknown = run([sample('source.js'), '--dump', '--no-such-flag']);
  assert.strictEqual(unknown.status, 2);
  assert.match(unknown.stderr, /unknown or incomplete option: --no-such-flag/);
  const incomplete = run([sample('source.js'), '--dump', '--key']);
  assert.strictEqual(incomplete.status, 2);
});
