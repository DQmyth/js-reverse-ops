#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

function usage() {
  console.error([
    'Usage: generate_replay_delivery_client.js --record <replay.json> --out <dir> [--base-url <url>] [--json]',
    '',
    'Generates sanitized Node and Python replay clients from an accepted replay record.',
  ].join('\n'));
  process.exit(1);
}

function parseArgs(argv) {
  const args = { record: '', out: '', baseUrl: 'https://example.invalid', json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--record') {
      args.record = argv[index + 1] || '';
      index += 1;
    } else if (item === '--out') {
      args.out = argv[index + 1] || '';
      index += 1;
    } else if (item === '--base-url') {
      args.baseUrl = argv[index + 1] || '';
      index += 1;
    } else if (item === '--json') {
      args.json = true;
    } else if (item === '--help' || item === '-h') {
      usage();
    } else {
      usage();
    }
  }
  if (!args.record || !args.out) usage();
  return args;
}

function resolveRepoPath(value) {
  if (!value) return '';
  const candidates = path.isAbsolute(value)
    ? [value]
    : [
        path.resolve(process.cwd(), value),
        path.resolve(rootDir, value),
        path.resolve(rootDir, 'public', value),
      ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(resolveRepoPath(file), 'utf8'));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeBaseUrl(value) {
  try {
    const parsed = new URL(value || 'https://example.invalid');
    if (!['http:', 'https:'].includes(parsed.protocol)) return 'https://example.invalid';
    return parsed.origin;
  } catch (_error) {
    return 'https://example.invalid';
  }
}

function firstSample(record) {
  const samples = Array.isArray(record.samples) ? record.samples : [];
  return samples.find((sample) => sample.accepted || sample.status_code === 200) || samples[0] || {};
}

function sampleContract(record, baseUrl) {
  const sample = firstSample(record);
  const resolvedBase = safeBaseUrl(baseUrl);
  const rawUrl = sample.url || '/api/example';
  const parsed = new URL(rawUrl, resolvedBase);
  const query = Object.fromEntries(parsed.searchParams.entries());
  const pathWithSearch = `${parsed.pathname}${parsed.search}`;
  const accepted = record.acceptance_status === 'accepted' && record.status === 'verified' && Number(record.divergence_count || 0) === 0;
  return {
    accepted,
    validation_status: `${record.status || 'unknown'}/${record.acceptance_status || 'unknown'}`,
    divergence_count: Number(record.divergence_count || 0),
    sample_id: sample.id || null,
    method: String(sample.method || 'GET').toUpperCase(),
    base_url: resolvedBase,
    path: parsed.pathname,
    path_with_search: pathWithSearch,
    query,
    expected_shape: Array.isArray(sample.expected_shape) ? sample.expected_shape : [],
    observed_shape: Array.isArray(sample.observed_shape) ? sample.observed_shape : [],
    status_code: sample.status_code || null,
  };
}

function renderNodeClient(contract) {
  return `#!/usr/bin/env node

const BASE_URL = process.env.REPLAY_BASE_URL || ${JSON.stringify(contract.base_url)};
const REQUEST_PATH = ${JSON.stringify(contract.path)};
const REQUEST_METHOD = ${JSON.stringify(contract.method)};
const DEFAULT_QUERY = ${JSON.stringify(contract.query, null, 2)};

function buildUrl(overrides = {}) {
  const url = new URL(REQUEST_PATH, BASE_URL);
  const query = { ...DEFAULT_QUERY, ...overrides };
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  return url;
}

async function replay(overrides = {}) {
  const url = buildUrl(overrides);
  const response = await fetch(url, {
    method: REQUEST_METHOD,
    headers: {
      'accept': 'application/json,text/plain,*/*',
      'user-agent': 'js-reverse-ops-replay-client/1.0',
    },
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch (_error) {
    body = text;
  }
  return { ok: response.ok, status: response.status, url: url.toString(), body };
}

if (require.main === module) {
  replay().then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { replay, buildUrl };
`;
}

function renderPythonClient(contract) {
  return `#!/usr/bin/env python3
import json
import os
import sys
import urllib.parse
import urllib.request

BASE_URL = os.environ.get("REPLAY_BASE_URL", ${JSON.stringify(contract.base_url)})
REQUEST_PATH = ${JSON.stringify(contract.path)}
REQUEST_METHOD = ${JSON.stringify(contract.method)}
DEFAULT_QUERY = ${JSON.stringify(contract.query, null, 2)}


def build_url(overrides=None):
    query = dict(DEFAULT_QUERY)
    if overrides:
        query.update(overrides)
    base = BASE_URL.rstrip("/") + REQUEST_PATH
    encoded = urllib.parse.urlencode(query)
    return base + (("?" + encoded) if encoded else "")


def replay(overrides=None):
    url = build_url(overrides)
    request = urllib.request.Request(
        url,
        method=REQUEST_METHOD,
        headers={
            "Accept": "application/json,text/plain,*/*",
            "User-Agent": "js-reverse-ops-replay-client/1.0",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            text = response.read().decode("utf-8", errors="replace")
            status = response.status
    except urllib.error.HTTPError as error:
        text = error.read().decode("utf-8", errors="replace")
        status = error.code

    try:
        body = json.loads(text)
    except Exception:
        body = text
    return {"ok": 200 <= status < 300, "status": status, "url": url, "body": body}


if __name__ == "__main__":
    result = replay()
    print(json.dumps(result, ensure_ascii=False, indent=2))
    sys.exit(0 if result["ok"] else 1)
`;
}

function renderNotes(contract) {
  return [
    '# Replay Delivery Client',
    '',
    `- sample: \`${contract.sample_id || 'unknown'}\``,
    `- validation: \`${contract.validation_status}\``,
    `- accepted_for_generation: \`${contract.accepted}\``,
    `- request: \`${contract.method} ${contract.path_with_search}\``,
    `- expected_shape: ${contract.expected_shape.map((item) => `\`${item}\``).join(', ') || '`unknown`'}`,
    '',
    '## Boundary',
    '',
    'These clients are generated from a replay record and use `https://example.invalid` unless `REPLAY_BASE_URL` is set. They are delivery templates, not fresh proof of live acceptance.',
    '',
  ].join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const record = readJson(args.record);
  const outDir = resolveRepoPath(args.out);
  ensureDir(outDir);
  const contract = sampleContract(record, args.baseUrl);
  const files = {
    node_client: 'replay-client.node.js',
    python_client: 'replay-client.py',
    manifest: 'replay-client-manifest.json',
    notes: 'replay-client-notes.md',
  };

  fs.writeFileSync(path.join(outDir, files.node_client), renderNodeClient(contract), 'utf8');
  fs.writeFileSync(path.join(outDir, files.python_client), renderPythonClient(contract), 'utf8');
  fs.writeFileSync(path.join(outDir, files.notes), renderNotes(contract), 'utf8');
  fs.writeFileSync(path.join(outDir, files.manifest), `${JSON.stringify({
    schema: 'js-reverse-ops-replay-delivery-client-manifest-v1',
    generated_at: new Date().toISOString(),
    source_record: args.record,
    generation_status: contract.accepted ? 'accepted-replay-template' : 'not-accepted-template',
    contract,
    files,
    boundary: 'Generated clients do not promote replay evidence. Re-run validation against runtime or server acceptance before delivery claims.',
  }, null, 2)}\n`, 'utf8');

  const result = {
    schema: 'js-reverse-ops-replay-delivery-client-generation-v1',
    out_dir: outDir,
    generation_status: contract.accepted ? 'accepted-replay-template' : 'not-accepted-template',
    files,
    contract,
  };
  process.stdout.write(args.json ? `${JSON.stringify(result, null, 2)}\n` : `${renderNotes(contract)}\n`);
}

main();
