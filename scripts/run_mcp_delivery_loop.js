#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');

function usage() {
  console.error([
    'Usage: run_mcp_delivery_loop.js <target> [--notes <text>] [--out <run-dir>] [--server-family <id>] [--record <mcp-record.json>] [--json]',
    '',
    'Builds a browser MCP delivery loop: playbook run, smoke plan, execution template, optional record verification, promotion, validation, and readiness.',
  ].join('\n'));
  process.exit(1);
}

function parseArgs(argv) {
  const args = {
    target: '',
    notes: '',
    out: '',
    serverFamily: 'chrome_devtools_mcp',
    record: '',
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--notes') {
      args.notes = argv[index + 1] || '';
      index += 1;
    } else if (item === '--out') {
      args.out = argv[index + 1] || '';
      index += 1;
    } else if (item === '--server-family') {
      args.serverFamily = argv[index + 1] || '';
      index += 1;
    } else if (item === '--record') {
      args.record = argv[index + 1] || '';
      index += 1;
    } else if (item === '--json') {
      args.json = true;
    } else if (item === '--help' || item === '-h') {
      usage();
    } else if (!args.target) {
      args.target = item;
    } else {
      usage();
    }
  }
  if (!args.target) usage();
  return args;
}

function safeTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function resolveRepoPath(value) {
  const candidates = path.isAbsolute(value)
    ? [value]
    : [
        path.resolve(process.cwd(), value),
        path.resolve(rootDir, value),
        path.resolve(rootDir, 'public', value),
      ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

function runJson(script, args) {
  const output = execFileSync(process.execPath, [path.join(rootDir, script), ...args, '--json'], {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(output);
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function buildTemplate(plan, runDir, args) {
  const checks = plan.planned_checks || [];
  return {
    schema: 'js-reverse-ops-browser-mcp-execution-record-template-v1',
    generated_at: new Date().toISOString(),
    workflow_id: `mcp-delivery-loop-${path.basename(runDir)}`,
    server_family: args.serverFamily,
    target: args.target,
    run_status: 'not-started',
    evidence_boundary: plan.evidence_boundary?.rule || plan.evidence_boundary || '',
    step_results: checks.filter((check) => check.supported).map((check) => ({
      step: check.order,
      capability: check.capability,
      normalized_action: check.normalized_action,
      status: 'pending',
      started_at: null,
      finished_at: null,
      notes: check.precondition || '',
      observed_outputs: [],
      artifact_paths: [],
    })),
  };
}

function renderMarkdown(summary) {
  const lines = [];
  lines.push('# MCP Delivery Loop');
  lines.push('');
  lines.push(`- Run directory: \`${summary.run_dir}\``);
  lines.push(`- Server family: \`${summary.server_family}\``);
  lines.push(`- Loop status: \`${summary.loop_status}\``);
  lines.push(`- Smoke coverage: \`${summary.smoke_plan.coverage_score}/100\``);
  lines.push(`- Record verified: \`${summary.record_verification ? summary.record_verification.ok : false}\``);
  lines.push(`- Delivery validation: \`${summary.delivery_validation.ok}\``);
  lines.push(`- Readiness: \`${summary.delivery_readiness.readiness}\``);
  lines.push('');
  lines.push('## Artifacts');
  lines.push('');
  for (const [name, file] of Object.entries(summary.artifacts)) {
    lines.push(`- ${name}: \`${file}\``);
  }
  lines.push('');
  lines.push(summary.next_action);
  lines.push('');
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const runDir = path.resolve(rootDir, args.out || `tmp/mcp-delivery-loop-${safeTimestamp()}`);
  fs.mkdirSync(runDir, { recursive: true });

  const playbookArgs = [
    args.target,
    '--out',
    path.relative(rootDir, runDir),
  ];
  if (args.notes) playbookArgs.push('--notes', args.notes);
  const playbookRun = runJson('scripts/run_playbook.js', playbookArgs);

  const smokePlan = runJson('scripts/plan_browser_mcp_smoke.js', ['--server-family', args.serverFamily]);
  const smokePlanPath = path.join(runDir, 'mcp-smoke-plan.json');
  writeJson(smokePlanPath, smokePlan);

  const template = buildTemplate(smokePlan, runDir, args);
  const templatePath = path.join(runDir, 'mcp-execution-record-template.json');
  writeJson(templatePath, template);

  let recordVerification = null;
  let promoteSummary = null;
  if (args.record) {
    const recordPath = resolveRepoPath(args.record);
    recordVerification = runJson('scripts/verify_browser_mcp_smoke_record.js', [
      '--record',
      path.relative(rootDir, recordPath),
      '--server-family',
      args.serverFamily,
    ]);
    promoteSummary = runJson('scripts/promote_delivery_evidence.js', [
      path.relative(rootDir, runDir),
      '--mcp-record',
      path.relative(rootDir, recordPath),
    ]);
  }

  const deliveryValidation = runJson('scripts/validate_delivery_artifacts.js', [path.relative(rootDir, runDir)]);
  const deliveryReadiness = runJson('scripts/assess_delivery_readiness.js', [path.relative(rootDir, runDir)]);
  const loopStatus = recordVerification?.ok ? 'observed-record-promoted' : 'awaiting-mcp-execution-record';
  const summary = {
    schema: 'js-reverse-ops-mcp-delivery-loop-summary-v1',
    generated_at: new Date().toISOString(),
    run_dir: runDir,
    target: args.target,
    server_family: args.serverFamily,
    loop_status: loopStatus,
    playbook_run: playbookRun,
    smoke_plan: {
      coverage_score: smokePlan.coverage_score,
      covered_count: smokePlan.covered_count,
      total_count: smokePlan.total_count,
      missing_capabilities: smokePlan.missing_capabilities || [],
    },
    record_verification: recordVerification,
    promote_summary: promoteSummary,
    delivery_validation: deliveryValidation,
    delivery_readiness: deliveryReadiness,
    artifacts: {
      playbook_run: path.relative(rootDir, path.join(runDir, 'playbook-run.json')),
      smoke_plan: path.relative(rootDir, smokePlanPath),
      execution_record_template: path.relative(rootDir, templatePath),
      evidence: path.relative(rootDir, path.join(runDir, 'evidence.json')),
      claim_set: path.relative(rootDir, path.join(runDir, 'claim-set.json')),
      operator_review: path.relative(rootDir, path.join(runDir, 'operator-review.md')),
    },
    next_action: recordVerification?.ok
      ? 'MCP execution record is verified and promoted. Add accepted replay evidence before claiming delivery-ready parity.'
      : 'Execute the MCP smoke template on a sanitized target, then rerun this loop with --record.',
  };
  writeJson(path.join(runDir, 'mcp-delivery-loop-summary.json'), summary);
  fs.writeFileSync(path.join(runDir, 'mcp-delivery-loop-summary.md'), renderMarkdown(summary));
  process.stdout.write(args.json ? `${JSON.stringify(summary, null, 2)}\n` : renderMarkdown(summary));
}

main();
