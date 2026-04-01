# Mobile Shell API Pivot

Use this playbook when a desktop page intermittently triggers bot checks, but an app or H5 request profile lands on a lightweight shell page that later hydrates from JSON APIs.

## Goal

Pivot from unstable desktop HTML capture to stable mobile-shell API recovery without publishing site-specific secrets or live session material.

## Typical Signals

- desktop HTML sometimes returns a verification or challenge page
- mobile or app-flavored headers return a shell page with a root node such as `#root`
- the shell references one large `umi`, `webpack`, or route bundle
- route changes are hash-based or SPA-based instead of path-based
- the real content appears only after bundle execution and API replay

## Procedure

1. Confirm the shell pattern.
   Save one shell HTML sample and record only generic markers:
   - empty app root
   - bundle entry filenames
   - route style such as hash routing

2. Inspect the runtime loader.
   Locate the module loader, route manifest, and request wrapper before guessing endpoints.
   Good targets:
   - webpack runtime handle
   - route-to-chunk map
   - request client factory
   - signing helper injection points

3. Recover the request wrapper contract.
   Prove:
   - base API prefix rewriting
   - required default headers
   - timestamp or nonce fields
   - signature placement
   - whether one wrapper serves both detail and list APIs

4. Enumerate structure APIs first.
   Prefer low-risk discovery endpoints such as:
   - group lists
   - board lists
   - category maps
   - route metadata

   These often reveal the real identifiers needed for later content calls.

5. Pivot from category-style routing to board-style APIs.
   If the shell does not expose a direct category list endpoint, recover the structure mapping first, then fetch content through the normalized board or section API.

6. Verify with at least two independent content IDs.
   Do not assume one board or route is representative. Prove the same wrapper and signer work across multiple boards or groups.

7. Deliver a requests or Scrapy replay only after the API chain is stable.
   The replay should contain:
   - sanitized default headers
   - generic signer code
   - structure endpoint fetch
   - content endpoint fetch
   - clear output schema

## Evidence To Keep

- sanitized shell HTML markers
- route chunk names without sensitive query material
- request wrapper shape
- endpoint path templates
- generic parameter schema
- proof that one structure endpoint leads to later content endpoints

## Do Not Publish

- recovered production secrets, app keys, or hard-coded signer material tied to one target
- full live signed URLs
- cookies, sessions, user identifiers, or verification payloads
- raw challenge HTML or live capture dumps tied to one named site

## Escalation Rule

If the mobile shell still fails outside the browser, separate:

- signer mismatch
- wrapper path rewrite mismatch
- transport/profile mismatch

Read `playbooks/transport-profile-ladder.md` before emulating more of the browser than necessary.
