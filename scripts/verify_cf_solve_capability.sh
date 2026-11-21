#!/usr/bin/env bash
# verify_cf_solve_capability — re-runnable proof that the request-level CF
# solver still clears live challenges (the maintainer retired; the failure
# mode is sudden `Error::Unsupported` on a new CF build — re-run this before
# relying on the solver in a harvesting session).
#
# Two acquisition modes, both live-verified 2026-11-19 (mac arm64):
#   challenge page (L2)     -> prints cf_clearance=...
#   turnstile widget (L2b)  -> prints a 1.<base64> token (needs --sitekey)
#
# Recorded traps (each cost a failed attempt):
#   - build: brew rust 1.100 works (the pinned 1.98 toolchain is ignored);
#     needs cmake + libclang; ~10 min incl. BoringSSL
#   - network: pass --proxy when the target (or challenges.cloudflare.com)
#     is not directly reachable
#   - multiple widgets on demo-collection pages: pass the exact --sitekey,
#     a wrong one is rejected by CF with HTTP 400 at the widget route
#   - DISCOVERY: cf_clearance is TLS-STACK-bound — a clearance issued by the
#     solver's BoringSSL stack was rejected (403 fresh challenge) when
#     replayed through curl_cffi with identical proxy exit + UA. Harvest on
#     the solver's stack (library Browser mode is reusable) or pool
#     per-stack; see references/cf-gate-triage.md.
#
# Usage:
#   bash scripts/verify_cf_solve_capability.sh <url> --fingerprint <profile.json> \
#        [--sitekey <key>] [--proxy http://host:port] [--cfsolve /path/to/challenge]
# Exit 0 = cleared (token/clearance printed); 1 = failed (solver output shown).
set -euo pipefail

PAGE="${1:?usage: verify_cf_solve_capability.sh <url> --fingerprint <profile.json> [--sitekey <key>] [--proxy <url>] [--cfsolve <bin>]}"
shift || true
argOf() { local k="$1"; shift 2>/dev/null; local i; i=$(echo " $* " | awk -v k=" $k " '{ if ((n=index($0, k)) > 0) { print substr($0, n+length(k)) } }' | awk '{print $1}'); echo "$i"; }

FP=""
SITEKEY=""
PROXY=""
VENDOR_DIR="$(cd "$(dirname "$0")/../../../vendor/cfsolve/bin" 2>/dev/null && pwd || true)"
BIN="${CFSOLVE_BIN:-${VENDOR_DIR:+$VENDOR_DIR/challenge}}"
BIN="${BIN:-/tmp/cfsolve/target/release/challenge}"

while [ $# -gt 0 ]; do
  case "$1" in
    --fingerprint) FP="$2"; shift 2 ;;
    --sitekey) SITEKEY="$2"; shift 2 ;;
    --proxy) PROXY="$2"; shift 2 ;;
    --cfsolve) BIN="$2"; shift 2 ;;
    *) shift ;;
  esac
done

[ -n "$FP" ] || { echo "--fingerprint <profile.json> is required" >&2; exit 2; }
[ -x "$BIN" ] || { echo "cfsolve binary not found/executable: $BIN (build: cargo build --release --bin challenge)" >&2; exit 2; }

DIR=$(mktemp -d /tmp/cf_solve_verify.XXXXXX)
ARGS=(--page "$PAGE" "$DIR" --solve --fingerprint "$FP")
[ -n "$SITEKEY" ] && ARGS+=(--sitekey "$SITEKEY")
[ -n "$PROXY" ] && ARGS+=(--proxy "$PROXY")

if OUT=$("$BIN" "${ARGS[@]}" 2>&1); then
  echo "$OUT" | tail -5
  TOKEN=$(echo "$OUT" | grep -oE '(cf_clearance=[^ ]+|^1\.[A-Za-z0-9_-]{40,})' | tail -1 || true)
  if echo "$OUT" | grep -q 'Cleared the challenge'; then
    echo "VERIFY: challenge page cleared ✓  (${TOKEN:0:60}...)"
    exit 0
  fi
  if echo "$OUT" | grep -qE '^1\.[A-Za-z0-9_-]{40,}'; then
    echo "VERIFY: turnstile token issued ✓  (${TOKEN:0:60}...)"
    exit 0
  fi
  echo "VERIFY: solver exited 0 but no clearance/token pattern recognized — inspect output above" >&2
  exit 1
else
  echo "$OUT" | tail -5 >&2
  echo "VERIFY: solver failed — if Error::Unsupported, the CF build moved on and the retired upstream needs a patch" >&2
  exit 1
fi
