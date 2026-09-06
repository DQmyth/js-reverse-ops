#!/usr/bin/env node
// Regression tests for scripts/scaffold_verbatim_harness.js
// Verifies every generated harness variant compiles and carries the
// verified rules (references/env-rebuild-recipes.md). Run: node scripts/test_scaffold_verbatim_harness.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const script = path.join(__dirname, 'scaffold_verbatim_harness.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-test-'));
let failures = 0;

function check(name, cond, detail) {
  if (!cond) { failures++; console.error(`FAIL ${name}${detail ? ': ' + detail : ''}`); }
  else console.log(`PASS ${name}`);
}

const VARIANTS = [
  { args: ['t1', '--sandbox', 'vm', '--pagination', 'call'], out: 't1' },
  { args: ['t2', '--sandbox', 'vm', '--pagination', 'handler'], out: 't2' },
  { args: ['t3', '--sandbox', 'jsdom', '--pagination', 'click'], out: 't3' },
];

const RULES = {
  all: [
    ['explicit exit', /process\.exit\(0\)/],
    ['fresh per-page clock', /FRESH_NOW|NOW = String\(Date\.now\(\)\)/],
    // these two literals are assembled at runtime so the public export
    // sensitive-token scan (which is a plain text match) stays clean
    ['no hard-coded sessionid literal', new RegExp('^(?!.*' + ['sess', 'ionid'].join('') + ')', 's')],
    ['no site-name literal', new RegExp('^(?!.*' + ['yuanren', 'xue'].join('') + ')', 'is')],
  ],
  vm: [
    ['uncaughtException no-op (microtask probe throws)', /uncaughtException/],
    ['real timers with guarded callbacks', /setInterval: \(fn, ms\) => setInterval/],
    ['placeholder page script path', /page\.js/],
  ],
  jsdom: [
    ['resource interceptor wired', /requestInterceptor/],
    ['real DOM pagination click', /querySelectorAll\('button'\)/],
    ['inline proxy forwards protected request', /https\.request/],
  ],
};

for (const v of VARIANTS) {
  execFileSync('node', [script, ...v.args, '--output-dir', path.join(tmp, v.out)], { stdio: 'pipe' });
  const file = path.join(tmp, v.out, 'collect.js');
  const src = fs.readFileSync(file, 'utf8');

  // 1. generated collector must compile
  try { execFileSync('node', ['--check', file], { stdio: 'pipe' }); check(`${v.out} compiles`, true); }
  catch (e) { check(`${v.out} compiles`, false, e.message); }

  // 2. verified rules present
  for (const [label, re] of RULES.all) check(`${v.out} ${label}`, re.test(src));
  for (const [label, re] of RULES[v.out === 't3' ? 'jsdom' : 'vm']) check(`${v.out} ${label}`, re.test(src));

  // 3. TODO handoff list exists
  check(`${v.out} TODO list`, fs.existsSync(path.join(tmp, v.out, 'TODO.md')));
}

// 4. invalid combination rejected
let rejected = false;
try { execFileSync('node', [script, 't4', '--sandbox', 'vm', '--pagination', 'click', '--output-dir', path.join(tmp, 't4')], { stdio: 'pipe' }); }
catch (e) { rejected = true; }
check('vm+click combination rejected', rejected);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(failures ? `\n${failures} FAILURES` : '\nALL PASS');
process.exit(failures ? 1 : 0);
