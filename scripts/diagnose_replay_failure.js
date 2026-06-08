#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const modelPath = path.join(rootDir, 'assets', 'env-rebuild-divergence-model.json');

function usage() {
  console.error([
    'Usage: diagnose_replay_failure.js [--run-dir <dir>] [--replay-record <record.json>] [--notes <text-or-file>] [--json]',
    '',
    'Classifies rejected or divergent replay evidence and recommends the next smallest repair step.',
  ].join('\n'));
  process.exit(1);
}

function parseArgs(argv) {
  const args = { runDir: '', replayRecord: '', notes: '', json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--run-dir') {
      args.runDir = argv[index + 1] || '';
      index += 1;
    } else if (item === '--replay-record') {
      args.replayRecord = argv[index + 1] || '';
      index += 1;
    } else if (item === '--notes') {
      args.notes = argv[index + 1] || '';
      index += 1;
    } else if (item === '--json') {
      args.json = true;
    } else if (item === '--help' || item === '-h') {
      usage();
    } else if (!args.runDir && fs.existsSync(resolveRepoPath(item)) && fs.statSync(resolveRepoPath(item)).isDirectory()) {
      args.runDir = item;
    } else if (!args.replayRecord) {
      args.replayRecord = item;
    } else {
      usage();
    }
  }
  if (!args.runDir && !args.replayRecord && !args.notes) usage();
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

function readTextMaybe(value) {
  if (!value) return '';
  const file = resolveRepoPath(value);
  if (fs.existsSync(file) && fs.statSync(file).isFile()) return fs.readFileSync(file, 'utf8');
  return value;
}

function readJsonIfExists(file) {
  if (!file || !fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_error) {
    return null;
  }
}

function collectRunDir(runDir) {
  if (!runDir) return {};
  const dir = resolveRepoPath(runDir);
  return {
    dir,
    evidence: readJsonIfExists(path.join(dir, 'evidence.json')),
    replayStatus: readJsonIfExists(path.join(dir, 'replay-status.json')),
    riskSummary: readJsonIfExists(path.join(dir, 'risk-summary.json')),
    readiness: readJsonIfExists(path.join(dir, 'delivery-readiness.json')),
    claimSet: readJsonIfExists(path.join(dir, 'claim-set.json')),
  };
}

function normalize(value) {
  return String(value || '').toLowerCase();
}

function signalHits(item, haystack) {
  return (item.signals || []).filter((signal) => {
    const normalized = normalize(signal);
    if (haystack.includes(normalized)) return true;
    const words = normalized.split(/[^a-z0-9_]+/).filter((word) => word.length > 3);
    return words.length >= 2 && words.every((word) => haystack.includes(word));
  });
}

function collectReplayFacts(replayRecord, run) {
  const samples = Array.isArray(replayRecord?.samples) ? replayRecord.samples : [];
  const statuses = samples.map((sample) => sample.status_code).filter((item) => typeof item === 'number');
  const expectedShapes = samples.flatMap((sample) => sample.expected_shape || []);
  const observedShapes = samples.flatMap((sample) => sample.observed_shape || []);
  const shapeMismatch = samples.some((sample) => {
    const expected = Array.isArray(sample.expected_shape) ? sample.expected_shape : [];
    const observed = Array.isArray(sample.observed_shape) ? sample.observed_shape : [];
    return expected.some((item) => !observed.includes(item));
  });
  const riskIds = Array.isArray(run.riskSummary?.risks) ? run.riskSummary.risks.map((risk) => risk.id) : [];
  const blockers = Array.isArray(run.readiness?.blockers) ? run.readiness.blockers : [];
  return {
    acceptance_status: replayRecord?.acceptance_status || run.replayStatus?.acceptance_status || null,
    replay_status: replayRecord?.status || run.replayStatus?.status || null,
    divergence_count: Math.max(
      Number(replayRecord?.divergence_count || run.replayStatus?.divergence_count || 0),
      shapeMismatch ? 1 : 0,
    ),
    statuses,
    expected_shapes: [...new Set(expectedShapes)],
    observed_shapes: [...new Set(observedShapes)],
    shape_mismatch: shapeMismatch,
    has_success_status: statuses.some((status) => status >= 200 && status < 300),
    has_rejected_status: statuses.some((status) => status >= 400),
    risk_ids: riskIds,
    blockers,
  };
}

function buildDiagnosis(args) {
  const model = readJsonIfExists(modelPath) || {};
  const run = collectRunDir(args.runDir);
  const replayRecord = readJsonIfExists(resolveRepoPath(args.replayRecord))
    || run.evidence?.replay_evidence
    || run.replayStatus
    || null;
  const notes = readTextMaybe(args.notes);
  const haystack = normalize(JSON.stringify({
    notes,
    replayRecord,
    evidence: run.evidence,
    replayStatus: run.replayStatus,
    riskSummary: run.riskSummary,
    claimSet: run.claimSet,
  }));
  const facts = collectReplayFacts(replayRecord, run);
  const diagnoses = (model.patch_classes || []).map((item) => {
    const hits = signalHits(item, haystack);
    let score = hits.length * 12 + Math.round((item.priority || 0) / 10);
    if (
      item.id === 'response-shape-prerequisite'
      && facts.shape_mismatch
      && (facts.acceptance_status === 'accepted' || facts.has_success_status)
    ) score += 35;
    if (item.id === 'response-shape-prerequisite' && facts.has_rejected_status && facts.acceptance_status !== 'accepted') {
      score -= 25;
    }
    if (item.id === 'transport-profile-drift' && facts.statuses.some((status) => [401, 403, 429].includes(status))) score += 30;
    if (item.id === 'storage-cookie-state' && facts.risk_ids.includes('cookie-provenance-unknown')) score += 25;
    if (item.id === 'crypto-helper-output' && facts.risk_ids.includes('signer-unresolved')) score += 25;
    if (item.id === 'crypto-helper-output' && /(signature|token|nonce|digest|encrypt|hash)\s+mismatch/.test(haystack)) score += 45;
    if (item.id === 'time-source-drift' && /expired|ttl|timestamp|server time/.test(haystack)) score += 20;
    return {
      id: item.id,
      label: item.label,
      score,
      matched_signals: hits,
      patch_actions: item.patch_actions || [],
      verification: item.verification || '',
    };
  }).filter((item) => item.score > 8 || item.matched_signals.length)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  const top = diagnoses[0] || null;
  return {
    schema: 'js-reverse-ops-replay-failure-diagnosis-v1',
    generated_at: new Date().toISOString(),
    run_dir: run.dir || null,
    replay_record: args.replayRecord || null,
    acceptance_status: facts.acceptance_status,
    replay_status: facts.replay_status,
    divergence_count: facts.divergence_count,
    facts,
    recommended_diagnosis: top,
    diagnoses,
    next_action: top
      ? `${top.patch_actions[0]} Then verify: ${top.verification}.`
      : 'No replay failure class is justified yet. Add runtime evidence, replay samples, or divergence notes.',
    next_scripts: top ? [
      'scripts/plan_env_patch_from_divergence.js',
      'scripts/compare_external_replay_to_runtime.js',
      'scripts/promote_delivery_evidence.js',
      'scripts/assess_delivery_readiness.js',
    ] : [
      'scripts/run_playbook.js',
      'scripts/promote_delivery_evidence.js',
    ],
    boundary: 'Replay failure diagnosis is a repair hypothesis. It does not promote replay readiness without accepted replay evidence.',
  };
}

function renderMarkdown(result) {
  const lines = [];
  lines.push('# Replay Failure Diagnosis');
  lines.push('');
  lines.push(`- Recommended: \`${result.recommended_diagnosis?.id || 'none'}\``);
  lines.push(`- Replay: \`${result.replay_status || 'unknown'}/${result.acceptance_status || 'unknown'}\``);
  lines.push(`- Divergence count: \`${result.divergence_count}\``);
  lines.push(`- Boundary: ${result.boundary}`);
  lines.push('');
  lines.push('## Diagnoses');
  lines.push('');
  if (!result.diagnoses.length) lines.push('- none');
  for (const item of result.diagnoses.slice(0, 5)) {
    lines.push(`- ${item.id}: score ${item.score}; signals ${item.matched_signals.join(', ') || 'none'}`);
  }
  lines.push('');
  lines.push('## Next Action');
  lines.push('');
  lines.push(result.next_action);
  lines.push('');
  return lines.join('\n');
}

const args = parseArgs(process.argv.slice(2));
const result = buildDiagnosis(args);
process.stdout.write(args.json ? `${JSON.stringify(result, null, 2)}\n` : renderMarkdown(result));
