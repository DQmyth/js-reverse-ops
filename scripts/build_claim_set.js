#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function usage() {
  console.error('Usage: build_claim_set.js <evidence.json> [--output <claim-set.json>]');
  process.exit(1);
}

const args = process.argv.slice(2);
if (!args.length) usage();

const inputPath = args[0];
let outputPath = '';
for (let i = 1; i < args.length; i += 1) {
  if (args[i] === '--output') outputPath = args[++i] || '';
  else usage();
}

const evidence = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const runtime = evidence.runtime_evidence || {};
const request = runtime.request || {};
const staticEvidence = evidence.static_evidence || {};
const hookEvidence = evidence.hook_evidence || {};
const mcpExecution = evidence.mcp_execution || {};
const challengeSuccess = evidence.challenge_success || {};
const publicWriteupFacts = evidence.public_writeup_facts || {};
const familyDecision = staticEvidence.family_decision || {};
const runtimeEndpoint = (() => {
  try {
    return new URL(request.url || '').pathname;
  } catch {
    return null;
  }
})();

function makeClaim(id, statement, strength, evidenceSources, notes = [], conflicts = []) {
  return {
    claim_id: id,
    statement,
    strength,
    evidence_sources: evidenceSources,
    conflicts,
    notes,
    last_verified_at: runtime.validated_at || null,
  };
}

const claims = [];
claims.push(
  makeClaim(
    'runtime-family',
    `The target runtime family is ${runtime.family_runtime || 'unknown'}.`,
    runtime.family_runtime ? 'verified' : 'weak',
    runtime.family_runtime ? ['network'] : ['static'],
    [`Topic ${runtime.topic || 'unknown'}`]
  )
);

if (request.method && runtimeEndpoint) {
  claims.push(
    makeClaim(
      'protected-endpoint',
      request.asset_only
        ? `Observed asset/bootstrap runtime request: ${request.method} ${runtimeEndpoint}.`
        : `The protected request is ${request.method} ${runtimeEndpoint}.`,
      request.asset_only ? 'inferred' : request.status === 200 ? 'verified' : 'inferred',
      request.asset_only ? ['network'] : request.status === 200 ? ['network', 'server_acceptance'] : ['network'],
      request.asset_only
        ? ['The captured runtime sample is asset-only and does not yet prove accepted protected-request parity.']
        : request.status === 200
          ? []
          : ['The captured runtime sample did not receive a success status.']
    )
  );
}

if ((request.fields || []).length) {
  claims.push(
    makeClaim(
      'request-fields',
      `Observed request fields: ${(request.fields || []).join(', ')}.`,
      'verified',
      ['network'],
      []
    )
  );
}

if ((request.headers || []).length) {
  claims.push(
    makeClaim(
      'request-headers',
      `Observed request headers include ${(request.headers || []).join(', ')}.`,
      'verified',
      ['network'],
      []
    )
  );
}

if (runtime.helper_page && runtime.helper_page.endpoint) {
  claims.push(
    makeClaim(
      'helper-endpoint-separate',
      `The page exposes helper endpoint ${runtime.helper_page.endpoint}, but it is separate from the protected request.`,
      request.status === 200 ? 'verified' : 'inferred',
      request.status === 200 ? ['network', 'static'] : ['static'],
      [],
      runtimeEndpoint ? [`Protected endpoint is ${runtimeEndpoint}`] : []
    )
  );
}

if (runtime.launcher_page && runtime.data_page) {
  claims.push(
    makeClaim(
      'launcher-data-split',
      `The visible launcher page hands off to a separate data app shell.`,
      'verified',
      ['network', 'static'],
      [`${runtime.launcher_page} -> ${runtime.data_page}`]
    )
  );
}

if (challengeSuccess.executed_at) {
  const challengeType = ((challengeSuccess.challenge || {}).type) || 'challenge-success';
  const challengeStrength =
    challengeSuccess.archival_public
      ? 'verified'
      : challengeSuccess.local_harness
        ? 'inferred'
        : 'verified';
  claims.push(
    makeClaim(
      'external-challenge-solved',
      challengeSuccess.archival_public
        ? `An archival challenge-success path was reproduced for ${challengeType}.`
        : challengeSuccess.local_harness
          ? `A local-harness challenge-success path was reproduced for ${challengeType}.`
          : `A live challenge-success path was reproduced for ${challengeType}.`,
      challengeStrength,
      challengeSuccess.archival_public ? ['challenge-success', 'archival'] : ['challenge-success'],
      challengeSuccess.notes || []
    )
  );

  if (
    (challengeSuccess.evidence || {}).solver ||
    (challengeSuccess.evidence || {}).symbol_map ||
    Array.isArray((challengeSuccess.evidence || {}).grid)
  ) {
    claims.push(
      makeClaim(
        'external-solver-route-preserved',
        'A full archival solver route is preserved across writeup facts, symbol mapping, solver logic, and solved output.',
        'verified',
        ['challenge-success', 'archival'],
        [
          (challengeSuccess.evidence || {}).writeup_facts,
          (challengeSuccess.evidence || {}).symbol_map,
          (challengeSuccess.evidence || {}).solver,
        ].filter(Boolean)
      )
    );
  }

  if (challengeSuccess.archival_public) {
    claims.push(
      makeClaim(
        'external-archival-challenge-success',
        'This challenge-success proof is archival and public-writeup-backed, not live remote parity.',
        'verified',
        ['challenge-success', 'archival'],
        challengeSuccess.notes || []
      )
    );
  }

  if (challengeSuccess.local_harness) {
    claims.push(
      makeClaim(
        'external-local-harness-route',
        'A minimal local-harness route has been preserved as the current proof path for this challenge.',
        'verified',
        ['challenge-success', 'local-harness'],
        challengeSuccess.notes || []
      )
    );
    claims.push(
      makeClaim(
        'external-local-proof-only',
        'The current challenge-success proof is local-only and should not be treated as live remote parity or replay verification.',
        'verified',
        ['challenge-success', 'local-harness'],
        ['Promotion beyond local proof requires a surviving accepted remote path.']
      )
    );
    if ((challengeSuccess.evidence || {}).harness_entrypoint) {
      claims.push(
        makeClaim(
          'external-harness-entrypoint-preserved',
          'The local harness entrypoint has been preserved as first-class challenge-success evidence.',
          'verified',
          ['challenge-success', 'local-harness'],
          [String((challengeSuccess.evidence || {}).harness_entrypoint)]
        )
      );
    }
  }
}

if (publicWriteupFacts.artifact) {
  const sourceType = ((publicWriteupFacts.source || {}).type) || 'public-writeup';
  const criticalPaths = publicWriteupFacts.critical_paths || [];
  claims.push(
    makeClaim(
      'external-public-facts-preserved',
      `Public archival reverse facts were preserved from ${sourceType}.`,
      'verified',
      ['archival'],
      criticalPaths.length ? [`critical paths: ${criticalPaths.join(', ')}`] : []
    )
  );
}

for (const contract of (staticEvidence.request_contracts || [])) {
  const endpoint = ((contract.inferred || {}).endpoint) || null;
  const sourceName = path.basename(contract.file || '');
  if (!endpoint) {
    claims.push(
      makeClaim(
        `static-contract-${sourceName || 'unknown'}`,
        `Static request contract ${sourceName || 'unknown'} did not directly recover the protected endpoint.`,
        'weak',
        ['static'],
        [],
        runtimeEndpoint ? [`Runtime endpoint is ${runtimeEndpoint}`] : []
      )
    );
  } else {
    claims.push(
      makeClaim(
        `static-contract-${sourceName || endpoint}`,
        `Static request contract ${sourceName || 'unknown'} suggests endpoint ${endpoint}.`,
        endpoint === runtimeEndpoint ? 'verified' : 'inferred',
        ['static'].concat(endpoint === runtimeEndpoint ? ['network'] : []),
        endpoint === runtimeEndpoint ? [] : ['Static endpoint differs from runtime-protected endpoint.'],
        endpoint === runtimeEndpoint || !runtimeEndpoint ? [] : [`Runtime endpoint is ${runtimeEndpoint}`]
      )
    );
  }
}

for (const contract of (staticEvidence.page_contracts || [])) {
  if ((contract.inferred || {}).helper_endpoint_risk) {
    claims.push(
      makeClaim(
        `helper-risk-${path.basename(contract.file || 'page-contract')}`,
        `Page contract ${path.basename(contract.file || 'unknown')} is likely exposing a helper endpoint rather than the protected request.`,
        request.status === 200 ? 'verified' : 'inferred',
        request.status === 200 ? ['network', 'static'] : ['static'],
        [],
        runtimeEndpoint ? [`Protected endpoint is ${runtimeEndpoint}`] : []
      )
    );
  }
}

if ((familyDecision.detected_risks || []).length) {
  claims.push(
    makeClaim(
      'risk-profile',
      `Detected risks: ${(familyDecision.detected_risks || []).join(', ')}.`,
      'inferred',
      ['static', 'network'],
      familyDecision.workflow_recommendation ? [familyDecision.workflow_recommendation] : []
    )
  );
}

if ((hookEvidence.observations || []).length) {
  const matched = (hookEvidence.observations || []).filter((item) => item.matches_target || (item.cookies || []).length || (item.fields || []).length);
  claims.push(
    makeClaim(
      'hook-evidence-present',
      `Hook evidence captured ${matched.length || 0} matched observation(s) across ${hookEvidence.observation_count || (hookEvidence.observations || []).length} total observation(s).`,
      matched.length ? 'verified' : 'inferred',
      matched.length ? ['hook'] : ['hook', 'static'],
      hookEvidence.presets && hookEvidence.presets.length ? [`presets: ${hookEvidence.presets.join(', ')}`] : []
    )
  );

  const cookieNames = [...new Set((hookEvidence.observations || []).flatMap((item) => item.cookies || []).map((item) => item.name).filter(Boolean))];
  if (cookieNames.length) {
    claims.push(
      makeClaim(
        'hook-cookie-generation',
        `Hook evidence observed cookie generation or mutation for ${cookieNames.join(', ')}.`,
        'verified',
        ['hook'],
        []
      )
    );
  }
}

if (mcpExecution.run_status) {
  const completed = mcpExecution.completed_steps || 0;
  const total = mcpExecution.step_count || 0;
  const policyStatus = ((mcpExecution.policy_summary || {}).status) || 'none';
  const strength = mcpExecution.run_status === 'completed'
    ? 'verified'
    : mcpExecution.run_status === 'failed'
      ? 'inferred'
      : 'weak';
  claims.push(
    makeClaim(
      'mcp-execution-record',
      `MCP execution workflow ${mcpExecution.workflow_id || 'unknown'} completed ${completed}/${total} step(s) with run status ${mcpExecution.run_status}.`,
      strength,
      ['mcp-execution'],
      mcpExecution.artifact ? [`artifact: ${mcpExecution.artifact}`] : []
    )
  );

  if (mcpExecution.run_status === 'not-started' && policyStatus === 'action-suppressed-by-capability-focus') {
    claims.push(
      makeClaim(
        'mcp-execution-intentionally-suppressed',
        `MCP execution for workflow ${mcpExecution.workflow_id || 'unknown'} was intentionally suppressed by current bundle policy rather than omitted by accident.`,
        'verified',
        ['mcp-execution'],
        [mcpExecution.action_generation_summary || (mcpExecution.policy_summary || {}).reason || 'policy-driven suppression']
      )
    );
  } else if (mcpExecution.run_status === 'not-started') {
    claims.push(
      makeClaim(
        'mcp-execution-not-started',
        `MCP execution for workflow ${mcpExecution.workflow_id || 'unknown'} has not started yet.`,
        'weak',
        ['mcp-execution'],
        [mcpExecution.action_generation_summary || 'No execution record steps were completed.']
      )
    );
  }
}

const result = {
  source: path.resolve(inputPath),
  topic: runtime.topic || null,
  generated_at: new Date().toISOString(),
  claims,
  summary: {
    verified: claims.filter((item) => item.strength === 'verified').length,
    inferred: claims.filter((item) => item.strength === 'inferred').length,
    weak: claims.filter((item) => item.strength === 'weak').length,
  },
};

const json = JSON.stringify(result, null, 2);
if (outputPath) fs.writeFileSync(outputPath, `${json}\n`, 'utf8');
console.log(json);
