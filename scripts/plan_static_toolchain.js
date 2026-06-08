#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');

function usage() {
  console.error('Usage: plan_static_toolchain.js <target.js> [--notes <text-or-file>] [--json]');
  process.exit(1);
}

function parseArgs(argv) {
  const args = { target: '', notes: '', json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--notes') {
      args.notes = argv[index + 1] || '';
      index += 1;
    } else if (item === '--json') {
      args.json = true;
    } else if (item === '--help' || item === '-h') {
      usage();
    } else if (!args.target) {
      args.target = item;
    } else {
      usage();
    }
  }
  if (!args.target) usage();
  return args;
}

function readMaybeFile(value) {
  if (!value) return '';
  const candidate = path.resolve(value);
  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return fs.readFileSync(candidate, 'utf8');
  return value;
}

function resolveRepoPath(target) {
  const candidates = [
    path.resolve(target),
    path.join(rootDir, target),
    path.join(rootDir, 'public', target),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.resolve(target);
}

function inspectObfuscation(file) {
  try {
    const output = execFileSync(process.execPath, [path.join(rootDir, 'scripts/inspect_obfuscation_family.js'), file], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return JSON.parse(output);
  } catch (error) {
    return { family: 'unavailable', signals: {}, error: error.message };
  }
}

function normalize(value) {
  return String(value || '').toLowerCase();
}

function signalHits(step, haystack) {
  return (step.signals || []).filter((signal) => {
    const normalized = normalize(signal);
    if (haystack.includes(normalized)) return true;
    const words = normalized.split(/[^a-z0-9_]+/).filter((word) => word.length > 3);
    return words.length > 0 && words.every((word) => haystack.includes(word));
  });
}

function collectSourceMapHints(code, notesText) {
  const sourceMapping = code.match(/\/\/[#@]\s*sourceMappingURL=([^\s]+)/);
  const sourceUrl = code.match(/\/\/[#@]\s*sourceURL=([^\s]+)/);
  const inlineSourceMap = /sourceMappingURL=data:application\/json[^,\s]*,/i.test(code);
  const noteHeader = String(notesText || '').match(/\b(?:x-sourcemap|sourcemap|source-map)\s*[:=]\s*([^\s]+)/i);
  return {
    source_mapping_url: sourceMapping ? sourceMapping[1] : null,
    source_url: sourceUrl ? sourceUrl[1] : null,
    inline_source_map: inlineSourceMap,
    noted_source_map: noteHeader ? noteHeader[1] : null,
  };
}

function buildPlan(args) {
  const targetPath = resolveRepoPath(args.target);
  const code = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, 'utf8') : '';
  const notesText = readMaybeFile(args.notes);
  const model = JSON.parse(fs.readFileSync(path.join(rootDir, 'assets/static-toolchain-decision-model.json'), 'utf8'));
  const inspection = code ? inspectObfuscation(targetPath) : { family: 'missing-target', signals: {} };
  const sourceMapHints = collectSourceMapHints(code, notesText);
  const signalText = Object.entries(inspection.signals || {})
    .filter(([, value]) => Number(value) > 0)
    .map(([key]) => key.replace(/_/g, ' '))
    .join(' ');
  const haystack = normalize(`${args.target} ${notesText} ${code.slice(0, 20000)} ${inspection.family || ''} ${signalText}`);

  const ranked = (model.toolchain_steps || []).map((step) => {
    const hits = signalHits(step, haystack);
    let score = hits.length * 10 + Math.round((step.priority || 0) / 10);
    if (step.id === 'source-map-recovery' && Object.values(sourceMapHints).some(Boolean)) score += 40;
    if (step.id === 'ast-readability-pass' && code && inspection.family === 'unknown') score += 10;
    if (step.id === 'obfuscator-cleanup' && /string-table|control-flow|numeric-ascii|_0x/.test(haystack)) score += 12;
    if (step.id === 'semantic-search' && /api|url|fetch|xhr|sign|token|cookie|headers/.test(haystack)) score += 8;
    if (step.id === 'runtime-correlation' && /runtime truth|hook evidence|paused frame|browser evidence/.test(haystack)) score += 8;
    return {
      id: step.id,
      label: step.label,
      score,
      matched_signals: hits,
      tools: step.tools || [],
      local_scripts: step.local_scripts || [],
      exit_criteria: step.exit_criteria || [],
    };
  }).filter((item) => item.score >= 10 || item.matched_signals.length)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  const runtimeTemplate = (model.toolchain_steps || []).find((item) => item.id === 'runtime-correlation');
  const selected = ranked.filter((item) => item.id !== 'runtime-correlation').slice(0, 4);
  const runtimeRank = ranked.find((item) => item.id === 'runtime-correlation');
  const runtimeStep = runtimeRank || (runtimeTemplate
    ? {
        id: runtimeTemplate.id,
        label: runtimeTemplate.label,
        score: 0,
        matched_signals: [],
        tools: runtimeTemplate.tools,
        local_scripts: runtimeTemplate.local_scripts,
        exit_criteria: runtimeTemplate.exit_criteria,
      }
    : null);
  if (runtimeStep) {
    selected.push({
      ...runtimeStep,
      verification_gate: true,
    });
  }

  return {
    schema: 'js-reverse-ops-static-toolchain-plan-v1',
    generated_at: new Date().toISOString(),
    target: args.target,
    inspection: {
      family: inspection.family,
      signals: inspection.signals || {},
    },
    source_map_hints: sourceMapHints,
    selected_steps: selected.map((item, index) => ({ order: index + 1, ...item })),
    recommended_step: selected[0] ? { order: 1, ...selected[0] } : null,
    boundary: 'Static toolchain planning reduces reading cost. It does not verify runtime behavior, server acceptance, or replay parity.',
  };
}

function renderMarkdown(plan) {
  const lines = [];
  lines.push('# Static Toolchain Plan');
  lines.push('');
  lines.push(`- Target: \`${plan.target}\``);
  lines.push(`- Family: \`${plan.inspection.family || 'unknown'}\``);
  lines.push(`- Recommended step: \`${plan.recommended_step?.id || 'none'}\``);
  lines.push('');
  lines.push('## Selected Steps');
  lines.push('');
  for (const step of plan.selected_steps) {
    lines.push(`### ${step.order}. ${step.id}`);
    lines.push('');
    lines.push(`- Matched: ${step.matched_signals.join(', ') || 'none'}`);
    lines.push(`- Tools: ${step.tools.map((tool) => `\`${tool}\``).join(', ')}`);
    lines.push(`- Local scripts: ${step.local_scripts.map((script) => `\`${script}\``).join(', ')}`);
    lines.push(`- Exit: ${step.exit_criteria.join('; ')}`);
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
