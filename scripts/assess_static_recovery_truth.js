#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const modelPath = path.join(rootDir, 'assets', 'static-verification-gate-model.json');

function usage() {
  console.error([
    'Usage: assess_static_recovery_truth.js --original <input.js> [--recovered <output.js>] [--runtime-evidence <hook.json>] [--replay-record <replay.json>] [--json]',
    '',
    'Labels static recovery output as inferred, runtime-correlated, divergent, or replay-verified.',
  ].join('\n'));
  process.exit(1);
}

function parseArgs(argv) {
  const args = { original: '', recovered: '', runtimeEvidence: '', replayRecord: '', json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--original') {
      args.original = argv[index + 1] || '';
      index += 1;
    } else if (item === '--recovered') {
      args.recovered = argv[index + 1] || '';
      index += 1;
    } else if (item === '--runtime-evidence') {
      args.runtimeEvidence = argv[index + 1] || '';
      index += 1;
    } else if (item === '--replay-record') {
      args.replayRecord = argv[index + 1] || '';
      index += 1;
    } else if (item === '--json') {
      args.json = true;
    } else if (item === '--help' || item === '-h') {
      usage();
    } else {
      usage();
    }
  }
  if (!args.original) usage();
  return args;
}

function resolveRepoPath(value) {
  const candidates = [
    path.resolve(value),
    path.join(rootDir, value),
    path.join(rootDir, 'public', value),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.resolve(value);
}

function readTextMaybe(file) {
  if (!file) return '';
  const resolved = resolveRepoPath(file);
  return fs.existsSync(resolved) ? fs.readFileSync(resolved, 'utf8') : '';
}

function readJsonMaybe(file) {
  if (!file) return null;
  const text = readTextMaybe(file);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_error) {
    return null;
  }
}

function findRiskSignals(model, text) {
  const haystack = String(text || '').toLowerCase();
  return (model.risk_signals || []).filter((signal) => {
    return (signal.patterns || []).some((pattern) => haystack.includes(String(pattern).toLowerCase()));
  }).map((signal) => ({
    id: signal.id,
    risk: signal.risk,
  }));
}

function hasRuntimeEvidence(data) {
  if (!data || typeof data !== 'object') return false;
  if (Array.isArray(data.observations) && data.observations.length) return true;
  if (Array.isArray(data.hook_events) && data.hook_events.length) return true;
  if (Array.isArray(data.captured_calls) && data.captured_calls.length) return true;
  if (data.provenance_status === 'runtime-captured' || data.status === 'runtime-captured') return true;
  return false;
}

function hasRuntimeDivergence(data) {
  if (!data || typeof data !== 'object') return false;
  const status = String(data.equivalence_status || data.static_equivalence_status || data.status || '').toLowerCase();
  if (['divergent', 'runtime-divergent', 'not-equivalent', 'mismatch'].includes(status)) return true;
  if (Array.isArray(data.mismatches) && data.mismatches.length) return true;
  const observations = Array.isArray(data.observations) ? data.observations : [];
  return observations.some((item) => item && item.matches_static === false);
}

function hasAcceptedReplay(data) {
  if (!data || typeof data !== 'object') return false;
  const status = String(data.acceptance_status || data.replay_acceptance_status || data.status || '').toLowerCase();
  return ['accepted', 'runtime-accepted', 'replay-verified', 'server-accepted'].includes(status);
}

function buildAssessment(args) {
  const model = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
  const original = readTextMaybe(args.original);
  const recovered = readTextMaybe(args.recovered);
  const runtimeEvidence = readJsonMaybe(args.runtimeEvidence);
  const replayRecord = readJsonMaybe(args.replayRecord);
  const riskSignals = findRiskSignals(model, `${original}\n${recovered}`);

  let state = model.default_gate.state_without_evidence;
  const promotionEvidence = [];
  if (hasRuntimeDivergence(runtimeEvidence)) {
    state = 'divergent';
    riskSignals.push({
      id: 'runtime-divergence',
      risk: 'Runtime evidence contradicts the readable static recovery output.',
    });
    promotionEvidence.push('runtime divergence present');
  } else if (hasRuntimeEvidence(runtimeEvidence)) {
    state = 'runtime-correlated';
    promotionEvidence.push('runtime evidence present');
  }
  if (state !== 'divergent' && hasAcceptedReplay(replayRecord)) {
    state = 'replay-verified';
    promotionEvidence.push('accepted replay record present');
  }

  const deliveryReady = (model.default_gate.allowed_delivery_ready_states || []).includes(state);
  return {
    schema: 'js-reverse-ops-static-recovery-truth-assessment-v1',
    generated_at: new Date().toISOString(),
    original: args.original,
    recovered: args.recovered || null,
    state,
    delivery_ready: deliveryReady,
    risk_signals: riskSignals,
    promotion_evidence: promotionEvidence,
    next_action: deliveryReady
      ? 'Static recovery is supported by replay/server acceptance and may be used in delivery artifacts.'
      : 'Keep static recovery claims inferred. Add hook evidence, paused-frame evidence, or accepted replay before promoting behavior.',
    boundary: model.default_gate.rule,
  };
}

function renderMarkdown(result) {
  const lines = [];
  lines.push('# Static Recovery Truth Assessment');
  lines.push('');
  lines.push(`- State: \`${result.state}\``);
  lines.push(`- Delivery ready: \`${result.delivery_ready}\``);
  lines.push(`- Boundary: ${result.boundary}`);
  lines.push('');
  lines.push('## Risk Signals');
  lines.push('');
  if (!result.risk_signals.length) lines.push('- none');
  for (const signal of result.risk_signals) lines.push(`- ${signal.id}: ${signal.risk}`);
  lines.push('');
  lines.push('## Next Action');
  lines.push('');
  lines.push(result.next_action);
  lines.push('');
  return lines.join('\n');
}

const args = parseArgs(process.argv.slice(2));
const result = buildAssessment(args);
process.stdout.write(args.json ? `${JSON.stringify(result, null, 2)}\n` : renderMarkdown(result));
