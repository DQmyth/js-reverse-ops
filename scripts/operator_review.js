#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function usage() {
  console.error('Usage: operator_review.js <task-dir> [--output <operator-review.md>]');
  process.exit(1);
}

const args = process.argv.slice(2);
if (!args.length) usage();
const taskDir = path.resolve(args[0]);
let outputPath = '';
for (let i = 1; i < args.length; i += 1) {
  if (args[i] === '--output') outputPath = args[++i] || '';
  else usage();
}

function readJsonIf(name) {
  const file = path.join(taskDir, name);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

const task = readJsonIf('task.json') || {};
const evidence = readJsonIf('evidence.json') || {};
const claims = readJsonIf('claim-set.json') || { claims: [] };
const risks = readJsonIf('risk-summary.json') || { risks: [] };
const maturity = readJsonIf('maturity-summary.json') || {};
const mcpExecution = evidence.mcp_execution || null;

const claimList = Array.isArray(claims.claims) ? claims.claims : [];
const riskList = Array.isArray(risks.items) ? risks.items : Array.isArray(risks.risks) ? risks.risks : [];
const severityOrder = { high: 3, medium: 2, low: 1 };
const unknowns = evidence.unknowns || [];
const evidenceGrade = maturity.evidence_grade || 'unknown';
const maturityLevel = maturity.maturity || evidence.status || 'unknown';
const maturityRecommendation = maturity.recommendation || '';
const capabilityDimensions = maturity.capability_dimensions || {};
const mcpPolicy = (mcpExecution && mcpExecution.policy_summary) || { status: 'none', reason: '' };
const hasStrongProof =
  evidenceGrade === 'verified-live' ||
  evidenceGrade === 'verified-archival' ||
  evidenceGrade === 'verified-local' ||
  maturityLevel === 'runtime-accepted' ||
  maturityLevel === 'replay-verified';
const suppressedClaimIds = new Set(
  hasStrongProof
    ? [
        'external-bundle-not-yet-verified',
        'runtime-evidence-missing',
      ]
    : []
);
const topVerified = claimList
  .filter((item) => !suppressedClaimIds.has(String(item.id || '')))
  .filter((item) => item.status === 'verified' || item.strength === 'verified' || item.strength === 'high')
  .slice(0, 5);
const topRisks = [...riskList]
  .sort((a, b) => (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0))
  .slice(0, 5);

function nextBestAction() {
  if (mcpExecution && mcpExecution.run_status === 'not-started' && mcpPolicy.status === 'action-suppressed-by-capability-focus') {
    return mcpExecution.action_generation_summary || mcpPolicy.reason || 'Treat suppressed MCP execution as an intentional policy decision, not a missing workflow step.';
  }
  if (evidenceGrade === 'verified-live') {
    return maturityRecommendation || 'Track drift, keep parity fixtures current, and use this bundle as a regression anchor.';
  }
  if (evidenceGrade === 'verified-archival') {
    if (capabilityDimensions.solver_backed) {
      return 'Keep archival solver-backed challenge-success separate from live parity, and only promote further if surviving assets or accepted remote behavior are found.';
    }
    return 'Keep archival challenge-success separate from live parity, and only promote further if surviving assets or accepted remote behavior are found.';
  }
  if (evidenceGrade === 'verified-local') {
    return 'Replace local-only proof with surviving live parity or accepted remote behavior before promoting this bundle further.';
  }
  if (capabilityDimensions.hook_backed) {
    return 'Use the existing hook-backed runtime truth to target one deeper accepted path, then promote from observation-heavy capture to accepted or replay-backed evidence.';
  }
  if (capabilityDimensions.pcap_backed) {
    return 'Preserve the pcap-backed request parity as a regression fixture and verify whether the capture still matches current remote behavior after drift.';
  }
  if (capabilityDimensions.solver_backed) {
    return 'Turn the solver-backed route into stronger claim and provenance coverage, and only pursue live parity if surviving public assets actually exist.';
  }
  if (capabilityDimensions.archival_backed && maturityRecommendation) {
    return maturityRecommendation;
  }
  if (topRisks[0]) {
    return topRisks[0].next_action || topRisks[0].mitigation || maturityRecommendation || 'proceed to replay or provenance tightening';
  }
  return maturityRecommendation || 'proceed to replay or provenance tightening';
}

const lines = [
  '# Operator Review',
  '',
  `- task: ${task.title || path.basename(taskDir)}`,
  `- target: ${task.target_url || 'unknown'}`,
  `- method: ${task.method || 'unknown'}`,
  `- maturity: ${maturityLevel}`,
  `- evidence_grade: ${evidenceGrade}`,
  `- capability_dimensions: solver=${Boolean(capabilityDimensions.solver_backed)}, hook=${Boolean(capabilityDimensions.hook_backed)}, pcap=${Boolean(capabilityDimensions.pcap_backed)}, archival=${Boolean(capabilityDimensions.archival_backed)}`,
  `- mcp_execution: ${mcpExecution ? `${mcpExecution.run_status} (${mcpExecution.completed_steps || 0}/${mcpExecution.step_count || 0})` : 'none'}`,
  `- mcp_policy: ${mcpExecution ? `${mcpPolicy.status || 'none'}${mcpPolicy.reason ? ` - ${mcpPolicy.reason}` : ''}` : 'none'}`,
  '',
  '## Top Verified Claims',
  '',
  ...(topVerified.length ? topVerified.map((item) => `- ${item.statement}`) : ['- none']),
  '',
  '## Top Risks',
  '',
  ...(topRisks.length ? topRisks.map((item) => `- [${item.severity}] ${item.reason || item.summary || 'unknown risk'}`) : ['- none']),
  '',
  '## Unknowns',
  '',
  ...(unknowns.length ? unknowns.map((item) => `- ${item}`) : ['- none']),
  '',
  '## Next Best Action',
  '',
  `- ${nextBestAction()}`,
  '',
].join('\n');

if (outputPath) fs.writeFileSync(outputPath, `${lines}\n`, 'utf8');
console.log(lines);
