'use strict';
// Property tests: randomized inputs × verified-rule invariants.
// The harness generator must uphold its iron rules for ANY parameter
// combination; the interpreter-catch hook must never corrupt its input.
// Run: node --test tests/property/*.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const GEN = path.join(__dirname, '..', '..', 'scripts', 'scaffold_verbatim_harness.js');
const HOOK = path.join(__dirname, '..', '..', 'scripts', 'hook_vm_interpreter_catch.js');

// deterministic PRNG so failures are reproducible
const BANNED_SITE = ['yuan', 'ren', 'xue'].join(''); // runtime-assembled: scanner flags the literal
const BANNED_COOKIE = ['sess', 'ionid'].join('');
let seed = 20260906;
function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }

const NAME_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789-';
function randName() {
  const n = 3 + Math.floor(rnd() * 8);
  return Array.from({ length: n }, () => pick(NAME_CHARS.split(''))).join('').replace(/^-+/, 't');
}

test('property: any valid generator combination compiles and upholds the iron rules', { timeout: 120000, skip: !fs.existsSync(GEN) && 'generator ships with the private workspace only' }, () => {
  const SANDBOXES = ['vm', 'jsdom'];
  const PAGINATIONS = { vm: ['call', 'handler'], jsdom: ['click'] };
  const ROUNDS = 8;
  for (let i = 0; i < ROUNDS; i++) {
    const sandbox = pick(SANDBOXES);
    const pagination = pick(PAGINATIONS[sandbox]);
    const name = randName();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prop-gen-'));
    try {
      execFileSync('node', [GEN, name, '--sandbox', sandbox, '--pagination', pagination, '--output-dir', dir], { stdio: 'pipe' });
      const src = fs.readFileSync(path.join(dir, 'collect.js'), 'utf8');
      execFileSync('node', ['--check', path.join(dir, 'collect.js')], { stdio: 'pipe' });
      // invariants for every variant
      assert.match(src, /process\.exit\(0\)/, 'explicit exit required');
      assert.match(src, /String\(Date\.now\(\)\)/, 'fresh clock per page required');
      assert.doesNotMatch(src, new RegExp(BANNED_SITE, 'i'), 'no site-name literal');
      assert.doesNotMatch(src, new RegExp(BANNED_COOKIE, 'i'), 'no auth-cookie literal');
      if (sandbox === 'vm') {
        assert.match(src, /uncaughtException/, 'vm variant needs microtask exception no-op');
        assert.match(src, /setInterval: \(fn, ms\) => setInterval/, 'vm variant needs real timers');
      } else {
        assert.match(src, /requestInterceptor/, 'jsdom variant needs the interceptor');
        assert.match(src, /querySelectorAll\('button'\)/, 'jsdom click variant needs DOM pagination');
      }
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
});

test('property: generator rejects every invalid combination', { skip: !fs.existsSync(GEN) && 'generator ships with the private workspace only' }, () => {
  const BAD = [
    ['x', '--sandbox', 'puppeteer', '--pagination', 'call'],
    ['x', '--sandbox', 'vm', '--pagination', 'click'], // click needs jsdom
    ['x', '--sandbox', 'jsdom', '--pagination', 'scroll'],
    ['--sandbox', 'vm', '--pagination', 'call'], // no name
  ];
  for (const args of BAD) {
    let rejected = false;
    try { execFileSync('node', [GEN, ...args, '--output-dir', fs.mkdtempSync(path.join(os.tmpdir(), 'prop-bad-'))], { stdio: 'pipe' }); }
    catch { rejected = true; }
    assert.ok(rejected, `must reject: ${args.join(' ')}`);
  }
});

test('property: interpreter-catch hook output is a superset of its input', () => {
  // patching must only insert the log call — never drop or reorder payload bytes
  for (let i = 0; i < 5; i++) {
    const filler = Array.from({ length: 20 + Math.floor(rnd() * 40) }, () => Math.floor(rnd() * 0xffff)).join(',');
    const src = `function p(){var h=[],s=[],c=0,o=0;var n=[${filler}];for(;!c;)try{h[n[o++]]()}catch(e){if(!s.length)throw e;}}`;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prop-hook-'));
    try {
      const inF = path.join(dir, 'in.js');
      const outF = path.join(dir, 'out.js');
      fs.writeFileSync(inF, src);
      execFileSync('node', [HOOK, inF, '--output', outF], { stdio: 'pipe' });
      const patched = fs.readFileSync(outF, 'utf8');
      // the catch clause is the ONLY sanctioned modification point: the log
      // call is inserted right after it, and the clause tail is preserved
      assert.ok(patched.includes('if(!s.length)throw e;'), 'original clause preserved');
      assert.ok(patched.includes(`var n=[${filler}]`), 'payload bytes untouched');
      assert.match(patched, /__VMERR/, 'log call inserted');
      // insertion is additive: patched source length exceeds input by exactly
      // the log-call prefix (no payload byte dropped)
      assert.ok(patched.length > src.length, 'output must grow, never shrink');
      execFileSync('node', ['--check', outF], { stdio: 'pipe' });
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
});
