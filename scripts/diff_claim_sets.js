#!/usr/bin/env node
const fs = require('fs');

function usage() {
  console.error('Usage: diff_claim_sets.js <old-claim-set.json> <new-claim-set.json> [--output <claim-diff.json>]');
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.length < 2) usage();
const oldPath = args[0];
const newPath = args[1];
let outputPath = '';
for (let i = 2; i < args.length; i += 1) {
  if (args[i] === '--output') outputPath = args[++i] || '';
  else usage();
}

const oldClaims = JSON.parse(fs.readFileSync(oldPath, 'utf8')).claims || [];
const newClaims = JSON.parse(fs.readFileSync(newPath, 'utf8')).claims || [];
const oldMap = new Map(oldClaims.map((item) => [item.claim_id, item]));
const newMap = new Map(newClaims.map((item) => [item.claim_id, item]));

const added = [];
const removed = [];
const changed = [];

for (const [id, claim] of newMap.entries()) {
  if (!oldMap.has(id)) added.push(claim);
  else {
    const before = oldMap.get(id);
    if (before.strength !== claim.strength || before.statement !== claim.statement) {
      changed.push({
        claim_id: id,
        before: { statement: before.statement, strength: before.strength },
        after: { statement: claim.statement, strength: claim.strength },
      });
    }
  }
}

for (const [id, claim] of oldMap.entries()) {
  if (!newMap.has(id)) removed.push(claim);
}

const result = {
  old: oldPath,
  newer: newPath,
  summary: {
    added: added.length,
    removed: removed.length,
    changed: changed.length,
  },
  added,
  removed,
  changed,
};

const json = JSON.stringify(result, null, 2);
if (outputPath) fs.writeFileSync(outputPath, `${json}\n`, 'utf8');
console.log(json);
