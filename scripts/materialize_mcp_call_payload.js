#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function usage() {
  console.error(
    'Usage: materialize_mcp_call_payload.js <workflow-mcp-exec-plan.json> [--output <file>]'
  );
  process.exit(1);
}

const args = process.argv.slice(2);
if (!args.length) usage();

const options = {
  execPlanJson: '',
  output: '',
};

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  const next = args[i + 1] || '';
  if (!options.execPlanJson) {
    options.execPlanJson = path.resolve(arg);
  } else if (arg === '--output') {
    options.output = path.resolve(next);
    i += 1;
  } else {
    usage();
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function toToolUse(action) {
  return {
    recipient_name: action.recipient_name,
    parameters: action.parameters || {},
  };
}

function canParallelize(action) {
  const effects = action.effects || {};
  return !effects.mutates_page_state && !effects.mutates_bundle_state && effects.network_observing_only;
}

const execPlan = readJson(options.execPlanJson);
const executable = Array.isArray(execPlan.executable_actions) ? execPlan.executable_actions.slice() : [];
executable.sort((a, b) => (a.order || 0) - (b.order || 0));

const groups = [];
let currentParallelGroup = null;

for (const action of executable) {
  if (canParallelize(action)) {
    if (!currentParallelGroup) {
      currentParallelGroup = {
        mode: 'parallel',
        reason: 'observation-only actions without page or bundle mutation',
        order_range: [action.order, action.order],
        actions: [],
      };
      groups.push(currentParallelGroup);
    }
    currentParallelGroup.actions.push(action);
    currentParallelGroup.order_range[1] = action.order;
  } else {
    currentParallelGroup = null;
    groups.push({
      mode: 'serial',
      reason: 'preserve ordering and mutation safety',
      order_range: [action.order, action.order],
      actions: [action],
    });
  }
}

const result = {
  generated_at: new Date().toISOString(),
  exec_plan_json: options.execPlanJson,
  workflow_id: execPlan.workflow_id || null,
  target: execPlan.target || null,
  bundle_dir: execPlan.bundle_dir || null,
  executable_count: executable.length,
  blocked_count: execPlan.blocked_count || 0,
  execution_groups: groups.map((group, index) => ({
    id: `group-${String(index + 1).padStart(3, '0')}`,
    mode: group.mode,
    reason: group.reason,
    order_range: group.order_range,
    tool_uses: group.actions.map(toToolUse),
    action_ids: group.actions.map((action) => action.id || null),
  })),
};

if (options.output) {
  fs.writeFileSync(options.output, JSON.stringify(result, null, 2) + '\n', 'utf8');
}

console.log(JSON.stringify(result, null, 2));
