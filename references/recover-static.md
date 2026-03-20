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
| deobfuscate obfuscator.io | `webcrack` | `restringer` |
| unbundle webpack/parcel | `webcrack` | `debundle`, `retidy` |
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
- `scripts/run_ast_pipeline.js`
- `scripts/extract_request_neighborhood.js`
- `scripts/diff_builds.js`
- `scripts/function_diff.js`

## Output Rule

Static recovery is not complete until:

- original file is retained
- transformed derivatives are retained
- at least one readable request neighborhood or semantic label artifact exists
- the result is handed back to either `Runtime` or `Replay` if verification is still missing
