#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function usage() {
  console.error(
    'Usage: select_executable_mcp_actions.js <workflow-mcp-batch.json> [--context-json <file>] [--output <file>] [--allow-mutating-page-state]'
  );
  process.exit(1);
}

const args = process.argv.slice(2);
if (!args.length) usage();

const options = {
  batchJson: '',
  contextJson: '',
  output: '',
  allowMutatingPageState: false,
};

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  const next = args[i + 1] || '';
  if (!options.batchJson) {
    options.batchJson = path.resolve(arg);
  } else if (arg === '--context-json') {
    options.contextJson = path.resolve(next);
    i += 1;
  } else if (arg === '--output') {
    options.output = path.resolve(next);
    i += 1;
  } else if (arg === '--allow-mutating-page-state') {
    options.allowMutatingPageState = true;
  } else {
    usage();
  }
}

if (!options.batchJson) usage();

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function hasPlaceholder(value) {
  if (typeof value === 'string') return /<[^>]+>/.test(value);
  if (Array.isArray(value)) return value.some(hasPlaceholder);
  if (value && typeof value === 'object') return Object.values(value).some(hasPlaceholder);
  return false;
}

function requirementFailures(requirements, context) {
  const failures = [];
  for (const [key, required] of Object.entries(requirements || {})) {
    if (required && !context[key]) failures.push(`missing-context:${key}`);
  }
  return failures;
}

const batch = readJson(options.batchJson);
const context = options.contextJson ? readJson(options.contextJson) : {};
const allowMutatingPageState = Boolean(
  options.allowMutatingPageState || context.allow_mutating_page_state
);
const toolUses = Array.isArray(batch.tool_uses) ? batch.tool_uses : [];
const capabilityDimensions = batch.capability_dimensions || {};

function policySummary() {
  if ((capabilityDimensions.solver_backed || capabilityDimensions.archival_backed) && batch.workflow_id === 'archival-challenge-success') {
    return {
      status: 'action-suppressed-by-capability-focus',
      reason: 'This bundle is archival or solver-backed, so MCP browser actions are intentionally minimized unless surviving live assets are confirmed.',
    };
  }
  if (capabilityDimensions.pcap_backed && batch.current_maturity === 'replay-verified' && batch.workflow_id === 'pcap-guided-form-replay') {
    return {
      status: 'action-suppressed-by-capability-focus',
      reason: 'This bundle is already a verified pcap-backed drift fixture, so MCP capture actions are intentionally omitted by default.',
    };
  }
  if (capabilityDimensions.hook_backed && batch.workflow_id === 'hook-to-provenance-loop') {
    return {
      status: 'depth-first-runtime-policy',
      reason: 'This bundle is hook-backed, so MCP actions should deepen accepted paths instead of broadening coverage.',
    };
  }
  return {
    status: 'none',
    reason: 'No capability-specific MCP policy override is active.',
  };
}

const policy = policySummary();

const executable = [];
const blocked = [];

for (const action of toolUses) {
  const reasons = [];
  if (hasPlaceholder(action.parameters || {})) {
    reasons.push('placeholder-parameter');
  }
  reasons.push(...requirementFailures(action.requirements || {}, context));
  if ((action.effects || {}).mutates_page_state && !allowMutatingPageState) {
    reasons.push('mutating-page-state-not-allowed');
  }

  const item = {
    id: action.id || null,
    order: typeof action.order === 'number' ? action.order : null,
    stage: action.stage || 'unspecified',
    recipient_name: action.recipient_name,
    parameters: action.parameters || {},
    guards: action.guards || [],
    requirements: action.requirements || {},
    effects: action.effects || {},
    note: action.note || '',
    policy_notes: [
      batch.dispatch_rationale || null,
      batch.capability_focus || null,
      policy.status !== 'none' ? policy.reason : null,
    ].filter(Boolean),
  };

  if (reasons.length) {
    blocked.push({ ...item, blocked_by: reasons });
  } else {
    executable.push(item);
  }
}

const result = {
  generated_at: new Date().toISOString(),
  batch_json: options.batchJson,
  context_json: options.contextJson || null,
  allow_mutating_page_state: allowMutatingPageState,
  workflow_id: batch.workflow_id || null,
  target: batch.target || null,
  bundle_dir: batch.bundle_dir || null,
  current_maturity: batch.current_maturity || null,
  capability_dimensions: capabilityDimensions,
  dispatch_rationale: batch.dispatch_rationale || '',
  capability_focus: batch.capability_focus || '',
  action_generation_summary: batch.action_generation_summary || '',
  policy_summary: policy,
  executable_count: executable.length,
  blocked_count: blocked.length,
  executable_actions: executable.sort((a, b) => (a.order || 0) - (b.order || 0)),
  blocked_actions: blocked.sort((a, b) => (a.order || 0) - (b.order || 0)),
};

if (options.output) {
  fs.writeFileSync(options.output, JSON.stringify(result, null, 2) + '\n', 'utf8');
}

console.log(JSON.stringify(result, null, 2));
