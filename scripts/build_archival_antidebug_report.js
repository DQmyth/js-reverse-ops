#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function usage() {
  console.error('Usage: build_archival_antidebug_report.js <bundle-dir> [--output-json <file>] [--output-md <file>]');
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
const publicFacts = (evidence.public_writeup_facts || {}).facts || evidence.public_writeup_facts || {};
const staticAnalysisSummaryPath = (evidence.static_analysis || {}).summary
  ? path.resolve(bundleDir, evidence.static_analysis.summary)
  : '';
const staticAnalysisSummary = staticAnalysisSummaryPath
  ? readJsonIfExists(staticAnalysisSummaryPath, {})
  : {};
const helperMarkers = ((staticAnalysisSummary.inferred || {}).helper_markers || []).map((item) => String(item));
const moduleHints = ((staticAnalysisSummary.inferred || {}).module_hints || []).map((item) => String(item));
const topVerifiedClaims = (claims.claims || [])
  .filter((item) => item.status === 'verified' || item.strength === 'verified' || item.strength === 'high')
  .map((item) => item.id || item.claim_id || item.statement);
const riskItems = Array.isArray(risks.items) ? risks.items : Array.isArray(risks.risks) ? risks.risks : [];

const report = {
  generated_at: new Date().toISOString(),
  bundle_dir: bundleDir,
  target: evidence.page_url || null,
  workflow_id: workflowDispatch ? workflowDispatch.workflow_id : null,
  workflow_status: workflowRun ? workflowRun.status : null,
  maturity: maturity.maturity || evidence.status || 'unknown',
  evidence_grade: maturity.evidence_grade || 'inferred',
  promotion_boundary: 'archival-proof-only',
  anti_debug_route: {
    critical_paths: (publicFacts.critical_paths || []).filter((item) => /anti-debug|unlock|localstorage/i.test(String(item))),
    writeup_keywords: (((publicFacts.public_signals || {}).writeup_keywords) || []).filter((item) => /anti-debug|unlock|localstorage|devtools/i.test(String(item))),
    helper_markers: helperMarkers.filter((item) => /anti-debug|unlock|localstorage|devtools/i.test(item)),
    module_hints: moduleHints.filter((item) => /anti-debug|unlock|localstorage|devtools/i.test(item)),
  },
  preserved_sources: {
    public_writeup_facts: (evidence.public_writeup_facts || {}).artifact || null,
    source_snapshot_available: Boolean((evidence.source_snapshot || {}).imported_count),
    static_analysis_summary: (evidence.static_analysis || {}).summary || null,
  },
  top_verified_claims: topVerifiedClaims.slice(0, 8),
  top_risks: riskItems.slice(0, 5).map((item) => ({
    id: item.id,
    severity: item.severity,
    summary: item.summary || item.reason || '',
  })),
};

if (options.outputJson) {
  fs.writeFileSync(options.outputJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

if (options.outputMd) {
  const lines = [
    '# Archival Anti-Debug Report',
    '',
    `- bundle_dir: ${report.bundle_dir}`,
    `- target: ${report.target || 'none'}`,
    `- workflow_id: ${report.workflow_id || 'none'}`,
    `- workflow_status: ${report.workflow_status || 'none'}`,
    `- maturity: ${report.maturity}`,
    `- evidence_grade: ${report.evidence_grade}`,
    `- promotion_boundary: ${report.promotion_boundary}`,
    '',
    '## Preserved Anti-Debug Route',
    '',
    `- critical_paths: ${report.anti_debug_route.critical_paths.join(', ') || 'none'}`,
    `- writeup_keywords: ${report.anti_debug_route.writeup_keywords.join(', ') || 'none'}`,
    `- helper_markers: ${report.anti_debug_route.helper_markers.join(', ') || 'none'}`,
    `- module_hints: ${report.anti_debug_route.module_hints.join(', ') || 'none'}`,
    '',
    '## Top Verified Claims',
    '',
    ...(report.top_verified_claims.length ? report.top_verified_claims.map((item) => `- ${item}`) : ['- none']),
    '',
    '## Top Risks',
    '',
    ...(report.top_risks.length ? report.top_risks.map((item) => `- [${item.severity}] ${item.id}: ${item.summary}`) : ['- none']),
  ];
  fs.writeFileSync(options.outputMd, `${lines.join('\n')}\n`, 'utf8');
}

console.log(JSON.stringify({
  bundle_dir: bundleDir,
  files: [
    options.outputJson ? path.basename(options.outputJson) : null,
    options.outputMd ? path.basename(options.outputMd) : null,
  ].filter(Boolean),
  promotion_boundary: report.promotion_boundary,
}, null, 2));
