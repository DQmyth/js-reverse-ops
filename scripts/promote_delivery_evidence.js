#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const args = { dir: '', hookEvidence: '', mcpRecord: '', replayRecord: '', json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--hook-evidence') {
      args.hookEvidence = argv[index + 1] || '';
      index += 1;
    } else if (item === '--mcp-record') {
      args.mcpRecord = argv[index + 1] || '';
      index += 1;
    } else if (item === '--replay-record') {
      args.replayRecord = argv[index + 1] || '';
      index += 1;
    } else if (item === '--json') {
      args.json = true;
    } else if (item === '--help' || item === '-h') {
      args.help = true;
    } else if (!args.dir) {
      args.dir = item;
    }
  }
  return args;
}

function usage() {
  return [
    'Usage: node scripts/promote_delivery_evidence.js <run-dir> [--hook-evidence hook.json] [--mcp-record record.json] [--replay-record replay.json] [--json]',
    '',
    'Promotes runtime hook, MCP execution, or replay evidence into a playbook-run delivery directory.',
  ].join('\n');
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function resolveInputPath(file, baseDir) {
  const candidates = path.isAbsolute(file)
    ? [file]
    : [
        path.resolve(process.cwd(), file),
        path.resolve(baseDir, file),
        path.resolve(rootDir, file),
        path.resolve(rootDir, 'public', file),
      ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

function writeJson(file, data) {
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function normalizeHookEvidence(file, baseDir) {
  if (!file) return null;
  const resolved = resolveInputPath(file, baseDir);
  const raw = readJson(resolved);
  const observations = raw.observations || [];
  const matched = observations.filter((item) => item.matches_target || (item.cookies || []).length || (item.fields || []).length);
  return {
    source: path.relative(baseDir, resolved),
    generated_at: raw.generated_at || new Date().toISOString(),
    capture_mode: raw.capture_mode || 'summary',
    preload_used: !!raw.preload_used,
    presets: raw.presets || [],
    observation_count: observations.length,
    matched_observation_count: matched.length,
    observations,
  };
}

function normalizeMcpRecord(file, baseDir) {
  if (!file) return null;
  const resolved = resolveInputPath(file, baseDir);
  const raw = readJson(resolved);
  const steps = raw.step_results || [];
  const completed = steps.filter((item) => ['completed', 'observed', 'success', 'ok'].includes(String(item.status || '').toLowerCase()));
  return {
    source: path.relative(baseDir, resolved),
    recorded_at: raw.generated_at || new Date().toISOString(),
    workflow_id: raw.workflow_id || null,
    run_status: raw.run_status || 'unknown',
    step_count: steps.length,
    completed_steps: completed.length,
    failed_steps: steps.filter((item) => item.status === 'failed').length,
    steps,
  };
}

function normalizeReplayRecord(file, baseDir) {
  if (!file) return null;
  const resolved = resolveInputPath(file, baseDir);
  const raw = readJson(resolved);
  const samples = raw.samples || [];
  const quality = assessReplayQuality(raw, samples);
  return {
    source: path.relative(baseDir, resolved),
    recorded_at: raw.generated_at || new Date().toISOString(),
    validation_method: raw.validation_method || 'unknown',
    status: quality.accepted ? 'verified' : (quality.acceptance_status === 'rejected' ? 'failed' : (raw.status || 'partial')),
    acceptance_status: quality.accepted ? 'accepted' : quality.acceptance_status,
    sample_count: samples.length,
    accepted_sample_count: quality.accepted_sample_count,
    divergence_count: quality.divergence_count,
    quality,
    samples,
  };
}

function assessReplayQuality(raw, samples) {
  const errors = [];
  const warnings = [];
  const acceptedSamples = samples.filter((item) => item.accepted || item.acceptance_status === 'accepted');
  let divergenceCount = typeof raw.divergence_count === 'number' ? raw.divergence_count : 0;
  if (raw.acceptance_status === 'accepted' && !acceptedSamples.length) {
    errors.push('accepted replay record has no accepted samples');
  }
  for (const [index, sample] of samples.entries()) {
    const label = sample.id || `sample-${index + 1}`;
    if (sample.divergence) divergenceCount += 1;
    if (sample.accepted || sample.acceptance_status === 'accepted') {
      if (!sample.method) errors.push(`${label} accepted sample missing method`);
      if (!sample.url) errors.push(`${label} accepted sample missing url`);
      if (typeof sample.status_code === 'number' && (sample.status_code < 200 || sample.status_code >= 300)) {
        errors.push(`${label} accepted sample has non-2xx status ${sample.status_code}`);
      }
      const expected = Array.isArray(sample.expected_shape) ? sample.expected_shape : [];
      const observed = Array.isArray(sample.observed_shape) ? sample.observed_shape : [];
      const missing = expected.filter((item) => !observed.includes(item));
      if (missing.length) {
        divergenceCount += 1;
        errors.push(`${label} observed shape missing ${missing.join(', ')}`);
      }
    }
  }
  if (raw.acceptance_status === 'accepted' && divergenceCount > 0) {
    errors.push(`accepted replay record has ${divergenceCount} divergence(s)`);
  }
  if (!samples.length) warnings.push('replay record has no samples');
  const accepted = raw.acceptance_status === 'accepted' && acceptedSamples.length > 0 && divergenceCount === 0 && errors.length === 0;
  return {
    accepted,
    acceptance_status: accepted ? 'accepted' : (raw.acceptance_status === 'accepted' ? 'rejected' : (raw.acceptance_status || 'not-tested')),
    accepted_sample_count: acceptedSamples.length,
    divergence_count: divergenceCount,
    errors,
    warnings,
  };
}

function isReplayAccepted(replayRecord) {
  return !!replayRecord && replayRecord.quality?.accepted === true;
}

function promoteEvidence(evidence, hookEvidence, mcpRecord, replayRecord) {
  const promotedAt = new Date().toISOString();
  if (hookEvidence) {
    evidence.hook_evidence = hookEvidence;
    if (hookEvidence.matched_observation_count > 0) {
      evidence.runtime_evidence = evidence.runtime_evidence || {};
      evidence.runtime_evidence.status = 'runtime-captured';
      evidence.runtime_evidence.validated_at = promotedAt;
      evidence.runtime_evidence.request = evidence.runtime_evidence.request || {};
      const matched = hookEvidence.observations.find((item) => item.matches_target) || hookEvidence.observations[0] || {};
      evidence.runtime_evidence.request.url = matched.url || evidence.runtime_evidence.request.url || null;
      evidence.runtime_evidence.request.method = matched.method || evidence.runtime_evidence.request.method || null;
      evidence.runtime_evidence.request.fields = unique([...(evidence.runtime_evidence.request.fields || []), ...(matched.fields || [])]);
    }
  }
  if (mcpRecord) evidence.mcp_execution = mcpRecord;
  if (replayRecord) {
    evidence.replay_evidence = {
      status: isReplayAccepted(replayRecord) ? 'verified' : replayRecord.status,
      acceptance_status: replayRecord.acceptance_status,
      validation_method: replayRecord.validation_method,
      sample_count: replayRecord.sample_count,
      accepted_sample_count: replayRecord.accepted_sample_count,
      divergence_count: replayRecord.divergence_count,
      quality: replayRecord.quality,
      source: replayRecord.source,
      samples: replayRecord.samples,
    };
    if (isReplayAccepted(replayRecord)) {
      evidence.runtime_evidence = evidence.runtime_evidence || {};
      evidence.runtime_evidence.status = 'runtime-accepted';
      evidence.runtime_evidence.accepted_at = promotedAt;
    }
  }
  if (!Array.isArray(evidence.notes)) evidence.notes = evidence.notes ? [evidence.notes] : [];
  evidence.notes.push(`delivery evidence promoted at ${promotedAt}`);
  return evidence;
}

function buildClaimSet(evidence, target) {
  const claims = [];
  function add(claim_id, statement, strength, evidence_sources, notes = []) {
    claims.push({ claim_id, statement, strength, evidence_sources, conflicts: [], notes, last_verified_at: evidence.runtime_evidence?.validated_at || null });
  }
  add('runtime-family', `The selected runtime family is ${evidence.runtime_evidence?.family_runtime || 'unknown'}.`, 'inferred', ['router']);
  if ((evidence.hook_evidence || {}).matched_observation_count > 0) {
    add('hook-evidence-promoted', `Hook evidence captured ${(evidence.hook_evidence || {}).matched_observation_count} matched observation(s).`, 'verified', ['hook']);
    const fields = unique((evidence.hook_evidence.observations || []).flatMap((item) => item.fields || []));
    if (fields.length) add('hook-fields-observed', `Hook evidence observed fields: ${fields.join(', ')}.`, 'verified', ['hook']);
    const cookies = unique((evidence.hook_evidence.observations || []).flatMap((item) => item.cookies || []).map((item) => item.name));
    if (cookies.length) add('hook-cookies-observed', `Hook evidence observed cookies: ${cookies.join(', ')}.`, 'verified', ['hook']);
  } else {
    add('runtime-evidence-pending', 'Runtime evidence has not yet been promoted.', 'weak', ['runner']);
  }
  if ((evidence.mcp_execution || {}).run_status) {
    const mcp = evidence.mcp_execution;
    add('mcp-execution-promoted', `MCP execution record status is ${mcp.run_status}; completed ${mcp.completed_steps || 0}/${mcp.step_count || 0} step(s).`, mcp.run_status === 'completed' ? 'verified' : 'inferred', ['mcp-execution']);
  }
  if ((evidence.replay_evidence || {}).acceptance_status === 'accepted') {
    add('replay-accepted', `Replay accepted ${evidence.replay_evidence.accepted_sample_count || 0}/${evidence.replay_evidence.sample_count || 0} sample(s) with ${evidence.replay_evidence.divergence_count || 0} divergence(s).`, 'verified', ['replay']);
  } else if (evidence.replay_evidence) {
    const errors = (evidence.replay_evidence.quality || {}).errors || [];
    add('replay-not-accepted', `Replay evidence is ${evidence.replay_evidence.acceptance_status || 'not-tested'} with ${errors.length} quality error(s).`, 'weak', ['replay'], errors);
  } else {
    add('replay-not-validated', 'Replay parity is not validated by promoted hook evidence alone.', 'weak', ['runner']);
  }
  return {
    schema: 'js-reverse-ops-claim-set-v1',
    source: 'promote-delivery-evidence',
    target,
    generated_at: new Date().toISOString(),
    claims,
    summary: {
      verified: claims.filter((item) => item.strength === 'verified').length,
      inferred: claims.filter((item) => item.strength === 'inferred').length,
      weak: claims.filter((item) => item.strength === 'weak').length,
    },
  };
}

function buildRiskSummary(evidence, target) {
  const risks = [];
  function add(id, severity, category, reason, next_action) {
    risks.push({ id, severity, category, reason, next_action });
  }
  if ((evidence.hook_evidence || {}).matched_observation_count > 0) {
    add('hook-evidence-present', 'low', 'runtime', 'Matched hook evidence has been promoted into the delivery directory.', 'Use promoted fields and cookies to close provenance and replay parity.');
  } else if ((evidence.mcp_execution || {}).run_status === 'completed' && (evidence.mcp_execution.completed_steps || 0) > 0) {
    add('mcp-execution-present', 'low', 'runtime', 'Sanitized MCP execution evidence has been promoted into the delivery directory.', 'Use MCP observations as runtime surface evidence, then collect field-level hook or replay evidence.');
  } else {
    add('runtime-evidence-missing', 'high', 'runtime', 'No matched runtime evidence has been promoted.', 'Capture hook, request, or paused-frame evidence before replay work.');
  }
  if ((evidence.replay_evidence || {}).acceptance_status === 'accepted') {
    add('replay-accepted', 'low', 'replay', 'Replay evidence reports accepted samples with no recorded divergence.', 'Preserve replay input/output samples with the final solver.');
  } else if (evidence.replay_evidence) {
    const errors = (evidence.replay_evidence.quality || {}).errors || [];
    add('replay-not-accepted', 'high', 'replay', `Replay evidence did not pass acceptance quality checks: ${errors.join('; ') || 'not accepted'}.`, 'Fix replay divergence before marking runtime accepted.');
  } else {
    add('replay-not-validated', 'medium', 'replay', 'Hook evidence does not prove accepted replay parity.', 'Run replay validation and record divergence before marking replay accepted.');
  }
  return {
    schema: 'js-reverse-ops-risk-summary-v1',
    source: 'promote-delivery-evidence',
    target,
    generated_at: new Date().toISOString(),
    risks,
    summary: {
      high: risks.filter((item) => item.severity === 'high').length,
      medium: risks.filter((item) => item.severity === 'medium').length,
      low: risks.filter((item) => item.severity === 'low').length,
    },
  };
}

function buildProvenance(evidence, target) {
  const nodes = [{ id: 'target', type: 'target', label: target }];
  const edges = [];
  const fieldStatus = {};
  const mcpObserved = (evidence.mcp_execution || {}).run_status === 'completed' && (evidence.mcp_execution.completed_steps || 0) > 0;
  if ((evidence.hook_evidence || {}).matched_observation_count > 0) {
    nodes.push({ id: 'hook:evidence', type: 'hook-evidence', label: 'promoted hook evidence' });
    edges.push({ from: 'hook:evidence', to: 'target', relation: 'observes_runtime', strength: 'verified', basis: 'hook evidence' });
    for (const observation of evidence.hook_evidence.observations || []) {
      const obsId = `hook:${observation.id || observation.surface || 'observation'}`;
      nodes.push({ id: obsId, type: 'hook-observation', label: observation.surface || observation.id || 'hook observation' });
      edges.push({ from: obsId, to: 'hook:evidence', relation: 'part_of', strength: observation.matches_target ? 'verified' : 'inferred', basis: 'hook evidence' });
      for (const field of observation.fields || []) {
        const id = `field:${field}`;
        nodes.push({ id, type: 'field', label: field });
        edges.push({ from: obsId, to: id, relation: 'observes_field', strength: observation.matches_target ? 'verified' : 'inferred', basis: 'hook evidence' });
        fieldStatus[field] = observation.matches_target ? 'direct' : 'partial';
      }
      for (const cookie of observation.cookies || []) {
        const id = `cookie:${cookie.name}`;
        nodes.push({ id, type: 'cookie', label: cookie.name, value_preview: cookie.value_preview || null });
        edges.push({ from: obsId, to: id, relation: 'observes_cookie', strength: 'verified', basis: 'hook evidence' });
        fieldStatus[cookie.name] = 'direct';
      }
    }
  }
  if (mcpObserved) {
    nodes.push({ id: 'mcp:execution', type: 'mcp-execution', label: 'promoted MCP execution evidence' });
    edges.push({ from: 'mcp:execution', to: 'target', relation: 'observes_runtime_surface', strength: 'verified', basis: 'mcp execution record' });
  }
  if ((evidence.replay_evidence || {}).acceptance_status === 'accepted') {
    nodes.push({ id: 'replay:accepted', type: 'replay', label: 'accepted replay evidence' });
    edges.push({ from: 'replay:accepted', to: 'target', relation: 'accepted_by_target', strength: 'verified', basis: 'replay evidence' });
    if (nodes.find((item) => item.id === 'hook:evidence')) {
      edges.push({ from: 'replay:accepted', to: 'hook:evidence', relation: 'validates_runtime_capture', strength: 'verified', basis: 'replay evidence' });
    }
  }
  return {
    schema: 'js-reverse-ops-provenance-graph-v1',
    source: 'promote-delivery-evidence',
    target,
    generated_at: new Date().toISOString(),
    status: (evidence.replay_evidence || {}).acceptance_status === 'accepted'
      ? 'runtime-accepted'
      : (((evidence.hook_evidence || {}).matched_observation_count > 0 || mcpObserved) ? 'runtime-captured' : 'bootstrap-only'),
    nodes,
    edges,
    field_status: fieldStatus,
    unresolved: (evidence.replay_evidence || {}).acceptance_status === 'accepted' ? [] : ['accepted replay not validated'],
  };
}

function buildReplayStatus(evidence, target, existingReplayStatus) {
  const replay = evidence.replay_evidence || {};
  if (!evidence.replay_evidence) return existingReplayStatus;
  return {
    schema: 'js-reverse-ops-replay-status-v1',
    target,
    generated_at: new Date().toISOString(),
    previous_status: existingReplayStatus ? {
      status: existingReplayStatus.status || null,
      acceptance_status: existingReplayStatus.acceptance_status || null,
    } : null,
    status: replay.acceptance_status === 'accepted' ? (replay.status || 'verified') : 'failed',
    acceptance_status: replay.acceptance_status,
    validation_method: replay.validation_method || 'unknown',
    sample_count: replay.sample_count || 0,
    accepted_sample_count: replay.accepted_sample_count || 0,
    divergence_count: replay.divergence_count || 0,
    evidence_source: replay.source || null,
    quality: replay.quality || null,
    required_before_replay: [],
  };
}

function renderProvenanceSummary(provenance) {
  const lines = ['# Provenance Summary', '', `- Status: \`${provenance.status}\``, `- Nodes: \`${provenance.nodes.length}\``, `- Edges: \`${provenance.edges.length}\``, '', '## Field Status', ''];
  const entries = Object.entries(provenance.field_status || {});
  if (!entries.length) lines.push('- none');
  for (const [field, status] of entries) lines.push(`- ${field}: \`${status}\``);
  lines.push('');
  return lines.join('\n');
}

function renderOperatorReview(evidence, claims, risks, provenance) {
  return [
    '# Operator Review',
    '',
    `- Runtime status: \`${evidence.runtime_evidence?.status || 'unknown'}\``,
    `- Hook observations: \`${evidence.hook_evidence?.matched_observation_count || 0}/${evidence.hook_evidence?.observation_count || 0}\``,
    `- Replay: \`${evidence.replay_evidence?.acceptance_status || 'not-tested'}\``,
    `- Claims: \`${claims.summary.verified} verified / ${claims.summary.inferred} inferred / ${claims.summary.weak} weak\``,
    `- Risks: \`${risks.summary.high} high / ${risks.summary.medium} medium / ${risks.summary.low} low\``,
    `- Provenance: \`${provenance.status}\``,
    '',
    '## Next Best Actions',
    '',
    '- Use promoted hook fields and cookies as provenance anchors.',
    evidence.replay_evidence?.acceptance_status === 'accepted' ? '- Preserve accepted replay samples with the final solver.' : '- Run replay validation before changing replay-status to accepted.',
    evidence.replay_evidence?.acceptance_status === 'accepted' ? '- Keep replay evidence linked to the final solver artifacts.' : '- Keep unresolved replay divergence explicit.',
    '',
  ].join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.dir || (!args.hookEvidence && !args.mcpRecord && !args.replayRecord)) {
    console.log(usage());
    process.exit(args.help ? 0 : 1);
  }
  const dir = path.resolve(args.dir);
  const evidencePath = path.join(dir, 'evidence.json');
  const playbookPath = path.join(dir, 'playbook-run.json');
  const replayStatusPath = path.join(dir, 'replay-status.json');
  const playbook = fs.existsSync(playbookPath) ? readJson(playbookPath) : {};
  const target = playbook.target || dir;
  const hookEvidence = normalizeHookEvidence(args.hookEvidence, dir);
  const mcpRecord = normalizeMcpRecord(args.mcpRecord, dir);
  const replayRecord = normalizeReplayRecord(args.replayRecord, dir);
  const existingReplayStatus = fs.existsSync(replayStatusPath) ? readJson(replayStatusPath) : null;
  const evidence = promoteEvidence(readJson(evidencePath), hookEvidence, mcpRecord, replayRecord);
  const claims = buildClaimSet(evidence, target);
  const risks = buildRiskSummary(evidence, target);
  const provenance = buildProvenance(evidence, target);
  const replayStatus = buildReplayStatus(evidence, target, existingReplayStatus);
  writeJson(evidencePath, evidence);
  writeJson(path.join(dir, 'claim-set.json'), claims);
  writeJson(path.join(dir, 'risk-summary.json'), risks);
  writeJson(path.join(dir, 'provenance-graph.json'), provenance);
  if (replayStatus) writeJson(replayStatusPath, replayStatus);
  fs.writeFileSync(path.join(dir, 'provenance-summary.md'), renderProvenanceSummary(provenance));
  fs.writeFileSync(path.join(dir, 'operator-review.md'), renderOperatorReview(evidence, claims, risks, provenance));
  const summary = {
    dir,
    runtime_status: evidence.runtime_evidence?.status || null,
    matched_hook_observations: evidence.hook_evidence?.matched_observation_count || 0,
    replay_acceptance_status: evidence.replay_evidence?.acceptance_status || null,
    replay_quality_errors: evidence.replay_evidence?.quality?.errors || [],
    claim_summary: claims.summary,
    risk_summary: risks.summary,
    provenance_status: provenance.status,
  };
  process.stdout.write(args.json ? `${JSON.stringify(summary, null, 2)}\n` : `promoted delivery evidence: ${summary.provenance_status}\n`);
}

main();
