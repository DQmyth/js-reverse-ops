#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

function usage() {
  console.error('Usage: diagnose_runtime_capture_gaps.js [--notes <text-or-file>] [--profile <hook-profile.json>] [--evidence <evidence.json>] [--json]');
  process.exit(1);
}

function parseArgs(argv) {
  const args = { notes: '', profile: '', evidence: '', json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--notes') {
      args.notes = argv[index + 1] || '';
      index += 1;
    } else if (item === '--profile') {
      args.profile = argv[index + 1] || '';
      index += 1;
    } else if (item === '--evidence') {
      args.evidence = argv[index + 1] || '';
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

function collectObserved(profile, evidence) {
  const observedText = [];
  const surfaces = new Set();
  for (const preset of profile?.presets || []) {
    for (const surface of preset.surfaces || []) surfaces.add(normalize(surface));
    observedText.push(preset.id, preset.label, ...(preset.focus || []), ...(preset.surfaces || []));
  }
  const hookEvidence = evidence?.hook_evidence || evidence || {};
  observedText.push(...flattenStrings(hookEvidence));
  return {
    surfaces,
    text: normalize(observedText.join(' ')),
  };
}

function signalHits(surface, haystack) {
  return (surface.signals || []).filter((signal) => {
    const normalized = normalize(signal);
    if (!normalized) return false;
    if (haystack.includes(normalized)) return true;
    const words = normalized.split(/[^a-z0-9]+/).filter((word) => word.length > 3);
    return words.length > 0 && words.every((word) => haystack.includes(word));
  });
}

function isCovered(surface, observed) {
  const observedText = observed.text;
  if ((surface.signals || []).some((signal) => observedText.includes(normalize(signal)))) return true;
  for (const observedSurface of observed.surfaces) {
    if ((surface.signals || []).some((signal) => observedSurface.includes(normalize(signal)))) return true;
    if (normalize(surface.label).includes(observedSurface)) return true;
  }
  return false;
}

function diagnose(args) {
  const modelPath = path.join(rootDir, 'assets/runtime-capture-surface-model.json');
  const model = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
  const profile = loadJsonMaybe(args.profile);
  const evidence = loadJsonMaybe(args.evidence);
  const notesText = readMaybeFile(args.notes);
  const observed = collectObserved(profile, evidence);
  const haystack = normalize(`${notesText} ${observed.text}`);

  const evaluated = (model.surfaces || []).map((surface) => {
    const hits = signalHits(surface, haystack);
    const covered = isCovered(surface, observed);
    const score = hits.length * 10 + Math.round((surface.priority || 0) / 10) + (covered ? -12 : 0);
    return {
      id: surface.id,
      label: surface.label,
      priority: surface.priority,
      score,
      covered,
      matched_signals: hits,
      presets: surface.presets || [],
      exit_criteria: surface.exit_criteria || [],
    };
  }).sort((a, b) => b.score - a.score || b.priority - a.priority || a.id.localeCompare(b.id));

  const missing = evaluated.filter((item) => item.matched_signals.length && !item.covered);
  const covered = evaluated.filter((item) => item.covered);
  const recommendationCutoff = Math.max(20, missing[0]?.score ? missing[0].score - 20 : 20);
  const recommendedPresets = [...new Set(
    missing
      .filter((item) => item.score >= recommendationCutoff)
      .slice(0, 4)
      .flatMap((item) => item.presets),
  )];
  const captureMode = missing.length <= 2 ? 'priority' : 'summary';
  return {
    schema: 'js-reverse-ops-runtime-capture-gap-diagnosis-v1',
    generated_at: new Date().toISOString(),
    input_summary: {
      notes_supplied: Boolean(notesText),
      profile_supplied: Boolean(profile),
      evidence_supplied: Boolean(evidence),
    },
    capture_mode: captureMode,
    missing_surfaces: missing,
    covered_surfaces: covered.map((item) => ({
      id: item.id,
      label: item.label,
      matched_signals: item.matched_signals,
    })),
    recommended_presets: recommendedPresets,
    next_action: missing[0]
      ? `Add ${missing[0].id} capture before widening unrelated runtime hooks.`
      : 'Current notes/evidence do not justify widening runtime capture.',
    boundary: 'This diagnosis ranks capture gaps. It does not prove signer correctness, server acceptance, or replay parity.',
  };
}

function renderMarkdown(result) {
  const lines = [];
  lines.push('# Runtime Capture Gap Diagnosis');
  lines.push('');
  lines.push(`- Capture mode: \`${result.capture_mode}\``);
  lines.push(`- Recommended presets: ${result.recommended_presets.map((item) => `\`${item}\``).join(', ') || '`none`'}`);
  lines.push(`- Next action: ${result.next_action}`);
  lines.push('');
  lines.push('## Missing Surfaces');
  lines.push('');
  if (!result.missing_surfaces.length) lines.push('- none');
  for (const item of result.missing_surfaces) {
    lines.push(`- \`${item.id}\`: ${item.label}`);
    lines.push(`  - matched: ${item.matched_signals.join(', ')}`);
    lines.push(`  - presets: ${item.presets.map((preset) => `\`${preset}\``).join(', ')}`);
  }
  lines.push('');
  lines.push('## Boundary');
  lines.push('');
  lines.push(result.boundary);
  lines.push('');
  return lines.join('\n');
}

const args = parseArgs(process.argv.slice(2));
const result = diagnose(args);
process.stdout.write(args.json ? `${JSON.stringify(result, null, 2)}\n` : renderMarkdown(result));
