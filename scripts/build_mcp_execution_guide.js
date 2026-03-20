#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function usage() {
  console.error(
    'Usage: build_mcp_execution_guide.js <workflow-mcp-call-payload.json> [--output-json <file>] [--output-md <file>]'
  );
  process.exit(1);
}

const args = process.argv.slice(2);
if (!args.length) usage();

const options = {
  callPayloadJson: '',
  outputJson: '',
  outputMd: '',
};

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  const next = args[i + 1] || '';
  if (!options.callPayloadJson) {
    options.callPayloadJson = path.resolve(arg);
  } else if (arg === '--output-json') {
    options.outputJson = path.resolve(next);
    i += 1;
  } else if (arg === '--output-md') {
    options.outputMd = path.resolve(next);
    i += 1;
  } else {
    usage();
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

const payload = readJson(options.callPayloadJson);
const execPlanPath = path.join(path.dirname(options.callPayloadJson), 'workflow-mcp-exec-plan.json');
const execPlan = fs.existsSync(execPlanPath) ? readJson(execPlanPath) : {};
const groups = Array.isArray(payload.execution_groups) ? payload.execution_groups : [];

const steps = groups.map((group, index) => {
  const base = {
    step: index + 1,
    group_id: group.id,
    mode: group.mode,
    reason: group.reason,
    order_range: group.order_range,
  };
  if (group.mode === 'parallel') {
    return {
      ...base,
      invocation: {
        adapter: 'multi_tool_use.parallel',
        tool_uses: group.tool_uses || [],
      },
    };
  }
  return {
    ...base,
    invocation: {
      adapter: 'single-tool-sequence',
      tool_calls: (group.tool_uses || []).map((toolUse) => ({
        recipient_name: toolUse.recipient_name,
        parameters: toolUse.parameters || {},
      })),
    },
  };
});

const guide = {
  generated_at: new Date().toISOString(),
  call_payload_json: options.callPayloadJson,
  exec_plan_json: fs.existsSync(execPlanPath) ? execPlanPath : null,
  workflow_id: payload.workflow_id || null,
  target: payload.target || null,
  bundle_dir: payload.bundle_dir || null,
  current_maturity: execPlan.current_maturity || null,
  capability_dimensions: execPlan.capability_dimensions || {},
  dispatch_rationale: execPlan.dispatch_rationale || '',
  capability_focus: execPlan.capability_focus || '',
  action_generation_summary: execPlan.action_generation_summary || '',
  policy_summary: execPlan.policy_summary || { status: 'none', reason: 'No policy summary available.' },
  steps,
};

if (options.outputJson) {
  fs.writeFileSync(options.outputJson, JSON.stringify(guide, null, 2) + '\n', 'utf8');
}

if (options.outputMd) {
  const lines = [
    '# MCP Execution Guide',
    '',
    `- workflow_id: ${guide.workflow_id || 'none'}`,
    `- target: ${guide.target || 'none'}`,
    `- current_maturity: ${guide.current_maturity || 'none'}`,
    `- capability_focus: ${guide.capability_focus || 'none'}`,
    `- action_generation_summary: ${guide.action_generation_summary || 'none'}`,
    `- policy_summary: ${guide.policy_summary.status || 'none'}${guide.policy_summary.reason ? ` - ${guide.policy_summary.reason}` : ''}`,
    `- steps: ${guide.steps.length}`,
    '',
    '## Steps',
    '',
  ];
  if (!guide.steps.length) {
    lines.push('- none');
  } else {
    for (const step of guide.steps) {
      lines.push(`- Step ${step.step}: ${step.mode} (${step.group_id})`);
      lines.push(`  adapter: ${step.invocation.adapter}`);
      lines.push(`  reason: ${step.reason}`);
    }
  }
  fs.writeFileSync(options.outputMd, lines.join('\n') + '\n', 'utf8');
}

console.log(JSON.stringify(guide, null, 2));
