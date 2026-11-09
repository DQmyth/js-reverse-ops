# Header-fingerprint-bound tokens (pure-HTTP route)

Recorded case: an "anti browser simulation" challenge (spiderbuf c14,
2026-11-09, closed pure-HTTP with zero browser after a browser-assisted
delivery in 2026-09). The site binds a page-issued token to a *header
fingerprint* of the issuing client and rejects consumption mismatches —
defeatable entirely at the header layer, no TLS spoofing needed.

## The three gates (and how each announces itself)

| Gate | Server behavior | Diagnostic signal |
|---|---|---|
| 1. Header-set gate (CF/edge) | bare-UA or thin-header requests → 403 empty | page GET itself fails |
| 2. Token registration gate | non-"browser-scored" page GET → **decoy token** (never registered server-side) | `Invalid Token` at stage 1 |
| 3. Fingerprint binding | token registered, but consumer headers ≠ issuer headers | `Invalid Fingerprint` at stage 1 |

The two error strings are the whole diagnostic: **Invalid Token = your GET
never registered (fix the GET), Invalid Fingerprint = GET was fine, your POST
differs (make POST headers match GET exactly)**. Read the error body before
theorizing about detection — same discipline as M10 (expired ≠ detected).

## What actually went into the fingerprint (measured by bisection)

- `sec-ch-ua-full-version-list` — the high-entropy client hint with FULL
  version numbers (`"156.0.8078.80"`). The low-entropy `sec-ch-ua` alone was
  NOT enough. This was the single most important header.
- **Cookie presence with fresh timestamps** — analytics cookies (`_ga`,
  `__gads`, `__gpi`, `__eoi`, `*_ga_*`) participate. Stale `RT=`/`T=` values
  (30+ min old) degraded the score; re-synthesizing the same cookie names with
  CURRENT timestamps passed. No real analytics round-trip needed.
- Full `Sec-Fetch-*` family + `Priority` + `Upgrade-Insecure-Requests` on the
  navigation GET; `Sec-Fetch-Mode: cors` + `Origin` on the XHR POST.
- UA consistency across GET/POST/key-derivation (the AES key was
  `SHA256(UA).hex[:16]`, so the UA you send is the UA you decrypt with).

Not in the fingerprint: TLS JA3 (curl_cffi chrome worked; plain curl with the
full header set was not tested past gate 1), HTTP/2 specifics, header order
(dict-ordered headers passed).

## Minimal pure chain

```
session = curl_cffi(impersonate='chrome')          # or any plausible TLS
nav_headers  = {accept, accept-language, cookie(fresh synthetic analytics),
                priority: 'u=0, i', sec-ch-ua, sec-ch-ua-full-version-list,
                sec-ch-ua-mobile, sec-ch-ua-platform, sec-fetch-{dest,mode,site,user},
                upgrade-insecure-requests, user-agent}
xhr_headers  = {accept: */*, accept-language, cookie(SAME), origin, priority: 'u=1, i',
                referer, sec-ch-ua*, sec-fetch-{dest:empty,mode:cors,site:same-origin},
                user-agent(SAME), content-type}

token  = regex('#token' div, GET page with nav_headers)
cipher = POST api {p: token} with xhr_headers      → Invalid Token ⇒ fix GET
data   = GET api?s=cipher with xhr_headers         → Invalid Fingerprint ⇒ match headers
json   = AES-128-CBC-decrypt(b64decode(data)[16:], key=SHA256(UA).hex[:16])
```

Retry discipline: the scoring is flaky under rapid bursts — one failure per
burst then a cooldown; retry with 3s+ spacing, and pause ~60-90s after a
5-failure streak. Budget retries accordingly.

## Why this matters beyond one site

This is the pure-HTTP counterpart of M12: there the observer poisoned the
cipher via globals; here the *issuer* poisons tokens for thin clients. Both
share the same defense: **the two error strings bisect the failure layer in
one request each**. When a gated API returns distinct error strings, map them
to layers before touching code.

## Client pass matrix (measured 2026-11, one site family — priors, not laws)

| client | header-set gate (page) | data APIs | token-REGISTRATION gate |
|---|---|---|---|
| plain curl + full Chrome header set | passes | passes (all 13 data challenges) | fails — `Invalid Token` (decoy issued) |
| Node fetch/undici + full headers | passes pages | passes | fails registration (same decoy) |
| curl_cffi `impersonate='chrome'` | passes | passes | **passes** |

Reading: TLS participates only where the server scores the CLIENT at token
issuance; everywhere else the full header set (Sec-Fetch-\*, sec-ch-ua-\*
including `sec-ch-ua-full-version-list`, Priority) plus fresh-timestamp
analytics cookies carried plain curl through. Start cheap (plain client +
full headers), escalate to an impersonating client only when the
registration-shaped gate answers `Invalid Token`.
