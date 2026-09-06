# Toolchain Bootstrap

Verify the sandbox toolchain **before** deep-diving; most "environment
fingerprint" rabbit holes start as a missing or stale dependency. Run the
fast path first:

```bash
python3 scripts/check_js_reverse_ops_deps.py        # dependency health report
python3 scripts/suggest_js_reverse_ops_repairs.py <dep-report.json>  # smallest repair plan
```

## Core runtime

| Tool | Used for | Install / check |
|---|---|---|
| Node.js ≥ 18 | vm sandboxes, jsdom harness, all collectors | `node -v` |
| jsdom (local `node_modules`) | full-page verbatim execution, resource interceptors | `node -e "require('jsdom')"` against the pinned path used by your harness; install with `npm i jsdom@24` if missing |
| webcrack | flattening/string-table unwrapping before verbatim extraction | `npx webcrack <input.js> -o out/` |
| Python 3 + requests | delivery shells (`solution.py` pattern) | `python3 -c "import requests"` |
| Chrome + remote debugging | runtime truth capture (only when a browser oracle is justified) | `scripts/start_debug_browser.sh` then `scripts/check_debug_browser.sh` |

## Harness conventions that avoid silent failures

- Pin the jsdom require path your harness uses; a global jsdom upgrade can
  change interceptor behavior between runs.
- Node heap: `--max-old-space-size=6000` for heavy page bundles.
- Always `process.exit(0)` after output when the harness arms real
  `setInterval`s — jsdom timers keep the event loop alive.
- Install `process.on('uncaughtException'/'unhandledRejection')` no-ops when
  the target runs deliberate probe-throw self-checks (see
  [env-rebuild-recipes.md](env-rebuild-recipes.md) Card 4).
- When a harness behaves differently between two runs of the same code, check
  for stale `/tmp` artifacts from an earlier session before re-deriving
  theory.

## Offline fallbacks

- No network: prefer static triage (`triage_js.sh`,
  `extract_request_contract.js`, `inspect_obfuscation_family.js`) and
  archival routes; defer runtime capture.
- jsdom unavailable: a minimal `vm.createContext` sandbox with BOM/DOM stubs
  covers most signer-only targets — see
  [env-rebuild-recipes.md](env-rebuild-recipes.md); you lose full-DOM
  rendering and real event bubbling, so pagination must go through stubbed
  handlers or global entry functions.
- webcrack fails or output structure drifts: fall back to
  `recover_string_table.js` / `run_ast_pipeline.js` passes, and re-locate
  function boundaries before reusing old line-number extractions.

## Sanity gates before deep work

1. dependency report clean (or failures explicitly waived)
2. target artifacts on disk (page HTML, challenge JS) with sizes logged
3. chosen route (verbatim vs hand-port; vm vs jsdom; browser-oracle vs
   local-only) written into the bundle worklog with a one-line justification
