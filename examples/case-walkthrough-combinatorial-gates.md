# Case Walkthrough: Combinatorial Environment Gates in a Modified Hash

A sanitized walkthrough of a practice-set target where the "modified
algorithm" was actually a combinatorial system of environment gates, and
where five rounds of hand-written pure-algorithm replay failed before a
verbatim-execution harness solved it in one pass. Techniques:
`../references/env-rebuild-recipes.md` cards 1-3, 7, 10; playbook step 5b.

## Target profile

- A sign/token endpoint whose token is a 64-hex digest of
  `path + now + page` — nominally a well-known hash standard.
- The challenge script is an `eval(unpacker(base64))` bundle; after
  unwrapping, every real statement is wrapped in opaque predicates and
  every meaningful constant is selected at runtime.

## Why hand-porting failed five times

The hash deviates from the standard in more places than a static read
suggests:

1. **The init vector is not a constant.** Each of the 8 state words is its
   own ternary chain: `typeof X === "function" ? (String(X) ===
   "function X() { [native code] }" ? A : B) : C` over a list of probed
   globals. One probed global is Node-only (`require`), another is
   browser-only (`print`) — so the "browser value" differs per word and
   the Node-reachable value differs again.
2. **The per-character encoder has a side-channel gate**: when
   `typeof __dirname === "undefined"` AND the native `print` global exists,
   every input byte is masked `& 254` instead of `& 255` — clearing the low
   bit of every character. A hand-written port that always masks `& 255`
   corrupts the entire input silently.
3. The round function carries three additional masks on SS1/TT1/TT2 and two
   custom round constants.

An 81-combination enumeration over "which masks apply" failed because the
parameter space itself was wrong: two gates had flipped the encoder and one
IV word. **Enumeration over a mis-modeled space converges to nothing.**

## The approach that worked

1. Unwrap the bundle once (`eval(unpacker(base64))` → readable code) and
   locate the signer function boundaries.
2. Extract the signer **verbatim** — including its private obfuscation
   helper table — into a `vm.createContext` sandbox.
3. Inject only BOM/DOM stubs. Critically: native-masked `toString` classes
   for every probed global, a native `print`, and **no** `require` /
   `__dirname` / host builtins (let the context provide them).
4. Calibrate before computing: after construction, dump the 8 state words
   and diff word-by-word against a browser-captured register dump. Any
   mismatch exits non-zero — this is the fast oracle; the server is only
   the final one.
5. Token = the page's own `sign(path + now + page)`; the `now` comes from a
   server time endpoint and must be **re-fetched per page** (the server
   rejects a shared clock once pagination exceeds the skew window).

## Result

Five pages captured with a stable, repeating total; submission accepted.
The recorded pitfall ledger, per-recipe code, and the calibration dump live
in `references/env-rebuild-recipes.md`.
