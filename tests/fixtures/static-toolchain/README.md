# static-toolchain fixtures

Real output of the tools a reverse engineer meets, built from one small CommonJS project, so that
"handled" can be asserted as: **the unbundled / cleaned / decoded tree does what the bundle does**.

| File | Built by | What it must read as / do |
|---|---|---|
| `src/{lib,signer,entry}.js` | — (hand-written source) | the baseline: every bundle below prints what `node src/entry.js` prints |
| `webpack-5.production.js` | webpack 5.113.0 + webpack-cli 7.3.1, `--mode production` | a webpack bundle: 2 mapped modules, the entry **inlined after the bootstrap** |
| `webpack-5.development.js` | same, `--mode development` (`devtool false`) | a webpack bundle: unminified, comments, string module ids |
| `webpack-5.esm.js` | same, production, ES-module sources, module concatenation off | a webpack bundle with harmony modules: the runtime carries `.d` / `.o` helpers |
| `webpack-5.multichunk.js` | same, production, from `srcmc/` | a bundle that **loads a chunk at run time**: `chunk_loading: true`; the unbundler refuses it |
| `webpack-5.multichunk.lazy.js` | the chunk file of the build above (renamed from `<id>.main.js`) | a webpack chunk file: `(self.webpackChunk=…).push([[id],{…}])`, one module, no bootstrap |
| `webpack-4.production.js` | webpack 4.47.0 + webpack-cli 4.10.0, `--mode production` | a webpack 4 bundle: `map[id].call(module.exports, module, exports, require)`, the map is the argument of the enclosing function, three `(function (…) {…})` in it |
| `webpack-4.development.js` | same, `--mode development` | the same with comment banners, `"./src/lib.js": (function (…) {…})` members, a comment line between the bootstrap and its argument |
| `webpack-4.multichunk.js` | same, production, from `srcmc/` | a bundle that **loads a chunk at run time**: `req.e = function (…)` in its bootstrap; the unbundler refuses it |
| `webpack-4.multichunk.lazy.js` | the chunk file of the build above (renamed from `<id>.js`) | a webpack chunk file: `(window.webpackJsonp=…).push([[id],{…}])`, one module |
| `browserify-17.js` | browserify 17.0.1 | a browserify bundle: 3 `[factory, deps]` entries, entry 1 |
| `packer-62.js` | `tests/helpers/packer.js` — the classic P.A.C.K.E.R algorithm **reimplemented**, not a capture | an eval shell; when unpacked: byte-identical to `src/lib.js` |
| `terser-5.minified.js` | terser 5.51.4, `-c -m`, of `src/lib.js` | minified, not obfuscated: `unknown` for the inspector; cleaned output runs like the source |
| `srcmc/{entry,lib,signer,lazy}.js` | — (hand-written source) | `src/entry.js` plus one dynamic `import()` of `lazy.js`: the root of the two multi-chunk builds |

`tests/fixtures/provenance.json` is the machine-readable version of this table; it is what
`scripts/trace_script_evidence.js` reads to grade a script as *run on real tool output*.

## What is real here and what is not

- The webpack, browserify and terser files are output of those tools, at the versions named, on
  macOS arm64. A rebuilt bundle differs in identifiers and ids; the tests assert behaviour,
  counts and relationships, never an id.
- `packer-62.js` is **not** captured from a site. The unpacker in it is the canonical text; the
  packing is our reimplementation (tests/unit/eval-packer.test.js pins that the helper rebuilds
  the fixture byte for byte). A payload captured from a real site would be stronger evidence.
- Everything here is small and Western-text only. Bundles of several MB, non-ASCII module ids and
  source maps have no sample.
- Each multi-chunk build has **one** lazy chunk holding **one** module, and its main bundle cannot
  be run without a page (it registers on `self` / `window`). More chunks, shared chunks, and a
  chunk whose modules require other modules have no sample.

## webpack 4 and multi-chunk output were claimed before they had a sample

Until the review after v1.9.0 the inspector and the unbundler were documented as handling webpack
4, with no webpack 4 file here and the unbundler's header reading "NOT verified". The six files
above were built for that review, and what they showed:

- the inspector read both webpack 4 bundles as `unknown`;
- the unbundler refused the production bundle, and for the development one wrote a `runtime.js`
  that did not parse (its own check caught that, exit 1) — the `"id": function (…) {…}` member
  shape had never been run;
- for the webpack 5 bundle with a lazy chunk the unbundler printed success, exit 0, and wrote a
  tree that failed at run time.

All three are pinned by tests now (`tests/unit/unbundle.test.js` and
`tests/unit/inspect-obfuscation-family.test.js`; run either with `MUTATOR_TOOL=<path to the older
script>` and those cases fail).

## Regenerating

```
npx webpack -c webpack.commonjs.config.js --mode production  --output-filename webpack-5.production.js
npx webpack -c webpack.commonjs.config.js --mode development --output-filename webpack-5.development.js
npx webpack -c webpack.esm.config.js        --mode production  --output-filename webpack-5.esm.js
npx webpack -c webpack.multichunk.config.js --mode production --output-path <dir>          # main.js + <id>.main.js
npx browserify src/entry.js -o browserify-17.js
npx terser src/lib.js -c -m -o terser-5.minified.js
node tests/helpers/packer.js src/lib.js packer-62.js
```

For the webpack 4 files, the same three webpack commands in a directory where webpack@4 and
webpack-cli@4 are installed: webpack-cli 4 has no `--output-filename`, so `--output-path <dir>`
there for all three; it writes `main.js` (and `<id>.js` for the chunk), to be renamed.

Run from a directory where the tools are installed and this one is on the path, or copy the three
`webpack.*.config.js` files next to a local install: they set `context: __dirname`, so the sources
resolve relative to the config and the bundle lands next to it (or in `--output-path`). webpack 4
and webpack 5 do not install into one `node_modules`; use two.

Still no sample: parcel, rollup and esbuild output, webpack `devtool: eval` output (factories
wrapped in `eval(…)`), a chunk file holding `[factory, deps]` pairs.
