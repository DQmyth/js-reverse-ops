'use strict';
// recover_string_table: what it reports is what happened. Until v1.8.5 the tool matched no real
// obfuscator.io output, decoded 0 strings on every sample tried, exited 0, and still wrote the
// re-printed input to --output. The cases pin what must not drift:
//   - a string table that was NOT recovered is exit 1 and no output file, whatever the reason
//     (webcrack missing, disabled by --builtin-only, stopped halfway, or unable to help)
//   - real obfuscator output comes out recovered AND still running (same line as the sample)
//   - a file without a string table is exit 0 and never reaches webcrack
//   - the built-in pass decodes the one layout it was written for
// and one invariant ties them together: an output file exists only on exit 0, and whenever it
// exists it runs and prints what its sample prints.
//
// webcrack is an optional dependency whose native part only has builds for Node 22 and 24 (its
// own engines field). Cases that need it are skipped, naming the reason, where it is absent.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { stringLiterals } = require('../helpers/string-literals');

const ROOT = path.join(__dirname, '..', '..');
const TOOL = path.join(ROOT, 'scripts', 'recover_string_table.js');
const FIX = path.join(ROOT, 'tests', 'fixtures', 'recover-string-table');
const STUB = path.join(__dirname, '..', 'helpers', 'hide-webcrack.js');
const SOURCE_STRINGS = stringLiterals(fs.readFileSync(path.join(FIX, 'source.js'), 'utf8'));
const RECOVERED = [
  'obfuscator-2.19.1-plain-table.js',
  'obfuscator-4.1.1-plain-table.js',
  'obfuscator-4.1.1-rc4-hardened.js',
  'obfuscator-5.10.1-plain-table.js',
  'obfuscator-5.10.1-rc4-hardened.js'
];
const NOT_RECOVERED = {
  'obfuscator-0.27.4-plain-table.js': /webcrack ran but resolved nothing/,
  'legacy-layout.synthetic.js': /webcrack's pass did not finish/
};
const OPT = { timeout: 120000 };

// Where would the SUBJECT's `require('webcrack')` land? Under the repo after `npm install`, else
// the shared npx cache that `npx webcrack` leaves behind — which is where the docs sent people
// before webcrack became a dependency, and the only place it exists on a workspace checkout.
function locateWebcrack() {
  const readPackage = (dir) => {
    try { return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')); } catch (_err) { return null; }
  };
  let dir = '';
  let nodePath = '';
  try {
    dir = path.join(path.dirname(require.resolve('webcrack', { paths: [ROOT] })), '..');
  } catch (_err) {
    let caches = [];
    try { caches = fs.readdirSync(path.join(os.homedir(), '.npm', '_npx')); } catch (_err2) { caches = []; }
    for (const cache of caches) {
      const modules = path.join(os.homedir(), '.npm', '_npx', cache, 'node_modules');
      if (readPackage(path.join(modules, 'webcrack'))) { dir = path.join(modules, 'webcrack'); nodePath = modules; break; }
    }
  }
  const pkg = dir ? readPackage(dir) : null;
  if (!pkg) return { state: 'missing' };
  const engine = (pkg.engines || {}).node || '';
  const major = Number(process.versions.node.split('.')[0]);
  const supported = !engine || [...engine.matchAll(/>=(\d+)/g)].some((m) => Number(m[1]) === major);
  return { state: supported ? 'ready' : 'wrong-node', version: pkg.version, engine, nodePath };
}

const WEBCRACK = locateWebcrack();
const NEEDS = WEBCRACK.state === 'ready' ? false
  : WEBCRACK.state === 'missing' ? 'needs webcrack: `npm install` in the repo (optional dependency; its native part builds for Node 22 and 24)'
    : `webcrack ${WEBCRACK.version} declares "${WEBCRACK.engine}"; this is Node ${process.version}`;

function runSubject(args, opts = {}) {
  const env = { ...process.env };
  delete env.NODE_OPTIONS;   // a clean interpreter unless the case asks otherwise
  if (opts.nodePath) env.NODE_PATH = [opts.nodePath, process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
  if (opts.hideWebcrack) env.NODE_OPTIONS = `--require=${STUB}`;
  return spawnSync(process.execPath, [TOOL, ...args], { encoding: 'utf8', env, timeout: 100000 });
}

function firstLine(file) {
  const r = spawnSync(process.execPath, [file], { encoding: 'utf8', timeout: 30000 });
  return (r.stdout.split('\n')[0] || '') + (r.status === 0 ? '' : ` [exit ${r.status}]`);
}

function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recover-string-table-'));
  return {
    dir,
    output: path.join(dir, 'out.js'),
    report: path.join(dir, 'report.json'),
    run(fixture, opts = {}) {
      return runSubject([path.join(FIX, fixture), '--output', this.output, '--json', this.report, ...(opts.args || [])], opts);
    },
    reported() { return JSON.parse(fs.readFileSync(this.report, 'utf8')); },
    clean() { fs.rmSync(dir, { recursive: true, force: true }); }
  };
}

function assertNoOutput(box, r) {
  assert.ok(!fs.existsSync(box.output), `no output file may be left behind (exit ${r.status})\n${r.stderr}`);
}

// a string-table lookup — `x(0x1a3, 'key')`, `x('0x3')`, `x(291)` to a `_0x<hex>`-ish name. The
// tool's yardstick, written out again on purpose: imported from the tool, it would pass whatever
// the tool passes.
function lookupsIn(code) {
  return (code.match(/\b(?:[_$A-Za-z][\w$]*)?_0x[0-9a-f]{4,8}\s*\(\s*(?:['"](?:0x[0-9a-f]+|\d+)['"]|0x[0-9a-f]+|\d+)\s*[,)]/g) || []).length;
}

// what an output file has to satisfy whenever it exists; before v1.8.5 the tool met only the
// "runs" half of it, by writing the re-printed input next to exit 0
function assertOutputContract(box, r, fixture) {
  if (!fs.existsSync(box.output)) return;
  assert.strictEqual(r.status, 0, `an output file was written on exit ${r.status}\n${r.stderr}`);
  const out = fs.readFileSync(box.output, 'utf8');
  const sample = fs.readFileSync(path.join(FIX, fixture), 'utf8');
  assert.ok(lookupsIn(out) < lookupsIn(sample), `the output resolves lookups the sample still has (${lookupsIn(sample)} -> ${lookupsIn(out)})`);
  assert.strictEqual(firstLine(box.output), firstLine(path.join(FIX, fixture)), 'the output runs and prints what the sample prints');
}

test('a file without a string table is exit 0, and webcrack is never reached', OPT, (t) => {
  const box = sandbox();
  t.after(() => box.clean());
  const r = box.run('source.js', { hideWebcrack: true });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stderr, /no string table found/);
  assert.strictEqual(box.reported().webcrack, null, 'a missing webcrack would show here if it had been asked for');
  assertNoOutput(box, r);
});

for (const fixture of Object.keys(NOT_RECOVERED)) {
  test(`with webcrack missing the string table is a failure, not a success: ${fixture}`, OPT, (t) => {
    const box = sandbox();
    t.after(() => box.clean());
    const r = box.run(fixture, { hideWebcrack: true });
    assert.strictEqual(r.status, 1, r.stderr);
    assert.match(r.stderr, /NOTHING RECOVERED from a file that carries a string table/);
    assert.match(r.stderr, /webcrack is not installed/);
    assert.match(r.stderr, /npm install/);
    const report = box.reported();
    assert.strictEqual(report.recovered_by, 'none');
    assert.strictEqual(report.webcrack.state, 'missing');
    assert.strictEqual(report.transformed.output_path, null);
    assertNoOutput(box, r);
  });
}

test('--builtin-only never calls webcrack, and still leaves no "output" for what it could not decode', OPT, (t) => {
  const box = sandbox();
  t.after(() => box.clean());
  const r = box.run('obfuscator-5.10.1-rc4-hardened.js', { args: ['--builtin-only'], nodePath: WEBCRACK.nodePath });
  assert.strictEqual(r.status, 1, r.stderr);
  assert.match(r.stderr, /Run again without --builtin-only/);
  assert.deepStrictEqual(box.reported().webcrack, { skipped: '--builtin-only' });
  assertNoOutput(box, r);
});

test('a missing file or an unknown option is exit 2, with the reason on stderr', OPT, () => {
  const missing = runSubject([path.join(FIX, 'no-such-file.js')]);
  assert.strictEqual(missing.status, 2);
  assert.match(missing.stderr, /cannot read .*no-such-file\.js/);
  const unknown = runSubject([path.join(FIX, 'source.js'), '--no-such-option']);
  assert.strictEqual(unknown.status, 2);
  assert.match(unknown.stderr, /^Usage: recover_string_table\.js/m);
});

for (const fixture of RECOVERED) {
  test(`real obfuscator output comes out recovered and still running: ${fixture}`, { ...OPT, skip: NEEDS }, (t) => {
    const box = sandbox();
    t.after(() => box.clean());
    const r = box.run(fixture, { nodePath: WEBCRACK.nodePath });
    assert.strictEqual(r.status, 0, r.stderr);
    const report = box.reported();
    assert.strictEqual(report.recovered_by, 'webcrack');
    assert.ok(report.hex_calls.before > 0, 'the sample really carried lookups');
    assert.strictEqual(report.hex_calls.after, 0, r.stderr);
    assert.strictEqual(report.webcrack.unresolved_placeholders, 0);
    assert.strictEqual(JSON.parse(r.stdout).recovered_by, 'webcrack', 'stdout carries the same report');
    const out = fs.readFileSync(box.output, 'utf8');
    // nothing lost, nothing invented: the string literals are the source's, exactly
    assert.deepStrictEqual(stringLiterals(out), SOURCE_STRINGS, 'the output carries the source\'s string literals and no others');
    assertOutputContract(box, r, fixture);
    t.diagnostic(`${report.hex_calls.before} lookups -> 0, ${fs.statSync(path.join(FIX, fixture)).size} B -> ${report.output_bytes} B, webcrack ${report.webcrack.version}`);
  });
}

for (const [fixture, reason] of Object.entries(NOT_RECOVERED)) {
  test(`a layout webcrack cannot finish is reported as one: ${fixture}`, { ...OPT, skip: NEEDS }, (t) => {
    const box = sandbox();
    t.after(() => box.clean());
    const r = box.run(fixture, { nodePath: WEBCRACK.nodePath });
    assert.strictEqual(r.status, 1, r.stderr);
    assert.match(r.stderr, /NOTHING RECOVERED/);
    assert.match(r.stderr, reason);
    assert.ok(!/pass did not finish/.test(r.stderr) || box.reported().webcrack.unresolved_placeholders > 0);
    assertNoOutput(box, r);
  });
}

test('the built-in pass decodes the layout it was written for, without webcrack', OPT, (t) => {
  const box = sandbox();
  t.after(() => box.clean());
  const r = box.run('legacy-layout.synthetic.js', { args: ['--builtin-only'], hideWebcrack: true });
  assert.strictEqual(r.status, 0, r.stderr);
  const report = box.reported();
  assert.strictEqual(report.recovered_by, 'builtin');
  assert.strictEqual(report.engine, 'builtin');
  assert.ok(report.transformed.replacement_passes + report.transformed.ast_neighborhood_replacements > 0);
  const literals = stringLiterals(fs.readFileSync(box.output, 'utf8'));
  for (const decoded of ['BUILTIN_LEGACY_MARKER_41', ':tail_9c', 'legacy: ', 'log']) {
    assert.ok(literals.includes(decoded), `the lookup became a literal: ${decoded}`);
  }
  assertOutputContract(box, r, 'legacy-layout.synthetic.js');
});

test('where webcrack is installed but not built for this Node: either it works, or it says so', { ...OPT, skip: WEBCRACK.state === 'wrong-node' ? false : 'needs webcrack installed under a Node outside its engines' }, (t) => {
  const box = sandbox();
  t.after(() => box.clean());
  const fixture = 'obfuscator-5.10.1-rc4-hardened.js';
  const r = box.run(fixture, { nodePath: WEBCRACK.nodePath });
  if (r.status === 0) {
    t.diagnostic(`webcrack ${WEBCRACK.version} ran on Node ${process.version} despite its engines field`);
    assert.strictEqual(box.reported().recovered_by, 'webcrack');
  } else {
    assert.strictEqual(r.status, 1, r.stderr);
    assert.match(r.stderr, /NOTHING RECOVERED/);
    assert.match(box.reported().webcrack.state, /^(failed|ran|incomplete)$/);
  }
  assertOutputContract(box, r, fixture);
  if (r.status !== 0) assertNoOutput(box, r);
});

test('every fixture, with webcrack missing and with --builtin-only: an output file exists only on exit 0, and runs', OPT, (t) => {
  const box = sandbox();
  t.after(() => box.clean());
  for (const fixture of fs.readdirSync(FIX).filter((f) => f.endsWith('.js'))) {
    for (const opts of [{ hideWebcrack: true }, { args: ['--builtin-only'], hideWebcrack: true }]) {
      fs.rmSync(box.output, { force: true });
      const r = box.run(fixture, opts);
      assert.ok([0, 1].includes(r.status), `${fixture}: exit ${r.status} is not an outcome the tool defines\n${r.stderr}`);
      assertOutputContract(box, r, fixture);
      if (r.status === 1) assert.match(r.stderr, /NOTHING RECOVERED/, `${fixture}: exit 1 names the string table`);
    }
  }
});
