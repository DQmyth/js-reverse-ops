#!/usr/bin/env bash
# Start the local JSReverser-MCP server against the debug browser at BROWSER_URL, logging to LOG_FILE.

set -euo pipefail

BROWSER_URL="${BROWSER_URL:-http://127.0.0.1:9222}"
LOG_FILE="${LOG_FILE:-/tmp/js-reverse-mcp-local.log}"

exec node vendor/JSReverser-MCP/build/src/index.js \
  --browserUrl "$BROWSER_URL" \
  --logFile "$LOG_FILE"
