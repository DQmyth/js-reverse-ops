#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const smokeModelPath = path.join(rootDir, 'assets', 'browser-mcp-smoke-model.json');
const adapterMapPath = path.join(rootDir, 'assets', 'mcp-server-adapter-map.json');

function usage() {
  console.error([
    'Usage: plan_browser_mcp_smoke.js [--server-family <id>] [--json] [--markdown <out.md>]',
    '',
    'Plans browser MCP smoke checks while keeping planned, executed, and observed states separate.',
  ].join('\n'));
  process.exit(1);
}

function parseArgs(argv) {
  const args = { serverFamily: '', json: false, markdown: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--server-family') {
      args.serverFamily = argv[index + 1] || '';
      index += 1;
    } else if (item === '--json') {
      args.json = true;
    } else if (item === '--markdown') {
      args.markdown = path.resolve(rootDir, argv[index + 1] || '');
      index += 1;
    } else if (item === '--help' || item === '-h') {
      usage();
    } else {
      usage();
    }
  }
  return args;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function buildPlan(args) {
  const smokeModel = readJson(smokeModelPath);
  const adapterMap = readJson(adapterMapPath);
  const serverFamily = args.serverFamily || smokeModel.default_server_family;
  const server = (adapterMap.server_families || []).find((item) => item.id === serverFamily);
  if (!server) throw new Error(`unknown server family: ${serverFamily}`);

  const supported = new Set((smokeModel.server_family_capabilities || {})[serverFamily] || []);
  const capabilityById = new Map((adapterMap.capabilities || []).map((item) => [item.id, item]));
  const checks = (smokeModel.smoke_checks || []).map((check, index) => {
    const capability = capabilityById.get(check.capability) || {};
    const covered = supported.has(check.capability);
    return {
      order: index + 1,
      id: check.id,
      capability: check.capability,
      normalized_action: check.normalized_action,
      state: smokeModel.evidence_boundary.planned_state,
      supported: covered,
      status: covered ? 'planned' : 'blocked-missing-capability',
      precondition: check.precondition,
      expected_evidence: check.expected_evidence || capability.expected_evidence || [],
      adapter_actions: capability.normalized_actions || [],
      evidence_boundary: smokeModel.evidence_boundary.rule,
    };
  });
  const covered = checks.filter((item) => item.supported);
  const blocked = checks.filter((item) => !item.supported);
  const coverage = checks.length ? covered.length / checks.length : 0;
  return {
    schema: 'js-reverse-ops-browser-mcp-smoke-plan-v1',
    generated_at: new Date().toISOString(),
    server_family: serverFamily,
    server_description: server.description,
    typical_strengths: server.typical_strengths || [],
    coverage_score: Math.round(coverage * 100),
    covered_count: covered.length,
    total_count: checks.length,
    blocked_count: blocked.length,
    planned_checks: checks,
    missing_capabilities: blocked.map((item) => item.capability),
    next_action: blocked.length
      ? `Add or adapt MCP tools for: ${blocked.map((item) => item.capability).join(', ')}.`
      : 'Run the planned smoke checks against a sanitized page, then ingest the MCP execution record before promoting observations.',
    evidence_boundary: smokeModel.evidence_boundary,
  };
}

function renderMarkdown(plan) {
  const lines = [];
  lines.push('# Browser MCP Smoke Plan');
  lines.push('');
  lines.push(`- Server family: \`${plan.server_family}\``);
  lines.push(`- Coverage: \`${plan.coverage_score}/100\``);
  lines.push(`- Planned checks: \`${plan.covered_count}/${plan.total_count}\``);
  lines.push(`- Boundary: ${plan.evidence_boundary.rule}`);
  lines.push('');
  lines.push('| Check | Capability | Status |');
  lines.push('| --- | --- | --- |');
  for (const check of plan.planned_checks) {
    lines.push(`| ${check.id} | ${check.capability} | ${check.status} |`);
  }
  lines.push('');
  lines.push('## Next Action');
  lines.push('');
  lines.push(plan.next_action);
  lines.push('');
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  let plan;
  try {
    plan = buildPlan(args);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  if (args.markdown) fs.writeFileSync(args.markdown, renderMarkdown(plan));
  process.stdout.write(args.json ? `${JSON.stringify(plan, null, 2)}\n` : renderMarkdown(plan));
}

main();
