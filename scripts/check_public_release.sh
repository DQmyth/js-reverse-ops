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

echo "[3/4] required files"
for file in README.md SKILL.md AGENTS.md AI_USAGE.md repo-map.json PUBLISHING.md CONTRIBUTING.md SECURITY.md LICENSE VERSION .gitattributes .gitignore; do
  test -f "$file"
done
test -f RELEASE.md
test -f examples/README.md
test -f examples/sample-target.js
test -f examples/sample-page.html
test -f examples/sample-notes.md
test -f examples/mobile-shell-requests-client.py
test -f examples/mobile-shell-scrapy-template.py
test -f scripts/js_reverse_ops.js
test -f scripts/map_case_to_pattern.js
test -f scripts/run_playbook.js
test -f scripts/validate_delivery_artifacts.js
test -f scripts/run_public_benchmarks.js
test -f scripts/generate_capability_scorecard.js
test -f scripts/install_local.sh
test -f scripts/publish_release.sh
test -f assets/case-pattern-index.json
test -f assets/public-benchmark-cases.json
test -f assets/capability-scorecard-model.json
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
node --check scripts/run_public_benchmarks.js
node --check scripts/generate_capability_scorecard.js
bash -n scripts/install_local.sh
bash -n scripts/publish_release.sh
node --check scripts/classify_reverse_pattern.js
node --check scripts/extract_page_contract.js
node --check scripts/extract_request_contract.js
node scripts/run_public_benchmarks.js
node scripts/run_playbook.js examples/sample-target.js --notes "XMLHttpRequest.open rewrites URL global token missing" --out tmp/check-playbook-run --json >/dev/null
node scripts/validate_delivery_artifacts.js tmp/check-playbook-run --json >/dev/null
bash scripts/install_local.sh tmp/install-check >/dev/null
node tmp/install-check/scripts/run_public_benchmarks.js >/dev/null
node scripts/generate_capability_scorecard.js --out tmp/capability-scorecard.json --markdown tmp/capability-scorecard.md >/dev/null

echo
echo "Public release check passed."
