#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const args = { dir: '', hookEvidence: '', mcpRecord: '', json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--hook-evidence') {
      args.hookEvidence = argv[index + 1] || '';
      index += 1;
    } else if (item === '--mcp-record') {
      args.mcpRecord = argv[index + 1] || '';
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
    'Usage: node scripts/promote_delivery_evidence.js <run-dir> [--hook-evidence hook.json] [--mcp-record record.json] [--json]',
    '',
    'Promotes runtime hook or MCP execution evidence into a playbook-run delivery directory.',
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
  return {
    source: path.relative(baseDir, resolved),
    recorded_at: raw.generated_at || new Date().toISOString(),
    workflow_id: raw.workflow_id || null,
    run_status: raw.run_status || 'unknown',
    step_count: steps.length,
    completed_steps: steps.filter((item) => item.status === 'completed').length,
    failed_steps: steps.filter((item) => item.status === 'failed').length,
    steps,
  };
}

function promoteEvidence(evidence, hookEvidence, mcpRecord) {
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
  add('replay-not-validated', 'Replay parity is not validated by promoted hook evidence alone.', 'weak', ['runner']);
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
  } else {
    add('runtime-evidence-missing', 'high', 'runtime', 'No matched runtime evidence has been promoted.', 'Capture hook, request, or paused-frame evidence before replay work.');
  }
  add('replay-not-validated', 'medium', 'replay', 'Hook evidence does not prove accepted replay parity.', 'Run replay validation and record divergence before marking replay accepted.');
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
  return {
    schema: 'js-reverse-ops-provenance-graph-v1',
    source: 'promote-delivery-evidence',
    target,
    generated_at: new Date().toISOString(),
    status: (evidence.hook_evidence || {}).matched_observation_count > 0 ? 'runtime-captured' : 'bootstrap-only',
    nodes,
    edges,
    field_status: fieldStatus,
    unresolved: ['accepted replay not validated'],
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
    `- Claims: \`${claims.summary.verified} verified / ${claims.summary.inferred} inferred / ${claims.summary.weak} weak\``,
    `- Risks: \`${risks.summary.high} high / ${risks.summary.medium} medium / ${risks.summary.low} low\``,
    `- Provenance: \`${provenance.status}\``,
    '',
    '## Next Best Actions',
    '',
    '- Use promoted hook fields and cookies as provenance anchors.',
    '- Run replay validation before changing replay-status to accepted.',
    '- Keep unresolved replay divergence explicit.',
    '',
  ].join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.dir || (!args.hookEvidence && !args.mcpRecord)) {
    console.log(usage());
    process.exit(args.help ? 0 : 1);
  }
  const dir = path.resolve(args.dir);
  const evidencePath = path.join(dir, 'evidence.json');
  const playbookPath = path.join(dir, 'playbook-run.json');
  const playbook = fs.existsSync(playbookPath) ? readJson(playbookPath) : {};
  const target = playbook.target || dir;
  const hookEvidence = normalizeHookEvidence(args.hookEvidence, dir);
  const mcpRecord = normalizeMcpRecord(args.mcpRecord, dir);
  const evidence = promoteEvidence(readJson(evidencePath), hookEvidence, mcpRecord);
  const claims = buildClaimSet(evidence, target);
  const risks = buildRiskSummary(evidence, target);
  const provenance = buildProvenance(evidence, target);
  writeJson(evidencePath, evidence);
  writeJson(path.join(dir, 'claim-set.json'), claims);
  writeJson(path.join(dir, 'risk-summary.json'), risks);
  writeJson(path.join(dir, 'provenance-graph.json'), provenance);
  fs.writeFileSync(path.join(dir, 'provenance-summary.md'), renderProvenanceSummary(provenance));
  fs.writeFileSync(path.join(dir, 'operator-review.md'), renderOperatorReview(evidence, claims, risks, provenance));
  const summary = {
    dir,
    runtime_status: evidence.runtime_evidence?.status || null,
    matched_hook_observations: evidence.hook_evidence?.matched_observation_count || 0,
    claim_summary: claims.summary,
    risk_summary: risks.summary,
    provenance_status: provenance.status,
  };
  process.stdout.write(args.json ? `${JSON.stringify(summary, null, 2)}\n` : `promoted delivery evidence: ${summary.provenance_status}\n`);
}

main();
