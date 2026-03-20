#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function usage() {
  console.error('Usage: build_archival_evidence_package.js <bundle-dir> [--output-json <file>] [--output-md <file>]');
  process.exit(1);
}

const args = process.argv.slice(2);
if (!args.length) usage();

const options = {
  bundleDir: '',
  outputJson: '',
  outputMd: '',
};

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  const next = args[i + 1] || '';
  if (!options.bundleDir) {
    options.bundleDir = path.resolve(arg);
  } else if (arg === '--output-json') {
    options.outputJson = path.resolve(next);
    i += 1;
  } else if (arg === '--output-md') {
    options.outputMd = path.resolve(next);
    i += 1;
  } else {
    usage();
  }
}

function readJsonIfExists(filePath, fallback = {}) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : fallback;
}

const bundleDir = options.bundleDir;
const evidence = readJsonIfExists(path.join(bundleDir, 'evidence.json'));
const maturity = readJsonIfExists(path.join(bundleDir, 'maturity-summary.json'));
const claims = readJsonIfExists(path.join(bundleDir, 'claim-set.json'), { claims: [] });
const risks = readJsonIfExists(path.join(bundleDir, 'risk-summary.json'), { items: [] });
const workflowDispatch = readJsonIfExists(path.join(bundleDir, 'workflow-dispatch.json'), null);
const workflowRun = readJsonIfExists(path.join(bundleDir, 'workflow-run.json'), null);

const challengeSuccess = evidence.challenge_success || {};
const publicFacts = evidence.public_writeup_facts || {};
const staticAnalysis = evidence.static_analysis || {};
const capabilityDimensions = maturity.capability_dimensions || {};
const verifiedClaims = (claims.claims || []).filter((item) => item.status === 'verified' || item.strength === 'verified').map((item) => item.id || item.claim_id || item.statement);
const riskItems = Array.isArray(risks.items) ? risks.items : Array.isArray(risks.risks) ? risks.risks : [];

const pkg = {
  generated_at: new Date().toISOString(),
  bundle_dir: bundleDir,
  target: evidence.page_url || null,
  evidence_grade: maturity.evidence_grade || 'inferred',
  maturity: maturity.maturity || evidence.status || 'unknown',
  capability_dimensions: capabilityDimensions,
  workflow_id: workflowDispatch ? workflowDispatch.workflow_id : null,
  workflow_status: workflowRun ? workflowRun.status : null,
  archival_sources: {
    public_writeup_facts: publicFacts.artifact || null,
    source_snapshot_available: Boolean((evidence.source_snapshot || {}).imported_count),
    static_analysis_summary: staticAnalysis.summary || null,
  },
  archival_route: {
    challenge_success: challengeSuccess.executed_at ? {
      local_harness: Boolean(challengeSuccess.local_harness),
      archival_public: Boolean(challengeSuccess.archival_public),
      type: (challengeSuccess.challenge || {}).type || null,
      success_signal: (challengeSuccess.challenge || {}).success_signal || null,
    } : null,
    solver_route_preserved: verifiedClaims.includes('external-solver-route-preserved'),
    top_verified_claims: verifiedClaims.slice(0, 8),
    top_risks: riskItems.slice(0, 5).map((item) => ({
      id: item.id,
      severity: item.severity,
      summary: item.summary || item.reason || '',
    })),
  },
  promotion_boundary:
    challengeSuccess.local_harness
      ? 'local-proof-only'
      : challengeSuccess.archival_public
        ? 'archival-proof-only'
        : 'inferred-only',
};

if (options.outputJson) {
  fs.writeFileSync(options.outputJson, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
}
if (options.outputMd) {
  const lines = [
    '# Archival Evidence Package',
    '',
    `- bundle_dir: ${pkg.bundle_dir}`,
    `- target: ${pkg.target || 'none'}`,
    `- maturity: ${pkg.maturity}`,
    `- evidence_grade: ${pkg.evidence_grade}`,
    `- workflow_id: ${pkg.workflow_id || 'none'}`,
    `- workflow_status: ${pkg.workflow_status || 'none'}`,
    `- promotion_boundary: ${pkg.promotion_boundary}`,
    '',
    '## Capability Dimensions',
    '',
    `- solver_backed: ${Boolean(capabilityDimensions.solver_backed)}`,
    `- hook_backed: ${Boolean(capabilityDimensions.hook_backed)}`,
    `- pcap_backed: ${Boolean(capabilityDimensions.pcap_backed)}`,
    `- archival_backed: ${Boolean(capabilityDimensions.archival_backed)}`,
    '',
    '## Archival Sources',
    '',
    `- public_writeup_facts: ${pkg.archival_sources.public_writeup_facts || 'none'}`,
    `- source_snapshot_available: ${pkg.archival_sources.source_snapshot_available}`,
    `- static_analysis_summary: ${pkg.archival_sources.static_analysis_summary || 'none'}`,
    '',
    '## Top Verified Claims',
    '',
    ...(pkg.archival_route.top_verified_claims.length ? pkg.archival_route.top_verified_claims.map((item) => `- ${item}`) : ['- none']),
    '',
    '## Top Risks',
    '',
    ...(pkg.archival_route.top_risks.length ? pkg.archival_route.top_risks.map((item) => `- [${item.severity}] ${item.id}: ${item.summary}`) : ['- none']),
  ];
  fs.writeFileSync(options.outputMd, `${lines.join('\n')}\n`, 'utf8');
}

console.log(JSON.stringify({
  bundle_dir: bundleDir,
  files: [
    options.outputJson ? path.basename(options.outputJson) : null,
    options.outputMd ? path.basename(options.outputMd) : null,
  ].filter(Boolean),
  promotion_boundary: pkg.promotion_boundary,
}, null, 2));
