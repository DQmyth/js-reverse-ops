#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

function usage() {
  console.error('Usage: generate_domain_handoff_plan.js [--notes <text-or-file>] [--artifact <path-or-label>] [--json]');
  process.exit(1);
}

function parseArgs(argv) {
  const args = { notes: '', artifact: '', json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--notes') {
      args.notes = argv[index + 1] || '';
      index += 1;
    } else if (item === '--artifact') {
      args.artifact = argv[index + 1] || '';
      index += 1;
    } else if (item === '--json') {
      args.json = true;
    } else if (item === '--help' || item === '-h') {
      usage();
    } else if (!args.notes) {
      args.notes = item;
    } else {
      usage();
    }
  }
  if (!args.notes && !args.artifact) usage();
  return args;
}

function readMaybeFile(value) {
  if (!value) return '';
  const candidate = path.resolve(value);
  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return fs.readFileSync(candidate, 'utf8');
  return value;
}

function normalize(value) {
  return String(value || '').toLowerCase();
}

function signalHits(handoff, haystack) {
  return (handoff.signals || []).filter((signal) => {
    const normalized = normalize(signal);
    if (/^[a-z0-9_]+$/.test(normalized) && normalized.length <= 3) {
      return new RegExp(`(^|[^a-z0-9_])${normalized}($|[^a-z0-9_])`).test(haystack);
    }
    if (haystack.includes(normalized)) return true;
    const words = normalized.split(/[^a-z0-9_]+/).filter((word) => word.length > 3);
    return words.length >= 2 && words.every((word) => haystack.includes(word));
  });
}

function buildPlan(args) {
  const model = JSON.parse(fs.readFileSync(path.join(rootDir, 'assets/domain-handoff-model.json'), 'utf8'));
  const notesText = readMaybeFile(args.notes);
  const artifactText = readMaybeFile(args.artifact);
  const haystack = normalize(`${notesText} ${args.artifact} ${artifactText}`);
  const handoffs = (model.handoffs || []).map((handoff) => {
    const hits = signalHits(handoff, haystack);
    const score = hits.length * 10 + Math.round((handoff.priority || 0) / 10);
    return {
      id: handoff.id,
      label: handoff.label,
      score,
      target_lane: handoff.target_lane,
      matched_signals: hits,
      boundary_artifacts: handoff.boundary_artifacts || [],
      next_tools: handoff.next_tools || [],
      exit_criteria: handoff.exit_criteria || [],
    };
  }).filter((item) => item.matched_signals.length)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  return {
    schema: 'js-reverse-ops-domain-handoff-plan-v1',
    generated_at: new Date().toISOString(),
    recommended_handoff: handoffs[0] || null,
    handoffs,
    next_action: handoffs[0]
      ? `Preserve ${handoffs[0].boundary_artifacts[0]} before handing off to ${handoffs[0].target_lane}.`
      : 'No cross-domain handoff is justified by the supplied notes or artifact.',
    boundary: 'Domain handoff planning preserves the artifact boundary. It does not merge packet, mobile, WASM, or binary findings into verified JS replay claims.',
  };
}

function renderMarkdown(plan) {
  const lines = [];
  lines.push('# Domain Handoff Plan');
  lines.push('');
  lines.push(`- Recommended handoff: \`${plan.recommended_handoff?.id || 'none'}\``);
  lines.push(`- Next action: ${plan.next_action}`);
  lines.push('');
  lines.push('## Handoffs');
  lines.push('');
  if (!plan.handoffs.length) lines.push('- none');
  for (const handoff of plan.handoffs) {
    lines.push(`### ${handoff.id}`);
    lines.push('');
    lines.push(`- Target lane: ${handoff.target_lane}`);
    lines.push(`- Matched: ${handoff.matched_signals.join(', ')}`);
    lines.push(`- Boundary artifacts: ${handoff.boundary_artifacts.join('; ')}`);
    lines.push(`- Next tools: ${handoff.next_tools.map((tool) => `\`${tool}\``).join(', ')}`);
    lines.push(`- Exit: ${handoff.exit_criteria.join('; ')}`);
    lines.push('');
  }
  lines.push('## Boundary');
  lines.push('');
  lines.push(plan.boundary);
  lines.push('');
  return lines.join('\n');
}

const args = parseArgs(process.argv.slice(2));
const plan = buildPlan(args);
process.stdout.write(args.json ? `${JSON.stringify(plan, null, 2)}\n` : renderMarkdown(plan));
