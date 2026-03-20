#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function usage() {
  console.error('Usage: benchmark_reverse_skill.js <bundles-root> [--output <benchmark-summary.json>]');
  process.exit(1);
}

const args = process.argv.slice(2);
if (!args.length) usage();
const bundlesRoot = path.resolve(args[0]);
let outputPath = '';
for (let i = 1; i < args.length; i += 1) {
  if (args[i] === '--output') outputPath = args[++i] || '';
  else usage();
}

function parseCaseDir(name) {
  const match = /^(topic|match)(\d+)$/.exec(name);
  if (!match) return null;
  return { dirName: name, caseKind: match[1], caseId: match[2] };
}

const caseDirs = fs.existsSync(bundlesRoot)
  ? fs.readdirSync(bundlesRoot)
    .map(parseCaseDir)
    .filter(Boolean)
    .sort((a, b) => Number(a.caseId) - Number(b.caseId) || a.caseKind.localeCompare(b.caseKind))
  : [];

const topics = [];
for (const entry of caseDirs) {
  const dir = path.join(bundlesRoot, entry.dirName);
  const evidencePath = path.join(dir, 'evidence.json');
  const claimsPath = path.join(dir, 'claim-set.json');
  const riskPath = path.join(dir, 'risk-summary.json');
  if (!fs.existsSync(evidencePath)) continue;
  const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  const claims = fs.existsSync(claimsPath) ? JSON.parse(fs.readFileSync(claimsPath, 'utf8')) : { summary: {} };
  const risks = fs.existsSync(riskPath) ? JSON.parse(fs.readFileSync(riskPath, 'utf8')) : { summary: {} };
  const request = ((evidence.runtime_evidence || {}).request) || {};
  const familyDecision = ((evidence.static_evidence || {}).family_decision) || {};
  const runtimeEvidence = evidence.runtime_evidence || {};
  const caseKind = runtimeEvidence.case_kind || entry.caseKind;
  const caseId = String(runtimeEvidence.case_id || runtimeEvidence.topic || entry.caseId);
  topics.push({
    case_kind: caseKind,
    case_id: caseId,
    topic: caseId,
    runtime_family: runtimeEvidence.family_runtime || null,
    accepted: Number(request.status || 0) === 200,
    protected_endpoint_known: Boolean(request.url),
    field_count: (request.fields || []).length,
    verified_claims: claims.summary.verified || 0,
    inferred_claims: claims.summary.inferred || 0,
    weak_claims: claims.summary.weak || 0,
    high_risks: risks.summary.high || 0,
    medium_risks: risks.summary.medium || 0,
    low_risks: risks.summary.low || 0,
    detected_risks: familyDecision.detected_risks || [],
  });
}

const result = {
  bundles_root: bundlesRoot,
  generated_at: new Date().toISOString(),
  summary: {
    case_count: topics.length,
    topic_count: topics.length,
    accepted_count: topics.filter((item) => item.accepted).length,
    acceptance_rate: topics.length ? Number((topics.filter((item) => item.accepted).length / topics.length).toFixed(3)) : 0,
    endpoint_recovery_rate: topics.length ? Number((topics.filter((item) => item.protected_endpoint_known).length / topics.length).toFixed(3)) : 0,
    verified_claim_total: topics.reduce((sum, item) => sum + item.verified_claims, 0),
    inferred_claim_total: topics.reduce((sum, item) => sum + item.inferred_claims, 0),
    weak_claim_total: topics.reduce((sum, item) => sum + item.weak_claims, 0),
    helper_endpoint_risk_count: topics.filter((item) => item.detected_risks.includes('helper-endpoint-risk')).length,
    launcher_handoff_count: topics.filter((item) => item.detected_risks.includes('launcher-page-handoff')).length,
    runtime_first_required_count: topics.filter((item) => item.detected_risks.includes('runtime-first-required')).length,
  },
  topics,
};

const json = JSON.stringify(result, null, 2);
if (outputPath) fs.writeFileSync(outputPath, `${json}\n`, 'utf8');
console.log(json);
