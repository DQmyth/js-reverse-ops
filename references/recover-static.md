# Recover Static

This reference absorbs the strongest static-analysis guidance from legacy JS reverse-engineering workflows and places it under the `Recover` stage.

## Static-first Decision Rules

Use static-heavy recovery when:

- the user gives you a local JS file or bundle
- the browser path is unavailable or unnecessary
- the target is obfuscation-heavy but runtime capture is not yet needed
- the goal is readability, bundler recovery, source reconstruction, or version diffing

Do not stay static-first when:

- the real request is still unknown
- the site is runtime-driven, cookie-driven, or JSONP-driven
- endpoint strings or field names are missing from loaded sources
- the current static output is producing helper endpoints, assets, or conflicting contracts

## Preferred Order

1. Look for source maps or original-source headers first.
2. Identify bundler family before deobfuscation.
3. Preserve original artifacts before every transform.
4. Apply the smallest transform that increases readability.
5. Cut local neighborhoods around request builders before reading the whole file.
6. Only do name recovery after structural recovery is stable.

## Tool Matrix

These tools are not required, but they are the best-known static helpers worth preserving from the older skill.

| Task | Primary Tool | Alternatives |
|---|---|---|
| source map extraction | browser/network inspection | custom download script |
| deobfuscate obfuscator.io | `scripts/recover_string_table.js` (webcrack inside) | `scripts/decode_string_array_runtime.js` for plain/base64 tables without it; `restringer` |
| decide what the file is | `scripts/inspect_obfuscation_family.js` — by shape; knows a webpack 4 / webpack 5 bundle, a webpack chunk file, and says when a bundle loads chunks at run time (`details.webpack.chunk_loading`); `next_tools` names the first thing to run | — |
| unbundle webpack (4 / 5) or browserify output: a bundle whose modules are all in the file | `scripts/unbundle.js` — factories moved verbatim into `modules/`, a `runtime.js` that runs like the bundle; written as an ES module, a `runtime.mjs`. Minified or not (verified: webpack 4.47 and 5.113 in production and in development, webpack 5 as an ES module (a script and a library), browserify 17, four bundles whose text is hard for a token scanner, and — a bundle nobody here built — esprima's distribution file, whose tree parses to the same AST) | webcrack 2.16 unpacks browserify; it returned no bundle for webpack 5 in the 1.8.7 review |
| split a webpack chunk file (`(self.webpackChunk=…).push([[245],{829(e){…}}])`) into its modules | `scripts/unbundle.js` — the same tree; its `runtime.js` registers the chunk as the file did (verified: one chunk file each from webpack 4.47 and 5.113, each of one module) | — |
| unbundle a bundle that loads chunks at run time | `node scripts/unbundle.js main.js <chunk.js> … --out <dir>` — the bundle and its chunk files into ONE tree: every module of every file, a `graph.json` saying which file each stands in and what each require resolves to, a `runtime.js` that does what the whole set did (the chunks are registered before the bundle starts, as one that arrived early would be). The inspector names the chunks asked for (`chunk_calls`) so the files can be collected. Chunk files missing are named; the tree fails, with a reason, when one is needed. The file with the bootstrap first; with `runtimeChunk` that is the runtime file, and its entry chunk is registered last. Verified on eleven real sets (webpack 4.47 and 5.113: default splitting, splitChunks, runtimeChunk, development mode). Handed the bundle alone the tool refuses | — |
| a file with several bundles in it (bundles bundled again — esbuild around webpack output) | **not done**: both tools say so. The inspector names the outer bundler and counts the bundles (`bundles_in_file`); the unbundler refuses (it used to cut the first and report done). One bundle inside such a wrapper is cut, the wrapper kept in the runtime | — |
| an AST readability pass over a webpack 5 bundle that has a chunk runtime | **not done**: `run_ast_pipeline.js` reads syntax up to ES2019 and the runtime uses `?.` — it refuses and says so. `unbundle.js` needs no parser and still splits | — |
| unbundle parcel / rollup, esbuild alone, webpack with an eval devtool, a chunk file holding `[factory, deps]` pairs; tell a minified esbuild bundle from any other file | **nothing verified here** | — |
| unpack the classic `eval(function(p,a,c,k,e,d){…})` shell | `scripts/decode_eval_wrapper.js` — byte-identical to the source on a packer-built sample | — |
| unminify syntax | `wakaru` | formatter + manual passes |
| variable-name recovery | `humanify` | custom AST rename passes |
| structural search | `ast-grep` | `semgrep` |
| AST transforms | `babel` + traverse | `recast`, `jscodeshift` |
| minified version diff | `difftastic` | AST diff |

## Static Recovery Patterns

Prioritize these patterns:

- string array + rotation
- control-flow flattening
- dead code injection
- proxy wrappers
- computed member access
- unicode and hex escapes
- bundler runtime wrappers

Map them into existing `js-reverse-ops` scripts whenever possible:

- `scripts/inspect_obfuscation_family.js`
- `scripts/unbundle.js`
- `scripts/recover_string_table.js`
- `scripts/decode_string_array_runtime.js`
- `scripts/run_ast_pipeline.js`
- `scripts/extract_request_neighborhood.js`
- `scripts/diff_builds.js`
- `scripts/function_diff.js`

### String tables: what is measured

| Route | Use it when | Verified on |
|---|---|---|
| `node scripts/recover_string_table.js <file> --output out.js` — webcrack as a library | first, always (optional dependency: `npm install` in the repo; Node 22 or 24) | javascript-obfuscator 2.19 / 4.1 / 5.10 output — plain string table, and rc4 + rotation + flattening + dead code + self-defending — and a live 127 KB bundle: every lookup back to a literal, the file back to the size of its source, the output runs and prints what the sample prints |
| `node scripts/decode_string_array_runtime.js <file> --dump` — runs the sample's own decoder | no webcrack, another Node, a plain or base64 table (it refuses rc4, and refuses a table it cannot isolate from the program) | javascript-obfuscator 0.27.4 / 2.19.1 / 4.1.1 / 5.10.1: every string of the source (three characters and up) is in the dump |
| by hand | a table webcrack does not finish and the decoder cannot run; eval/packed layouts | the 2019 layout (v0.27) is where the two meet: webcrack leaves it as it is, the decoder reads it |

`recover_string_table.js` exits 0 for a recovery and for "no string table here"; exit 1 means a
string table is present and nothing was recovered — no output file is written, and stderr names
the reason. Until v1.8.5 neither tool matched any real obfuscator output: `recover_string_table.js`
recovered 0 strings, exited 0 and still wrote the re-printed input to `--output`, and
`decode_string_array_runtime.js` could not recognise a lookup written as a function declaration.
Both are pinned against real output now (`tests/fixtures/recover-string-table/`,
`tests/fixtures/decode-string-array-runtime/`).

## Output Rule

Static recovery is not complete until:

- original file is retained
- transformed derivatives are retained
- at least one readable request neighborhood or semantic label artifact exists
- the result is handed back to either `Runtime` or `Replay` if verification is still missing
