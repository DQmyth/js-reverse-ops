#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const smokeModelPath = path.join(rootDir, 'assets', 'browser-mcp-smoke-model.json');
const adapterMapPath = path.join(rootDir, 'assets', 'mcp-server-adapter-map.json');

function usage() {
  console.error([
    'Usage: verify_browser_mcp_smoke_record.js --record <mcp-execution.json> [--server-family <id>] [--json]',
    '',
    'Verifies adapter-specific browser MCP smoke execution records without promoting planned actions to observed facts.',
  ].join('\n'));
  process.exit(1);
}

function parseArgs(argv) {
  const args = { record: '', serverFamily: '', json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--record') {
      args.record = argv[index + 1] || '';
      index += 1;
    } else if (item === '--server-family') {
      args.serverFamily = argv[index + 1] || '';
      index += 1;
    } else if (item === '--json') {
      args.json = true;
    } else if (item === '--help' || item === '-h') {
      usage();
    } else {
      usage();
    }
  }
  if (!args.record) usage();
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

function readJson(file) {
  return JSON.parse(fs.readFileSync(resolveRepoPath(file), 'utf8'));
}

function normalizeStatus(value) {
  return String(value || '').toLowerCase();
}

function isExecuted(step) {
  return ['executed', 'observed', 'completed', 'success', 'ok'].includes(normalizeStatus(step.status));
}

function hasObservedEvidence(step) {
  if (Array.isArray(step.observed_outputs) && step.observed_outputs.length) return true;
  if (Array.isArray(step.artifact_paths) && step.artifact_paths.length) return true;
  if (step.evidence && typeof step.evidence === 'object' && Object.keys(step.evidence).length) return true;
  return false;
}

function hasRawCaptureRisk(step) {
  const text = JSON.stringify(step).toLowerCase();
  if (/\.(har|pcap|pcapng)\b/.test(text)) return true;
  if (/"cookie"\s*:/.test(text) || /authorization/.test(text)) return true;
  if (/"body"\s*:/.test(text) && !/body_shape/.test(text)) return true;
  return false;
}

function buildVerification(args) {
  const smokeModel = readJson(smokeModelPath);
  const adapterMap = readJson(adapterMapPath);
  const record = readJson(args.record);
  const serverFamily = args.serverFamily || record.server_family || smokeModel.default_server_family;
  const server = (adapterMap.server_families || []).find((item) => item.id === serverFamily);
  if (!server) throw new Error(`unknown server family: ${serverFamily}`);

  const supported = new Set((smokeModel.server_family_capabilities || {})[serverFamily] || []);
  const steps = Array.isArray(record.step_results) ? record.step_results : [];
  const rawCaptureRisks = [];
  const capability_results = (smokeModel.smoke_checks || []).map((check) => {
    const matching = steps.filter((step) => {
      if (step.capability === check.capability) return true;
      return step.normalized_action === check.normalized_action;
    });
    for (const step of matching) {
      if (hasRawCaptureRisk(step)) rawCaptureRisks.push({
        capability: check.capability,
        normalized_action: step.normalized_action || check.normalized_action,
      });
    }
    const executed = matching.some(isExecuted);
    const observed = matching.some((step) => isExecuted(step) && hasObservedEvidence(step));
    const isSupported = supported.has(check.capability);
    return {
      id: check.id,
      capability: check.capability,
      normalized_action: check.normalized_action,
      supported: isSupported,
      state: observed ? smokeModel.evidence_boundary.observed_state
        : executed ? smokeModel.evidence_boundary.executed_state
          : smokeModel.evidence_boundary.planned_state,
      status: !isSupported ? 'blocked-missing-capability'
        : observed ? 'observed'
          : executed ? 'executed-without-observation'
            : 'missing',
      matched_steps: matching.length,
      expected_evidence: check.expected_evidence || [],
    };
  });
  const required = capability_results.filter((item) => item.supported);
  const observedRequired = required.filter((item) => item.status === 'observed');
  const missingRequired = required.filter((item) => item.status !== 'observed');
  const ok = required.length > 0 && missingRequired.length === 0 && rawCaptureRisks.length === 0;
  return {
    schema: 'js-reverse-ops-browser-mcp-smoke-verification-v1',
    generated_at: new Date().toISOString(),
    record: args.record,
    server_family: serverFamily,
    server_description: server.description,
    run_status: record.run_status || 'unknown',
    observed_count: observedRequired.length,
    required_count: required.length,
    coverage_score: required.length ? Math.round((observedRequired.length / required.length) * 100) : 0,
    ok,
    capability_results,
    missing_capabilities: missingRequired.map((item) => item.capability),
    raw_capture_risks: rawCaptureRisks,
    evidence_boundary: smokeModel.evidence_boundary.rule,
    next_action: ok
      ? 'Smoke execution record is observed and sanitized. It can support runtime surface capability claims.'
      : 'Keep MCP smoke as planned or executed-only until all supported checks have sanitized observations.',
  };
}

function renderMarkdown(result) {
  const lines = [];
  lines.push('# Browser MCP Smoke Verification');
  lines.push('');
  lines.push(`- Server family: \`${result.server_family}\``);
  lines.push(`- OK: \`${result.ok}\``);
  lines.push(`- Coverage: \`${result.coverage_score}/100\``);
  lines.push(`- Boundary: ${result.evidence_boundary}`);
  lines.push('');
  lines.push('| Capability | Status | State |');
  lines.push('| --- | --- | --- |');
  for (const item of result.capability_results) {
    lines.push(`| ${item.capability} | ${item.status} | ${item.state} |`);
  }
  lines.push('');
  lines.push(result.next_action);
  lines.push('');
  return lines.join('\n');
}

const args = parseArgs(process.argv.slice(2));
let result;
try {
  result = buildVerification(args);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
process.stdout.write(args.json ? `${JSON.stringify(result, null, 2)}\n` : renderMarkdown(result));
if (!result.ok) process.exit(1);
