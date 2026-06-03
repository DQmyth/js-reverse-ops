#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const args = {
    target: '',
    notes: '',
    out: '',
    execute: false,
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
    } else if (item === '--execute') {
      args.execute = true;
    } else if (item === '--json') {
      args.json = true;
    } else if (item === '--help' || item === '-h') {
      args.help = true;
    } else if (!args.target) {
      args.target = item;
    }
  }
  return args;
}

function usage() {
  return [
    'Usage: node scripts/run_playbook.js <target-url-or-file> [--notes notes.md] [--out dir] [--execute] [--json]',
    '',
    'Turns router and playbook output into a concrete run directory.',
    'Default mode is dry-run: it writes the plan, hook scaffold, and command list without executing target scripts.',
  ].join('\n');
}

function safeTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function runJson(script, args) {
  const output = execFileSync(process.execPath, [path.join(rootDir, script), ...args, '--json'], {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(output);
}

function commandToArgv(command) {
  return command.match(/"[^"]*"|'[^']*'|\S+/g)
    .map((item) => item.replace(/^['"]|['"]$/g, ''));
}

function isExecutableLocalCommand(command) {
  const argv = commandToArgv(command);
  const script = argv.find((item) => item.startsWith('scripts/')) || '';
  if (!script) return false;
  if (/start_debug_browser|check_debug_browser|check_js_reverse_ops_deps|check_local_js_reverse_mcp/.test(script)) return false;
  return true;
}

function executeCommand(command) {
  const argv = commandToArgv(command);
  const bin = argv.shift();
  try {
    const stdout = execFileSync(bin, argv, {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { command, status: 'ok', stdout: stdout.slice(0, 20000), stderr: '' };
  } catch (error) {
    return {
      command,
      status: 'failed',
      exit_code: error.status || 1,
      stdout: String(error.stdout || '').slice(0, 20000),
      stderr: String(error.stderr || error.message || '').slice(0, 20000),
    };
  }
}

function buildEvidence(plan, runContext) {
  return {
    schema: 'js-reverse-ops-bootstrap-evidence-v1',
    created_at: runContext.created_at,
    target: runContext.target,
    notes: runContext.notes || '',
    runtime_evidence: {
      status: 'not-collected',
      family_runtime: plan.family,
      request: {
        status: null,
        url: null,
        method: null,
        fields: [],
        headers: [],
      },
    },
    static_evidence: {
      router_plan: plan,
      family_decision: {
        family: plan.family,
        stage: plan.stage,
        reasons: plan.reasons || [],
        playbook: plan.playbook || null,
        hook_presets: plan.hook_presets || [],
        detected_risks: inferRisks(plan),
      },
    },
    hook_evidence: {
      status: plan.hook_presets && plan.hook_presets.length ? 'scaffolded' : 'not-required-yet',
      presets: plan.hook_presets || [],
      observations: [],
    },
    replay_evidence: {
      status: 'not-started',
      reason: 'runner generated a playbook plan before runtime evidence or replay validation was collected',
    },
    unknowns: inferUnknowns(plan),
  };
}

function inferRisks(plan) {
  const risks = ['bootstrap-only'];
  if (plan.stage === 'runtime') risks.push('runtime-first-required');
  if ((plan.hook_presets || []).length) risks.push('hook-required');
  if (!plan.playbook) risks.push('playbook-not-selected');
  return risks;
}

function inferUnknowns(plan) {
  const unknowns = [
    'accepted protected request has not been validated',
    'field and cookie provenance is not yet proven',
    'replay parity has not been tested',
  ];
  if ((plan.hook_presets || []).length) unknowns.push('hook observations have not been collected');
  return unknowns;
}

function buildClaimSet(plan, evidence, runContext) {
  const claims = [
    {
      claim_id: 'router-family-selected',
      statement: `Router selected family ${plan.family}.`,
      strength: 'inferred',
      evidence_sources: ['static', 'router'],
      conflicts: [],
      notes: plan.reasons || [],
      last_verified_at: null,
    },
    {
      claim_id: 'playbook-selected',
      statement: plan.playbook
        ? `Recommended playbook is ${plan.playbook}.`
        : 'No dedicated playbook was selected by the router.',
      strength: plan.playbook ? 'inferred' : 'weak',
      evidence_sources: ['router', 'pattern-memory'],
      conflicts: [],
      notes: (plan.pattern_matches || []).map((item) => `${item.id}:${Math.round(item.score * 100)}%`),
      last_verified_at: null,
    },
    {
      claim_id: 'runtime-evidence-pending',
      statement: 'Runtime evidence has not yet been collected for this run.',
      strength: 'weak',
      evidence_sources: ['runner'],
      conflicts: [],
      notes: evidence.unknowns,
      last_verified_at: null,
    },
    {
      claim_id: 'replay-not-validated',
      statement: 'Replay parity is not validated by this bootstrap run.',
      strength: 'weak',
      evidence_sources: ['runner'],
      conflicts: [],
      notes: ['Use accepted runtime samples and divergence logs before promoting replay claims.'],
      last_verified_at: null,
    },
  ];

  if ((plan.hook_presets || []).length) {
    claims.push({
      claim_id: 'hook-profile-scaffolded',
      statement: `Hook profile should start from presets: ${plan.hook_presets.join(', ')}.`,
      strength: 'inferred',
      evidence_sources: ['router', 'hook-preset'],
      conflicts: [],
      notes: ['Hook scaffold exists, but no live hook observation is included yet.'],
      last_verified_at: null,
    });
  }

  return {
    schema: 'js-reverse-ops-claim-set-v1',
    source: 'playbook-run',
    target: runContext.target,
    generated_at: runContext.created_at,
    claims,
    summary: {
      verified: claims.filter((item) => item.strength === 'verified').length,
      inferred: claims.filter((item) => item.strength === 'inferred').length,
      weak: claims.filter((item) => item.strength === 'weak').length,
    },
  };
}

function buildRiskSummary(plan, evidence, runContext) {
  const risks = [];
  function addRisk(id, severity, category, reason, nextAction) {
    risks.push({ id, severity, category, reason, next_action: nextAction });
  }

  addRisk(
    'bootstrap-only',
    'medium',
    'evidence',
    'This run is generated from router and pattern-memory evidence only.',
    'Collect runtime request, hook, or replay evidence before promoting claims.'
  );
  if (plan.stage === 'runtime') {
    addRisk(
      'runtime-first-required',
      'high',
      'workflow',
      'The selected route requires browser/runtime truth before replay work is trustworthy.',
      'Run the generated hook profile or equivalent runtime capture before writing final replay code.'
    );
  }
  if ((plan.hook_presets || []).length) {
    addRisk(
      'hook-evidence-missing',
      'medium',
      'runtime',
      'Hook presets were selected, but no hook observations have been collected yet.',
      'Fill and execute the hook scaffold, then promote matched observations into provenance.'
    );
  }
  if (!plan.playbook) {
    addRisk(
      'generic-route-only',
      'medium',
      'routing',
      'No dedicated playbook was selected.',
      'Use the stage references and static extractors until a stronger pattern emerges.'
    );
  }

  const severityOrder = { high: 3, medium: 2, low: 1 };
  risks.sort((a, b) => severityOrder[b.severity] - severityOrder[a.severity] || a.id.localeCompare(b.id));
  return {
    schema: 'js-reverse-ops-risk-summary-v1',
    source: 'playbook-run',
    target: runContext.target,
    generated_at: runContext.created_at,
    risks,
    summary: {
      high: risks.filter((item) => item.severity === 'high').length,
      medium: risks.filter((item) => item.severity === 'medium').length,
      low: risks.filter((item) => item.severity === 'low').length,
    },
  };
}

function buildProvenance(plan, runContext) {
  const nodes = [
    { id: 'target', type: 'target', label: runContext.target },
    { id: 'router-plan', type: 'router', label: plan.family, stage: plan.stage },
  ];
  const edges = [
    { from: 'router-plan', to: 'target', relation: 'classifies', strength: 'inferred', basis: 'router plan' },
  ];
  const fieldStatus = {};

  if (plan.playbook) {
    nodes.push({ id: 'playbook', type: 'playbook', label: plan.playbook });
    edges.push({ from: 'playbook', to: 'router-plan', relation: 'recommended_by', strength: 'inferred', basis: 'route selection' });
  }
  for (const preset of plan.hook_presets || []) {
    const presetId = `hook:${preset}`;
    nodes.push({ id: presetId, type: 'hook-preset', label: preset });
    edges.push({ from: presetId, to: 'target', relation: 'should_observe', strength: 'inferred', basis: 'hook preset' });
  }
  for (const match of plan.pattern_matches || []) {
    const matchId = `pattern:${match.id}`;
    nodes.push({ id: matchId, type: 'pattern-match', label: match.id, score: match.score });
    edges.push({ from: matchId, to: 'router-plan', relation: 'supports', strength: 'inferred', basis: (match.hits || []).join('; ') });
  }

  return {
    schema: 'js-reverse-ops-provenance-graph-v1',
    source: 'playbook-run',
    target: runContext.target,
    generated_at: runContext.created_at,
    status: 'bootstrap-only',
    nodes,
    edges,
    field_status: fieldStatus,
    unresolved: [
      'request fields not captured',
      'cookie writes not captured',
      'accepted replay not validated',
    ],
  };
}

function renderProvenanceSummary(provenance) {
  const lines = [];
  lines.push('# Provenance Summary');
  lines.push('');
  lines.push(`- Status: \`${provenance.status}\``);
  lines.push(`- Nodes: \`${provenance.nodes.length}\``);
  lines.push(`- Edges: \`${provenance.edges.length}\``);
  lines.push('');
  lines.push('## Unresolved');
  lines.push('');
  for (const item of provenance.unresolved || []) lines.push(`- ${item}`);
  lines.push('');
  return lines.join('\n');
}

function buildReplayStatus(plan, runContext) {
  return {
    schema: 'js-reverse-ops-replay-status-v1',
    target: runContext.target,
    generated_at: runContext.created_at,
    status: 'not-started',
    acceptance_status: 'not-tested',
    validation_method: 'none',
    sample_count: 0,
    required_before_replay: [
      'accepted runtime request sample',
      'field and cookie provenance',
      'divergence log comparing replay output to runtime truth',
    ],
    recommended_playbook: plan.playbook || null,
  };
}

function renderOperatorReview(plan, claimSet, riskSummary, replayStatus) {
  const lines = [];
  lines.push('# Operator Review');
  lines.push('');
  lines.push(`- Family: \`${plan.family}\``);
  lines.push(`- Stage: \`${plan.stage}\``);
  lines.push(`- Playbook: \`${plan.playbook || 'none'}\``);
  lines.push(`- Claims: \`${claimSet.summary.verified} verified / ${claimSet.summary.inferred} inferred / ${claimSet.summary.weak} weak\``);
  lines.push(`- Risks: \`${riskSummary.summary.high} high / ${riskSummary.summary.medium} medium / ${riskSummary.summary.low} low\``);
  lines.push(`- Replay: \`${replayStatus.status}\`, acceptance \`${replayStatus.acceptance_status}\``);
  lines.push('');
  lines.push('## Next Best Actions');
  lines.push('');
  if (plan.playbook) lines.push(`- Read and follow \`${plan.playbook}\`.`);
  if ((plan.hook_presets || []).length) lines.push('- Complete the generated hook profile and capture matching runtime evidence.');
  lines.push('- Replace bootstrap claims with verified claims after runtime or replay validation.');
  lines.push('- Keep unresolved field and cookie provenance explicit until evidence closes it.');
  lines.push('');
  return lines.join('\n');
}

function writeDeliveryArtifacts(plan, runContext, outDir) {
  const evidence = buildEvidence(plan, runContext);
  const claimSet = buildClaimSet(plan, evidence, runContext);
  const riskSummary = buildRiskSummary(plan, evidence, runContext);
  const provenance = buildProvenance(plan, runContext);
  const replayStatus = buildReplayStatus(plan, runContext);
  const files = {
    'evidence.json': evidence,
    'claim-set.json': claimSet,
    'risk-summary.json': riskSummary,
    'provenance-graph.json': provenance,
    'replay-status.json': replayStatus,
  };
  for (const [filename, data] of Object.entries(files)) {
    fs.writeFileSync(path.join(outDir, filename), `${JSON.stringify(data, null, 2)}\n`);
  }
  fs.writeFileSync(path.join(outDir, 'provenance-summary.md'), renderProvenanceSummary(provenance));
  fs.writeFileSync(path.join(outDir, 'operator-review.md'), renderOperatorReview(plan, claimSet, riskSummary, replayStatus));
  return Object.keys(files).concat(['provenance-summary.md', 'operator-review.md']);
}

function writeHookScaffold(plan, outDir) {
  if (!plan.hook_presets || !plan.hook_presets.length) return null;
  const output = execFileSync(process.execPath, [
    path.join(rootDir, 'scripts/scaffold_hook_profile.js'),
    '--preset',
    plan.hook_presets.join(','),
    '--mode',
    'priority',
    '--target',
    plan.target || '',
    '--out',
    outDir,
  ], {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(output);
}

function writeHookExecutionArtifacts(hookProfile, outDir) {
  if (!hookProfile) return null;
  const actionOutput = execFileSync(process.execPath, [
    path.join(rootDir, 'scripts/build_hook_action_plan.js'),
    path.join(outDir, 'hook-profile.json'),
    '--out',
    outDir,
  ], {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const actionPlan = JSON.parse(actionOutput);
  const runbookOutput = execFileSync(process.execPath, [
    path.join(rootDir, 'scripts/build_hook_execution_runbook.js'),
    path.join(outDir, 'hook-action-plan.json'),
    '--out',
    outDir,
  ], {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const executionRunbook = JSON.parse(runbookOutput);
  return {
    action_plan: actionPlan,
    execution_runbook: executionRunbook,
    files: []
      .concat(actionPlan.files || [])
      .concat(executionRunbook.files || []),
  };
}

function renderMarkdown(run) {
  const lines = [];
  lines.push('# Playbook Run');
  lines.push('');
  lines.push(`- Target: \`${run.target}\``);
  lines.push(`- Family: \`${run.plan.family}\``);
  lines.push(`- Stage: \`${run.plan.stage}\``);
  if (run.plan.playbook) lines.push(`- Playbook: \`${run.plan.playbook}\``);
  if (run.plan.hook_presets.length) lines.push(`- Hook presets: \`${run.plan.hook_presets.join(', ')}\``);
  lines.push(`- Mode: \`${run.execute ? 'execute-local' : 'dry-run'}\``);
  lines.push('');
  lines.push('## Reasons');
  lines.push('');
  for (const reason of run.plan.reasons || []) lines.push(`- ${reason}`);
  lines.push('');
  lines.push('## Recommended Sequence');
  lines.push('');
  for (const item of run.plan.recommended_sequence || []) lines.push(`- ${item}`);
  lines.push('');
  lines.push('## Commands');
  lines.push('');
  for (const command of run.commands || []) lines.push(`- \`${command.command}\` (${command.action})`);
  if (run.executions && run.executions.length) {
    lines.push('');
    lines.push('## Execution Results');
    lines.push('');
    for (const result of run.executions) lines.push(`- ${result.status}: \`${result.command}\``);
  }
  lines.push('');
  lines.push('## Next Operator Actions');
  lines.push('');
  if (run.plan.playbook) lines.push(`- Read \`${run.plan.playbook}\` before widening analysis.`);
  if (run.hook_profile) lines.push('- Review `hook-profile.md` and fill target-specific instrumentation before browser execution.');
  if (run.hook_execution) lines.push('- Use `hook-execution-runbook.md` as the MCP-oriented runtime capture sequence.');
  lines.push('- Promote verified observations into claim, provenance, and replay artifacts before declaring completion.');
  lines.push('');
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.target) {
    console.log(usage());
    process.exit(args.help ? 0 : 1);
  }

  const planArgs = [args.target];
  if (args.notes) planArgs.push('--notes', args.notes);
  const plan = runJson('scripts/js_reverse_ops.js', planArgs);
  const createdAt = new Date().toISOString();
  const outDir = path.resolve(rootDir, args.out || path.join('runs', `playbook-${safeTimestamp()}`));
  fs.mkdirSync(outDir, { recursive: true });

  const commands = (plan.next_commands || []).map((command) => ({
    command,
    action: args.execute && isExecutableLocalCommand(command) ? 'execute' : 'record',
  }));
  const executions = args.execute
    ? commands.filter((item) => item.action === 'execute').map((item) => executeCommand(item.command))
    : [];
  const runContext = { created_at: createdAt, target: args.target, notes: args.notes || '' };
  const deliveryFiles = writeDeliveryArtifacts(plan, runContext, outDir);
  const hookProfile = writeHookScaffold(plan, outDir);
  const hookExecution = writeHookExecutionArtifacts(hookProfile, outDir);
  const run = {
    schema: 'js-reverse-ops-playbook-run-v1',
    created_at: createdAt,
    target: args.target,
    notes: args.notes || '',
    out_dir: outDir,
    execute: args.execute,
    plan,
    commands,
    executions,
    hook_profile: hookProfile,
    hook_execution: hookExecution,
    delivery_artifacts: deliveryFiles,
  };

  fs.writeFileSync(path.join(outDir, 'playbook-run.json'), `${JSON.stringify(run, null, 2)}\n`);
  fs.writeFileSync(path.join(outDir, 'playbook-run.md'), renderMarkdown(run));

  const summary = {
    out_dir: outDir,
    family: plan.family,
    stage: plan.stage,
    playbook: plan.playbook,
    hook_presets: plan.hook_presets,
    commands: commands.length,
    executed: executions.length,
    files: ['playbook-run.json', 'playbook-run.md']
      .concat(deliveryFiles)
      .concat(hookProfile ? hookProfile.files : [])
      .concat(hookExecution ? hookExecution.files : []),
  };
  process.stdout.write(args.json ? `${JSON.stringify(summary, null, 2)}\n` : `${renderSummary(summary)}\n`);
}

function renderSummary(summary) {
  return [
    `out_dir: ${summary.out_dir}`,
    `family: ${summary.family}`,
    `stage: ${summary.stage}`,
    summary.playbook ? `playbook: ${summary.playbook}` : 'playbook: none',
    `commands: ${summary.commands}`,
    `executed: ${summary.executed}`,
    `files: ${summary.files.join(', ')}`,
  ].join('\n');
}

main();
