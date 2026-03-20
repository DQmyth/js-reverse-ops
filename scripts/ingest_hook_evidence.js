#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function usage() {
  console.error('Usage: node ingest_hook_evidence.js <evidence.json> <hook-evidence.json> [--output <evidence.json>]');
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.length < 2) usage();

const evidencePath = args[0];
const hookPath = args[1];
let outputPath = '';
for (let i = 2; i < args.length; i += 1) {
  if (args[i] === '--output') outputPath = args[++i] || '';
  else usage();
}

const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
const hookEvidence = JSON.parse(fs.readFileSync(hookPath, 'utf8'));

const observations = hookEvidence.observations || [];
const matched = observations.filter((item) => item.matches_target || (item.cookies || []).length || (item.fields || []).length);
const hookSummary = {
  source: path.resolve(hookPath),
  generated_at: hookEvidence.generated_at || new Date().toISOString(),
  capture_mode: hookEvidence.capture_mode || 'summary',
  preload_used: !!hookEvidence.preload_used,
  presets: hookEvidence.presets || [],
  observation_count: observations.length,
  matched_observation_count: matched.length,
  observations,
};

evidence.hook_evidence = hookSummary;

if (!Array.isArray(evidence.artifacts)) evidence.artifacts = [];
const relHook = path.relative(path.dirname(path.resolve(outputPath || evidencePath)), path.resolve(hookPath));
if (!evidence.artifacts.includes(relHook)) evidence.artifacts.push(relHook);

if (!Array.isArray(evidence.verified_findings)) evidence.verified_findings = [];
if (!Array.isArray(evidence.inferred_findings)) evidence.inferred_findings = [];

if (matched.length) {
  evidence.verified_findings.push(`hook evidence captured ${matched.length} matched observation(s)`);
} else if (observations.length) {
  evidence.inferred_findings.push('hook evidence exists but no observation was marked as target-matching');
}

const json = JSON.stringify(evidence, null, 2);
if (outputPath) fs.writeFileSync(outputPath, `${json}\n`, 'utf8');
console.log(json);
