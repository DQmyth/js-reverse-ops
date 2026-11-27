#!/usr/bin/env node
// trace_script_evidence — what the test suite really proves about each script, recorded rather
// than guessed. Until v1.9.0 "tested" meant "some file in tests/ names the script": three tools of
// the recover stage had green tests on hand-written samples while recovering nothing on any real
// obfuscator output. This tool measures instead:
//   every test file is run with tests/helpers/trace-script-spawns.js preloaded, which writes one
//   line per child process that starts (command + arguments). Records from a test file that fails
//   are dropped. Then, per script, the best input it was ever run on:
//     real-sample            output of a third-party tool, version in tests/fixtures/provenance.json
//     input-not-from-a-tool  it ran, but only on plain / hand-written / temporary / rebuilt input
//     untested               no test starts it
// The result goes to assets/script-evidence.json, which the scripts catalog prints as a column
// and scripts-catalog.test.js pins ("untested" may only shrink). Not the whole truth — a test can
// run a real sample and assert nothing — but a floor that cannot be talked around.
// Usage: node scripts/trace_script_evidence.js [--strict]
//   --strict  refuse (exit 1) when the environment cannot produce complete evidence: needs a Node
//             line webcrack is built for, webcrack resolvable, and curl_cffi for python3 — the
//             tests needing them are skipped otherwise and the tiers would silently read lower.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { createRequire } = require('module');

const root = path.join(__dirname, '..');
const HOOK = path.join(root, 'tests', 'helpers', 'trace-script-spawns.js');
const OUT = path.join(root, 'assets', 'script-evidence.json');
const strict = process.argv.includes('--strict');
const TIERS = ['real-sample', 'input-not-from-a-tool', 'untested'];

function environment() {
  const major = Number(process.versions.node.split('.')[0]);
  let webcrack = false;
  try { createRequire(path.join(root, 'package.json')).resolve('webcrack'); webcrack = true; } catch (_err) { /* not resolvable from the repo */ }
  if (!webcrack) {
    for (const cache of fs.existsSync(path.join(os.homedir(), '.npm', '_npx')) ? fs.readdirSync(path.join(os.homedir(), '.npm', '_npx')) : []) {
      if (fs.existsSync(path.join(os.homedir(), '.npm', '_npx', cache, 'node_modules', 'webcrack', 'package.json'))) webcrack = true;
    }
  }
  const curlCffi = spawnSync('python3', ['-c', 'import curl_cffi'], { stdio: 'ignore' }).status === 0;
  const complete = (major === 22 || major === 24) && webcrack && curlCffi;
  return { node: process.version, webcrack, curl_cffi: curlCffi, complete };
}

const env = environment();
if (strict && !env.complete) {
  console.error(`trace_script_evidence: this environment cannot produce complete evidence (${JSON.stringify(env)}): tests that need webcrack / curl_cffi / a matching Node would be skipped and the tiers would read lower.`);
  process.exit(1);
}

const provenance = JSON.parse(fs.readFileSync(path.join(root, 'tests', 'fixtures', 'provenance.json'), 'utf8')).fixtures;
const tests = [];
for (const layer of ['unit', 'property', 'integration', 'performance']) {
  const dir = path.join(root, 'tests', layer);
  if (fs.existsSync(dir)) for (const name of fs.readdirSync(dir).sort()) if (name.endsWith('.test.js')) tests.push(`tests/${layer}/${name}`);
}

const scriptNames = new Set();
for (const dir of ['scripts', 'public/scripts']) {
  const full = path.join(root, dir);
  if (fs.existsSync(full)) for (const name of fs.readdirSync(full)) if (/\.(js|py|sh)$/.test(name) && !name.startsWith('.')) scriptNames.add(name);
}

// what an argument points at, by the provenance registry where it is registered
function inputKind(arg) {
  if (!arg || arg.length > 400 || /[\n]/.test(arg)) return null;
  if (!/[\\/]/.test(arg) && /\.(js|py|json|html|txt|md)$/.test(arg) === false) return null;
  const abs = path.isAbsolute(arg) ? arg : path.resolve(root, arg);
  const rel = path.relative(root, abs);
  if (rel.startsWith('tests/fixtures/')) return provenance[rel] ? provenance[rel].kind : 'unregistered';
  if (rel.startsWith('examples/')) return 'example';
  if (abs.startsWith(os.tmpdir()) || abs.startsWith('/tmp/') || /(?:^|[\\/])tmp[\\/]/.test(rel)) return 'temp';
  return null;
}

const SCRIPT_FILE = /[/\\]scripts[/\\]([^/\\]+\.(js|py|sh))$/;
function scriptOf(record) {
  const m = SCRIPT_FILE.exec(record.file || '');
  if (m) return m[1];
  for (const arg of record.args || []) {
    const hit = SCRIPT_FILE.exec(arg);
    if (hit && scriptNames.has(hit[1])) return hit[1];
  }
  return null;
}

const scripts = {};
const failed = [];
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-'));
for (const test of tests) {
  const log = path.join(dir, `${test.replace(/[\\/]/g, '_')}.jsonl`);
  const r = spawnSync(process.execPath, ['--test', path.join(root, test)], {
    stdio: 'ignore', timeout: 300000, cwd: root,
    env: { ...process.env, JSRO_EVIDENCE_LOG: log, JSRO_EVIDENCE_TEST: test, NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --require=${HOOK}`.trim() },
  });
  if (r.status !== 0) { failed.push({ test, status: r.status, signal: r.signal || null }); continue; }
  if (!fs.existsSync(log)) continue;
  for (const line of fs.readFileSync(log, 'utf8').split('\n')) {
    if (!line) continue;
    let record;
    try { record = JSON.parse(line); } catch (_err) { continue; }
    const name = scriptOf(record);
    if (!name) continue;
    const entry = scripts[name] || (scripts[name] = { runs: 0, tests: new Set(), inputs: {} });
    entry.runs += 1;
    entry.tests.add(test);
    for (const arg of [record.file, ...(record.args || [])]) {
      const kind = inputKind(arg);
      if (kind) entry.inputs[kind] = (entry.inputs[kind] || 0) + 1;
    }
  }
}
fs.rmSync(dir, { recursive: true, force: true });

for (const name of scriptNames) if (!scripts[name]) scripts[name] = { runs: 0, tests: new Set(), inputs: {} };
const tiers = Object.fromEntries(TIERS.map((t) => [t, []]));
const out = {};
for (const name of [...scriptNames].sort()) {
  const s = scripts[name];
  const tier = s.inputs.real ? 'real-sample' : s.runs > 0 ? 'input-not-from-a-tool' : 'untested';
  tiers[tier].push(name);
  out[name] = { tier, runs: s.runs, tests: [...s.tests].sort(), inputs: s.inputs };
}
const document = {
  schema: 'js-reverse-ops-script-evidence-v1',
  method: 'Each test file run with tests/helpers/trace-script-spawns.js preloaded: one line per child process started and per scripts/ file require()d; records from failing test files dropped. A script is graded by the best input any surviving record shows it was run on.',
  tier_definitions: {
    'real-sample': 'run by a passing test on output of a third-party tool (tests/fixtures/provenance.json names it)',
    'input-not-from-a-tool': 'run by a passing test, but only on plain, hand-written, temporary or rebuilt input',
    untested: 'no test starts it',
  },
  tiers,
  environment: env,
  tests: { total: tests.length, passed: tests.length - failed.length, failed },
  counts: Object.fromEntries(TIERS.map((t) => [t, tiers[t].length])),
  scripts: out,
};
// Evidence from a suite that is not green is not evidence. Nothing is written then — the
// committed file stays as it was — and the reason goes to stderr. (An earlier cut wrote the file
// with a "failed" list and let scripts-catalog.test.js assert on it: the test is itself part of
// the recorded run, so it read its own previous failure and never stopped failing.)
if (failed.length) {
  console.error(`trace_script_evidence: ${failed.length} test file(s) failed — evidence NOT written (assets/script-evidence.json left as it was):`);
  for (const f of failed) console.error(`  ${f.test} (exit ${f.status}${f.signal ? ', ' + f.signal : ''})`);
  process.exit(1);
}
fs.writeFileSync(OUT, `${JSON.stringify(document, null, 2)}\n`);
console.error(`trace_script_evidence: ${tests.length}/${tests.length} test files passed; scripts: ${tiers['real-sample'].length} real-sample, ${tiers['input-not-from-a-tool'].length} input-not-from-a-tool, ${tiers.untested.length} untested → assets/script-evidence.json`);
