#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const profilesPath = path.join(rootDir, 'assets/anti-detection-profiles.json');

function usage() {
  console.error('Usage: select_anti_detection_profile.js --symptoms <text> [--json]');
  process.exit(1);
}

const args = process.argv.slice(2);
const options = { symptoms: '', json: false };
for (let index = 0; index < args.length; index += 1) {
  const item = args[index];
  if (item === '--symptoms') {
    options.symptoms = args[index + 1] || '';
    index += 1;
  } else if (item === '--json') {
    options.json = true;
  } else {
    usage();
  }
}
if (!options.symptoms) usage();

const db = JSON.parse(fs.readFileSync(profilesPath, 'utf8'));
const profiles = db.profiles || [];

const SIGNALS = [
  {
    profile: 'preload-survival',
    keywords: ['one-shot', 'bootstrap', 'first load', 'reload', 'disappear', 'before page scripts', 'preload'],
    reason: 'Bootstrap or first-load behavior should be captured before target scripts execute.',
  },
  {
    profile: 'stealth-runtime',
    keywords: ['tostring', 'tamper', 'monkeypatch', 'hook detected', 'devtools', 'debugger', 'integrity', 'console', 'misdirection'],
    reason: 'Runtime integrity or hook-detection symptoms require narrower stealth-oriented capture.',
  },
  {
    profile: 'fingerprint-parity',
    keywords: ['navigator', 'webdriver', 'headless', 'canvas', 'webgl', 'permissions', 'languages', 'accept-language', 'user-agent', 'client hints', 'tls', 'ja3', 'http2'],
    reason: 'Browser or transport fingerprint symptoms require parity capture before changing signer code.',
  },
  {
    profile: 'stateful-storage',
    keywords: ['localstorage', 'sessionstorage', 'indexeddb', 'storage', 'cookie', 'bootstrap state', 'seed', 'write order', 'first party state'],
    reason: 'Stateful storage or cookie symptoms require preserving acquisition and write order before replay.',
  },
  {
    profile: 'baseline-observe',
    keywords: ['network', 'unknown', 'initial', 'baseline', 'observe'],
    reason: 'No hostile runtime signal requires escalation yet.',
  },
];

function scoreSignal(signal, text) {
  const hits = signal.keywords.filter((keyword) => text.includes(keyword));
  return { ...signal, hits, score: hits.length };
}

function selectProfile(symptoms) {
  const text = symptoms.toLowerCase();
  const ranked = SIGNALS.map((signal) => scoreSignal(signal, text)).sort((a, b) => b.score - a.score);
  const best = ranked[0] && ranked[0].score > 0 ? ranked[0] : SIGNALS.find((item) => item.profile === 'baseline-observe');
  const profile = profiles.find((item) => item.id === best.profile) || profiles[0];
  return {
    schema: 'js-reverse-ops-anti-detection-profile-selection-v1',
    generated_at: new Date().toISOString(),
    symptoms,
    selected_profile: profile,
    matched_signals: ranked.filter((item) => item.score > 0).map((item) => ({
      profile: item.profile,
      hits: item.hits,
      reason: item.reason,
    })),
    decision: {
      status: 'profile-selected',
      reason: best.reason,
      next_verification: 'Capture runtime evidence under the selected profile, then validate request parity or replay acceptance separately.',
      promotion_boundary: 'Anti-detection profile selection only changes observation strategy. It does not prove signer correctness, server acceptance, or replay parity.',
    },
  };
}

function renderMarkdown(result) {
  const lines = [];
  lines.push('# Anti-Detection Profile Selection');
  lines.push('');
  lines.push(`- Selected profile: \`${result.selected_profile.id}\``);
  lines.push(`- Label: ${result.selected_profile.label}`);
  lines.push(`- Reason: ${result.decision.reason}`);
  lines.push(`- Patch classes: ${(result.selected_profile.patch_classes || []).join(', ') || 'none'}`);
  lines.push('');
  lines.push('## Promotion Boundary');
  lines.push('');
  lines.push(result.decision.promotion_boundary);
  lines.push('');
  return lines.join('\n');
}

const result = selectProfile(options.symptoms);
process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : renderMarkdown(result));
