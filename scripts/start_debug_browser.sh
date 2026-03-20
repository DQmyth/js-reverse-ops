#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-9222}"
HEADLESS="${HEADLESS:-1}"
USER_DATA_DIR="${USER_DATA_DIR:-/tmp/js-reverse-google-chrome-debug}"
LOG_FILE="${LOG_FILE:-/tmp/js-reverse-google-chrome-debug.log}"
MACOS_OPEN_APP="${MACOS_OPEN_APP:-auto}"
TARGET_URL="${1:-about:blank}"

if [[ -n "${CHROME_BIN:-}" ]]; then
  BROWSER_BIN="$CHROME_BIN"
elif [[ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]]; then
  BROWSER_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
elif [[ -x "/Applications/Chromium.app/Contents/MacOS/Chromium" ]]; then
  BROWSER_BIN="/Applications/Chromium.app/Contents/MacOS/Chromium"
else
  echo "No supported browser binary found. Set CHROME_BIN explicitly." >&2
  exit 1
fi

if [[ "$BROWSER_BIN" == *"/Applications/Chromium.app/"* ]]; then
  echo "Chromium is present, but this skill defaults to Google Chrome because damaged Chromium builds are common on macOS." >&2
fi

mkdir -p "$USER_DATA_DIR"

existing_pid="$(lsof -ti "tcp:${PORT}" -sTCP:LISTEN 2>/dev/null | head -n 1 || true)"
if [[ -n "$existing_pid" ]]; then
  echo "Port ${PORT} is already in use by pid ${existing_pid}. Stop that process or choose another PORT." >&2
  exit 1
fi

args=(
  "--remote-debugging-port=${PORT}"
  "--user-data-dir=${USER_DATA_DIR}"
  "--no-first-run"
  "--no-default-browser-check"
)

if [[ "$HEADLESS" == "1" ]]; then
  args+=("--headless=new")
fi

browser_pid=""
launcher="binary"
app_bundle=""

if [[ "$BROWSER_BIN" == *.app/Contents/MacOS/* ]]; then
  app_bundle="${BROWSER_BIN%/Contents/MacOS/*}.app"
fi

check_debug_endpoint() {
  python3 - "$PORT" >/dev/null 2>&1 <<'PY'
import json
import sys
import urllib.request

port = sys.argv[1]
with urllib.request.urlopen(f"http://127.0.0.1:{port}/json/version", timeout=1.0) as resp:
    json.load(resp)
PY
}

stabilize_debug_endpoint() {
  local tries="$1"
  local delay="$2"
  local stable_count=0
  local pid=""

  for ((i=0; i<tries; i++)); do
    pid="$(lsof -ti "tcp:${PORT}" -sTCP:LISTEN 2>/dev/null | head -n 1 || true)"
    if [[ -n "$pid" ]] && check_debug_endpoint; then
      stable_count=$((stable_count + 1))
      if [[ "$stable_count" -ge 3 ]]; then
        browser_pid="$pid"
        return 0
      fi
    else
      stable_count=0
    fi
    sleep "$delay"
  done

  return 1
}

launch_with_binary() {
  nohup "$BROWSER_BIN" "${args[@]}" "$TARGET_URL" >"$LOG_FILE" 2>&1 &
}

launch_with_open() {
  : >"$LOG_FILE"
  nohup open -na "$app_bundle" --args "${args[@]}" "$TARGET_URL" >"$LOG_FILE" 2>&1 &
}

should_try_open_fallback() {
  [[ "$(uname -s)" == "Darwin" ]] || return 1
  [[ -n "$app_bundle" ]] || return 1

  case "$MACOS_OPEN_APP" in
    1|true|yes|open)
      return 0
      ;;
    auto)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

launch_with_binary

if ! stabilize_debug_endpoint 40 0.25; then
  if should_try_open_fallback; then
    launcher="open"
    launch_with_open
    if ! stabilize_debug_endpoint 48 0.25; then
      echo "Browser did not expose a stable remote debugging endpoint on port ${PORT}. Check ${LOG_FILE}." >&2
      exit 1
    fi
  else
    echo "Browser did not expose a stable remote debugging endpoint on port ${PORT}. Check ${LOG_FILE}." >&2
    exit 1
  fi
fi

echo "debug_browser_ready pid=${browser_pid} port=${PORT} browser=${BROWSER_BIN} launcher=${launcher} log=${LOG_FILE}"
