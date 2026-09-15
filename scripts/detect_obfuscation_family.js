#!/usr/bin/env node
// Match a target's source against assets/obfuscation-family-signatures.json.
// Lexical evidence for routing; runtime confirmation still required.
// Usage: node scripts/detect_obfuscation_family.js <file> [--json]
const fs = require('fs');
const path = require('path');
const file = process.argv[2];
if (!file) { console.error('usage: detect_obfuscation_family.js <file> [--json]'); process.exit(2); }
const src = fs.readFileSync(file, 'utf8');
const lib = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'assets', 'obfuscation-family-signatures.json'), 'utf8'));
const hits = [];
for (const fam of lib.families) {
  let score = 0, matched = [];
  for (const m of fam.markers || []) if (src.includes(m)) { score += 2; matched.push(m); }
  for (const r of fam.markers_regex || []) { try { if (new RegExp(r).test(src)) { score += 1; matched.push('/' + r + '/'); } } catch (e) {} }
  if (score > 0) hits.push({ id: fam.id, label: fam.label, score, matched: matched.slice(0, 5), capability_hint: fam.capability_hint });
}
hits.sort((a, b) => b.score - a.score);
if (process.argv.includes('--json')) console.log(JSON.stringify({ file, families: hits }, null, 2));
else if (!hits.length) console.log('no family signatures matched');
else for (const h of hits) console.log(`${h.id} (score ${h.score}) → ${h.capability_hint}\n   matched: ${h.matched.join(' | ')}`);
