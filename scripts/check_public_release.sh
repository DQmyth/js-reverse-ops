#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_root"

echo "[1/4] repository"
git status --short --branch

echo "[2/4] sensitive scan"
scan_pattern="$(
  printf '%s' \
    'yuan''renxue|match''\.yuan''renxue|match''2023|z''ol|session''id|python-''spider|'\
    '/topic/[0-9]+|/match/[0-9]+|/api/match''2023/|/api/question/[0-9]+|'\
    '/Users/[A-Za-z0-9._-]+|/home/[A-Za-z0-9._-]+|'\
    'Bearer[[:space:]]+[A-Za-z0-9._~+/=-]{20,}|Basic[[:space:]]+[A-Za-z0-9+/=]{20,}|'\
    'x-api-key[[:space:]]*[:=][[:space:]]*["'\'']?[A-Za-z0-9._-]{16,}|'\
    'ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|'\
    'AIza[0-9A-Za-z_-]{20,}|-----BEGIN (RSA|DSA|EC|OPENSSH|PGP) PRIVATE KEY-----|'\
    'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]{10,}\.[A-Za-z0-9._-]{10,}'
)"
if rg -n -S \
  --glob '!./.git/**' \
  --glob '!./tmp/**' \
  --glob '!./dist/**' \
  "$scan_pattern" .; then
  echo
  echo "Sensitive markers detected. Review before pushing."
  exit 1
fi

tracked_forbidden="$(
  git ls-files | rg -n '(^tmp/|^dist/|^runs/|^private/|tmp_cases|__pycache__/|\.pyc$|\.pyo$|\.env($|\.)|(^|/)(id_rsa|id_dsa|id_ecdsa|id_ed25519|\.netrc|credentials?\.json|secrets?\.json)$|(\.har|\.pcap|\.pcapng)$)' || true
)"
if [ -n "$tracked_forbidden" ]; then
  echo "$tracked_forbidden"
  echo
  echo "Forbidden generated, private, or sensitive-looking paths are tracked. Remove or rename before pushing."
  exit 1
fi

if git status --short --ignored | rg -n '(^!! tmp/|^!! .*__pycache__/|^!! .*\.pyc$)' >/dev/null; then
  echo "Ignored generated files exist locally; this is allowed, but they must stay untracked."
fi

echo "[3/4] required files"
for file in README.md SKILL.md AGENTS.md AI_USAGE.md repo-map.json package.json PUBLISHING.md CONTRIBUTING.md SECURITY.md LICENSE VERSION .gitattributes .gitignore; do
  test -f "$file"
done
test -f RELEASE.md
test -f examples/README.md
test -f examples/sample-target.js
test -f examples/sample-page.html
test -f examples/sample-static-obfuscated.js
test -f examples/sample-sourcemap-bundle.js
test -f examples/sample-static-decoy.js
test -f examples/sample-static-readable-wrong.js
test -f examples/sample-static-runtime-divergence.json
test -f examples/sample-browser-mcp-execution-record.json
test -f examples/sample-playwright-mcp-execution-record.json
test -f examples/sample-browser-tools-mcp-execution-record.json
test -f examples/sample-domain-handoff-record.json
test -f examples/sample-packet-domain-handoff-record.json
test -f examples/sample-mobile-domain-handoff-record.json
test -f examples/sample-native-domain-handoff-record.json
test -f examples/sample-debugger-domain-handoff-record.json
test -f examples/sample-proxy-rpc-domain-handoff-record.json
test -f examples/sample-hook-evidence.json
test -f examples/sample-replay-record.json
test -f examples/sample-replay-divergent-record.json
test -f examples/sample-replay-transport-403-record.json
test -f examples/sample-replay-crypto-mismatch-record.json
test -f examples/sample-replay-ttl-expired-record.json
test -f examples/sample-notes.md
test -f examples/mobile-shell-requests-client.py
test -f examples/mobile-shell-scrapy-template.py
test -f scripts/js_reverse_ops.js
test -f scripts/map_case_to_pattern.js
test -f scripts/run_playbook.js
test -f scripts/validate_delivery_artifacts.js
test -f scripts/promote_delivery_evidence.js
test -f scripts/recommend_next_action.js
test -f scripts/run_public_benchmarks.js
test -f scripts/generate_capability_scorecard.js
test -f scripts/explain_public_release_risk.js
test -f scripts/compare_external_skill_matrix.js
test -f scripts/plan_browser_mcp_smoke.js
test -f scripts/verify_browser_mcp_smoke_record.js
test -f scripts/run_mcp_delivery_loop.js
test -f scripts/diagnose_replay_failure.js
test -f scripts/generate_replay_delivery_client.js
test -f scripts/validate_replay_delivery_client.js
test -f scripts/validate_domain_handoff_record.js
test -f scripts/assess_static_recovery_truth.js
test -f scripts/jsro.js
test -f scripts/install_local.sh
test -f scripts/publish_release.sh
test -f assets/case-pattern-index.json
test -f assets/public-benchmark-cases.json
test -f assets/capability-scorecard-model.json
test -f assets/release-risk-policy.json
test -f assets/external-skill-regression-model.json
test -f assets/browser-mcp-smoke-model.json
test -f assets/static-verification-gate-model.json
test -f playbooks/accepted-response-hidden-dom.md
test -f playbooks/bootstrap-digest-ladder.md
test -f playbooks/fresh-reload-seeded-signer-step-key-ladder.md
test -f playbooks/mobile-shell-api-pivot.md
test -f playbooks/xhr-open-url-rewrite-runtime-replay.md

node <<'NODE'
const fs = require('fs');
const repoMap = JSON.parse(fs.readFileSync('repo-map.json', 'utf8'));
const paths = new Set([
  ...(repoMap.primary_entrypoints || []),
  ...Object.values(repoMap.recommended_sequences || {}).flat(),
  ...Object.values(repoMap.stage_refs || {}),
  ...Object.keys(repoMap.core_dirs || {}),
]);
const missing = [...paths]
  .filter((item) => !/^https?:\/\//.test(item))
  .filter((item) => !fs.existsSync(item));
if (missing.length) {
  console.error(JSON.stringify({status: 'missing repo-map paths', missing}, null, 2));
  process.exit(1);
}
NODE

echo "[4/4] script syntax"
node --check scripts/js_reverse_ops.js
node --check scripts/map_case_to_pattern.js
node --check scripts/run_playbook.js
node --check scripts/validate_delivery_artifacts.js
node --check scripts/promote_delivery_evidence.js
node --check scripts/recommend_next_action.js
node --check scripts/run_public_benchmarks.js
node --check scripts/generate_capability_scorecard.js
node --check scripts/explain_public_release_risk.js
node --check scripts/compare_external_skill_matrix.js
node --check scripts/select_anti_detection_profile.js
node --check scripts/plan_browser_mcp_smoke.js
node --check scripts/verify_browser_mcp_smoke_record.js
node --check scripts/run_mcp_delivery_loop.js
node --check scripts/diagnose_replay_failure.js
node --check scripts/generate_replay_delivery_client.js
node --check scripts/validate_replay_delivery_client.js
node --check scripts/validate_domain_handoff_record.js
node --check scripts/assess_static_recovery_truth.js
node --check scripts/jsro.js
bash -n scripts/install_local.sh
bash -n scripts/publish_release.sh
node --check scripts/classify_reverse_pattern.js
node --check scripts/extract_page_contract.js
node --check scripts/extract_request_contract.js
node scripts/run_public_benchmarks.js
node scripts/run_playbook.js examples/sample-target.js --notes "XMLHttpRequest.open rewrites URL global token missing" --out tmp/check-playbook-run --json >/dev/null
node scripts/validate_delivery_artifacts.js tmp/check-playbook-run --json >/dev/null
node scripts/recommend_next_action.js tmp/check-playbook-run --json >/dev/null
node scripts/jsro.js next tmp/check-playbook-run --json >/dev/null
node scripts/promote_delivery_evidence.js tmp/check-playbook-run --hook-evidence examples/sample-hook-evidence.json --replay-record examples/sample-replay-record.json --json >/dev/null
node scripts/validate_delivery_artifacts.js tmp/check-playbook-run --json >/dev/null
bash scripts/install_local.sh tmp/install-check >/dev/null
node tmp/install-check/scripts/run_public_benchmarks.js >/dev/null
node scripts/generate_capability_scorecard.js --out tmp/capability-scorecard.json --markdown tmp/capability-scorecard.md >/dev/null
node scripts/explain_public_release_risk.js --json --strict >/dev/null
node scripts/compare_external_skill_matrix.js --json >/dev/null
node scripts/select_anti_detection_profile.js --symptoms "navigator webdriver canvas webgl user-agent client hints differ" --json >/dev/null
node scripts/select_anti_detection_profile.js --symptoms "localStorage seed cookie write order bootstrap state" --json >/dev/null
node scripts/validate_domain_handoff_record.js --record examples/sample-domain-handoff-record.json --json --strict >/dev/null
node scripts/validate_domain_handoff_record.js --record examples/sample-packet-domain-handoff-record.json --json --strict >/dev/null
node scripts/validate_domain_handoff_record.js --record examples/sample-mobile-domain-handoff-record.json --json --strict >/dev/null
node scripts/validate_domain_handoff_record.js --record examples/sample-native-domain-handoff-record.json --json --strict >/dev/null
node scripts/validate_domain_handoff_record.js --record examples/sample-debugger-domain-handoff-record.json --json --strict >/dev/null
node scripts/validate_domain_handoff_record.js --record examples/sample-proxy-rpc-domain-handoff-record.json --json --strict >/dev/null
node scripts/jsro.js handoffcheck --record examples/sample-domain-handoff-record.json --json --strict >/dev/null
node scripts/plan_browser_mcp_smoke.js --json >/dev/null
node scripts/verify_browser_mcp_smoke_record.js --record examples/sample-browser-mcp-execution-record.json --json >/dev/null
node scripts/verify_browser_mcp_smoke_record.js --record examples/sample-playwright-mcp-execution-record.json --server-family playwright_mcp --json >/dev/null
node scripts/verify_browser_mcp_smoke_record.js --record examples/sample-browser-tools-mcp-execution-record.json --server-family browser_tools_mcp --json >/dev/null
node scripts/run_mcp_delivery_loop.js examples/sample-target.js --notes "XMLHttpRequest.open rewrites URL global token missing" --out tmp/check-mcp-loop-run --record examples/sample-browser-mcp-execution-record.json --json >/dev/null
node scripts/diagnose_replay_failure.js --replay-record examples/sample-replay-divergent-record.json --notes "accepted request but observed error shape" --json >/dev/null
node scripts/diagnose_replay_failure.js --replay-record examples/sample-replay-transport-403-record.json --notes "403 in script while browser succeeds; compare user-agent origin referer accept-language and client profile" --json >/dev/null
node scripts/diagnose_replay_failure.js --replay-record examples/sample-replay-crypto-mismatch-record.json --notes "signature mismatch and token mismatch after request contract parity" --json >/dev/null
node scripts/diagnose_replay_failure.js --replay-record examples/sample-replay-ttl-expired-record.json --notes "ttl and timestamp expired; freeze server time before replay" --json >/dev/null
node scripts/generate_replay_delivery_client.js --record examples/sample-replay-record.json --out tmp/check-replay-client --json >/dev/null
node scripts/validate_replay_delivery_client.js tmp/check-replay-client --json >/dev/null
node scripts/jsro.js replayclientcheck tmp/check-replay-client --json >/dev/null
node --check tmp/check-replay-client/replay-client.node.js
node scripts/plan_static_toolchain.js examples/sample-sourcemap-bundle.js --json >/dev/null
node scripts/assess_static_recovery_truth.js --original examples/sample-static-decoy.js --json >/dev/null
node scripts/assess_static_recovery_truth.js --original examples/sample-static-readable-wrong.js --runtime-evidence examples/sample-static-runtime-divergence.json --json >/dev/null
node scripts/jsro.js benchmark >/dev/null

echo
echo "Public release check passed."
