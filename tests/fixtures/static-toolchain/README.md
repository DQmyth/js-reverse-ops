# static-toolchain fixtures

Real output of the bundlers and minifiers a reverse engineer meets, built from a few hand-written
sources, so that "handled" can be asserted as: **the unbundled / cleaned / decoded tree does what
the input does** — and, where the input needs a page, what the input does on a page.

Every file here is registered in `tests/fixtures/provenance.json` with its generator and version;
that registry is what `scripts/trace_script_evidence.js` reads to grade a script as *run on real
tool output*. The directory grew with what each review found; "How it grew" says which sample
showed what.

## One bundle in one file

| File | Built by | What it must read as / do |
|---|---|---|
| `src/{lib,signer,entry}.js` | — (hand-written source, CommonJS) | the baseline: every bundle of `src/` prints what `node src/entry.js` prints |
| `webpack-5.production.js` | webpack 5.113.0 + webpack-cli 7.3.1, `webpack.commonjs.config.js`, production | a webpack bundle: 2 mapped modules, the entry **inlined after the bootstrap** |
| `webpack-5.development.js` | same, development | unminified, comment banners, string module ids |
| `webpack-5.esm.js` | same, `webpack.esm.config.js`, production, ES-module sources, module concatenation off | a bundle with harmony (ES module) factories |
| `webpack-5.multichunk.js` | `webpack.multichunk.config.js`, production, from `srcmc/` | a bundle that **loads a chunk at run time**; the unbundler refuses it when it is given alone |
| `webpack-5.multichunk.lazy.js` | the chunk file of that build (renamed from `<id>.main.js`) | a webpack chunk file: `(self.webpackChunk=…).push([[id],{…}])`, one module, no bootstrap |
| `webpack-4.production.js` | webpack 4.47.0 + webpack-cli 4.10.0, `webpack.commonjs.config.js`, production | a webpack 4 bundle: `map[id].call(module.exports, module, module.exports, require)`, the map is the argument of the enclosing function, three `(function (…) {…})` in it |
| `webpack-4.development.js` | same, development | comment banners, `"./src/lib.js": (function (…) {…})` members, a comment line between the bootstrap and its argument |
| `webpack-4.multichunk.js`, `webpack-4.multichunk.lazy.js` | same bundler, `webpack.multichunk.config.js`, production, from `srcmc/` | the webpack 4 pair of the two rows above (`req.e = function (…)` in the bootstrap, the ask made inside a module) |
| `esm-output-webpack-5.mjs` | webpack 5.113.0 + webpack-cli 7.3.1, `webpack.esm-output.config.js`, production | webpack 5 writing an **ES module** (`experiments.outputModule`); runs on its own, prints what `src/entry.js` prints |
| `esm-library-webpack-5.mjs` | same, `webpack.esm-library.config.js`, production, from `srct/lib.js` | webpack 5 writing an ES-module **library**: `export` statements at the top level, the module in the map inside |
| `browserify-17.js` | browserify 17.0.1 | a browserify bundle: 3 `[factory, deps]` entries, entry 1 |
| `packer-62.js` | `tests/helpers/packer.js` — the classic P.A.C.K.E.R algorithm **reimplemented**, not a capture | an eval shell; when unpacked: byte-identical to `src/lib.js` |
| `terser-5.minified.js` | terser 5.51.4, `-c -m`, of `src/lib.js` | minified, not obfuscated: `unknown` for the inspector; cleaned output runs like the source |

Sources: `src/` for most; `srcmc/` (`src/entry.js` plus one dynamic `import()` of `lazy.js`) for
the two `*.multichunk` pairs; `srct/` (below) for the ES-module pair.

## A bundle and the chunk files it loads

Each row is one build, a directory of the files **as the bundler named them** — a main bundle finds
its chunks by those names. The unbundler takes the file with the bootstrap first and the chunk
files after it, and writes one tree. Every tree prints what `node srcsplit/entry.mjs` prints, which
is what the files themselves print on a page (`tests/helpers/page-shim.js` plays it).

Sources: `srcsplit/{entry,lib,signer,shared,lazy-a,lazy-b,deep}.mjs` — ES modules, two dynamic
imports whose targets share one module.

| Directory (files) | Built by | The shape it adds |
|---|---|---|
| `split-webpack-5/` (`main.js`, `lazy-a.js`, `lazy-b.js`) | webpack 5.113.0 + webpack-cli 7.3.1, `webpack.split.config.js`, production | webpack's own cutting: the shared module is **copied** into both chunk files, each minified on its own, so the two copies differ in text |
| `split-webpack-4/` (same names) | webpack 4.47.0 + webpack-cli 4.10.0, same config | the same from webpack 4 (`window.webpackJsonp`; chunk ids 0 and 1 behind the file names) |
| `split-shared-webpack-5/` (`main.js`, `225.js`, `lazy-a.js`, `lazy-b.js`) | webpack 5.113.0, `webpack.split-shared.config.js` (`splitChunks.minSize: 0`) | the shared module has a chunk file of its own; a module of `lazy-a.js` requires a module of the main bundle and one of `225.js` |
| `split-shared-webpack-4/` (`main.js`, `lazy-a.js`, `lazy-b.js`, `lazy-a~lazy-b.js`) | webpack 4.47.0, same config | the same from webpack 4 |
| `runtime-webpack-5/` (`runtime.js`, `main.js`, `225.js`, `lazy-a.js`, `lazy-b.js`) | webpack 5.113.0, `webpack.runtime.config.js` (`runtimeChunk: 'single'`) | **runtimeChunk**: the bootstrap is a file of its own with no module; the entry is an entry chunk file with start-up code of its own, which a page loads right after the runtime |
| `runtime-webpack-4/` (`runtime.js`, `main.js`, `lazy-a~lazy-b.js`, `lazy-a.js`, `lazy-b.js`) | webpack 4.47.0, same config | the same from webpack 4 (its start-up code is a list of deferred modules) |
| `dev-webpack-5/` (`main.js`, `lazy-a.js`, `lazy-b.js`) | webpack 5.113.0, `webpack.split.config.js`, **development** | unminified: module ids are paths, chunk ids are names (`"lazy-a"`), the ask is `req.e(/* import() */ "lazy-a")` |
| `dev-webpack-4/` (same names) | webpack 4.47.0, same config | the same from webpack 4 |
| `dev-shared-webpack-5/` (`main.js`, `srcsplit_shared_mjs.js`, `lazy-a.js`, `lazy-b.js`) | webpack 5.113.0, `webpack.split-shared.config.js`, development | the shared chunk as a file of its own, by a name |

## Hard for a token scanner

`srct/{lib,entry}.js`: ordinary code made of the constructs a scanner has to get right — a
template literal that holds a template in its interpolation (which holds one again), regexes after
the `)` of a nested condition and after the `}` of a block, a regex with quotes, braces and an
escaped bracket in its character class, division beside regexes, quotes slashes and comment marks
inside template text.

| File | Built by | What it must do |
|---|---|---|
| `webpack-5.scanner.js`, `webpack-4.scanner.js` | webpack 5.113.0 / webpack 4.47.0, `webpack.scanner.config.js`, production | bundles of `srct/` that print what `node srct/entry.js` prints |
| `webpack-5.scanner.development.js`, `webpack-4.scanner.development.js` | the same, development | the same, unminified |

`tests/unit/token-scanner.test.js` compares the scanner with a real parser (esprima) on every file
of this collection that esprima can read.

## Another bundler around bundles

`esbuild/`. The sources are three entries in `esbuild/src/` that reach files of this collection
through relative paths: one webpack 4 bundle, two of them, a plain module. `esbuild/build.js`
rebuilds the outputs (esbuild is not a dependency of this package).

| File | Built by | What it shows |
|---|---|---|
| `esbuild/esbuild-plain.cjs.js` | esbuild 0.27.2, `bundle`, format `cjs`, not minified | plain esbuild output; its runtime helper `__commonJS` names the bundler |
| `esbuild/esbuild-plain.iife.min.js` | esbuild 0.27.2, format `iife`, minified | minified, esbuild renames its helpers: nothing names the bundler, and the inspector says `unknown` |
| `esbuild/esbuild-around-one-bundle.js` | esbuild 0.27.2, format `cjs` | one bundle inside a wrapper: esbuild named first, the bundle second. The unbundler cuts the bundle; the wrapper stays in `runtime.js` |
| `esbuild/esbuild-around-one-bundle.mjs` | esbuild 0.27.2, format `esm` | the same written as an ES module (`import { createRequire }` at the top): the tree is `runtime.mjs` |
| `esbuild/esbuild-around-two-bundles.js` | esbuild 0.27.2, format `cjs` | two bundles in one file: `several-webpack-bundles`. The unbundler refuses it |

## What is real here and what is not

- The webpack, esbuild, browserify and terser files are output of those tools, at the versions
  named, on macOS arm64. The tests assert behaviour, counts and relationships — and, where it
  makes a statement readable, an id (`556`, `970`): ids are deterministic for a fixed source,
  bundler and version; a rebuild with another version changes them, and the tests with them.
- `packer-62.js` is **not** captured from a site. The unpacker in it is the canonical text; the
  packing is our reimplementation (tests/unit/eval-packer.test.js pins that the helper rebuilds
  the fixture byte for byte). A payload captured from a real site would be stronger evidence.
- Everything here was built for this repository, from sources written for it, and most of it is
  small. The one bundle in the suite that nobody here built is a package dependency:
  `tests/unit/unbundle.test.js` cuts esprima's own distribution file, as installed. Files ten
  times larger from installed packages were read by hand in the reviews — a 1.7 MB UMD webpack
  bundle, a 3.2 MB ES module that esbuild built around a webpack bundle, a 526 KB file of four
  webpack bundles in esbuild wrappers — and what they showed became the fixtures above.
- No sample of: a site-sized build (hundreds of chunks), non-ASCII module ids, source maps, CSS or
  worker chunks, webpack `target: node` chunk loading, webpack `devtool: eval` output (factories in
  `eval(…)`), a chunk file holding `[factory, deps]` pairs, a chunk file registering several
  chunk ids, parcel or rollup output, a **minified** esbuild bundle around webpack bundles.

## How it grew

Each review built what had been claimed without a sample, and kept what broke:

- **v1.9.1 — webpack 4 and chunks.** v1.9.0 documented webpack 4 handling with no webpack 4 file.
  Built, the inspector read both webpack 4 bundles as `unknown`; the unbundler refused one and
  wrote a `runtime.js` that did not parse for the other; for a bundle with a lazy chunk it printed
  success and wrote a tree that failed at run time.
- **v1.9.2 — one tree for a bundle with its chunks.** The `split-*` builds came before the code and
  taught three things: webpack 5's default publicPath reads the document at start-up; a module
  copied into two chunk files is minified twice, so the copies differ; in webpack 4 the ask for a
  chunk sits inside a module.
- **v1.9.3 — shapes never built here before.** `runtime-*`: the runtime on its own was refused as
  "module map not recognised", and an entry chunk has to be registered last in a tree or its
  start-up asks for chunks that are not there yet. `dev-*`: module files were written with the id's
  `.mjs` ending and Node refused to load them — the unbundler had printed success. Then `srct/`
  and its four bundles, after a real bundle with a template inside a template's interpolation had
  the scanner miscount the braces after it. Then files from installed packages: a bundle esbuild
  wrapped, with `import` at the top level, whose runtime has to be `.mjs`; a file of four bundles
  that was cut at the first and reported done; a module map whose keys a minifier wrote as `19e3`.
  Those became `esm-*`, `esbuild/*`, and cases of `tests/unit/token-scanner.test.js`.

## Regenerating

With the tools installed and this directory the working one (webpack@5 + webpack-cli@7 in one
place to run them from, webpack@4 + webpack-cli@4 in another; browserify@17; terser@5):

```
webpack -c webpack.commonjs.config.js        --mode production  --output-path <dir>
webpack -c webpack.commonjs.config.js        --mode development --output-path <dir>
webpack -c webpack.esm.config.js             --mode production  --output-path <dir>
webpack -c webpack.multichunk.config.js      --mode production  --output-path <dir>
webpack -c webpack.split.config.js           --mode production  --output-path <dir>
webpack -c webpack.split.config.js           --mode development --output-path <dir>
webpack -c webpack.split-shared.config.js    --mode production  --output-path <dir>
webpack -c webpack.split-shared.config.js    --mode development --output-path <dir>
webpack -c webpack.runtime.config.js         --mode production  --output-path <dir>
webpack -c webpack.scanner.config.js         --mode production  --output-path <dir>
webpack -c webpack.scanner.config.js         --mode development --output-path <dir>
webpack -c webpack.esm-output.config.js      --mode production  --output-path <dir>
webpack -c webpack.esm-library.config.js     --mode production  --output-path <dir>
browserify src/entry.js -o browserify-17.js
terser src/lib.js -c -m -o terser-5.minified.js
node tests/helpers/packer.js src/lib.js packer-62.js
node esbuild/build.js <path to an installed esbuild package>
```

The configs set `context: __dirname`, so the sources resolve relative to the config — whatever
directory the bundler is run from. Each build writes `main.js` and its chunk files as the bundler
names them: those names are kept, as the tables give them, because a main bundle finds its chunks
by them. The only renames are the `*.multichunk` pairs (`main.js` → `webpack-<4|5>.multichunk.js`,
the chunk file → the matching `.lazy.js`). The webpack 4 rows are the same configs — `commonjs`,
`multichunk`, `split`, `split-shared`, `runtime`, `scanner` — run with webpack 4; webpack-cli 4
has no `--output-filename`, hence `--output-path` everywhere.
