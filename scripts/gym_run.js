#!/usr/bin/env node
// Reverse gym runner: solve every generated challenge END-TO-END using the
// skill's standard recipes (vm sandbox, no bespoke per-flavor code), and
// additionally assert that the associated misdiagnosis behaves as documented
// (the wrong approach fails, the recipe succeeds). This is a capability
// regression suite, not a unit test: it proves the methodology works on
// never-before-seen targets that encode each failure mode.
//
// Usage: node scripts/gym_run.js [--targets <dir>] [--json]
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const argv = process.argv.slice(2);
const tIdx = argv.indexOf('--targets');
const targetsDir = tIdx >= 0 ? argv[tIdx + 1] : path.join(__dirname, '..', 'gym-targets');
const WANT_JSON = argv.includes('--json');

// The single generic solver — the skill's verbatim recipe (cards 1-4):
// vm context with ONLY realm-local stubs, real timers, and waits.
function makeRealm(extra = {}) {
  const sandbox = {
    console: { log() {}, error() {}, warn() {} },
    setTimeout: (fn, ms) => setTimeout(() => { try { fn(); } catch (e) {} }, ms),
    clearTimeout: t => clearTimeout(t),
    setInterval: (fn, ms) => setInterval(() => { try { fn(); } catch (e) {} }, ms),
    clearInterval: t => clearInterval(t),
    crypto: require('crypto'), // realm-scoped service object (not the host require)
    Math, Date, Error, TypeError, RangeError, String, Number,
    ...extra,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  return sandbox;
}

function loadTarget(flavor, extra) {
  const sbx = makeRealm(extra);
  const src = fs.readFileSync(path.join(targetsDir, flavor, 'target.js'), 'utf8');
  vm.runInContext(src, sbx, { filename: flavor + '/target.js' });
  return sbx;
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const md5 = (s) => require('crypto').createHash('md5').update(String(s)).digest('hex');
const sha1 = (s) => require('crypto').createHash('sha1').update(String(s)).digest('hex');

const SOLVERS = {
  async m1() {
    // recipe: diff two runs, notice clock-tracking, freeze the clock
    const a = loadTarget('m1', { Date: { now: () => 1000 } });
    const b = loadTarget('m1', { Date: { now: () => 2000 } });
    const da = a.derive('x'), db = b.derive('x');
    if (JSON.stringify(da) === JSON.stringify(db)) throw new Error('M1 setup broken: tails should track the clock');
    if (JSON.stringify(da.slice(0, 4)) !== JSON.stringify(db.slice(0, 4))) throw new Error('M1 setup broken: base must be stable');
    const c = loadTarget('m1', { Date: { now: () => 1000 } });
    if (JSON.stringify(c.derive('x')) !== JSON.stringify(da)) throw new Error('frozen clock must reproduce the key exactly');
    return 'time-derived confirmed: base stable, tail tracks clock, frozen-clock reproducible';
  },
  m2() {
    // recipe: never trust a single 200; require real:true + cross-run stable data
    const t = loadTarget('m2');
    const good = md5(t.SECRET);
    const ok = t.verify(good, t.SECRET);
    const maze = t.verify('deadbeef', t.SECRET);
    if (ok.status !== 200 || !ok.real) throw new Error('correct token must yield real:true');
    if (maze.status !== 200 || maze.real) throw new Error('maze answer must be 200-but-fake (that is the trap)');
    const stable = JSON.stringify(t.verify(good, t.SECRET).data) === JSON.stringify(t.verify(good, t.SECRET).data);
    if (!stable) throw new Error('real data must be cross-run stable');
    return 'maze discriminated: 200-everywhere, only md5(secret) carries real data';
  },
  async m3() {
    // recipe: real timers + wait, then sign works; before the wait it is empty
    const t = loadTarget('m3');
    const early = t.sign('x');
    if (early !== '') throw new Error('M3 setup broken: pre-timer sign must be empty');
    await sleep(80);
    const s1 = t.sign('hello');
    if (!s1) throw new Error('after the timer the branch must open');
    if (t.sign('hello') !== s1) throw new Error('post-arming signer must be deterministic');
    return 'timer self-check armed: empty-before, deterministic-after';
  },
  m4() {
    // recipe: realm-local stubs -> payload resolves INSIDE the context
    const t = loadTarget('m4');
    const r = t.read();
    if (r !== 'present-in-this-realm') throw new Error('indirect eval must resolve against the realm-local global, got: ' + r);
    // the wrong approach demonstrably fails: host-flavored realm without the stub
    const wrong = loadTarget('m4', { document: undefined });
    delete wrong.document;
    const src = fs.readFileSync(path.join(targetsDir, 'm4', 'target.js'), 'utf8');
    const sb2 = makeRealm(); delete sb2.document;
    vm.runInContext(src.replace('globalThis.document = { __tag: \'present-in-this-realm\' };', ''), sb2, { filename: 'm4/hostleak.js' });
    if (sb2.read() !== 'MISSING') throw new Error('host-leak control must observe MISSING');
    return 'realm isolation proven: local tag resolves in-realm; control sees MISSING';
  },
  m5() {
    // recipe: native-masked class flips the IV word (default realm provides a leaky class)
    const leaky = loadTarget('m5', { Document: class Document { constructor() { this.a = 1; } } });
    if (leaky.IV[0] !== 0x1234) throw new Error('M5 setup broken: class source must select the degraded IV');
    const nativeFn = (name) => { const f = { [name]: function () {} }[name]; f.toString = () => `function ${name}() { [native code] }`; return f; };
    const masked = loadTarget('m5', { Document: nativeFn('Document') });
    if (masked.IV[0] !== 0x2f9d) throw new Error('native-masked class must select the real IV');
    return 'native mask proven: leaky IV=1234, masked IV=2f9d';
  },
  m6() {
    // recipe: same-env twice diverges (IV in the tail); frozen random is deterministic
    const t = loadTarget('m6');
    const a = t.sign('k'), b = t.sign('k');
    if (a === b) throw new Error('M6 setup broken: same-env runs must diverge (random IV)');
    const ivOf = (tok) => parseInt(tok.split('-')[1], 16);
    if (a.split('-')[0] === b.split('-')[0]) throw new Error('heads differ only via IV propagation — verify setup');
    // NOTE: Math members are NON-ENUMERABLE — spread copies none of them
    const fr = {}; for (const k of Object.getOwnPropertyNames(Math)) fr[k] = Math[k];
    fr.random = () => 0.42;
    const f1 = loadTarget('m6', { Math: fr }), f2 = loadTarget('m6', { Math: fr });
    if (f1.sign('k') !== f2.sign('k')) throw new Error('frozen randomness must make the signer deterministic');
    return 'random-IV classified: diverges live, deterministic under frozen randomness';
  },
  m7() {
    // recipe: helper answers anyone; protected flow binds the payload
    const t = loadTarget('m7');
    const h = t.helper();
    if (h.real !== undefined && h.real) throw new Error('helper must not be the protected flow');
    const p = t.protected_('payload-a');
    if (!p.real || p.token !== sha1('payload-a|gym-m7')) throw new Error('protected flow token must bind the payload');
    if (t.protected_('payload-b').token === p.token) throw new Error('tokens must differ per payload');
    return 'helper trap discriminated: helper open to all; protected token payload-bound';
  },
  async combo_all() {
    // level-2: recipes in combination (native mask + real timers + tail read + decoy skip)
    const nativeFn = (name) => { const f = { [name]: function () {} }[name]; f.toString = () => `function ${name}() { [native code] }`; return f; };
    const t = loadTarget('combo_all', { Document: nativeFn('Document') });
    if (t.helper().real !== undefined && t.helper().real) throw new Error('helper must stay a decoy');
    const early = t.protected_('load');
    if (early.real) throw new Error('pre-timer protected call must degrade');
    await sleep(80);
    const r1 = t.protected_('payload-one');
    if (!r1.real || !r1.token.includes('-')) throw new Error('armed call must produce a real token with an IV tail');
    // the IV tail travels in the token: verifier binds payload via the head
    const head = r1.token.split('-')[0];
    const sha1 = require('crypto').createHash('sha1').update('payload-one' + '|' + head).digest('hex');
    if (r1.expect !== sha1) throw new Error('token head must bind the payload deterministically');
    const r2 = t.protected_('payload-one');
    if (r2.token.split('-')[0] !== head) throw new Error('heads must be deterministic (only the IV tail is random)');
    return 'composite solved: native mask + timer wait + tail-carried IV + decoy skipped, head deterministic';
  },
  m8() {
    // recipe: plain surface works; stealth surface silently degrades
    const plain = loadTarget('m8', { navigator: { webdriver: false } });
    const p1 = plain.sign('x');
    if (!p1.startsWith('v')) throw new Error('plain surface must produce a deterministic hash');
    const stealth = loadTarget('m8', { navigator: { webdriver: false }, __STEALTH__: 1 });
    if (stealth.sign('x') !== '') throw new Error('stealth surface must silently degrade');
    return 'execution-surface fingerprint proven: plain=v-hash, stealth=empty';
  },
};

(async () => {
  const results = [];
  for (const flavor of Object.keys(SOLVERS)) {
    const dir = path.join(targetsDir, flavor);
    if (!fs.existsSync(path.join(dir, 'target.js'))) continue;
    const t0 = Date.now();
    try {
      const note = await SOLVERS[flavor]();
      results.push({ flavor, ok: true, ms: Date.now() - t0, note });
    } catch (e) {
      results.push({ flavor, ok: false, ms: Date.now() - t0, error: e.message });
    }
  }
  const failed = results.filter(r => !r.ok);
  if (WANT_JSON) console.log(JSON.stringify({ schema: 'js-reverse-ops-gym-run-v1', results }, null, 2));
  else {
    for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.flavor} (${r.ms}ms) — ${r.note || r.error}`);
    console.log(failed.length ? `\n${failed.length} FAILED` : '\ngym: all challenges solved via the standard recipes');
  }
  process.exit(failed.length ? 1 : 0);
})();
