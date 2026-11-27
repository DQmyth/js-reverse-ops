#!/usr/bin/env bash
# ATOMIC RELEASE PIPELINE — the single sanctioned path from workspace to GitHub.
#
#   bash scripts/make_release.sh X.Y.Z "release message" [--push]
#
# Runs as ONE short-circuit chain; any failed step aborts BEFORE anything is
# pushed, so "export failed but still pushed a half-updated state" (a real,
# repeated operator mistake — 4 occurrences on record) becomes impossible:
#
#   1. workspace preflight   — benchmarks + trigger evals + gym + tests + syntax
#   2. catalog freshness     — auto-generated catalog must be up to date
#   3. changelog entry       — VERSION must have a matching CHANGELOG section
#   4. export                — allowlist copy + sensitive-token scan (hard gate)
#   5. dist check            — make check inside the exported public bundle
#   5b. CI rehearsal         — a clean copy of the export: npm install, then the release
#                              check script and the test suite exactly as CI runs them
#   6. dist release-scan     — banned-token scan on the public tree (hard gate)
#   7. git commit            — only after 1-6 are all green
#   8. git tag vX.Y.Z
#   9. push commit + tag     — ONLY with --push; without it everything above
#                              still runs and stages the commit locally
#
# The operator cannot skip a gate: every step is in this file, in this order.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="$ROOT/../../dist/public-skills/js-reverse-ops"
VERSION="${1:?usage: make_release.sh X.Y.Z \"message\" [--push]}"
MESSAGE="${2:?usage: make_release.sh X.Y.Z \"message\" [--push]}"
PUSH="${3:-}"

step() { printf '\n\033[1;36m== %s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31mRELEASE ABORTED at: %s\033[0m\n' "$*" >&2; exit 1; }

step "1/9 workspace preflight (benchmarks + evals + gym + tests + syntax)"
( cd "$ROOT" \
  && node scripts/run_public_benchmarks.js > /tmp/mr_bench.log 2>&1 \
  && node scripts/run_trigger_evals.js > /tmp/mr_trig.log 2>&1 \
  && node scripts/gym_generate_targets.js --out /tmp/mr_gym > /dev/null 2>&1 \
  && node scripts/gym_run.js --targets /tmp/mr_gym > /tmp/mr_gym1.log 2>&1 \
  && node scripts/gym_generic_solver.js --targets /tmp/mr_gym > /tmp/mr_gym2.log 2>&1 \
  && rm -rf /tmp/mr_gym ) || die "workspace preflight (see /tmp/mr_*.log)"
echo "  benchmarks + trigger evals + gym (both solvers) green"

step "2/9 tests + syntax"
( cd "$ROOT" && node --test tests/unit/*.test.js tests/property/*.test.js tests/integration/*.test.js tests/performance/*.test.js > /tmp/mr_tests.log 2>&1 ) \
  || die "test suite (see /tmp/mr_tests.log)"
echo "  all test layers green"

step "3/9 script evidence + catalog freshness + changelog entry"
# The catalog's third column is re-measured, not trusted: each release records which tests start
# which scripts and on what input (about 30 s), and stops if a test file fails or the recording
# environment is incomplete (tests that need webcrack / curl_cffi / a matching Node would be
# skipped and every tier would read lower). A script that lost or gained evidence then makes the
# committed catalog stale — which is the point.
( cd "$ROOT" && node scripts/trace_script_evidence.js --strict > /tmp/mr_evidence.log 2>&1 ) || die "script evidence (see /tmp/mr_evidence.log)"
( cd "$ROOT" && node scripts/generate_scripts_catalog.js --check > /dev/null 2>&1 ) || die "scripts-catalog.md is stale — the evidence changed: `node scripts/generate_scripts_catalog.js`, and sync the UNTESTED list in tests/unit/scripts-catalog.test.js"
grep -q "^## \[$VERSION\]" "$ROOT/public/CHANGELOG.md" || die "CHANGELOG.md has no '## [$VERSION]' section"
grep -q "$VERSION" "$ROOT/public/VERSION" 2>/dev/null || echo "$VERSION" > "$ROOT/public/VERSION"
# nothing reads package.json's version, so it drifted to 0.1.14 while releases passed 1.8;
# keep it equal to VERSION from here on
node -e "const fs = require('fs'); const p = process.argv[1]; const j = JSON.parse(fs.readFileSync(p, 'utf8')); if (j.version !== process.argv[2]) { j.version = process.argv[2]; fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n'); }" "$ROOT/public/package.json" "$VERSION"
echo "  catalog fresh, changelog entry present, VERSION=$VERSION (package.json in sync)"

step "4/9 export (allowlist + sensitive-token hard gate)"
OUT="$( cd "$ROOT" && node scripts/export_public_skill.js 2>&1 )" || { printf '%s\n' "$OUT" | tail -5; die "export blocked (sensitive tokens or missing manifest sources)"; }
printf '%s\n' "$OUT" | grep -q '"status": "ok"' || { printf '%s\n' "$OUT" | tail -5; die "export did not report ok"; }
echo "  export ok — leak gate passed"

step "5/9 dist make check (exported bundle must be green standalone)"
( cd "$DIST" && make check > /tmp/mr_dist.log 2>&1 ) || die "dist make check (see /tmp/mr_dist.log)"
echo "  exported bundle passes make check"

step "5b/9 CI rehearsal: a clean copy of the export, npm install, then CI's own steps"
# `make check` does run the release check, but in a tree that has no node_modules of its own:
# the dist tree finds its dependencies through an ancestor folder on the release machine. CI
# installs them first, and from v1.4.0 to v1.8.5 its release check then rejected that un-ignored
# node_modules/ — 24 red releases that every local run was blind to. The rehearsal is CI's order
# on a clean copy: npm install, the release check with ripgrep off PATH (the CI image has none),
# the tests. Under these conditions 1.8.5 fails and 1.8.6 passes.
REHEARSAL="$(mktemp -d)"
mkdir -p "$REHEARSAL/bin"
ln -s "$(command -v node)" "$REHEARSAL/bin/node"
( rsync -a --exclude .git --exclude tmp --exclude node_modules "$DIST/" "$REHEARSAL/repo/" \
  && cd "$REHEARSAL/repo" && git init -q && git add -A \
  && npm install --no-audit --no-fund --loglevel=error > /tmp/mr_rehearsal_npm.log 2>&1 \
  && PATH="$REHEARSAL/bin:/usr/bin:/bin" bash scripts/check_public_release.sh > /tmp/mr_rehearsal_check.log 2>&1 \
  && node --test tests/unit/*.test.js tests/property/*.test.js > /tmp/mr_rehearsal_tests.log 2>&1 ) \
  || { rm -rf "$REHEARSAL"; die "CI rehearsal (see /tmp/mr_rehearsal_{npm,check,tests}.log)"; }
rm -rf "$REHEARSAL"
echo "  on a clean copy: npm install, check_public_release.sh (no ripgrep on PATH) and the tests all pass"

step "6/9 dist release-scan (banned tokens in the public tree)"
( cd "$DIST" && make release-scan > /dev/null 2>&1 ) || die "dist release-scan found banned tokens"
echo "  release scan clean"

step "7/9 commit (staged only after every gate is green)"
( cd "$DIST" && git add -A && git diff --cached --quiet && echo "  (nothing to commit — dist already up to date)" ) \
  || ( cd "$DIST" && git commit -q -m "$MESSAGE" && echo "  committed: $MESSAGE" )

step "8/9 tag v$VERSION"
( cd "$DIST" && git tag -f "v$VERSION" > /dev/null 2>&1 )
echo "  tagged v$VERSION (local)"

if [ "$PUSH" = "--push" ]; then
  step "9/9 push commit + tag"
  ( cd "$DIST" && git push && git push -f origin "v$VERSION" ) || die "push failed — fix remote state and re-run with --push"
  echo "  pushed. create the GitHub release with:"
  echo "    gh release create v$VERSION --repo <owner>/js-reverse-ops --title v$VERSION --generate-notes"
else
  step "9/9 push SKIPPED (no --push)"
  echo "  everything is committed and tagged LOCALLY in $DIST"
  echo "  inspect, then: bash scripts/make_release.sh $VERSION \"…\" --push   (re-runs all gates, pushes)"
fi

printf '\n\033[1;32mRELEASE READY: v%s — every gate green, nothing half-pushed.\033[0m\n' "$VERSION"
