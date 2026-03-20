#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function usage() {
  console.error('Usage: scaffold_external_replay.js --bundle-dir <dir>');
  process.exit(1);
}

const args = process.argv.slice(2);
if (!args.length) usage();

const options = { bundleDir: '' };
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  const next = args[i + 1] || '';
  if (arg === '--bundle-dir') {
    options.bundleDir = path.resolve(next);
    i += 1;
  } else {
    usage();
  }
}
if (!options.bundleDir) usage();

function readJson(name, fallback = {}) {
  const file = path.join(options.bundleDir, name);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback;
}
function writeJson(name, data) {
  fs.writeFileSync(path.join(options.bundleDir, name), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}
function writeText(name, content) {
  fs.writeFileSync(path.join(options.bundleDir, name), `${content}\n`, 'utf8');
}
function appendUnique(list, value) {
  if (!list.includes(value)) list.push(value);
}

const evidence = readJson('evidence.json');
const claims = readJson('claim-set.json', { claims: [] });
const artifactIndex = readJson('artifact-index.json', { output_dir: options.bundleDir, root_files: [], groups: { original: [], derived: [], evidence: [] } });
const runtime = evidence.runtime_evidence || {};
const request = runtime.request || {};

let parsedUrl;
try {
  parsedUrl = new URL(request.url || evidence.page_url || 'https://example.invalid/api/example');
} catch {
  parsedUrl = new URL('https://example.invalid/api/example');
}
const samplePayload = {};
for (const field of request.fields || []) samplePayload[field] = `<captured-${field}>`;

const replayPy = `import json
import requests


class ExternalReplay:
    def __init__(self):
        self.session = requests.Session()

    def build_payload(self):
        return ${JSON.stringify(samplePayload, null, 4)}

    def build_headers(self):
        return {
            "User-Agent": "Mozilla/5.0",
        }

    def request(self):
        url = "${request.url || parsedUrl.toString()}"
        payload = self.build_payload()
        headers = self.build_headers()
        response = self.session.${(request.method || 'POST').toLowerCase() === 'get' ? 'get' : 'post'}(
            url,
            ${((request.method || 'POST').toLowerCase() === 'get') ? 'params=payload' : 'json=payload'},
            headers=headers,
        )
        return {
            "status_code": response.status_code,
            "text": response.text,
        }


if __name__ == "__main__":
    replay = ExternalReplay()
    print(json.dumps(replay.request(), ensure_ascii=False, indent=2))
`;

const replayNotes = [
  '# Replay Scaffold Notes',
  '',
  `- request_url: ${request.url || 'unknown'}`,
  `- request_method: ${request.method || 'UNKNOWN'}`,
  `- request_fields: ${(request.fields || []).join(', ') || 'none'}`,
  `- synthetic_runtime: ${Boolean(runtime.synthetic)}`,
  '',
  'This scaffold is a starting point only. Replace placeholder payload values and derived headers or signatures with real logic before treating replay output as meaningful.',
].join('\n');

  fs.writeFileSync(path.join(options.bundleDir, 'replay.py'), replayPy, 'utf8');
  writeText('replay-notes.md', replayNotes);

evidence.replay_scaffold = {
  generated: true,
  file: 'replay.py',
  synthetic_runtime_basis: Boolean(runtime.synthetic),
};
writeJson('evidence.json', evidence);

if (!Array.isArray(claims.claims)) claims.claims = [];
if (!claims.claims.some((item) => item.id === 'external-replay-scaffold-generated')) {
  claims.claims.push({
    id: 'external-replay-scaffold-generated',
    status: 'verified',
    strength: 'medium',
    statement: 'Replay scaffold has been generated for the external bundle.',
    evidence_sources: ['replay.py', 'replay-notes.md'],
  });
}
if (claims.overall_status === 'runtime-captured') claims.overall_status = 'replay-scaffolded';
writeJson('claim-set.json', claims);

if (!artifactIndex.groups) artifactIndex.groups = { original: [], derived: [], evidence: [] };
if (!Array.isArray(artifactIndex.groups.derived)) artifactIndex.groups.derived = [];
for (const name of ['replay.py', 'replay-notes.md']) {
  const full = path.join(options.bundleDir, name);
  if (!artifactIndex.groups.derived.some((entry) => entry.destination === full)) {
    artifactIndex.groups.derived.push({
      status: 'generated',
      source: full,
      destination: full,
    });
  }
}
writeJson('artifact-index.json', artifactIndex);

console.log(JSON.stringify({
  bundle_dir: options.bundleDir,
  replay_file: path.join(options.bundleDir, 'replay.py'),
  request_url: request.url || null,
  synthetic_runtime_basis: Boolean(runtime.synthetic),
}, null, 2));
