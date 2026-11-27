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
| unbundle webpack/parcel | `webcrack` (CLI) | `debundle`, `retidy` |
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
