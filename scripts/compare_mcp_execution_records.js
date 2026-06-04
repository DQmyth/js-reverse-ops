#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function usage() {
  console.error('Usage: compare_mcp_execution_records.js <record-a.json> [record-b.json] [--json]');
  process.exit(1);
}

const args = process.argv.slice(2);
const options = { json: false, files: [] };
for (const arg of args) {
  if (arg === '--json') options.json = true;
  else options.files.push(path.resolve(arg));
}
if (!options.files.length || options.files.length > 2) usage();

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function normalizeStep(step) {
  return {
    step: step.step || null,
    group_id: step.group_id || null,
    adapter: step.adapter || step.tool_name || step.server_family || null,
    normalized_action: step.normalized_action || step.action || null,
    status: step.status || 'unknown',
    observed_count: Array.isArray(step.observed_outputs) ? step.observed_outputs.length : 0,
    artifact_count: Array.isArray(step.artifact_paths) ? step.artifact_paths.length : 0,
    notes: step.notes || '',
  };
}

function summarizeRecord(record, file) {
  const steps = Array.isArray(record.step_results) ? record.step_results.map(normalizeStep) : [];
  const statusCounts = {};
  const adapterCounts = {};
  for (const step of steps) {
    statusCounts[step.status] = (statusCounts[step.status] || 0) + 1;
    const adapter = step.adapter || 'unknown';
    adapterCounts[adapter] = (adapterCounts[adapter] || 0) + 1;
  }
  return {
    file,
    workflow_id: record.workflow_id || null,
    target: record.target || null,
    run_status: record.run_status || 'unknown',
    step_count: steps.length,
    observed_step_count: steps.filter((step) => step.observed_count > 0 || step.artifact_count > 0).length,
    status_counts: statusCounts,
    adapter_counts: adapterCounts,
    steps,
  };
}

function compareRecords(left, right) {
  const warnings = [];
  if (left.workflow_id !== right.workflow_id) warnings.push(`workflow differs: ${left.workflow_id || 'unknown'} vs ${right.workflow_id || 'unknown'}`);
  if (left.step_count !== right.step_count) warnings.push(`step count differs: ${left.step_count} vs ${right.step_count}`);
  if (left.observed_step_count !== right.observed_step_count) warnings.push(`observed step count differs: ${left.observed_step_count} vs ${right.observed_step_count}`);
  const max = Math.max(left.steps.length, right.steps.length);
  const step_diffs = [];
  for (let index = 0; index < max; index += 1) {
    const a = left.steps[index] || {};
    const b = right.steps[index] || {};
    const changes = [];
    for (const key of ['adapter', 'normalized_action', 'status', 'observed_count', 'artifact_count']) {
      if ((a[key] || null) !== (b[key] || null)) changes.push(`${key}: ${a[key] || 'none'} -> ${b[key] || 'none'}`);
    }
    if (changes.length) step_diffs.push({ step_index: index + 1, changes });
  }
  return {
    equivalent: warnings.length === 0 && step_diffs.length === 0,
    warnings,
    step_diffs,
  };
}

function renderMarkdown(result) {
  const lines = [];
  lines.push('# MCP Execution Record Comparison');
  lines.push('');
  for (const summary of result.records) {
    lines.push(`## ${path.basename(summary.file)}`);
    lines.push('');
    lines.push(`- Workflow: \`${summary.workflow_id || 'unknown'}\``);
    lines.push(`- Run status: \`${summary.run_status}\``);
    lines.push(`- Steps: \`${summary.step_count}\``);
    lines.push(`- Observed steps: \`${summary.observed_step_count}\``);
    lines.push('');
  }
  if (result.comparison) {
    lines.push('## Comparison');
    lines.push('');
    lines.push(`- Equivalent: \`${result.comparison.equivalent}\``);
    if (result.comparison.warnings.length) {
      lines.push('- Warnings:');
      for (const warning of result.comparison.warnings) lines.push(`  - ${warning}`);
    }
    if (result.comparison.step_diffs.length) {
      lines.push('- Step diffs:');
      for (const diff of result.comparison.step_diffs) lines.push(`  - step ${diff.step_index}: ${diff.changes.join('; ')}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

const records = options.files.map((file) => summarizeRecord(readJson(file), file));
const result = {
  schema: 'js-reverse-ops-mcp-execution-record-comparison-v1',
  generated_at: new Date().toISOString(),
  records,
  comparison: records.length === 2 ? compareRecords(records[0], records[1]) : null,
};

process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : renderMarkdown(result));
