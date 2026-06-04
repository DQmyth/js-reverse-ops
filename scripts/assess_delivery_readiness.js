#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const modelPath = path.join(rootDir, 'assets/delivery-readiness-model.json');

function usage() {
  console.error('Usage: assess_delivery_readiness.js <run-dir> [--json]');
  process.exit(1);
}

const args = process.argv.slice(2);
const options = { dir: '', json: false };
for (const arg of args) {
  if (arg === '--json') options.json = true;
  else if (!options.dir) options.dir = path.resolve(arg);
  else usage();
}
if (!options.dir) usage();

function readJsonIfExists(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function hasFile(dir, file) {
  return fs.existsSync(path.join(dir, file));
}

function collectRiskBlockers(riskSummary, model) {
  const blockingIds = new Set(model.blocking_risk_ids || []);
  const risks = Array.isArray(riskSummary?.risks) ? riskSummary.risks : [];
  return risks.filter((risk) => risk.severity === 'high' || blockingIds.has(risk.id));
}

function verifiedRuntimeOrReplayClaims(claimSet) {
  const claims = Array.isArray(claimSet?.claims) ? claimSet.claims : [];
  return claims.filter((claim) => {
    if (claim.strength !== 'verified') return false;
    const sources = Array.isArray(claim.evidence_sources) ? claim.evidence_sources : [];
    return sources.some((source) => ['network', 'hook', 'server_acceptance', 'replay', 'challenge-success'].includes(source));
  });
}

function assess(dir) {
  const model = readJsonIfExists(modelPath) || {};
  const evidence = readJsonIfExists(path.join(dir, 'evidence.json'));
  const replayStatus = readJsonIfExists(path.join(dir, 'replay-status.json'));
  const claimSet = readJsonIfExists(path.join(dir, 'claim-set.json'));
  const riskSummary = readJsonIfExists(path.join(dir, 'risk-summary.json'));
  const errors = [];
  const blockers = [];
  const warnings = [];

  if (!evidence) errors.push('missing evidence.json');
  if (!replayStatus) errors.push('missing replay-status.json');
  if (!claimSet) errors.push('missing claim-set.json');
  if (!riskSummary) errors.push('missing risk-summary.json');

  const runtimeStatus = evidence?.runtime_evidence?.status || null;
  const acceptedReplay = replayStatus?.acceptance_status === 'accepted' && replayStatus?.status === 'verified';
  const rejectedReplay = replayStatus?.acceptance_status === 'rejected' || evidence?.replay_evidence?.acceptance_status === 'rejected';
  const divergenceCount = Number(replayStatus?.divergence_count || evidence?.replay_evidence?.divergence_count || 0);
  const acceptedSamples = Number(replayStatus?.accepted_sample_count || evidence?.replay_evidence?.accepted_sample_count || 0);
  const verifiedClaims = verifiedRuntimeOrReplayClaims(claimSet);
  const riskBlockers = collectRiskBlockers(riskSummary, model);
  const deliveryFiles = [
    'evidence.json',
    'claim-set.json',
    'risk-summary.json',
    'provenance-graph.json',
    'replay-status.json',
  ];
  const missingDeliveryFiles = deliveryFiles.filter((file) => !hasFile(dir, file));

  if (runtimeStatus !== 'runtime-accepted') blockers.push(`runtime status is ${runtimeStatus || 'unknown'}, not runtime-accepted`);
  if (!acceptedReplay) blockers.push(`replay is ${replayStatus?.status || 'unknown'}/${replayStatus?.acceptance_status || 'unknown'}, not verified/accepted`);
  if (rejectedReplay) blockers.push('replay is rejected');
  if (divergenceCount !== 0) blockers.push(`replay divergence_count is ${divergenceCount}`);
  if (acceptedSamples <= 0) blockers.push('accepted replay requires accepted_sample_count > 0');
  if (!verifiedClaims.length) blockers.push('no verified runtime or replay claim');
  for (const risk of riskBlockers) blockers.push(`risk blocker ${risk.id}: ${risk.reason || risk.category || 'unresolved'}`);
  for (const file of missingDeliveryFiles) blockers.push(`missing delivery artifact ${file}`);

  let readiness = 'not-ready';
  if (!errors.length && (evidence?.hook_evidence?.matched_observation_count || 0) > 0) readiness = 'evidence-only';
  if (!errors.length && acceptedReplay && divergenceCount === 0 && acceptedSamples > 0 && verifiedClaims.length) readiness = 'replay-ready';
  if (readiness === 'replay-ready' && runtimeStatus === 'runtime-accepted' && riskBlockers.length === 0 && missingDeliveryFiles.length === 0) {
    readiness = 'delivery-ready';
  }
  if (readiness === 'delivery-ready' && blockers.length) {
    warnings.push('delivery-ready downgraded because blockers were detected');
    readiness = 'replay-ready';
  }

  return {
    schema: 'js-reverse-ops-delivery-readiness-assessment-v1',
    model_schema: model.schema || null,
    dir,
    ok: errors.length === 0,
    readiness,
    errors,
    blockers,
    warnings,
    summary: {
      runtime_status: runtimeStatus,
      replay_status: replayStatus ? `${replayStatus.status || 'unknown'}/${replayStatus.acceptance_status || 'unknown'}` : null,
      accepted_sample_count: acceptedSamples,
      divergence_count: divergenceCount,
      verified_runtime_or_replay_claims: verifiedClaims.length,
      risk_blockers: riskBlockers.map((risk) => risk.id),
    },
  };
}

function renderText(result) {
  const lines = [];
  lines.push(`delivery readiness: ${result.readiness}`);
  lines.push(`runtime: ${result.summary.runtime_status || 'unknown'}`);
  lines.push(`replay: ${result.summary.replay_status || 'unknown'}`);
  for (const blocker of result.blockers) lines.push(`BLOCKER ${blocker}`);
  for (const warning of result.warnings) lines.push(`WARN ${warning}`);
  for (const error of result.errors) lines.push(`ERROR ${error}`);
  return `${lines.join('\n')}\n`;
}

const result = assess(options.dir);
process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : renderText(result));
if (!result.ok) process.exit(1);
