# Browser Setup

Use this when runtime tooling fails because the MCP cannot connect to a browser, or macOS reports that Chromium is damaged.

## Preferred Target

Default to `Google Chrome` on macOS.

Reason:

- bundled or cached `Chromium` builds are more likely to be quarantined or damaged
- `js-reverse` only needs a working DevTools endpoint, not a specific Chromium brand
- `Google Chrome` is already installed more often and is easier to stabilize

## Stable Launch Path

Use the bundled launcher:

```bash
skills/js-reverse-ops/scripts/start_debug_browser.sh
```

Useful overrides:

```bash
PORT=9223 skills/js-reverse-ops/scripts/start_debug_browser.sh
HEADLESS=0 skills/js-reverse-ops/scripts/start_debug_browser.sh 'https://example.com'
CHROME_BIN='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' skills/js-reverse-ops/scripts/start_debug_browser.sh
MACOS_OPEN_APP=1 skills/js-reverse-ops/scripts/start_debug_browser.sh
```

Health check:

```bash
skills/js-reverse-ops/scripts/check_debug_browser.sh
```

Local MCP smoke test:

```bash
python3 skills/js-reverse-ops/scripts/check_local_js_reverse_mcp.py
```

Manual foreground MCP server:

```bash
skills/js-reverse-ops/scripts/start_local_js_reverse_mcp.sh
```

## Repair Rule

If Chromium fails with a damaged-app popup:

1. stop trying to repair Chromium inside the reverse workflow
2. launch `Google Chrome` with remote debugging
3. confirm `http://127.0.0.1:9222/json/version` responds
4. only then run `check_browser_health` in the MCP

## macOS App-Bundle Fallback

If direct execution of the browser binary briefly exposes `9222` and then exits, do not trust the first listener check.

Use an isolated app instance instead:

```bash
MACOS_OPEN_APP=1 USER_DATA_DIR=/tmp/js-reverse-google-chrome-open skills/js-reverse-ops/scripts/start_debug_browser.sh
```

Why:

- some macOS app bundles momentarily expose DevTools and then tear down the process tree when launched as the inner binary
- `open -na ... --args` keeps a real isolated app instance alive
- the separate `USER_DATA_DIR` avoids attaching to the operator's existing browsing context

Validation rule:

1. require `json/version` to stay reachable, not only `lsof`
2. if direct binary launch flaps, retry with `MACOS_OPEN_APP=1`
3. keep the isolated profile path in the evidence note for that session

## Verification Sequence

1. `scripts/start_debug_browser.sh`
2. `scripts/check_debug_browser.sh`
3. `js-reverse.check_browser_health`
4. navigate to the target page
5. run the normal runtime playbook

## Bridge Failure Rule

If DevTools is still reachable but MCP tools fail with `Transport closed`:

1. stop adding more hooks or breakpoints in that session
2. persist every captured request body, frame value, and call stack to disk
3. treat the current browser evidence as authoritative for this pass
4. run `python3 skills/js-reverse-ops/scripts/check_local_js_reverse_mcp.py`
5. if the local smoke test passes, the current Codex session's MCP binding is dead; restart the session or reconnect the MCP client
6. restart the runtime workflow from preflight instead of trying to continue half-broken instrumentation
