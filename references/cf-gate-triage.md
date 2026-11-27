# Cloudflare gate triage and the pure-algorithm ladder

"Blocked by Cloudflare" is four different problems with different costs.
Triage FIRST — the fastest permanent mistake is treating L2 as L1 (more
headers will never execute a challenge) or L1 as L2 (driving a browser to
solve what a header set already passes).

## Live evidence matrix (every claim has a re-runnable proof)

| gate | live result | date | re-verify |
|---|---|---|---|
| L0 clean CF-CDN | 200 through plain client + full headers ✓ | 2026-11-17 | `node scripts/cf_gate_triage.js <url>` |
| L1 passive fingerprint | stockx: probe 403 → curl_cffi chrome → full page 200 ✓; depop: stayed 403 after upgrade (residential-IP rung untested, partial) | 2026-11-19 | triage the URL, then upgrade the client per the route |
| L2 challenge page | cfsolve cleared a live challenge via HTTP proxy (Safari/iOS profile), in-stack page fetch + `cf_clearance` ✓ — retirement risk NOT materialized; **discovery: clearance is TLS-stack-bound** (curl_cffi replay 403) | 2026-11-19 | `bash scripts/verify_cf_solve_capability.sh <url> --fingerprint <profile> [--proxy ...]` |
| L2b turnstile widget | cfsolve three-pass solve (POST → interaction/proof worker → complete), real `1.<token>` issued ✓; wrong sitekey rejected 400 at the widget route | 2026-11-19 | same verifier with `--sitekey <key>` |
| recaptcha v2 (perception) | official demo 3/4, real 2.5KB `g-recaptcha-response` token, 7-10s per pass, OIV7 fallback exercised ✓ | 2026-11-19 | `python3 scripts/verify_recaptcha_capability.py --driver ... --chrome ...` |
| geetest v4 (protocol gate) | PyPasser wire solve on the official adaptive demo: full tuple in 2.6s ✓ | 2026-11-21 | `GeeTestV4Solver(captcha_id, risk_type='auto', proxy=...)` |
| recaptcha v3 (score gate) | PyPasser anchor forge: real response token in 0.9s ✓ | 2026-11-21 | `V3Solver(anchor_url, proxy=...)` |
| hcaptcha passive (protocol gate) | methodology acquired (5-request chain, verbatim HSW, P1_ token) — evidence level 1, NOT yet reproduced; image path still needs a service key | 2026-11-27 | references/hcaptcha-passive-route.md |
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
- L1 closed end-to-end (2026-11-19): stockx.com triaged L1 (403, no
  challenge markers) by plain-Node probe → the documented upgrade route
  (curl_cffi chrome impersonation, direct connection) returned 200 with the
  full 433KB page ✓. depop.com also triaged L1 but stayed 403 after the
  client upgrade — the next rung on that route is a clean residential IP,
  which was not tested
- cfsolve acquisition rung live-verified (see External solver notes)


## Human-verification widget families (beyond Cloudflare)

`cf_gate_triage.js` also reports `captcha_family` — the embedded widget
families scanned over the full page body, independent of the CF ladder
verdict (a loadable page with a widget is still L0 for delivery; the widget
gates the form, not the fetch):

| family | markers (component-level) | nature | route |
|---|---|---|---|
| turnstile | `challenges.cloudflare.com/turnstile`, `cf-turnstile` | protocol gate | request-level solve (cfsolve et al.), cf_clearance pinned to (IP, UA) |
| recaptcha v2 (image) | `g-recaptcha`, `google.com/recaptcha`, `recaptcha/api` | **perception gate** — not pure-algorithmable by nature | external CV solver (recaptcha_ia_solver) or a captcha-solving service — **live-verified end-to-end: 3/4 on the official demo, real 2.5KB token, incl. an OIV7-fallback-only challenge; see `scripts/verify_recaptcha_capability.py`**; audio-transcription route exists too (PyPasser's Vosk path) |
| recaptcha v3 (score) | invisible widget, `grecaptcha.execute` | **score gate — NOT perception**: the anchor token is forgeable over pure HTTP | PyPasser `V3Solver(anchor_url)` — **live-verified 0.9s, real response token** (2026-11-21) |
| hcaptcha passive (no task) | `hcaptcha.com`, `h-captcha`, `checksiteconfig` | **protocol gate** — corrects our earlier uniform classification: the no-image flow is request-replay + verbatim HSW execution (n proof + motionData), no CV/service needed | route in [references/hcaptcha-passive-route.md](hcaptcha-passive-route.md) — documented methodology, not yet reproduced by us |
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

- clearance is bound to **(IP, User-Agent, TLS client-hello)** — live-tested
  (2026-11-19): a clearance solved by a request-level solver's BoringSSL
  stack was REJECTED (403, fresh challenge) when replayed through
  curl_cffi's safari fingerprint with the identical proxy exit and UA;
  the same stack that solved continued to pass. Pool key must include the
  client STACK, or the harvesting traffic must ride the solver's stack
- treat it as a **pooled, expiring resource**: key = (host, proxy session),
  TTL budget ~20min, and invalidate on ANY `cf-mitigated` response
  (negative feedback) instead of waiting for hard expiry
- acquisition is the only browser-shaped step (and the only one a
  request-level solver removes); everything after acquisition is pure HTTP
  with the full header set from this ladder

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

Hard caveats: the maintainer announced retirement (Nov 2026); the failure
mode is sudden death — a new CF challenge build returns `Error::Unsupported`
and the tool is dead until someone patches it. Keep a browser fallback for
acquisition and monitor the `Unsupported` rate.

**Live-verified 2026-11-19** (mac arm64, brew rust 1.100 ignoring the pinned
1.98 toolchain — builds fine; ~10 min incl. BoringSSL): solved the live
scrapingcourse L2 challenge page through an HTTP proxy with the shipped
Safari/iOS profile — challenge cleared, protected page fetched in-stack,
`cf_clearance` issued. The retirement risk had NOT materialized against the
current CF build at test time. Cross-stack reuse failed (see the TLS-binding
rule above): harvest on the solver's stack, or pool per-stack.
