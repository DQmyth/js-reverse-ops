#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function usage() {
  console.error(
    'Usage: normalize_task_artifacts.js --output-dir <dir> [--task-json <file>] [--evidence-json <file>] [--report-md <file>] [--notes-md <file>] [--family-decision-json <file>] [--claim-set-json <file>] [--risk-summary-json <file>] [--provenance-graph-json <file>] [--provenance-summary-md <file>] [--operator-review-md <file>] [--workflow-dispatch-json <file>] [--workflow-run-json <file>] [--workflow-run-md <file>] [--workflow-action-list-json <file>] [--workflow-mcp-batch-json <file>] [--workflow-mcp-context-json <file>] [--workflow-mcp-exec-plan-json <file>] [--workflow-mcp-call-payload-json <file>] [--workflow-mcp-execution-guide-json <file>] [--workflow-mcp-execution-guide-md <file>] [--workflow-mcp-execution-template-json <file>] [--workflow-mcp-execution-record-json <file>] [--workflow-mcp-execution-record-md <file>] [--local-harness-plan-json <file>] [--local-harness-plan-md <file>] [--local-harness-result-template-json <file>] [--local-harness-result-json <file>] [--local-harness-result-md <file>] [--archival-evidence-package-json <file>] [--archival-evidence-package-md <file>] [--archival-antidebug-report-json <file>] [--archival-antidebug-report-md <file>] [--original <file>]... [--derived <file>]... [--evidence-artifact <file>]...'
  );
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.length === 0) usage();

const options = {
  outputDir: '',
  taskJson: '',
  evidenceJson: '',
  reportMd: '',
  notesMd: '',
  familyDecisionJson: '',
  claimSetJson: '',
  riskSummaryJson: '',
  provenanceGraphJson: '',
  provenanceSummaryMd: '',
  operatorReviewMd: '',
  workflowDispatchJson: '',
  workflowRunJson: '',
  workflowRunMd: '',
  workflowActionListJson: '',
  workflowMcpBatchJson: '',
  workflowMcpContextJson: '',
  workflowMcpExecPlanJson: '',
  workflowMcpCallPayloadJson: '',
  workflowMcpExecutionGuideJson: '',
  workflowMcpExecutionGuideMd: '',
  workflowMcpExecutionTemplateJson: '',
  workflowMcpExecutionRecordJson: '',
  workflowMcpExecutionRecordMd: '',
  localHarnessPlanJson: '',
  localHarnessPlanMd: '',
  localHarnessResultTemplateJson: '',
  localHarnessResultJson: '',
  localHarnessResultMd: '',
  archivalEvidencePackageJson: '',
  archivalEvidencePackageMd: '',
  archivalAntidebugReportJson: '',
  archivalAntidebugReportMd: '',
  original: [],
  derived: [],
  evidenceArtifacts: [],
};

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  const next = args[i + 1] || '';
  if (arg === '--output-dir') {
    options.outputDir = next;
    i += 1;
  } else if (arg === '--task-json') {
    options.taskJson = next;
    i += 1;
  } else if (arg === '--evidence-json') {
    options.evidenceJson = next;
    i += 1;
  } else if (arg === '--report-md') {
    options.reportMd = next;
    i += 1;
  } else if (arg === '--notes-md') {
    options.notesMd = next;
    i += 1;
  } else if (arg === '--family-decision-json') {
    options.familyDecisionJson = next;
    i += 1;
  } else if (arg === '--claim-set-json') {
    options.claimSetJson = next;
    i += 1;
  } else if (arg === '--risk-summary-json') {
    options.riskSummaryJson = next;
    i += 1;
  } else if (arg === '--provenance-graph-json') {
    options.provenanceGraphJson = next;
    i += 1;
  } else if (arg === '--provenance-summary-md') {
    options.provenanceSummaryMd = next;
    i += 1;
  } else if (arg === '--operator-review-md') {
    options.operatorReviewMd = next;
    i += 1;
  } else if (arg === '--workflow-dispatch-json') {
    options.workflowDispatchJson = next;
    i += 1;
  } else if (arg === '--workflow-run-json') {
    options.workflowRunJson = next;
    i += 1;
  } else if (arg === '--workflow-run-md') {
    options.workflowRunMd = next;
    i += 1;
  } else if (arg === '--workflow-action-list-json') {
    options.workflowActionListJson = next;
    i += 1;
  } else if (arg === '--workflow-mcp-batch-json') {
    options.workflowMcpBatchJson = next;
    i += 1;
  } else if (arg === '--workflow-mcp-context-json') {
    options.workflowMcpContextJson = next;
    i += 1;
  } else if (arg === '--workflow-mcp-exec-plan-json') {
    options.workflowMcpExecPlanJson = next;
    i += 1;
  } else if (arg === '--workflow-mcp-call-payload-json') {
    options.workflowMcpCallPayloadJson = next;
    i += 1;
  } else if (arg === '--workflow-mcp-execution-guide-json') {
    options.workflowMcpExecutionGuideJson = next;
    i += 1;
  } else if (arg === '--workflow-mcp-execution-guide-md') {
    options.workflowMcpExecutionGuideMd = next;
    i += 1;
  } else if (arg === '--workflow-mcp-execution-template-json') {
    options.workflowMcpExecutionTemplateJson = next;
    i += 1;
  } else if (arg === '--workflow-mcp-execution-record-json') {
    options.workflowMcpExecutionRecordJson = next;
    i += 1;
  } else if (arg === '--workflow-mcp-execution-record-md') {
    options.workflowMcpExecutionRecordMd = next;
    i += 1;
  } else if (arg === '--local-harness-plan-json') {
    options.localHarnessPlanJson = next;
    i += 1;
  } else if (arg === '--local-harness-plan-md') {
    options.localHarnessPlanMd = next;
    i += 1;
  } else if (arg === '--local-harness-result-template-json') {
    options.localHarnessResultTemplateJson = next;
    i += 1;
  } else if (arg === '--local-harness-result-json') {
    options.localHarnessResultJson = next;
    i += 1;
  } else if (arg === '--local-harness-result-md') {
    options.localHarnessResultMd = next;
    i += 1;
  } else if (arg === '--archival-evidence-package-json') {
    options.archivalEvidencePackageJson = next;
    i += 1;
  } else if (arg === '--archival-evidence-package-md') {
    options.archivalEvidencePackageMd = next;
    i += 1;
  } else if (arg === '--archival-antidebug-report-json') {
    options.archivalAntidebugReportJson = next;
    i += 1;
  } else if (arg === '--archival-antidebug-report-md') {
    options.archivalAntidebugReportMd = next;
    i += 1;
  } else if (arg === '--original') {
    options.original.push(next);
    i += 1;
  } else if (arg === '--derived') {
    options.derived.push(next);
    i += 1;
  } else if (arg === '--evidence-artifact') {
    options.evidenceArtifacts.push(next);
    i += 1;
  } else {
    usage();
  }
}

if (!options.outputDir) usage();

function uniq(items) {
  return [...new Set(items.filter(Boolean))];
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyIfNeeded(src, dest) {
  const resolvedSrc = path.resolve(src);
  const resolvedDest = path.resolve(dest);
  if (!fs.existsSync(resolvedSrc)) {
    return { status: 'missing', source: resolvedSrc, destination: resolvedDest };
  }
  ensureDir(path.dirname(resolvedDest));
  if (resolvedSrc !== resolvedDest) fs.copyFileSync(resolvedSrc, resolvedDest);
  return { status: 'copied', source: resolvedSrc, destination: resolvedDest };
}

const outputDir = path.resolve(options.outputDir);
ensureDir(outputDir);
ensureDir(path.join(outputDir, 'artifacts', 'original'));
ensureDir(path.join(outputDir, 'artifacts', 'derived'));
ensureDir(path.join(outputDir, 'artifacts', 'evidence'));

const rootCopies = [];

for (const [key, fileName] of [
  ['taskJson', 'task.json'],
  ['evidenceJson', 'evidence.json'],
  ['reportMd', 'report.md'],
  ['notesMd', 'notes.md'],
  ['familyDecisionJson', 'family-decision.json'],
  ['claimSetJson', 'claim-set.json'],
  ['riskSummaryJson', 'risk-summary.json'],
  ['provenanceGraphJson', 'provenance-graph.json'],
  ['provenanceSummaryMd', 'provenance-summary.md'],
  ['operatorReviewMd', 'operator-review.md'],
  ['workflowDispatchJson', 'workflow-dispatch.json'],
  ['workflowRunJson', 'workflow-run.json'],
  ['workflowRunMd', 'workflow-run.md'],
  ['workflowActionListJson', 'workflow-action-list.json'],
  ['workflowMcpBatchJson', 'workflow-mcp-batch.json'],
  ['workflowMcpContextJson', 'workflow-mcp-context.json'],
  ['workflowMcpExecPlanJson', 'workflow-mcp-exec-plan.json'],
  ['workflowMcpCallPayloadJson', 'workflow-mcp-call-payload.json'],
  ['workflowMcpExecutionGuideJson', 'workflow-mcp-execution-guide.json'],
  ['workflowMcpExecutionGuideMd', 'workflow-mcp-execution-guide.md'],
  ['workflowMcpExecutionTemplateJson', 'workflow-mcp-execution-template.json'],
  ['workflowMcpExecutionRecordJson', 'workflow-mcp-execution-record.json'],
  ['workflowMcpExecutionRecordMd', 'workflow-mcp-execution-record.md'],
  ['localHarnessPlanJson', 'local-harness-plan.json'],
  ['localHarnessPlanMd', 'local-harness-plan.md'],
  ['localHarnessResultTemplateJson', 'local-harness-result-template.json'],
  ['localHarnessResultJson', 'local-harness-result.json'],
  ['localHarnessResultMd', 'local-harness-result.md'],
  ['archivalEvidencePackageJson', 'archival-evidence-package.json'],
  ['archivalEvidencePackageMd', 'archival-evidence-package.md'],
  ['archivalAntidebugReportJson', 'archival-antidebug-report.json'],
  ['archivalAntidebugReportMd', 'archival-antidebug-report.md'],
]) {
  if (options[key]) {
    rootCopies.push(copyIfNeeded(options[key], path.join(outputDir, fileName)));
  }
}

function copyGroup(items, bucket) {
  return uniq(items).map((item) => copyIfNeeded(item, path.join(outputDir, 'artifacts', bucket, path.basename(item))));
}

const originalCopies = copyGroup(options.original, 'original');
const derivedCopies = copyGroup(options.derived, 'derived');
const evidenceCopies = copyGroup(options.evidenceArtifacts, 'evidence');

const index = {
  output_dir: outputDir,
  root_files: rootCopies,
  groups: {
    original: originalCopies,
    derived: derivedCopies,
    evidence: evidenceCopies,
  },
};

fs.writeFileSync(path.join(outputDir, 'artifact-index.json'), `${JSON.stringify(index, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(index, null, 2));
