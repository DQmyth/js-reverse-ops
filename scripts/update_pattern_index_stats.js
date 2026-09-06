#!/usr/bin/env node
// Record pattern outcome telemetry into assets/pattern-outcome-stats.json.
// Keeps case-pattern-index.json schema untouched (it is a benchmark asset);
// stats live beside it so routing and docs can weight patterns by evidence.
//
// Usage:
//   node scripts/update_pattern_index_stats.js --record env_gated_crypto_differential solved
//   node scripts/update_pattern_index_stats.js --record jsdom_native_vm_differential failed --note "jsdom class leak, topic 24"
//   node scripts/update_pattern_index_stats.js --show
//
// Data safety: record pattern ids and outcomes only; never put targets,
// credentials, or site names into notes.

const fs = require('fs');
const path = require('path');

const statsPath = path.join(__dirname, '..', 'assets', 'pattern-outcome-stats.json');

function load() {
  if (fs.existsSync(statsPath)) return JSON.parse(fs.readFileSync(statsPath, 'utf8'));
  return { schema: 'js-reverse-ops-pattern-outcome-stats-v1', updated_at: null, stats: {} };
}

function save(d) {
  d.updated_at = new Date().toISOString();
  fs.writeFileSync(statsPath, JSON.stringify(d, null, 2) + '\n');
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--show')) {
    console.log(JSON.stringify(load(), null, 2));
    return;
  }
  const i = argv.indexOf('--record');
  if (i < 0 || !argv[i + 1]) { console.error('usage: update_pattern_index_stats.js --record <pattern-id> <solved|failed|partial> [--note "..."] | --show'); process.exit(2); }
  const id = argv[i + 1];
  const outcome = (argv[i + 2] || '').toLowerCase();
  if (!['solved', 'failed', 'partial'].includes(outcome)) { console.error('outcome must be solved|failed|partial'); process.exit(2); }
  const noteIdx = argv.indexOf('--note');
  const note = noteIdx >= 0 ? argv[noteIdx + 1] : undefined;

  const d = load();
  const s = d.stats[id] || { applied: 0, solved: 0, failed: 0, partial: 0, last_outcome: null, last_verified: null, notes: [] };
  s.applied += 1;
  s[outcome] = (s[outcome] || 0) + 1;
  s.last_outcome = outcome;
  s.last_verified = d.updated_at || new Date().toISOString();
  if (note) s.notes = [...(s.notes || []).slice(-4), note];
  d.stats[id] = s;
  save(d);
  console.log(`recorded: ${id} ${outcome} (applied=${s.applied}, solved=${s.solved})`);
}

main();
