#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const laneModelPath = path.join(rootDir, 'assets/task-lane-model.json');

function usage() {
  console.error('Usage: generate_task_lane_plan.js <target> [--notes <text-or-file>] [--json]');
  process.exit(1);
}

const args = process.argv.slice(2);
const options = { target: '', notes: '', json: false };
for (let index = 0; index < args.length; index += 1) {
  const item = args[index];
  if (item === '--notes') {
    options.notes = args[index + 1] || '';
    index += 1;
  } else if (item === '--json') {
    options.json = true;
  } else if (!options.target) {
    options.target = item;
  } else {
    usage();
  }
}
if (!options.target) usage();

function readMaybeFile(value) {
  if (!value) return '';
  const file = path.resolve(value);
  if (fs.existsSync(file) && fs.statSync(file).isFile()) return fs.readFileSync(file, 'utf8');
  return value;
}

function routeTarget(target, notes) {
  const routeArgs = [path.join(rootDir, 'scripts/js_reverse_ops.js'), target, '--json'];
  if (notes) routeArgs.splice(2, 0, '--notes', notes);
  const output = execFileSync(process.execPath, routeArgs, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(output);
}

function scoreLane(lane, route, notesText) {
  const haystack = `${route.family || ''} ${route.stage || ''} ${(route.reasons || []).join(' ')} ${(route.hook_presets || []).join(' ')} ${notesText}`.toLowerCase();
  let score = lane.stage === route.stage ? 3 : 0;
  const hits = [];
  for (const signal of lane.use_when || []) {
    const words = signal.toLowerCase().split(/[^a-z0-9_]+/).filter((word) => word.length > 3);
    const matched = words.filter((word) => haystack.includes(word));
    if (matched.length >= Math.min(2, words.length)) {
      score += 1;
      hits.push(signal);
    }
  }
  if (lane.id === 'delivery-readiness' && /replay|delivery|python|proxy|handoff/.test(haystack)) score += 2;
  if (lane.id === 'runtime-hook-capture' && ((route.hook_presets || []).length || /xhr|fetch|cookie|token|sign/.test(haystack))) score += 2;
  if (lane.id === 'static-ast-recover' && /packed|_0x|eval|obfuscat|minif|vm-like/.test(haystack)) score += 2;
  if (lane.id === 'crypto-entry-discovery' && /sign|token|nonce|encrypt|digest|crypto|wasm/.test(haystack)) score += 2;
  if (lane.id === 'crypto-entry-discovery' && /wasm|server[- ]?time|module helper|time gated/.test(haystack)) score += 4;
  if (lane.id === 'runtime-hook-capture' && /wasm|server[- ]?time|module helper|time gated/.test(haystack)) score -= 1;
  if (lane.id === 'env-rebuild' && /diverge|environment|window|document|navigator|storage|node|python/.test(haystack)) score += 2;
  return { lane, score, hits };
}

function buildPlan() {
  const notesText = readMaybeFile(options.notes);
  const model = JSON.parse(fs.readFileSync(laneModelPath, 'utf8'));
  const route = routeTarget(options.target, options.notes);
  const ranked = (model.lanes || [])
    .map((lane) => scoreLane(lane, route, notesText))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.lane.id.localeCompare(b.lane.id));
  const selected = ranked.slice(0, 4).map((item, index) => ({
    order: index + 1,
    id: item.lane.id,
    stage: item.lane.stage,
    score: item.score,
    matched_use_when: item.hits,
    scripts: item.lane.scripts,
    exit_criteria: item.lane.exit_criteria,
  }));
  return {
    schema: 'js-reverse-ops-task-lane-plan-v1',
    generated_at: new Date().toISOString(),
    target: options.target,
    route: {
      family: route.family,
      stage: route.stage,
      playbook: route.playbook,
      hook_presets: route.hook_presets || [],
    },
    selected_lanes: selected,
    next_lane: selected[0] || null,
    boundary: 'Lane planning decomposes the task. It does not prove runtime, replay, or delivery success.',
  };
}

function renderMarkdown(plan) {
  const lines = [];
  lines.push('# Task Lane Plan');
  lines.push('');
  lines.push(`- Target: \`${plan.target}\``);
  lines.push(`- Route: \`${plan.route.family}/${plan.route.stage}\``);
  if (plan.route.playbook) lines.push(`- Playbook: \`${plan.route.playbook}\``);
  lines.push('');
  lines.push('## Selected Lanes');
  lines.push('');
  for (const lane of plan.selected_lanes) {
    lines.push(`### ${lane.order}. ${lane.id}`);
    lines.push('');
    lines.push(`- Stage: \`${lane.stage}\``);
    lines.push(`- Scripts: ${lane.scripts.map((script) => `\`${script}\``).join(', ')}`);
    lines.push(`- Exit: ${lane.exit_criteria.join('; ')}`);
    lines.push('');
  }
  lines.push('## Boundary');
  lines.push('');
  lines.push(plan.boundary);
  lines.push('');
  return lines.join('\n');
}

const plan = buildPlan();
process.stdout.write(options.json ? `${JSON.stringify(plan, null, 2)}\n` : renderMarkdown(plan));
