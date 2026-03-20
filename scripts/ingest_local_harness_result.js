#!/usr/bin/env node
const childProcess = require('child_process');
const path = require('path');

function usage() {
  console.error('Usage: ingest_local_harness_result.js --bundle-dir <dir> --result-json <file>');
  process.exit(1);
}

const args = process.argv.slice(2);
if (!args.length) usage();

const options = {
  bundleDir: '',
  resultJson: '',
};

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  const next = args[i + 1] || '';
  if (arg === '--bundle-dir') {
    options.bundleDir = path.resolve(next);
    i += 1;
  } else if (arg === '--result-json') {
    options.resultJson = path.resolve(next);
    i += 1;
  } else {
    usage();
  }
}

if (!options.bundleDir || !options.resultJson) usage();

const ingestScript = path.resolve(__dirname, 'ingest_external_challenge_success.js');
const result = childProcess.spawnSync(
  process.execPath,
  [ingestScript, '--bundle-dir', options.bundleDir, '--success-json', options.resultJson],
  { encoding: 'utf8' }
);

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || 'ingest_local_harness_result failed\n');
  process.exit(result.status || 1);
}

process.stdout.write(result.stdout || '');
