# Environment-Rebuild Recipe Cards

Verbatim-execution recipes for making browser-only JS run correctly inside a
Node sandbox (vm or jsdom). Each card: **symptom → recipe → why it works**.
All recipes are verified against yuanrenxue match topics 22-29 and 24.
Generic decision framework: [../public/playbooks/env-gated-crypto-differential.md](../public/playbooks/env-gated-crypto-differential.md).

Rule zero: **prefer running the target's own code verbatim over hand-porting
the algorithm.** Hand transcription loses env-gated branches; verbatim
execution plus the recipes below lets the code pick its own constants.
Calibrate with an in-process oracle (a register dump, a known vector) before
trusting server 200/403.

## Card 1 — Native-masked global classes

Symptom: probes like `String(Document) === "function Document() { [native code] }"`
or `typeof X === "function"` select wrong branches.

Recipe:

```js
function nativeFn(name) {
  const f = { [name]: function () {} }[name];
  f.toString = function () { return 'function ' + name + '() { [native code] }'; };
  return f;
}
sandbox.Document = nativeFn('Document'); // repeat per probed class
```

Why: obfuscators gate constants on native-shape checks; class transpilers and
jsdom leak class source through `String()`.

## Card 2 — Class-tag probes (`Object.prototype.toString`)

Symptom: `Object.prototype.toString.call(document) === "[object HTMLDocument]"`
fails.

Recipe: `const document = { [Symbol.toStringTag]: 'HTMLDocument', ... }`
(same for `navigator` → `'Navigator'`).

Why: `Object.prototype.toString` reads `Symbol.toStringTag` first; one line
satisfies the probe exactly.

## Card 3 — Never pass host `eval` / `Function` / builtins into vm.createContext

Symptom: `ReferenceError: document is not defined` raised from `eval` frames,
or every environment probe fails although all stubs exist.

Recipe: sandbox contains **only BOM/DOM stubs** (`document`, `navigator`,
`location`, timers, `$`, XHR, storage). Do not pass `eval`, `Function`,
`Object`, `Array`, `Math`, `JSON`, `Promise`, ... — the vm context already
has its own ECMAScript builtins.

Why: a host `eval` keeps its scope chain bound to the **host global**, so
indirect-eval payloads resolve free variables against the wrong global. Host
builtins also betray configurability/identity probes.

## Card 4 — Real timers, not synchronous stubs

Symptom: first token computes correctly but every later call emits an empty
or divergent token; no exception, no global change.

Recipe:

```js
setTimeout: (fn, ms) => setTimeout(() => { try { fn(); } catch (e) {} }, ms),
setInterval: (fn, ms) => setInterval(() => { try { fn(); } catch (e) {} }, ms),
```

plus `process.on('uncaughtException'/'unhandledRejection', () => {})`, then
**wait a few seconds after boot before using the signer**.

Why: shells sample fingerprints (Error-constructor messages, URI-malformed
probes) inside timer callbacks; synchronous or no-op timers mean the
self-check never runs and later token branches silently degrade. The
deliberate probe throws escape function-level try/catch via microtasks.

## Card 5 — Getter-only properties need defineProperty

Symptom: assignments like `navigator.webdriver = false` silently no-op.

Recipe: `Object.defineProperty(target, key, { configurable: true, get() { return val; } })`
on the instance or prototype — never plain assignment, never a plain Proxy
swap on `window.navigator`.

## Card 6 — `Function.prototype.constructor === Function` probes

Symptom: a guarded Function shim breaks identity probes and the shell takes a
degraded branch.

Recipe: prefer the vm context's own Function (don't shim at all). If a shim
is unavoidable (infinite-loop bytecode), keep
`shim.prototype = Function.prototype` AND `shim.toString` native-masked, and
expect the identity probe to still fail — then patch the probe's consumer,
not the probe.

## Card 7 — Element/DOM stubs with encoding side-channels

Symptom: per-character encoding differs (`&254` vs `&255` masks, missing low
bits) or byte streams diverge at the first non-ASCII char.

Recipe: check for `print` / `window.chrome` / `Notification` style
side-conditions near the encoder; define exactly the globals the target
checks (`print` exists natively in Chrome, `require`/`__dirname` do not).

Why: encoders commonly branch on "am I in a browser?" via globals that exist
in Node; each flipped branch corrupts every subsequent byte.

## Card 8 — Fresh context per page when signer state is per-page

Symptom: page 1 token valid, page 2+ empty or invalid after in-process
pagination attempts.

Recipe: re-run the whole boot in a fresh sandbox per page and trigger the
page's own pagination (click handler / `call(N)`), rather than extracting and
reusing the signer function. Stateful signers (keyed hash chains, nonce
pools, RSA padding counters) cannot be reused across calls.

## Card 9 — Inline proxy for short-TTL tokens

Symptom: token valid when captured but 403 by the time you send it (TTL
seconds); frozen-clock sandboxes always fail.

Recipe: the resource interceptor answers `/api/getTime` with the current
server time and performs the REAL https request inside the interceptor the
moment the page assembles it, feeding the real response back to the page.
Refresh the frozen time before every page. Zero delay between signing and
sending.

## Card 10 — Calibration oracle before any token

Symptom: sandbox "works" (no errors, token produced) but server rejects.

Recipe: dump an in-process artifact the browser also exposes — post-`reset()`
register array, alphabet table, decoded constant sample — and diff
word-by-word against a browser capture before computing production tokens.
Server 200/403 is the final oracle; the in-process dump is the fast one.
