#!/usr/bin/env node

const { spawnSync } = require('child_process');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

const steps = [
  'scripts/generate_public_router_docs.js',
  'scripts/generate_scripts_catalog.js',
  'scripts/export_public_skill.js',
];

for (const step of steps) {
  const result = spawnSync('node', [path.join(rootDir, step)], {
    cwd: path.resolve(rootDir, '..', '..'),
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}
