# Iterative Script-Warmup Same Endpoint

Use this playbook when one visible endpoint does not return data immediately, but instead returns executable script or bootstrap payloads that must be applied before the same endpoint starts returning arrays or records.

## Reach For This Playbook When

- the page points to one stable `question` or `data` endpoint, but the first response body is JavaScript rather than data
- running the returned script writes one cookie or field and the page retries the same path
- an older writeup mentions a second data endpoint, but live replay shows that path is now gone or returns `404`
- the replay keeps failing because the solver assumes the first script response is only a hint instead of one step in a short warmup chain

## Core Idea

Treat the target as one endpoint with staged output modes, not as a script endpoint plus a separate data endpoint.

The practical shape is usually:

1. request one stable endpoint
2. receive bootstrap script
3. execute or emulate the bootstrap script
4. preserve the emitted cookie or field
5. request the same endpoint again
6. receive real data

Some targets need more than one warmup round, but the control surface still stays on the same path.

## Typical Failure Pattern

The common mistake is:

- see one script response
- assume a hidden second `/api/...` route must exist
- keep probing outdated endpoints
- miss that the live page simply retries the same endpoint after one cookie write

That usually leads to stale transport theories and unnecessary signer hunting.

## First Actions

1. freeze one accepted-or-near-accepted response from the live endpoint
2. classify whether the response payload is:
   - script
   - encoded script
   - data array or object
3. if it is script, execute it in a controlled local runtime and record:
   - cookie writes
   - exposed helper functions
   - any carry-over fields needed for the next round
4. replay the same endpoint with the newly emitted cookie or field
5. repeat until the endpoint switches from script mode to data mode, or until the chain clearly loops

## What To Preserve

- the stable endpoint path
- response mode per round, for example `str -> str -> list`
- emitted cookie or field per round
- the smallest contract that first returns data
- whether the last page changes user-agent or pagination behavior

## Modeling Guidance

Do not collapse every returned script into one "derive cookie once" helper.

Instead, preserve the round structure explicitly:

- round number
- request cookie or field entering the round
- payload type returned by the round
- emitted cookie or field for the next round

That makes it much easier to tell whether the target is:

- one warmup round plus data
- multiple script rounds before data
- or a loop that never reaches data because one bootstrap side effect is still missing

## Verification Standard

Promote a replay path only after all of the following are true:

- the live endpoint path is confirmed
- the round progression is confirmed
- the emitted cookie or field is reproduced outside the browser
- the same endpoint returns real data under replay

If the endpoint keeps returning script, preserve the chain as a runtime-risk artifact instead of claiming the target is solved.
