#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
codex_home="${CODEX_HOME:-$HOME/.codex}"
dest="${1:-$codex_home/skills/js-reverse-ops}"

mkdir -p "$(dirname "$dest")"

if command -v rsync >/dev/null 2>&1; then
  rsync -a \
    --exclude '.git' \
    --exclude 'tmp' \
    --exclude 'runs' \
    --exclude 'node_modules' \
    "$repo_root"/ "$dest"/
else
  mkdir -p "$dest"
  (
    cd "$repo_root"
    find . \
      -path './.git' -prune -o \
      -path './tmp' -prune -o \
      -path './runs' -prune -o \
      -path './node_modules' -prune -o \
      -path "./${dest#$repo_root/}" -prune -o \
      -type d -exec mkdir -p "$dest/{}" \; -o \
      -type f -exec cp "{}" "$dest/{}" \;
  )
fi

echo "Installed js-reverse-ops to $dest"
echo "Run: node $dest/scripts/run_public_benchmarks.js"
