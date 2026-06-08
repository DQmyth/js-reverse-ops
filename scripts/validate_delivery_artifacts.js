#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const REQUIRED_FILES = [
  'playbook-run.json',
  'playbook-run.md',
  'evidence.json',
  'claim-set.json',
  'risk-summary.json',
  'provenance-graph.json',
  'provenance-summary.md',
  'operator-review.md',
  'replay-status.json',
];

function parseArgs(argv) {
  const args = { dir: '', json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--json') args.json = true;
    else if (item === '--help' || item === '-h') args.help = true;
    else if (!args.dir) args.dir = item;
  }
  return args;
}

function usage() {
  return [
    'Usage: node scripts/validate_delivery_artifacts.js <run-dir> [--json]',
    '',
    'Validates the public playbook-run delivery artifact contract.',
  ].join('\n');
}

function readJson(file, errors) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    errors.push(`invalid json ${path.basename(file)}: ${error.message}`);
    return null;
  }
}

function countBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key] || 'unknown';
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function validate(dir) {
  const root = path.resolve(dir);
  const errors = [];
  const warnings = [];
  const files = {};

  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    return {
      schema: 'js-reverse-ops-delivery-validation-v1',
      dir: root,
      ok: false,
      errors: [`not a directory: ${root}`],
      warnings,
    };
  }

  for (const file of REQUIRED_FILES) {
    const filePath = path.join(root, file);
    files[file] = fs.existsSync(filePath);
    if (!files[file]) errors.push(`missing required file: ${file}`);
  }

  const playbookRun = files['playbook-run.json'] ? readJson(path.join(root, 'playbook-run.json'), errors) : null;
  const evidence = files['evidence.json'] ? readJson(path.join(root, 'evidence.json'), errors) : null;
  const claimSet = files['claim-set.json'] ? readJson(path.join(root, 'claim-set.json'), errors) : null;
  const riskSummary = files['risk-summary.json'] ? readJson(path.join(root, 'risk-summary.json'), errors) : null;
  const provenance = files['provenance-graph.json'] ? readJson(path.join(root, 'provenance-graph.json'), errors) : null;
  const replayStatus = files['replay-status.json'] ? readJson(path.join(root, 'replay-status.json'), errors) : null;

  if (playbookRun) {
    if (playbookRun.schema !== 'js-reverse-ops-playbook-run-v1') errors.push('playbook-run.json schema mismatch');
    for (const file of REQUIRED_FILES.filter((item) => !item.endsWith('.md'))) {
      if (file !== 'playbook-run.json' && !(playbookRun.delivery_artifacts || []).includes(file)) {
        warnings.push(`playbook-run delivery_artifacts does not list ${file}`);
      }
    }
  }

  if (evidence) {
    if (evidence.schema !== 'js-reverse-ops-bootstrap-evidence-v1') errors.push('evidence.json schema mismatch');
    const runtimeStatus = (evidence.runtime_evidence || {}).status;
    const matchedHook = ((evidence.hook_evidence || {}).matched_observation_count || 0) > 0;
    if (runtimeStatus !== 'not-collected' && !matchedHook) {
      warnings.push('bootstrap evidence should keep runtime_evidence.status as not-collected until live capture exists');
    }
  }

  if (claimSet) {
    if (claimSet.schema !== 'js-reverse-ops-claim-set-v1') errors.push('claim-set.json schema mismatch');
    const claims = claimSet.claims || [];
    const actual = countBy(claims, 'strength');
    const expected = claimSet.summary || {};
    for (const strength of ['verified', 'inferred', 'weak']) {
      if ((actual[strength] || 0) !== (expected[strength] || 0)) {
        errors.push(`claim summary mismatch for ${strength}`);
      }
    }
    const replayAccepted = replayStatus && replayStatus.acceptance_status === 'accepted';
    const runtimeCaptured = evidence && (evidence.runtime_evidence || {}).status && (evidence.runtime_evidence || {}).status !== 'not-collected';
    const matchedHook = evidence && ((evidence.hook_evidence || {}).matched_observation_count || 0) > 0;
    const mcpObserved = evidence && (evidence.mcp_execution || {}).run_status === 'completed' && ((evidence.mcp_execution || {}).completed_steps || 0) > 0;
    if (!replayAccepted && !runtimeCaptured && !matchedHook && !mcpObserved && (actual.verified || 0) > 0) {
      errors.push('bootstrap run has verified claims before accepted replay or runtime evidence');
    }
  }

  if (riskSummary) {
    if (riskSummary.schema !== 'js-reverse-ops-risk-summary-v1') errors.push('risk-summary.json schema mismatch');
    const riskIds = (riskSummary.risks || []).map((item) => item.id);
    const runtimeCaptured = provenance && provenance.status !== 'bootstrap-only';
    if (!runtimeCaptured && !riskIds.includes('bootstrap-only')) warnings.push('risk-summary should include bootstrap-only risk for runner output');
  }

  if (provenance) {
    if (provenance.schema !== 'js-reverse-ops-provenance-graph-v1') errors.push('provenance-graph.json schema mismatch');
    if (!['bootstrap-only', 'runtime-captured', 'runtime-accepted'].includes(provenance.status)) {
      warnings.push(`unexpected provenance status: ${provenance.status}`);
    }
    if (!Array.isArray(provenance.nodes) || !Array.isArray(provenance.edges)) {
      errors.push('provenance graph must include nodes and edges arrays');
    }
  }

  if (replayStatus) {
    if (replayStatus.schema !== 'js-reverse-ops-replay-status-v1') errors.push('replay-status.json schema mismatch');
    const acceptedReplay = replayStatus.status === 'verified' && replayStatus.acceptance_status === 'accepted';
    const testedReplay = replayStatus.status === 'failed' && replayStatus.acceptance_status === 'rejected';
    if (!acceptedReplay && !testedReplay && (replayStatus.status !== 'not-started' || replayStatus.acceptance_status !== 'not-tested')) {
      warnings.push('bootstrap replay-status should remain not-started/not-tested until validation exists');
    }
    if (acceptedReplay && provenance && provenance.status !== 'runtime-accepted') {
      errors.push('accepted replay must promote provenance status to runtime-accepted');
    }
    if (!acceptedReplay && provenance && provenance.status === 'runtime-accepted') {
      errors.push('runtime-accepted provenance requires accepted replay status');
    }
  }

  return {
    schema: 'js-reverse-ops-delivery-validation-v1',
    dir: root,
    ok: errors.length === 0,
    errors,
    warnings,
    required_files_present: REQUIRED_FILES.filter((file) => files[file]).length,
    required_files_total: REQUIRED_FILES.length,
    claim_summary: claimSet ? claimSet.summary : null,
    risk_summary: riskSummary ? riskSummary.summary : null,
    provenance_status: provenance ? provenance.status : null,
    replay_status: replayStatus ? {
      status: replayStatus.status,
      acceptance_status: replayStatus.acceptance_status,
    } : null,
  };
}

function renderText(result) {
  const lines = [
    `delivery artifacts: ${result.ok ? 'ok' : 'failed'}`,
    `required files: ${result.required_files_present || 0}/${result.required_files_total || REQUIRED_FILES.length}`,
  ];
  if (result.provenance_status) lines.push(`provenance: ${result.provenance_status}`);
  if (result.replay_status) lines.push(`replay: ${result.replay_status.status}/${result.replay_status.acceptance_status}`);
  for (const warning of result.warnings || []) lines.push(`WARN ${warning}`);
  for (const error of result.errors || []) lines.push(`ERROR ${error}`);
  return `${lines.join('\n')}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.dir) {
    console.log(usage());
    process.exit(args.help ? 0 : 1);
  }
  const result = validate(args.dir);
  process.stdout.write(args.json ? `${JSON.stringify(result, null, 2)}\n` : renderText(result));
  if (!result.ok) process.exit(1);
}

main();
