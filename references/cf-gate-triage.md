# Cloudflare gate triage and the pure-algorithm ladder

"Blocked by Cloudflare" is four different problems with different costs.
Triage FIRST — the fastest permanent mistake is treating L2 as L1 (more
headers will never execute a challenge) or L1 as L2 (driving a browser to
solve what a header set already passes).

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
- L1 has no live sample this round; its evidence base is the token
  registration gate measured in the external corpus (full header set +
  impersonating-client ladder)


## cf_clearance lifecycle discipline (the part that keeps delivery pure)

- clearance is bound to **(IP, User-Agent)** — reuse the exact pair that
  solved, or CF rejects it
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
acquisition, monitor the `Unsupported` rate, and pin the profile's
(IP, UA) exactly when reusing `cf_clearance`.
