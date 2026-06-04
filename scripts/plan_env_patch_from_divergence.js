#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

function usage() {
  console.error('Usage: plan_env_patch_from_divergence.js [--divergence <json>] [--notes <text-or-file>] [--json]');
  process.exit(1);
}

function parseArgs(argv) {
  const args = { divergence: '', notes: '', json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--divergence') {
      args.divergence = argv[index + 1] || '';
      index += 1;
    } else if (item === '--notes') {
      args.notes = argv[index + 1] || '';
      index += 1;
    } else if (item === '--json') {
      args.json = true;
    } else if (item === '--help' || item === '-h') {
      usage();
    } else if (!args.divergence && fs.existsSync(path.resolve(item))) {
      args.divergence = item;
    } else if (!args.notes) {
      args.notes = item;
    } else {
      usage();
    }
  }
  return args;
}

function readMaybeFile(value) {
  if (!value) return '';
  const candidate = path.resolve(value);
  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return fs.readFileSync(candidate, 'utf8');
  return value;
}

function loadJsonMaybe(file) {
  if (!file) return null;
  return JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
}

function normalize(value) {
  return String(value || '').toLowerCase();
}

function flattenStrings(value, out = []) {
  if (value == null) return out;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    out.push(String(value));
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) flattenStrings(item, out);
    return out;
  }
  if (typeof value === 'object') {
    for (const item of Object.values(value)) flattenStrings(item, out);
  }
  return out;
}

function sameArray(a, b) {
  return JSON.stringify([...(a || [])].sort()) === JSON.stringify([...(b || [])].sort());
}

function firstDivergence(record) {
  if (!record) return null;
  if (record.comparison) {
    const comparison = record.comparison;
    for (const [key, value] of Object.entries(comparison)) {
      if (value === false) return { source: 'comparison', kind: key.replace(/_match$/, ' mismatch'), detail: key };
    }
  }
  for (const sample of record.samples || []) {
    const expectedShape = Array.isArray(sample.expected_shape) ? sample.expected_shape : [];
    const observedShape = Array.isArray(sample.observed_shape) ? sample.observed_shape : [];
    if (expectedShape.length && observedShape.length && !sameArray(expectedShape, observedShape)) {
      return {
        source: 'sample',
        sample_id: sample.id || null,
        kind: 'shape mismatch',
        expected_shape: expectedShape,
        observed_shape: observedShape,
        status_code: sample.status_code ?? null,
      };
    }
    if (sample.divergence) return { source: 'sample', sample_id: sample.id || null, kind: 'explicit divergence', detail: sample.divergence };
    if (sample.status_code && Number(sample.status_code) >= 400) {
      return { source: 'sample', sample_id: sample.id || null, kind: `${sample.status_code} rejection`, status_code: sample.status_code };
    }
  }
  if (Number(record.divergence_count || 0) > 0) {
    return { source: 'record', kind: 'divergence_count nonzero', divergence_count: Number(record.divergence_count || 0) };
  }
  return null;
}

function signalHits(patchClass, haystack) {
  return (patchClass.signals || []).filter((signal) => {
    const normalized = normalize(signal);
    if (haystack.includes(normalized)) return true;
    const words = normalized.split(/[^a-z0-9]+/).filter((word) => word.length > 3);
    return words.length > 0 && words.every((word) => haystack.includes(word));
  });
}

function buildPlan(args) {
  const model = JSON.parse(fs.readFileSync(path.join(rootDir, 'assets/env-rebuild-divergence-model.json'), 'utf8'));
  const record = loadJsonMaybe(args.divergence);
  const notesText = readMaybeFile(args.notes);
  const divergence = firstDivergence(record);
  const synthesized = [];
  if (divergence?.kind) synthesized.push(divergence.kind);
  if (divergence?.expected_shape || divergence?.observed_shape) synthesized.push('expected_shape observed_shape shape mismatch observed error missing items branch selection');
  if (divergence?.status_code && Number(divergence.status_code) >= 400) synthesized.push(`${divergence.status_code} rejection 403 transport cookie`);
  const haystack = normalize(`${notesText} ${flattenStrings(record).join(' ')} ${synthesized.join(' ')}`);

  const patchPlan = (model.patch_classes || []).map((patchClass) => {
    const hits = signalHits(patchClass, haystack);
    const score = hits.length * 10 + Math.round((patchClass.priority || 0) / 10);
    return {
      id: patchClass.id,
      label: patchClass.label,
      score,
      matched_signals: hits,
      patch_actions: patchClass.patch_actions || [],
      verification: patchClass.verification,
    };
  }).filter((item) => item.matched_signals.length)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  return {
    schema: 'js-reverse-ops-env-patch-plan-v1',
    generated_at: new Date().toISOString(),
    first_divergence: divergence,
    patch_plan: patchPlan,
    recommended_patch: patchPlan[0] || null,
    next_action: patchPlan[0]
      ? `Apply one ${patchPlan[0].id} patch and rerun replay/runtime comparison.`
      : 'No environment patch is justified by the supplied divergence record.',
    boundary: 'This plan proposes environment rebuild patches. It does not mark replay accepted or delivery ready.',
  };
}

function renderMarkdown(plan) {
  const lines = [];
  lines.push('# Environment Patch Plan');
  lines.push('');
  lines.push(`- First divergence: \`${plan.first_divergence?.kind || 'unknown'}\``);
  lines.push(`- Recommended patch: \`${plan.recommended_patch?.id || 'none'}\``);
  lines.push(`- Next action: ${plan.next_action}`);
  lines.push('');
  lines.push('## Patch Candidates');
  lines.push('');
  if (!plan.patch_plan.length) lines.push('- none');
  for (const patch of plan.patch_plan) {
    lines.push(`### ${patch.id}`);
    lines.push('');
    lines.push(`- Matched: ${patch.matched_signals.join(', ')}`);
    lines.push(`- Verify: ${patch.verification}`);
    lines.push('- Actions:');
    for (const action of patch.patch_actions) lines.push(`  - ${action}`);
    lines.push('');
  }
  lines.push('## Boundary');
  lines.push('');
  lines.push(plan.boundary);
  lines.push('');
  return lines.join('\n');
}

const args = parseArgs(process.argv.slice(2));
const result = buildPlan(args);
process.stdout.write(args.json ? `${JSON.stringify(result, null, 2)}\n` : renderMarkdown(result));
