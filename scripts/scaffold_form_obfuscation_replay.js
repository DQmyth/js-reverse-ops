#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function usage() {
  console.error(
    'Usage: scaffold_form_obfuscation_replay.js --source-html <page.html> --page-contract <page-contract.json> --bundle-dir <dir>'
  );
  process.exit(1);
}

const args = process.argv.slice(2);
if (!args.length) usage();

const options = {
  sourceHtml: '',
  pageContract: '',
  bundleDir: '',
};

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  const next = args[i + 1] || '';
  if (arg === '--source-html') {
    options.sourceHtml = path.resolve(next);
    i += 1;
  } else if (arg === '--page-contract') {
    options.pageContract = path.resolve(next);
    i += 1;
  } else if (arg === '--bundle-dir') {
    options.bundleDir = path.resolve(next);
    i += 1;
  } else {
    usage();
  }
}

if (!options.sourceHtml || !options.pageContract || !options.bundleDir) usage();

const html = fs.readFileSync(options.sourceHtml, 'utf8');
const contract = JSON.parse(fs.readFileSync(options.pageContract, 'utf8'));
const bundleDir = options.bundleDir;

function readJson(name, fallback = {}) {
  const file = path.join(bundleDir, name);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback;
}
function writeJson(name, data) {
  fs.writeFileSync(path.join(bundleDir, name), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}
function writeText(name, content) {
  fs.writeFileSync(path.join(bundleDir, name), `${content}\n`, 'utf8');
}

const inferred = contract.inferred || {};
const endpoint = inferred.endpoint || '';
const method = inferred.method || 'POST';
const hiddenFields = inferred.body_keys || [];
const onsubmit = (inferred.form_onsubmit_handlers || [])[0] || '';

const shiftMatch = html.match(/String\.fromCharCode\(\s*text\.charCodeAt\(x\)\s*([+-])\s*(\d+)\s*\)/);
const fixedShift = shiftMatch ? Number(shiftMatch[2]) * (shiftMatch[1] === '-' ? -1 : 1) : null;
const rotatingShift =
  /var\s+lily\s*=\s*frog\(0,93\)/.test(html) &&
  /junk\s*\+=\s*String\.fromCharCode\(lily\+32\)/.test(html) &&
  /dock2\s*=\s*dock\s*\+\s*lily/.test(html) &&
  /if\s*\(\s*dock2\s*>\s*93\s*\)/.test(html);
const mappingMatches = [...html.matchAll(/document\.([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)\.value\s*=\s*([A-Za-z0-9_]+)\(document\.\1\.([A-Za-z0-9_]+)\.value\)/g)];
const formMappings = mappingMatches.map((m) => ({
  form_alias: m[1],
  output_field: m[2],
  transform: m[3],
  input_field: m[4],
}));
const clearMatches = [...html.matchAll(/document\.([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)\.value\s*=\s*""/g)];
const clearFields = [...new Set(clearMatches.map((m) => m[2]))];

if (!endpoint || !hiddenFields.length || (!rotatingShift && fixedShift == null) || !formMappings.length) {
  console.error('Could not derive a concrete form-obfuscation replay contract from the provided inputs.');
  process.exit(1);
}

const transformName = formMappings[0].transform;
const payloadLines = formMappings
  .map((item) => `        "${item.output_field}": ${transformName}(args.${item.input_field}${rotatingShift ? ', args.lily' : ''}),`)
  .concat(clearFields.map((field) => `        "${field}": "",`))
  .join('\n');

const cliArgs = [...new Set(formMappings.map((item) => item.input_field))];
const cliArgDecl = cliArgs.map((name) => `    parser.add_argument("--${name}", required=True)`).join('\n');

const transformBody = rotatingShift
  ? `    if lily < 0 or lily > 93:\n        raise ValueError("lily must be between 0 and 93")\n    out = chr(lily + 32)\n    for ch in text:\n        dock = ord(ch) - 32\n        dock2 = dock + lily\n        if dock2 > 93:\n            dock2 -= 94\n        out += chr(dock2 + 32)\n    return out`
  : `    return "".join(chr(ord(ch) + (${fixedShift})) for ch in text)`;

const replayPy = `import argparse
import json
import requests


def ${transformName}(text: str${rotatingShift ? ', lily: int' : ''}) -> str:
${transformBody}


def build_payload(args):
    return {
${payloadLines}
    }


def main():
    parser = argparse.ArgumentParser()
${cliArgDecl}
${rotatingShift ? '    parser.add_argument("--lily", type=int, default=54)\n' : ''}    parser.add_argument("--base-url", default="http://example.invalid")
    args = parser.parse_args()

    url = args.base_url.rstrip("/") + "/${endpoint}"
    payload = build_payload(args)
    response = requests.${method.toLowerCase() === 'get' ? 'get' : 'post'}(url, ${method.toLowerCase() === 'get' ? 'params' : 'data'}=payload, timeout=15)
    print(json.dumps({
        "url": url,
        "status_code": response.status_code,
        "payload": payload,
        "text": response.text,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
`;

const notes = [
  '# Form Obfuscation Replay Notes',
  '',
  `- source_html: ${options.sourceHtml}`,
  `- endpoint: ${endpoint}`,
  `- method: ${method}`,
  `- hidden_fields: ${hiddenFields.join(', ')}`,
  `- cleared_fields: ${clearFields.join(', ') || 'none'}`,
  `- onsubmit: ${onsubmit || 'none'}`,
  `- inferred_transform: ${rotatingShift ? `${transformName}(rotating shift with leading lily byte)` : `${transformName}(charCode shift ${fixedShift >= 0 ? '+' : ''}${fixedShift})`}`,
  rotatingShift ? '- replay_parameter: --lily <0..93> (default 54)' : null,
  '',
  'This replay scaffold is derived from a form-driven page contract and inline JavaScript transform, not from live browser request capture.',
].filter(Boolean).join('\n');

fs.writeFileSync(path.join(bundleDir, 'form-replay.py'), replayPy, 'utf8');
writeText('form-replay-notes.md', notes);

const evidence = readJson('evidence.json');
evidence.form_replay = {
  generated: true,
  source_html: path.relative(bundleDir, options.sourceHtml),
  page_contract: path.relative(bundleDir, options.pageContract),
  endpoint,
  method,
  hidden_fields: hiddenFields,
  cleared_fields: clearFields,
  transform: {
    name: transformName,
    charcode_shift: rotatingShift ? null : fixedShift,
    rotating_shift: rotatingShift,
    replay_parameter: rotatingShift ? 'lily' : null,
  },
};
evidence.notes = Array.isArray(evidence.notes) ? evidence.notes : [];
if (!evidence.notes.includes('Form-driven replay scaffold has been generated from inline obfuscation logic.')) {
  evidence.notes.push('Form-driven replay scaffold has been generated from inline obfuscation logic.');
}
writeJson('evidence.json', evidence);

const claimSet = readJson('claim-set.json', { claims: [] });
if (!Array.isArray(claimSet.claims)) claimSet.claims = [];
if (!claimSet.claims.some((item) => item.id === 'form-obfuscation-replay-generated')) {
  claimSet.claims.push({
    id: 'form-obfuscation-replay-generated',
    status: 'verified',
    strength: 'high',
    statement: `Replay scaffold generated for form-driven obfuscation target ${method} ${endpoint}.`,
    evidence_sources: ['form-replay.py', 'form-replay-notes.md'],
  });
}
writeJson('claim-set.json', claimSet);

const artifactIndex = readJson('artifact-index.json', {
  output_dir: bundleDir,
  root_files: [],
  groups: { original: [], derived: [], evidence: [] },
});
if (!artifactIndex.groups) artifactIndex.groups = { original: [], derived: [], evidence: [] };
if (!Array.isArray(artifactIndex.groups.derived)) artifactIndex.groups.derived = [];
for (const name of ['form-replay.py', 'form-replay-notes.md']) {
  const full = path.join(bundleDir, name);
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
  bundle_dir: bundleDir,
  endpoint,
  method,
  hidden_fields: hiddenFields,
  cleared_fields: clearFields,
  transform: {
    name: transformName,
    charcode_shift: rotatingShift ? null : fixedShift,
    rotating_shift: rotatingShift,
  },
  replay_file: path.join(bundleDir, 'form-replay.py'),
}, null, 2));
