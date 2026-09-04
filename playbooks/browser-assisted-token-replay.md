# Browser-Assisted Token Replay

Use this playbook when the signer is a custom VM or stateful black box whose output changes on every invocation, making local replication expensive, while the server still accepts a previously captured token URL.

## Trigger Signals

- the token differs on every call even for identical page and timestamp inputs (internal state advances per invocation)
- the signer lives inside a custom interpreter (payload-encoded strings, exotic identifier sets, no reachable crypto APIs)
- a captured token URL replayed through a plain HTTP client still returns `200` with data
- the task only needs the data values across a fixed page set, not a reusable offline signer

## Common Failure Modes

- investing days in VM semantic recovery before checking whether replay even works
- attributing captured responses by parsing the request URL when the transport attaches parameters in the request body or through a `data` option, leaving the opened URL without a query string
- installing the capture hook after the page's automatic first request and then waiting for data that already fired
- switching the last-page user agent after the request already went out

## Operating Sequence

1. Capture one natural token URL from the real browser, then replay it twice through a plain client before any deeper reverse work:
   - both replays accepted: replay tolerance is proven; browser-assisted delivery is legitimate and the VM can stay a black box
   - replays rejected: the token is a one-time nonce; local signer recovery is required, route to the VM semantics pipeline instead
2. Drive the real browser through the page set:
   - open the target page in a debug browser, inject the auth cookie, install an XHR capture before triggering
   - capture responses into an ordered array and attribute pages by click order, not by URL parsing
   - re-click the first page after installing the hook, because the automatic initial request fires before the hook exists
3. For the final page gate, apply a user-agent override through the browser protocol before clicking, so the browser itself produces the gated request.
4. Sum and submit from the Python side; the browser only computes tokens and fetches data.

## Artifacts To Preserve

- the replay probe result (both replay responses)
- the browser-driver script with ordered capture
- the per-page data and final sum
- a note that the signer was intentionally left as a black box, so later sessions do not mistake the delivery for an unfinished recovery
