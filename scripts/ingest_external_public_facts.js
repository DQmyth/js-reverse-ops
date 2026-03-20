#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function usage() {
  console.error('Usage: ingest_external_public_facts.js --bundle-dir <dir> --facts-json <file>');
  process.exit(1);
}

const args = process.argv.slice(2);
if (!args.length) usage();

let bundleDir = '';
let factsJson = '';
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  const next = args[i + 1] || '';
  if (arg === '--bundle-dir') {
    bundleDir = path.resolve(next);
    i += 1;
  } else if (arg === '--facts-json') {
    factsJson = path.resolve(next);
    i += 1;
  } else {
    usage();
  }
}

if (!bundleDir || !factsJson) usage();
if (!fs.existsSync(bundleDir)) {
  console.error(`Bundle directory not found: ${bundleDir}`);
  process.exit(1);
}
if (!fs.existsSync(factsJson)) {
  console.error(`Facts JSON not found: ${factsJson}`);
  process.exit(1);
}

function readJson(filePath, fallback = {}) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function appendUniqueString(list, value) {
  if (!list.includes(value)) list.push(value);
}

const evidencePath = path.join(bundleDir, 'evidence.json');
const artifactIndexPath = path.join(bundleDir, 'artifact-index.json');
const facts = readJson(factsJson, {});
const evidence = readJson(evidencePath, {});
evidence.public_writeup_facts = {
  artifact: path.relative(bundleDir, factsJson),
  sample_id: facts.sample_id || null,
  source: facts.source || null,
  critical_paths: ((facts.facts || {}).critical_paths) || [],
  stack: ((facts.facts || {}).stack) || [],
  public_signals: ((facts.facts || {}).public_signals) || {},
};
evidence.notes = Array.isArray(evidence.notes) ? evidence.notes : [];
appendUniqueString(evidence.notes, 'Public writeup facts have been preserved as first-class archival evidence.');
writeJson(evidencePath, evidence);

const artifactIndex = readJson(artifactIndexPath, {
  output_dir: bundleDir,
  root_files: [],
  groups: { original: [], derived: [], evidence: [] },
});
if (!artifactIndex.groups) artifactIndex.groups = { original: [], derived: [], evidence: [] };
if (!Array.isArray(artifactIndex.groups.evidence)) artifactIndex.groups.evidence = [];
if (!artifactIndex.groups.evidence.some((entry) => entry.destination === factsJson)) {
  artifactIndex.groups.evidence.push({
    status: 'linked',
    source: factsJson,
    destination: factsJson,
  });
}
writeJson(artifactIndexPath, artifactIndex);

console.log(JSON.stringify({
  bundle_dir: bundleDir,
  facts_json: factsJson,
  artifact: path.relative(bundleDir, factsJson),
}, null, 2));
