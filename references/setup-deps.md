# Setup And Dependency Checks

Use `scripts/check_js_reverse_ops_deps.py` before blaming the target or the browser.

## Command

```bash
python3 skills/js-reverse-ops/scripts/check_js_reverse_ops_deps.py
```

## Modes

- `full`: core local runtimes and helper commands are available
- `degraded`: Node and Python are available, but helper commands are missing
- `minimal`: even core local runtimes are missing

## Repair Suggestions

After collecting the dependency report, convert it into a repair plan:

```bash
python3 skills/js-reverse-ops/scripts/suggest_js_reverse_ops_repairs.py /path/to/dep-report.json
```

## What It Checks

- `python3`
- `node`
- `npm`
- `rg`
- `git`
- `curl`
- macOS `open`
- core browser bridge scripts
- core task and output-contract files

## Optional Profiles

The dependency doctor also reports optional tool coverage so you can see whether the current host is good for:

- `packet_capture`: `tshark`
- `proxy_delivery`: `mitmdump`
- `wasm_recover`: `wasm2wat` or `wasm-decompile`
- `android_or_hybrid`: `jadx`
- `runtime_mobile_bridge`: `frida`

These are not required for the core browser-first workflow, but they matter when the target family needs packet truth, proxy handoff, heavier wasm recovery, or hybrid app analysis.

## Optional JS Reverse Toolchain

These tools are useful when installed, but the skill must still work in degraded mode:

- `webcrack`: first-pass deobfuscation, string-array recovery, and common bundle unpacking
- `wakaru`: syntax normalization and readability recovery for modern minified code
- `ast-grep`: structural search and small pattern-driven rewrites
- `prettier` or an equivalent formatter: stable readable output for review diffs
- `humanify`: optional identifier recovery after code has been sanitized for external processing

Treat any cloud-backed or LLM-backed tool as an external disclosure boundary. Use sanitized snippets and keep the original target artifact local.

## Collection Modes

For large local targets, use `scripts/collect_target_code.js` to avoid loading everything at once.

### Summary

```bash
node skills/js-reverse-ops/scripts/collect_target_code.js <target> --mode summary
```

Returns all interesting files with metadata.

### Priority

```bash
node skills/js-reverse-ops/scripts/collect_target_code.js <target> --mode priority --top 20
```

Ranks likely high-value files first.

### Incremental

```bash
node skills/js-reverse-ops/scripts/collect_target_code.js <target> --mode incremental
```

Stores a manifest and returns only changed files since the previous run.
