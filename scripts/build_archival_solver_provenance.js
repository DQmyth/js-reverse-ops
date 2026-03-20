#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function usage() {
  console.error('Usage: build_archival_solver_provenance.js <evidence.json> [--output-json <solver-provenance-report.json>] [--output-md <solver-provenance-report.md>]');
  process.exit(1);
}

const args = process.argv.slice(2);
if (!args.length) usage();

const inputPath = path.resolve(args[0]);
let outputJson = '';
let outputMd = '';
for (let i = 1; i < args.length; i += 1) {
  if (args[i] === '--output-json') outputJson = path.resolve(args[++i] || '');
  else if (args[i] === '--output-md') outputMd = path.resolve(args[++i] || '');
  else usage();
}

const evidence = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const challengeSuccess = evidence.challenge_success || {};
const challenge = challengeSuccess.challenge || {};
const challengeEvidence = challengeSuccess.evidence || {};

const chain = [];
if (challengeEvidence.writeup_facts) {
  chain.push({
    step: chain.length + 1,
    type: 'public-writeup-facts',
    artifact: challengeEvidence.writeup_facts,
    role: 'records original challenge facts, hints, and recovered solver direction',
  });
}
if (challengeEvidence.symbol_map) {
  chain.push({
    step: chain.length + 1,
    type: 'symbol-map',
    artifact: challengeEvidence.symbol_map,
    role: 'turns writeup observations into a reusable symbol domain or seeded board model',
  });
}
if (challengeEvidence.solver) {
  chain.push({
    step: chain.length + 1,
    type: 'solver',
    artifact: challengeEvidence.solver,
    role: 'encodes the archival challenge constraints into a local solver path',
  });
}
chain.push({
  step: chain.length + 1,
  type: 'challenge-success',
  artifact: 'artifacts/evidence/challenge-success',
  role: 'records the solved output and challenge-success artifact set',
});

const result = {
  source: inputPath,
  generated_at: new Date().toISOString(),
  status: evidence.status || 'unknown',
  kind: 'archival-solver-provenance',
  challenge: {
    type: challenge.type || 'unknown',
    success_signal: challenge.success_signal || null,
    target_host: challenge.target_host || null,
    password: challenge.password || null,
  },
  chain,
  derived_outputs: {
    solver_result: challengeEvidence.solver_result || null,
    solved_grid: challengeEvidence.grid || [],
    final_flag: challenge.password || null,
  },
  boundary: {
    archival_public: Boolean(challengeSuccess.archival_public),
    local_harness: Boolean(challengeSuccess.local_harness),
    remote_runtime_parity: false,
    remote_request_accepted: false,
    replay_verified: false,
  },
  recommendation: 'Use this chain as the canonical archival challenge-success route until surviving live assets or accepted remote parity are found.',
};

const md = [
  `# Solver Provenance Report: ${path.basename(path.dirname(path.dirname(inputPath))) || 'sample'}`,
  '',
  `- status: \`${result.status}\``,
  `- kind: \`${result.kind}\``,
  '',
  '## Chain',
  '',
  ...result.chain.map((item) => `${item.step}. \`${item.artifact}\`\n   ${item.role}`),
  '',
  '## Result',
  '',
  `- solver result: \`${result.derived_outputs.solver_result || 'unknown'}\``,
  `- final flag: \`${result.derived_outputs.final_flag || 'unknown'}\``,
  '',
  '## Boundary',
  '',
  `- archival public evidence: ${result.boundary.archival_public}`,
  `- live remote parity: ${result.boundary.remote_runtime_parity}`,
  `- accepted request replay: ${result.boundary.remote_request_accepted}`,
  `- replay verified: ${result.boundary.replay_verified}`,
  '',
].join('\n');

if (outputJson) fs.writeFileSync(outputJson, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
if (outputMd) fs.writeFileSync(outputMd, `${md}\n`, 'utf8');
console.log(JSON.stringify(result, null, 2));
