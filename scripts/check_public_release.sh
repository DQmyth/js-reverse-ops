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
test -f playbooks/accepted-response-hidden-dom.md
test -f playbooks/bootstrap-digest-ladder.md
test -f playbooks/fresh-reload-seeded-signer-step-key-ladder.md
test -f playbooks/mobile-shell-api-pivot.md

echo "[4/4] script syntax"
node --check scripts/classify_reverse_pattern.js
node --check scripts/extract_page_contract.js
node --check scripts/extract_request_contract.js

echo
echo "Public release check passed."
