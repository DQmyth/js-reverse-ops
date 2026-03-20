#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <js-file>" >&2
  exit 1
fi

file="$1"
if [[ ! -f "$file" ]]; then
  echo "File not found: $file" >&2
  exit 1
fi

size=$(wc -c < "$file" | tr -d ' ')
lines=$(wc -l < "$file" | tr -d ' ')
max_line=$(awk '{ if (length > max) max = length } END { print max+0 }' "$file")

printf 'file: %s\n' "$file"
printf 'size_bytes: %s\n' "$size"
printf 'line_count: %s\n' "$lines"
printf 'max_line_length: %s\n' "$max_line"

fingerprint() {
  local label="$1"
  local pattern="$2"
  local count
  count=$( (rg -o "$pattern" "$file" -N 2>/dev/null || true) | wc -l | tr -d ' ' )
  printf '%s: %s\n' "$label" "$count"
}

echo 'heuristics:'
fingerprint '  webpack_markers' '__webpack_require__|__webpack_modules__|webpackJsonp'
fingerprint '  parcel_markers' 'parcelRequire'
fingerprint '  browserify_markers' '\[[0-9]+\]:\[function|function\(require,module,exports\)'
fingerprint '  source_map_refs' 'sourceMappingURL|SourceMap|X-SourceMap'
fingerprint '  eval_markers' '\beval\b|new Function'
fingerprint '  crypto_markers' 'CryptoJS|crypto\.subtle|md5|sha1|sha256|sha512|hmac|aes|rsa'
fingerprint '  obfuscation_markers' '_0x[0-9a-f]+|while\s*\(\s*true\s*\)|\\x[0-9a-fA-F]{2}'
fingerprint '  dynamic_imports' 'import\('
fingerprint '  websocket_markers' 'WebSocket|socket\.io'

if (( max_line > 5000 )); then
  echo 'assessment: likely minified or bundled'
else
  echo 'assessment: not obviously minified by line length alone'
fi
