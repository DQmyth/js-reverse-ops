#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');

function usage() {
  console.error([
    'Usage: recommend_next_action.js <run-dir> [--notes <text-or-file>] [--json]',
    '',
    'Reads a playbook run directory and recommends the next smallest operator command.',
  ].join('\n'));
  process.exit(1);
}

function parseArgs(argv) {
  const args = { runDir: '', notes: '', json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--notes') {
      args.notes = argv[index + 1] || '';
      index += 1;
    } else if (item === '--json') {
      args.json = true;
    } else if (item === '--help' || item === '-h') {
      usage();
    } else if (!args.runDir) {
      args.runDir = item;
    } else {
      usage();
    }
  }
  if (!args.runDir) usage();
  return args;
}

function resolveRepoPath(value) {
  if (!value) return '';
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

function readJsonIfExists(file) {
  if (!file || !fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_error) {
    return null;
  }
}

function readTextMaybe(value) {
  if (!value) return '';
  const file = resolveRepoPath(value);
  if (fs.existsSync(file) && fs.statSync(file).isFile()) return fs.readFileSync(file, 'utf8');
  return value;
}

function runJson(script, args) {
  try {
    const output = execFileSync(process.execPath, [path.join(rootDir, script), ...args, '--json'], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return JSON.parse(output);
  } catch (error) {
    return {
      error: error.message,
      stderr: error.stderr ? String(error.stderr).slice(0, 1000) : '',
    };
  }
}

function rel(file) {
  return path.relative(rootDir, file);
}

function hasRisk(riskSummary, id) {
  return (riskSummary?.risks || []).some((risk) => risk.id === id);
}

function buildRecommendation(args) {
  const runDir = resolveRepoPath(args.runDir);
  const playbookRun = readJsonIfExists(path.join(runDir, 'playbook-run.json'));
  const evidence = readJsonIfExists(path.join(runDir, 'evidence.json'));
  const replayStatus = readJsonIfExists(path.join(runDir, 'replay-status.json'));
  const riskSummary = readJsonIfExists(path.join(runDir, 'risk-summary.json'));
  const claimSet = readJsonIfExists(path.join(runDir, 'claim-set.json'));
  const notes = readTextMaybe(args.notes);

  const readiness = fs.existsSync(path.join(runDir, 'evidence.json'))
    ? runJson('scripts/assess_delivery_readiness.js', [rel(runDir)])
    : null;
  const replayFailure = replayStatus && (
    replayStatus.acceptance_status === 'rejected'
    || Number(replayStatus.divergence_count || 0) > 0
    || evidence?.replay_evidence?.acceptance_status === 'rejected'
    || Number(evidence?.replay_evidence?.divergence_count || 0) > 0
  )
    ? runJson('scripts/diagnose_replay_failure.js', ['--run-dir', rel(runDir), ...(notes ? ['--notes', notes] : [])])
    : null;
  const captureGaps = (hasRisk(riskSummary, 'hook-evidence-missing') || hasRisk(riskSummary, 'runtime-first-required'))
    ? runJson('scripts/diagnose_runtime_capture_gaps.js', [
      ...(notes ? ['--notes', notes] : []),
      ...(fs.existsSync(path.join(runDir, 'hook-profile.json')) ? ['--profile', rel(path.join(runDir, 'hook-profile.json'))] : []),
      ...(fs.existsSync(path.join(runDir, 'evidence.json')) ? ['--evidence', rel(path.join(runDir, 'evidence.json'))] : []),
    ])
    : null;

  const reasons = [];
  const candidates = [];
  const replayState = `${replayStatus?.status || 'unknown'}/${replayStatus?.acceptance_status || 'unknown'}`;

  if (readiness?.readiness === 'delivery-ready') {
    candidates.push({
      id: 'validate-delivery',
      priority: 95,
      command: `node scripts/validate_delivery_artifacts.js ${rel(runDir)} --json`,
      rationale: 'Delivery readiness is already satisfied; validate artifacts before handoff or release.',
    });
  }

  if (replayFailure?.recommended_diagnosis) {
    reasons.push(`replay diagnosis: ${replayFailure.recommended_diagnosis.id}`);
    candidates.push({
      id: 'diagnose-replay-failure',
      priority: 90,
      command: `node scripts/diagnose_replay_failure.js --run-dir ${rel(runDir)} --json`,
      rationale: `Replay is ${replayState}; repair ${replayFailure.recommended_diagnosis.id} before promoting delivery.`,
    });
  }

  if (captureGaps?.missing_surfaces?.length) {
    reasons.push(`runtime capture gap: ${captureGaps.missing_surfaces[0].id}`);
    candidates.push({
      id: 'capture-runtime-truth',
      priority: replayFailure ? 70 : 88,
      command: `node scripts/diagnose_runtime_capture_gaps.js --profile ${rel(path.join(runDir, 'hook-profile.json'))} --evidence ${rel(path.join(runDir, 'evidence.json'))} --json`,
      rationale: `Runtime evidence is still missing; collect ${captureGaps.missing_surfaces[0].id} before replay work.`,
    });
  } else if (hasRisk(riskSummary, 'hook-evidence-missing')) {
    reasons.push('hook evidence missing');
    candidates.push({
      id: 'execute-hook-runbook',
      priority: 82,
      command: fs.existsSync(path.join(runDir, 'hook-execution-runbook.md'))
        ? `sed -n '1,220p' ${rel(path.join(runDir, 'hook-execution-runbook.md'))}`
        : `node scripts/validate_delivery_artifacts.js ${rel(runDir)} --json`,
      rationale: 'Hook scaffold exists but no matched runtime observations have been promoted yet.',
    });
  }

  if (readiness?.readiness && readiness.readiness !== 'delivery-ready') {
    reasons.push(`delivery readiness: ${readiness.readiness}`);
    candidates.push({
      id: 'assess-readiness',
      priority: 50,
      command: `node scripts/assess_delivery_readiness.js ${rel(runDir)} --json`,
      rationale: 'Use readiness blockers to decide whether runtime, replay, or risk evidence is still missing.',
    });
  }

  if (!candidates.length) {
    candidates.push({
      id: 'validate-run-directory',
      priority: 40,
      command: `node scripts/validate_delivery_artifacts.js ${rel(runDir)} --json`,
      rationale: 'No stronger next action was justified from current artifacts.',
    });
  }

  candidates.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  const recommended = candidates[0];
  return {
    schema: 'js-reverse-ops-next-action-v1',
    generated_at: new Date().toISOString(),
    run_dir: rel(runDir),
    route: {
      family: playbookRun?.family || playbookRun?.plan?.family || null,
      stage: playbookRun?.stage || playbookRun?.plan?.stage || null,
      playbook: playbookRun?.playbook || playbookRun?.plan?.playbook || null,
    },
    readiness,
    replay_failure: replayFailure,
    capture_gaps: captureGaps,
    artifact_summary: {
      has_evidence: Boolean(evidence),
      has_claim_set: Boolean(claimSet),
      has_risk_summary: Boolean(riskSummary),
      replay_status: replayState,
      risk_ids: (riskSummary?.risks || []).map((risk) => risk.id),
    },
    recommended_action: recommended,
    candidates,
    reasons: [...new Set(reasons)],
    boundary: 'This command recommends the next operator step from existing artifacts. It does not promote inferred, planned, or rejected evidence.',
  };
}

function renderMarkdown(result) {
  const lines = [];
  lines.push('# Next Action');
  lines.push('');
  lines.push(`- Recommended: \`${result.recommended_action.id}\``);
  lines.push(`- Command: \`${result.recommended_action.command}\``);
  lines.push(`- Why: ${result.recommended_action.rationale}`);
  lines.push(`- Readiness: \`${result.readiness?.readiness || 'unknown'}\``);
  lines.push(`- Replay: \`${result.artifact_summary.replay_status}\``);
  lines.push('');
  lines.push('## Reasons');
  lines.push('');
  if (!result.reasons.length) lines.push('- none');
  for (const reason of result.reasons) lines.push(`- ${reason}`);
  lines.push('');
  lines.push('## Boundary');
  lines.push('');
  lines.push(result.boundary);
  lines.push('');
  return lines.join('\n');
}

const args = parseArgs(process.argv.slice(2));
const result = buildRecommendation(args);
process.stdout.write(args.json ? `${JSON.stringify(result, null, 2)}\n` : renderMarkdown(result));
