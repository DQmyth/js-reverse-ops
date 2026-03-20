#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function usage() {
  console.error('Usage: init_bundle_worklog.js --bundle-dir <dir> [--profile <profile-id>]');
  process.exit(1);
}

const args = process.argv.slice(2);
if (!args.length) usage();

const options = {
  bundleDir: '',
  profile: 'baseline-observe',
};

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  const next = args[i + 1] || '';
  if (arg === '--bundle-dir') {
    options.bundleDir = path.resolve(next);
    i += 1;
  } else if (arg === '--profile') {
    options.profile = next;
    i += 1;
  } else {
    usage();
  }
}
if (!options.bundleDir) usage();

const bundleDir = options.bundleDir;
const profileDb = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '..', 'assets', 'anti-detection-profiles.json'), 'utf8')
);
const profile = (profileDb.profiles || []).find((item) => item.id === options.profile) || profileDb.profiles[0];

function writeIfMissing(name, content) {
  const file = path.join(bundleDir, name);
  if (!fs.existsSync(file)) fs.writeFileSync(file, `${content}\n`, 'utf8');
  return file;
}

const nextMd = [
  '# NEXT',
  '',
  '## Immediate Actions',
  '',
  '- capture or replace the highest-value missing evidence',
  '- compare latest bundle maturity against the target stage',
  '- preserve new artifacts before changing the replay or runtime strategy',
].join('\n');

const worklogMd = [
  '# WORKLOG',
  '',
  '## Entries',
  '',
  `- initialized worklog with anti-detection profile \`${profile.id}\``,
].join('\n');

const deadEndsMd = [
  '# Dead Ends',
  '',
  'Record paths that looked promising but failed, so future sessions do not repeat them blindly.',
].join('\n');

const antiProfileMd = [
  '# Anti-Detection Profile',
  '',
  `- id: ${profile.id}`,
  `- label: ${profile.label}`,
  `- use_when: ${profile.use_when}`,
  `- patch_classes: ${(profile.patch_classes || []).join(', ') || 'none'}`,
  '',
  '## Session Notes',
  '',
  '- record hostile signals here before patching',
  '- record the smallest successful bypass here',
].join('\n');

const outputs = {
  next: writeIfMissing('NEXT.md', nextMd),
  worklog: writeIfMissing('WORKLOG.md', worklogMd),
  dead_ends: writeIfMissing('dead-ends.md', deadEndsMd),
  anti_detection_profile: writeIfMissing('anti-detection-profile.md', antiProfileMd),
};

console.log(JSON.stringify({ bundle_dir: bundleDir, profile: profile.id, outputs }, null, 2));
