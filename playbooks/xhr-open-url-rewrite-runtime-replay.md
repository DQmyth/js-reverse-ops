# XHR Open URL Rewrite Runtime Replay

Use this playbook when a page or challenge bundle does not expose the final token on a global variable, but a runtime hook rewrites the request URL during `XMLHttpRequest.open`.

## Trigger Signals

- the visible request has a token-shaped query field, but the page does not expose a stable `window.token` or `window.request`
- local replay can reproduce a long prefix or intermediate digest, but the final token still fails server validation
- a candidate helper such as a base64 or digest function emits values with the right length but the wrong acceptance behavior
- hooking `XMLHttpRequest.prototype.open` shows the input URL being replaced with a signed URL
- the final accepted request is a GET or XHR URL where the signer field appears only after runtime transport hooks run

## Common Failure Modes

- manually concatenating an observed prefix with one plausible suffix from a codec helper
- trusting a global `token` name from page source when the transport field is injected later
- replaying only the visible helper function while skipping the script load order that installs the transport hook
- rebuilding in Python before proving the runtime hook path
- dropping runtime-written cookies or per-page state returned by the previous accepted response
- using stale challenge assets after the live bundle has drifted

## Operating Sequence

1. Preserve the live page, signer bundle, runtime bootstrap scripts, and any server-issued state script.
2. Capture one accepted request and record the exact path, method, query keys, cookies, and response state fields.
3. Hook `XMLHttpRequest.prototype.open` before the challenge scripts execute.
4. Trigger the smallest URL open call that matches the protected endpoint, for example:

```js
var xhr = new XMLHttpRequest();
xhr.open("GET", "/api/data?page=" + pageNo, false);
```

5. Inspect the URL observed by the wrapped `open` call. If the runtime rewrites it to include the final signer field, treat that rewritten URL as the signer output.
6. Rebuild the minimum local runtime in Node/jsdom or a similar JS environment:
   - preserve original script order
   - serve local copies of remote scripts through a resource interceptor or equivalent loader
   - stub only the browser APIs the bundle actually probes
   - record runtime-written cookies
7. Extract the signer field from the rewritten URL and let Python or another HTTP client perform the real request.
8. After each accepted response, apply any returned state into the next local runtime pass before generating the next page or round.
9. Validate against the server after every page or round; do not promote a locally plausible token until the protected endpoint accepts it.

## Minimal Local Runtime Pattern

```js
const nativeOpen = window.XMLHttpRequest.prototype.open;
window.__openCalls = [];
window.XMLHttpRequest.prototype.open = function(method, url) {
  window.__openCalls.push({ method: String(method), url: String(url) });
  return nativeOpen.apply(this, arguments);
};

var xhr = new XMLHttpRequest();
xhr.open("GET", "/api/data?page=" + pageNo, false);

const signedUrl = window.__openCalls
  .map(item => item.url)
  .filter(url => url.includes("/api/data") && url.includes("sig="))
  .pop();
```

Use generic placeholders such as `sig`, `token`, or `m` in notes. Do not preserve live signed URLs, session cookies, account cookies, or target-specific secrets in public artifacts.

## Artifacts To Preserve

- sanitized request contract: path shape, method, field names, and dependency list
- script list and script load order
- local runtime harness
- hook output showing the URL before and after rewrite
- runtime cookie names without private values
- per-page or per-round state transition shape
- one accepted validation summary without live credentials or full signed URLs

## Promotion Boundary

Promote this path to delivery only after:

- the runtime hook produces a signed URL locally
- the extracted signer field passes the protected endpoint
- replay handles runtime cookies and state transitions
- stale assets are refreshed or versioned
- the final output reports page or round totals separately from the final aggregate
