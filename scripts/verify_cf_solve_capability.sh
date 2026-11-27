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
#     needs cmake + libclang; full build ~2.5 min (first-ever BoringSSL build ~10 min)
#   - network: pass --proxy when the target (or challenges.cloudflare.com)
#     is not directly reachable
#   - multiple widgets on demo-collection pages: pass the exact --sitekey,
#     a wrong one is rejected by CF with HTTP 400 at the widget route
#   - CLEARANCE BINDING = (exit IP, User-Agent), NOT the TLS stack. The
#     earlier "TLS-stack-bound" claim is RETRACTED — it was an artifact of
#     a hand-typed UA (Version/26.0 vs the profile's Version/26.6.3).
#     Controlled re-test 2026-11-27: no clearance 403; clearance + wrong
#     UA 403; clearance + exact UA 200 from curl_cffi (safari AND chrome
#     fingerprints); same clearance from another exit IP 403. Always READ
#     the UA from profile.json (misdiagnosis M15)
#   - BUILD DRIFT is observed fact, not a risk: a binary from the 11-17
#     commit stopped clearing on 2026-11-27 ("challenge did not complete
#     after the interaction POST", both exits). Upstream pushed "fix for
#     new build" on 11-26; a rebuild then cleared 5/5. If this verifier
#     fails on a page it used to clear, fetch upstream and rebuild first
#   - L2b caveat: the demo sitekey 3x00000000000000000000FF is Cloudflare's
#     official TEST key ("Forces interactive challenge") — a token there
#     proves the protocol handshake, not production scoring
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
UP="$(dirname "$BIN")/../UPSTREAM"; [ -f "$UP" ] && echo "cfsolve vendored build: $(head -1 "$UP")"
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
