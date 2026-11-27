# Cloudflare gate triage and the pure-algorithm ladder

"Blocked by Cloudflare" is four different problems with different costs.
Triage FIRST — the fastest permanent mistake is treating L2 as L1 (more
headers will never execute a challenge) or L1 as L2 (driving a browser to
solve what a header set already passes).

## Live evidence matrix (every claim has a re-runnable proof)

| gate | live result | date | re-verify |
|---|---|---|---|
| L0 clean CF-CDN | 200 through plain client + full headers ✓ | 2026-11-17 | `node scripts/cf_gate_triage.js <url>` |
| L1 passive fingerprint | **no current success** — the one recorded pass (stockx: probe 403 → curl_cffi chrome → 200, 2026-11-19) drifted site-side within two days; re-tested 2026-11-27: stockx and depop both triage L1 and BOTH stay 403 after the curl_cffi upgrade (0/2). The triage verdict is accurate; the upgrade route has no live success today, and its next rung (clean residential IP) is untested | 2026-11-27 | triage the URL, then upgrade the client per the route |
| L2 challenge page | demo sites: cleared 5/5 on 2026-11-27 with cfsolve rebuilt from upstream `3d2f67e` (first demo site 3/3, second 2/2). **Production site** (same day, same build): an international court's site serving public judgment PDFs behind a path-scoped managed challenge with its own production sitekey (624KB orchestrator, 25 embedding-page parameters) — triage verdict L2 correct, cleared in 14-27s on 5 of 7 attempts (two early attempts against the home page timed out; two later home-page attempts passed), clearance replayed from plain-HTTP curl_cffi, 6 PDFs downloaded complete (85/44/44/163/3/3 pages); browser-free audit PASS, 3 independent runs byte-identical. **Build drift is observed fact:** the binary built from the 11-17 commit had failed 0/2 on a demo site earlier that day (probes 40→38, third response "not complete") | 2026-11-27 | `bash scripts/verify_cf_solve_capability.sh <url> --fingerprint <profile> [--proxy ...]` |
| L2b turnstile widget | **standalone widget: protocol handshake only** — cfsolve issued a real `1.<token>` 2/2, but on Cloudflare's OFFICIAL TEST sitekey (`3x00000000000000000000FF` = "Forces interactive challenge"). No production form-embedded widget has been tested. (The widget inside a production challenge page was solved — see the L2 row — which is a different scoring context.) A wrong sitekey is rejected 400 at the widget route | 2026-11-27 | same verifier with `--sitekey <key>` |
| recaptcha v2 (perception) | official demo 3/4, real 2.5KB `g-recaptcha-response` token, 7-10s per pass, OIV7 fallback exercised ✓ | 2026-11-19 | `python3 scripts/verify_recaptcha_capability.py --driver ... --chrome ...` |
| geetest v4 (protocol gate) | PyPasser wire solve on the official adaptive demo: full tuple in 2.6s ✓ | 2026-11-21 | `GeeTestV4Solver(captcha_id, risk_type='auto', proxy=...)` |
| recaptcha v3 (score gate) | PyPasser anchor forge: real response token in 0.9s ✓ | 2026-11-21 | `V3Solver(anchor_url, proxy=...)` |
| hcaptcha passive (protocol gate) | **NOT passed.** 4 of 5 legs live (transport, config, `n` in 0.5s via a public SDK, wire encoding accepted); getcaptcha answers `{"success": false, "error-codes": []}` — an empty-code verdict from the behavior scorer (insufficient evidence). Four synthetic motionData variants and href-bound `n` all score identically; the missing piece is genuine vmdata cross-consistency, and no public parent-page executor exists | 2026-11-27 | references/hcaptcha-passive-route.md |
| unreachable | UNKNOWN with honest route (local network cannot reach the host) | 2026-11-17 | triage any known-unreachable URL |

## Level table (signal → verdict → action)

| Level | Essence | Reliable signals | Action |
|---|---|---|---|
| **L0** none/weak | CF as plain CDN | 200 to any client | straight into the pipeline |
| **L1** passive fingerprint | TLS/h2/header + IP reputation, no JS | 403/429 with NO challenge markers in body | full Chrome header set first, then an impersonating client (`curl_cffi impersonate='chrome'`); rotate to a clean residential IP before concluding |
| **L2** active challenge | JS/Managed Challenge — PoW + env checks | `cf-mitigated: challenge` response header (most reliable), 503 body with `Just a moment...`, `__cf_chl_opt`/`_cf_chl_opt`, `/cdn-cgi/challenge-platform/`, `cf-chl-bypass`, `cf_chl_prog` | solve ONCE for `cf_clearance` (request-level solver or a single browser session), then deliver pure-HTTP |
| **L2b** Turnstile | embedded human-verification widget | `challenges.cloudflare.com/turnstile`, `cf-turnstile-response`, `cf-turnstile` in page | request-level solver (sitekey + action + cData), or interactive once |
| **L3** Bot Management | enterprise ML score + behavior, re-challenges after solving | intermittent 403s, manual visits also challenged frequently | route around (app API, public API) or a commercial scraping API |

Supporting signals: `__cf_bm` cookie ⇒ Bot Fight Mode / Bot Management active;
403 with no challenge markers ⇒ more likely IP/WAF than a challenge — retry
from a clean residential IP before writing "detected".

Automate the verdict: `node scripts/cf_gate_triage.js <url> [--json]` runs
the escalating probe (thin headers → full Chrome header set) and reports
level + markers. Its L1 stage uses plain Node TLS, so a verdict of L1 means
"upgrade client" — confirm with `curl_cffi` before escalating to L2 tooling.

Live-verified (2026-11-17, this tool against real targets):

- challenge page (403 + `cf-mitigated: challenge` + `_cf_chl_opt` +
  `/cdn-cgi/challenge-platform/` + "Just a moment") → **L2** ✓
  (scrapingcourse.com/cloudflare-challenge)
- 200 page with an embedded turnstile widget (`class="cf-turnstile"`) →
  **L2b** ✓ (2captcha turnstile demo) — this live case found a real bug in
  the first version: a naive `200 → L0` shortcut misjudged it; the intercept
  state must outrank the widget check only when it IS an intercept
- clean 200 behind CF CDN (`server: cloudflare`) → **L0** ✓
- unreachable target → **UNKNOWN** with the honest "fix connectivity first"
  route (correct when local networking itself cannot reach the host)
- L1: the triage verdict is accurate (stockx.com and depop.com both triaged
  L1 — 403, no challenge markers — on 11-19 and again on 11-27), but the
  upgrade route has ONE recorded success only (stockx via curl_cffi chrome,
  200 with the full 433KB page, 2026-11-19) and it drifted site-side within
  two days; re-tested 2026-11-27 on both targets → 0/2 after the upgrade.
  The next rung (clean residential IP) was never tested
- CF-fronted site with the site's OWN header-fingerprint token gate (plain
  UA → 403, full header set → 200, token registration scored on headers and
  cookie freshness): solved end-to-end pure-HTTP with curl_cffi and
  re-verified 2026-11-27 (CPC 34.14 reproduced) — the one CF-fronted class
  with a stable, repeatedly re-verified success
- cfsolve acquisition rung (L2): 5/5 challenge pages cleared on
  2026-11-27 with the rebuilt (11-26) binary on two demo sites — after 0/2
  with the 11-17 build earlier the same day (see External solver notes)
- cfsolve on a PRODUCTION site (2026-11-27): an international court's site
  serving public judgment PDFs. Every file URL answers 403 +
  `cf-mitigated: challenge` (managed challenge, the site's own production
  sitekey). The solver cleared it in 14-27s; the clearance replayed from
  curl_cffi; 6 PDFs came down complete (85/44/44/163/3/3 pages). Two
  lessons: (a) challenge rules can be path-scoped — on the proxy exit the
  home page was released while the file URLs stayed challenged, so clear
  against a URL that IS challenged (the target URL itself works); (b)
  solve with cfsolve, download with a normal client — its CLI saves the
  cleared response decoded as text, and that copy of a PDF fails
  `qpdf --check` (broken streams) while the normal-client download is
  byte-exact. Re-run twice more since: cleared every time, and the six
  PDFs were byte-identical on every run


## Human-verification widget families (beyond Cloudflare)

`cf_gate_triage.js` also reports `captcha_family` — the embedded widget
families scanned over the full page body, independent of the CF ladder
verdict (a loadable page with a widget is still L0 for delivery; the widget
gates the form, not the fetch):

| family | markers (component-level) | nature | route |
|---|---|---|---|
| turnstile | `challenges.cloudflare.com/turnstile`, `cf-turnstile` | protocol gate, scored on production keys | request-level solve (cfsolve et al.) — the protocol handshake is verified on Cloudflare's official TEST sitekey only; production-sitekey scoring is unverified. Clearance is pinned to (exit IP, UA) |
| recaptcha v2 (image) | `g-recaptcha`, `google.com/recaptcha`, `recaptcha/api` | **perception gate** — not pure-algorithmable by nature | external CV solver (recaptcha_ia_solver) or a captcha-solving service — **live-verified end-to-end: 3/4 on the official demo, real 2.5KB token, incl. an OIV7-fallback-only challenge; see `scripts/verify_recaptcha_capability.py`**; audio-transcription route exists too (PyPasser's Vosk path) |
| recaptcha v3 (score) | invisible widget, `grecaptcha.execute` | **score gate — NOT perception**: the anchor token is forgeable over pure HTTP | PyPasser `V3Solver(anchor_url)` — **live-verified 0.9s, real response token** (2026-11-21) |
| hcaptcha passive (no task) | `hcaptcha.com`, `h-captcha`, `checksiteconfig` | **protocol-shaped, but BEHAVIOR-SCORED** — the no-image flow is request-replay + verbatim HSW execution in form (so it is not a pure perception gate), yet the server's empty-error-code verdict shows a behavior scorer still decides: no image task does NOT mean no scrutiny | 5-request protocol reproduced to 4/5 legs live; the pass itself NOT achieved (see [references/hcaptcha-passive-route.md](hcaptcha-passive-route.md)) — do not promise this gate |
| hcaptcha with image task | same markers + non-empty `tasklist` | perception gate | captcha-solving service or CV rung (unchanged) |
| geetest v4 | `static.geetest.com`, `/gt.js`, `gtx-captcha` | **protocol gate — wire-solvable pure HTTP** (v3/legacy variants: mixed; the client-side-judgment prior still applies there) | PyPasser `GeeTestV4Solver(captcha_id, risk_type='auto')` — **live-verified 2.6s on the official adaptive demo, full lot/pass_token/captcha_output tuple** (2026-11-21); older gt3 payloads: extract embedded data first |
| slider (named impls) | `nc_1_n1z`, `slidercaptcha`, `jdjr-verify`, `puzzle-slider` | client-side judgment prior | check source for base64/blob data before simulating the drag — recorded corpus cases never needed the drag |

Design notes (live-tested 2026-11-19):
- markers are deliberately COMPONENT-level; bare words ("geetest") appear in
  marketing copy and false-positive (a captcha-service demo listing page was
  initially misjudged as geetest by the bare word)
- multiple families on one page are reported as an array — collection/demo
  pages genuinely embed several
- the CF-ladder verdict and the family are orthogonal: verdict says whether
  you can FETCH, family says what guards the SUBMIT

Perception gates and pure-algorithm-default: solving images requires
perception, which is a different capability family (CV, not protocol
reversing) — routing them to an external solver or service is the honest
ladder rung, the same way TLS impersonation routes to curl_cffi.

## cf_clearance lifecycle discipline (the part that keeps delivery pure)

- clearance is bound to **(exit IP, User-Agent)** — and NOT to the TLS
  stack. Controlled re-test 2026-11-27 (first demo site): no clearance →
  403 challenge; clearance + the profile's exact UA → 200 from curl_cffi,
  with safari AND chrome fingerprints; the same clearance from another
  exit IP → 403; clearance + a UA differing only in the version token →
  403. **Retracted:** the "TLS-stack-bound" claim published 2026-11-19
  came from a hand-typed UA (`Version/26.0` vs the profile's
  `Version/26.6.3`). Always read the UA from `profile.json` (M15)
- treat it as a **pooled, expiring resource**: key = (host, exit IP, profile UA),
  TTL budget ~20min, and invalidate on ANY `cf-mitigated` response
  (negative feedback) instead of waiting for hard expiry
- acquisition is the only browser-shaped step (and the only one a
  request-level solver removes). Afterwards plain HTTP is enough — any
  client, from the same exit IP, with the profile UA:
  `python3 scripts/cf_clearance_harvest.py <url> --replay` harvests the pair
  and proves the replay (the profile defaults to the solver's bundled one),
  then `python3 scripts/cf_fetch_with_clearance.py --harvest harvest.json
  --out-dir out/ URL...` collects the other URLs of the zone — same exit IP,
  same UA, both read from the harvest file
- the clearance can be harvested on ANY challenged URL of the zone and
  reused on the rest; pick one that is actually challenged (rules can be
  path-scoped). Binary resources must be fetched by a normal HTTP client

## Behavior-telemetry gates: record, materialize, replay

When a gate checks BEHAVIOR (timelines, frame intervals, resource timing),
the pure route generalizes the stub-contract method (M11/M12):

1. **Record** — run one genuine browser session through a decoding capture
   proxy (or in-target instrumentation) and log the decoded payloads the
   gate uploads; never wrap page globals to sample (M12).
2. **Materialize** — freeze the recorded answers into a data file (a
   profile): the check dimensions observed in the wild include
   `engine / transport / timeline / intervals / orchestrator / interaction /
   resource_timing`. The profile IS the environment, the same way K/E stub
   values were the environment for a wasm signer.
3. **Replay** — answer the checks from the profile over a raw client; the
   challenge protocol never executes in a browser again.

Minimal in-sandbox equivalent: real asynchronous timers with natural jitter.
Synchronous loops produce uniform intervals — detectable and rejected. The
gym flavor `behavior_telemetry` encodes exactly this testable difference.

## External solver notes (cfsolve)

`cfsolve` (github.com/chris124567/cfsolve, MIT, Rust) solves Turnstile
widgets and challenge pages request-based: browser profile files (recorded
check answers, ~185KB for the shipped Safari/iOS profile), a capture proxy
to record new profiles, vendored BoringSSL/wreq/http2 patches for transport
impersonation, and a challenge-JS deobfuscator. First-choice for the L2/L2b
acquisition step at proxy-only cost.

Hard caveats: the maintainer announced retirement (Nov 2026), and the
fragility is now OBSERVED, not hypothetical. A binary built from the 11-17
commit stopped clearing on 2026-11-27 (`Error: challenge did not complete
after the interaction POST`, on both direct and proxy exits); upstream
pushed `3d2f67e fix for new build` on 11-26 and a rebuild cleared 5/5.
Expect this each time CF ships a challenge build: run the verifier first,
and when it fails fetch upstream and rebuild (full build ≈2.5 min on Apple
Silicon; rustc 1.100 works, the pinned 1.98 toolchain is ignored). The
Turnstile evidence is on Cloudflare's TEST sitekey only.

**Live-verified** (mac arm64, rustc 1.100): 2026-11-19 with the 11-17
build (one demo site, via HTTP proxy); 2026-11-27 with the 11-26 build — a
first demo site 3/3 (direct ×2, proxy ×1) and a second demo site 2/2,
protected pages fetched in-stack, `cf_clearance` issued each time; the
stale 11-17 build failed 0/2 the same day. The clearance was then replayed
from plain-HTTP curl_cffi with the profile UA (see the binding rule). The
"cross-stack reuse failed" note that stood here until 2026-11-27 was wrong
and is retracted.

## Recipe — from a blocked URL to the files

Prerequisites: Node; Python 3 with `pip install -r requirements.txt`; and the
third-party solver `cfsolve` built once (it is NOT bundled — see its row in
the toolchain table; `export CFSOLVE_DIR=~/cfsolve` tells the tools where it
is, and its checkout ships the browser profile).

    # 1. which gate is this? (pure Node, works out of the box)
    node scripts/cf_gate_triage.js "<url>"

    # 2. acquire: solve the challenge once and prove the pair replays
    python3 scripts/cf_clearance_harvest.py "<url>" --json > harvest.json

    # 3. collect every URL of the zone over plain HTTP
    python3 scripts/cf_fetch_with_clearance.py --harvest harvest.json --out-dir out/ "<url>" "<url2>" ...

    # 4. when "no browser" must be evidence rather than a promise
    python3 scripts/audit_browser_free.py --report audit.json -- <steps 2-3 as one command>

Step 2 fails when Cloudflare has shipped a challenge build the checked-out
solver does not know yet (pull upstream and rebuild), or when the challenge
demands an interaction the solver cannot perform. Step 3 exits with 3 as soon
as the site answers with another challenge page — a clearance is bound to the
exit IP and the User-Agent recorded in `harvest.json` and expires on the
site's schedule: re-harvest instead of retrying.

## Proving the route is browser-free

"Was this really solved without a browser?" is the first question a result
gets, and a verbal yes is not evidence. Watch the whole run instead:

    python3 scripts/audit_browser_free.py --json --report audit.json -- <command>

It samples the subject's process tree and TCP table for the command's whole
lifetime and fails on three kinds of evidence: a browser engine executable in
the tree, browser-automation flags on a command line (`--remote-debugging-port`,
`--headless`, chromedriver, playwright, ...), or a connection to a loopback
address (debug ports live on localhost). A subject that exits non-zero is
INCONCLUSIVE, never a pass — a flow that never completed proves nothing about
itself.

Recorded audit of the production run above: **PASS**, 83 samples over 25s —
process tree `{python3, challenge}` (the solver), no engine, no automation
flag, no loopback peer, remote peers on port 443 only. The solver itself is a
native 20MB arm64 executable whose only dynamic dependencies are system
libraries. Three independent runs cleared the site and returned
byte-identical PDFs each time.

What a pass does not prove: a browser reached over a non-loopback address
appears as an ordinary remote peer, and a child shorter than the sampling
interval can be missed. Read it as "no local browser evidence".

Where the solving actually comes from (keep this straight when reporting):
the challenge solver is the third-party cfsolve, and its "looks like a real
browser" answers are a recorded profile (captured once from a real Safari)
replayed by code. This repo contributes the triage, the harvest/replay tool,
the binding-rule verification and this audit — not the solver.
