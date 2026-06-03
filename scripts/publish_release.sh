#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: bash scripts/publish_release.sh [--version X.Y.Z] [--message "..."] [--tag] [--push]

Runs the public release check, optionally updates VERSION, commits, tags, and pushes.
Default mode only validates the current public repository.
EOF
}

version=""
message=""
make_tag=0
push_remote=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --version)
      version="${2:-}"
      shift 2
      ;;
    --message)
      message="${2:-}"
      shift 2
      ;;
    --tag)
      make_tag=1
      shift
      ;;
    --push)
      push_remote=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_root"

if [ -n "$version" ]; then
  printf '%s\n' "$version" > VERSION
fi

bash scripts/check_public_release.sh

if [ -n "$message" ]; then
  git add .
  git commit -m "$message"
fi

if [ "$make_tag" -eq 1 ]; then
  tag_version="${version:-$(cat VERSION)}"
  git tag -a "v$tag_version" -m "Release v$tag_version"
fi

if [ "$push_remote" -eq 1 ]; then
  git push
  if [ "$make_tag" -eq 1 ]; then
    tag_version="${version:-$(cat VERSION)}"
    git push origin "v$tag_version"
  fi
fi

echo "Public release workflow completed."
