#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-9222}"

listener="$(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
if [[ -z "$listener" ]]; then
  echo "debug_browser_down port=${PORT}"
  exit 1
fi

python3 - "$PORT" <<'PY'
import json
import sys
import urllib.request

port = sys.argv[1]
url = f"http://127.0.0.1:{port}/json/version"
try:
    with urllib.request.urlopen(url, timeout=1.5) as resp:
        data = json.load(resp)
except Exception as exc:
    print(f"debug_browser_partial port={port} error={exc}")
    raise SystemExit(1)

product = data.get("Browser", "unknown")
websocket_url = data.get("webSocketDebuggerUrl", "")
print(f"debug_browser_up port={port} browser={product} websocket={websocket_url}")
PY
