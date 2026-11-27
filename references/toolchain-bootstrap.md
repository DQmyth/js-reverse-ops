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
| cfsolve (optional, Rust) | request-based Cloudflare challenge-page / Turnstile acquisition — issues a `cf_clearance` over plain HTTP, no browser. **Live-verified 2026-11-27 with upstream `3d2f67e`: 5/5 challenge pages cleared on two demo sites.** The 11-17 build had failed 0/2 the same day — it breaks whenever CF ships a new challenge build, so run the verifier first and rebuild from upstream when it fails (full build ≈2.5 min; a full BoringSSL rebuild ≈10 min). The clearance is bound to (exit IP, User-Agent) and replays from curl_cffi — the solver is only needed for that one step. **Solve with it, download with a normal HTTP client**: its CLI decodes the cleared response as text, so the copy it saves is corrupted for binary resources (measured on a PDF — fails `qpdf --check`). Also verified on a production site with its own sitekey (an international court's public judgments behind a path-scoped managed challenge). Turnstile evidence is on Cloudflare's TEST sitekey only (handshake verified, production scoring unverified) | NOT bundled — get it once: `git clone https://github.com/chris124567/cfsolve ~/cfsolve` then `cargo build --release --bin challenge --manifest-path ~/cfsolve/Cargo.toml` (needs a Rust toolchain, cmake and libclang; about 2.5 minutes from a fresh clone), then `export CFSOLVE_DIR=~/cfsolve` so the tools find the binary and its bundled profile. Check a build with `bash scripts/verify_cf_solve_capability.sh …`, acquire a clearance with `python3 scripts/cf_clearance_harvest.py …`, collect with `python3 scripts/cf_fetch_with_clearance.py …` (Python deps: `pip install -r requirements.txt`) |
| recaptcha_ia_solver (optional, Python) | reCAPTCHA v2 image-grid acquisition: fine-tuned YOLOv8s-cls (14 classes) + OIV7 fallback, driver-agnostic (`solve_recaptcha(driver)`); perception gates are not pure-algorithmable — this is the external CV rung. **Live-verified end-to-end 2026-11-19**: official demo, 3/4 attempts, real `g-recaptcha-response` token (2.5KB), 7-10s per passing round incl. one OIV7-fallback-only challenge (buildings); verify yourself with `scripts/verify_recaptcha_capability.py` | `pip install -e .` from github.com/cateyelow/recaptcha_ia_solver; mac-arm64: fetch the matching Chrome-for-Testing driver manually (uc's auto-download can fetch the wrong arch), `xattr -cr` + ad-hoc `codesign` it past Gatekeeper, and use selenium4 `Service()` — all three are recorded in the verifier's header |
| PyPasser (optional, Python) | multi-family captcha rung: **geetest v4 wire solver (live 2.6s) + reCAPTCHA v3 anchor forge (live 0.9s)** + lemin/arvancloud pure-HTTP paths + v2 audio (Vosk) route; MIT | `pip install PyPasser` + `pip install numpy pillow` (import-time deps the package omits); venv at /tmp/pypasser_env on this machine |
| pyv8c (optional, Python) | SECOND EXECUTION RUNG between jsdom and real Chrome: real V8 (Chromium IDL baseline) + deterministic Python BOM/DOM — live-probed 2026-11-27 with our calibration cards: document.all [[IsHTMLDDA]] CORRECT, constructors native-masked, eval-this===window, plugins=5/mimeTypes=2, Worker+WebSocket native (every recorded jsdom gap passed in one shot); ships deterministic frame clock, and a documented V8 Inspector — CORRECTED (hands-on 2026-11-27): the Inspector lives in the pyv8 native layer (docs/pyv8/devtools.md) but sync_api exposes NO debugger entry, so debugger-in-sandbox is documented-not-verified for pyv8c; iv8's debug-mode access logging is the verified in-sandbox observability today, Profile/Page model, local-Chrome reference tooling; needs CPython 3.12+ (`pip install pyv8c`, single ABI3 wheel incl. V8) | route: prefer over jsdom when the target touches M4/M5/M5b-family surfaces or when Python-end-to-end delivery matters; choosing between pyv8c and iv8 — pyv8c for standard V8-Inspector debugging + newer IDL baseline + active maintenance; iv8 for probe-hunting (API-access logs/breakpoints), logical-time determinism, offline contract replay, and threading; note the env-profile/IDL version-mismatch warning is expected (profile 156 vs IDL 154) |
| iv8 (optional, Python) | THIRD execution option, REVERSE-WORKFLOW-ORIENTED twin of pyv8c: C++-native BOM/DOM on V8 — live-probed 2026-11-27: same calibration card all-green (doc.all IsHTMLDDA, native-masked ctors, eval-this, plugins 5/2, Worker/WS) PLUS workflow weapons pyv8c lacks: **debug-mode API-access chain logging** (locates the target's environment probes — our M-family diagnosis built in), **API-access breakpoints**, **logical time** (sleep(5000) completes instantly — M1/M3/M6 discrimination at engine level), `debugger;` neutralized, isTrusted input events, `netLog` (intercepted request inspection = built-in request-contract capture), `hookNative`/`wrapNative` (M5/M12 tools built in), offline-by-default XHR/fetch with `add_resource` injection (matches our replay-contract discipline), 200+ field fingerprint profiles, per-Isolate threading (GIL released) | `pip install iv8` (py3.9-3.14, mac wheel 3.11+); caveats: community/Pro split (CSS layout engine, Chromium network stack, parallel Workers are Pro), quiet since 2026-10-13, macOS "author-untested" — probe before trusting |
| hcaptcha-hsj-hsw-reversed (optional, Python+Node) | hcaptcha HSW crypto rung: working HSW execution env (preconfigured Node+jsdom runtime — solves the warm-up problem out of the box) + reversed n-token cipher (AES-256-CTR iv‖be32) + six build-static keys + refresh workflow + `HSWBridge.solve` — live-tested: fresh-challenge `n` in 0.5s; getcaptcha accepted the wire (200, challenge rotation → remaining gap is motionData realism, not crypto) | `pip install git+https://github.com/CircuitSavage/hcaptcha-hsj-hsw-reversed` + `npm install` in the clone (jsdom dep); route via `references/hcaptcha-passive-route.md` |
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
