# static-toolchain fixtures

Real output of the tools a reverse engineer meets, built from one small CommonJS project, so that
"handled" can be asserted as: **the unbundled / cleaned / decoded tree does what the bundle does**.

| File | Built by | What it must read as / do |
|---|---|---|
| `src/{lib,signer,entry}.js` | — (hand-written source) | the baseline: every bundle below prints what `node src/entry.js` prints |
| `webpack-5.production.js` | webpack 5.113.0 + webpack-cli 7.3.1, `--mode production` | a webpack bundle: 2 mapped modules, the entry **inlined after the bootstrap** |
| `webpack-5.development.js` | same, `--mode development` (`devtool false`) | a webpack bundle: unminified, comments, string module ids |
| `webpack-5.esm.js` | same, production, ES-module sources, module concatenation off | a webpack bundle with harmony modules: the runtime carries `.d` / `.o` helpers |
| `browserify-17.js` | browserify 17.0.1 | a browserify bundle: 3 `[factory, deps]` entries, entry 1 |
| `packer-62.js` | `tests/helpers/packer.js` — the classic P.A.C.K.E.R algorithm **reimplemented**, not a capture | an eval shell; when unpacked: byte-identical to `src/lib.js` |
| `terser-5.minified.js` | terser 5.51.4, `-c -m`, of `src/lib.js` | minified, not obfuscated: `unknown` for the inspector; cleaned output runs like the source |

`tests/fixtures/provenance.json` is the machine-readable version of this table; it is what
`scripts/trace_script_evidence.js` reads to grade a script as *run on real tool output*.

## What is real here and what is not

- The webpack, browserify and terser files are output of those tools, at the versions named, on
  macOS arm64. A rebuilt bundle differs in identifiers and ids; the tests assert behaviour,
  counts and relationships, never an id.
- `packer-62.js` is **not** captured from a site. The unpacker in it is the canonical text; the
  packing is our reimplementation (tests/unit/eval-packer.test.js pins that the helper rebuilds
  the fixture byte for byte). A payload captured from a real site would be stronger evidence.
- Everything here is small and Western-text only. Bundles of several MB, non-ASCII module ids,
  source maps, and multi-chunk webpack output have no sample.

## Missing on purpose

- **webpack 4**: `scripts/unbundle.js` handles its array-shaped module map by code, without a
  sample to run it on. If someone builds one, add it to this table and `provenance.json`.
- **multi-chunk webpack** (`webpackChunk…` bootstrap): neither the inspector nor the unbundler
  knows it.

## Regenerating

```
npx webpack -c webpack.commonjs.config.js --mode production  --output-filename webpack-5.production.js
npx webpack -c webpack.commonjs.config.js --mode development --output-filename webpack-5.development.js
npx webpack -c webpack.esm.config.js        --mode production  --output-filename webpack-5.esm.js
npx browserify src/entry.js -o browserify-17.js
npx terser src/lib.js -c -m -o terser-5.minified.js
node tests/helpers/packer.js src/lib.js packer-62.js
```

Run from a directory where webpack@5 / webpack-cli@7 / browserify@17 / terser@5 are installed;
the two `webpack.*.config.js` files set `context: __dirname`, so the bundle lands next to them.
