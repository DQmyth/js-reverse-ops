#!/usr/bin/env node
// Close the learning loop: after solving/failing a real target, turn the
// observed symptom into a draft benchmark case + optional telemetry record.
// Drafts are written to a REVIEW file — never auto-committed into assets.
//
// Usage:
//   node scripts/harvest_pattern_case.js --symptom "<text>" --pattern <pattern-id> \
//        [--outcome solved|failed|partial] [--note "..."] [--drafts <file>]
const fs = require('fs');
const path = require('path');
const argv = process.argv.slice(2);
const argOf = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };

const symptom = argOf('--symptom');
const pattern = argOf('--pattern');
if (!symptom || !pattern) { console.error('usage: harvest_pattern_case.js --symptom "<text>" --pattern <id> [--outcome solved] [--note "..."]'); process.exit(2); }
const outcome = argOf('--outcome');
const note = argOf('--note');
const draftsFile = argOf('--drafts') || path.join(process.cwd(), 'pattern-case-drafts.jsonl');

// 1. telemetry record (optional)
if (outcome) {
  try {
    const { execFileSync } = require('child_process');
    execFileSync('node', [path.join(__dirname, 'update_pattern_index_stats.js'), '--record', pattern, outcome, ...(note ? ['--note', note] : [])], { stdio: 'pipe' });
    console.error(`telemetry recorded: ${pattern} ${outcome}`);
  } catch (e) { console.error('telemetry skipped:', e.message); }
}

// 2. benchmark case draft (sanitization is the reviewer's job — reminder emitted)
const id = 'harvested_' + pattern + '_' + Date.now().toString(36);
const draft = {
  id, type: 'pattern', text: symptom.toLowerCase(),
  expect: { top_pattern: pattern, min_score: 0.05 },
  _review: {
    status: 'draft',
    checklist: [
      'lowercased, no site names / credentials / URLs',
      'symptom is the DECOY text an operator would actually type',
      'min_score sane for the pattern signal count',
    ],
  },
};
fs.appendFileSync(draftsFile, JSON.stringify(draft) + '\n');
console.log(JSON.stringify({ drafted: id, draftsFile, review_required: true }, null, 1));
