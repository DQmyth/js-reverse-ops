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
| js-deobfuscator (kuizuo) | SECOND-OPINION deobfuscator (Babel AST: decoder discovery, control-flow unflatten, rename) — same-sample parity with webcrack on the recorded v4 corpus file (both recover the main logic; neither unpacks every deep literal), use when webcrack output looks half-unpacked; playground at js-deobfuscator.vercel.app | `npm i js-deobfuscator` → `deobfuscate(src)` |
| Python 3 + requests | delivery shells (`solution.py` pattern) | `python3 -c "import requests"` |
| curl_cffi (Python) | impersonating client for the TLS/header-scored layer (L1) | `pip install curl_cffi`; smoke: `python3 -c "from curl_cffi import requests; print(requests.Session(impersonate='chrome').get('https://example.com').status_code)"` |
| cfsolve (optional, Rust) | request-based Cloudflare Turnstile/challenge acquisition (L2/L2b) — clears to a `cf_clearance`; **live-verified 2026-11-19**: built with brew rust 1.100 (pinned 1.98 ignored, ~10min incl. BoringSSL), solved a live L2 challenge page through an HTTP proxy with the shipped Safari/iOS profile — retirement risk NOT materialized against the current CF build; NOTE clearance is also TLS-stack-bound: cross-stack replay via curl_cffi was rejected, harvest on the solver's stack or pool per-stack | `cargo build --release --bin challenge` from github.com/chris124567/cfsolve; route via `references/cf-gate-triage.md` |
| recaptcha_ia_solver (optional, Python) | reCAPTCHA v2 image-grid acquisition: fine-tuned YOLOv8s-cls (14 classes) + OIV7 fallback, driver-agnostic (`solve_recaptcha(driver)`); perception gates are not pure-algorithmable — this is the external CV rung. **Live-verified end-to-end 2026-11-19**: official demo, 3/4 attempts, real `g-recaptcha-response` token (2.5KB), 7-10s per passing round incl. one OIV7-fallback-only challenge (buildings); verify yourself with `scripts/verify_recaptcha_capability.py` | `pip install -e .` from github.com/cateyelow/recaptcha_ia_solver; mac-arm64: fetch the matching Chrome-for-Testing driver manually (uc's auto-download can fetch the wrong arch), `xattr -cr` + ad-hoc `codesign` it past Gatekeeper, and use selenium4 `Service()` — all three are recorded in the verifier's header |
| PyPasser (optional, Python) | multi-family captcha rung: **geetest v4 wire solver (live 2.6s) + reCAPTCHA v3 anchor forge (live 0.9s)** + lemin/arvancloud pure-HTTP paths + v2 audio (Vosk) route; MIT | `pip install PyPasser` + `pip install numpy pillow` (import-time deps the package omits); venv at /tmp/pypasser_env on this machine |
| pyv8c (optional, Python) | SECOND EXECUTION RUNG between jsdom and real Chrome: real V8 (Chromium IDL baseline) + deterministic Python BOM/DOM — live-probed 2026-11-27 with our calibration cards: document.all [[IsHTMLDDA]] CORRECT, constructors native-masked, eval-this===window, plugins=5/mimeTypes=2, Worker+WebSocket native (every recorded jsdom gap passed in one shot); ships V8 Inspector (debug inside the SAME sandbox that reproduces the signer — no more debug-in-Chrome/deliver-in-Node context gap), deterministic frame clock, Profile/Page model, local-Chrome reference tooling; needs CPython 3.12+ (`pip install pyv8c`, single ABI3 wheel incl. V8) | route: prefer over jsdom when the target touches M4/M5/M5b-family surfaces (host builtins, native classes, document.all, plugins, Worker/WS) or when Python-end-to-end delivery matters; note the env-profile/IDL version-mismatch warning is expected (profile 156 vs IDL 154) |
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
