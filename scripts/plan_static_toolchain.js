#!/usr/bin/env node
// plan_static_toolchain — ranks the static-recovery steps for one file, by what the file contains
// and by what inspect_obfuscation_family.js says it is; each local script it names carries what the
// test suite proves about it. The steps come from assets/static-toolchain-decision-model.json.
// A plan ranks; it verifies nothing.
// Usage: node scripts/plan_static_toolchain.js <target.js> [--notes <text-or-file>] [--json]
// Output: markdown, or the same plan as JSON with --json. Starts with what the inspector says to
// run (next_tools). Every local script is printed with its evidence — the scripts catalog's third
// column, from assets/script-evidence.json; a step's third-party tools with what was measured
// here, where anything was (`tools_measured` in the model).
// `scripts/unbundle.js` is listed only when the inspector offers it (its next_tools): for a
// bundle whose modules are all in the file, for a bundle with the chunk files it loads (the step's
// note says to pass them), for a runtime file, and for a chunk file. Not for a file of several
// bundles — what the inspector lists under `not_offered` is listed under not_offered here too.
// Exit 0 for a readable file, 1 for a usage error.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');

function usage() {
  console.error('Usage: plan_static_toolchain.js <target.js> [--notes <text-or-file>] [--json]');
  process.exit(1);
}

// what the suite proves about a script — the catalog's evidence column, same words
const EVIDENCE_LABEL = { 'real-sample': 'real sample', 'input-not-from-a-tool': 'not from a tool', untested: 'untested' };
function scriptEvidence() {
  try {
    const recorded = JSON.parse(fs.readFileSync(path.join(rootDir, 'assets', 'script-evidence.json'), 'utf8'));
    return (script) => {
      const record = recorded.scripts[path.basename(script)];
      return record && EVIDENCE_LABEL[record.tier] ? EVIDENCE_LABEL[record.tier] : 'untested';
    };
  } catch (error) {
    return () => 'untested';
  }
}

// what the inspector knows about this file decides what "bundle-splitting" is here
function bundleNote(inspection, offered) {
  const webpack = (inspection.details && inspection.details.webpack) || null;
  const chunk = (inspection.details && inspection.details.webpack_chunk) || null;
  if (chunk) {
    return `a webpack chunk file (chunk ${chunk.chunk_ids.join(', ')}): scripts/unbundle.js splits it into its ${chunk.module_count} module(s); it does nothing on its own — the bundle that loads it is another file`;
  }
  if (webpack && webpack.bundles_in_file > 1) {
    return `several webpack bundles stand in this file (${webpack.bundles_in_file}), bundles that were bundled again${inspection.details.esbuild ? ' by esbuild' : ''}: unbundle.js cuts a file with one bundle and refuses this one`;
  }
  if (webpack && webpack.module_count === 0) {
    return 'webpack\'s runtime on its own: the bootstrap and no module — every module, the entry\'s included, stands in a chunk file. Cut it with them: node scripts/unbundle.js <runtime.js> <chunk.js> … --out <dir> makes one tree of all of them';
  }
  if (webpack && webpack.chunk_loading) {
    const asked = webpack.chunk_calls.length ? `it asks for chunk ${webpack.chunk_calls.join(', ')}` : 'its chunk loader is written into the bootstrap';
    return `this bundle loads chunks at run time (${asked}): cut it together with those chunk files — node scripts/unbundle.js <bundle.js> <chunk.js> … --out <dir> makes one tree of all of them; handed the bundle alone the tool refuses`;
  }
  if (offered.has('scripts/unbundle.js')) return 'all modules are in this file: scripts/unbundle.js gives one file per module and a runtime.js that runs like the bundle';
  return null;
}

// a model step as the plan carries it
function describeStep(step, evidenceOf, note, offered) {
  const localScripts = (step.local_scripts || []).filter((script) => script !== 'scripts/unbundle.js' || offered.has(script));
  return {
    tools: step.tools || [],
    tools_measured: step.tools_measured || null,
    local_scripts: localScripts,
    local_script_evidence: Object.fromEntries(localScripts.map((script) => [script, evidenceOf(script)])),
    note: note || null,
    exit_criteria: step.exit_criteria || [],
  };
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

// signals written with capitals mean exactly that: `Function(` is the dynamic constructor, and
// every file with a plain `function (` in it is not evidence of one
function signalHits(step, haystack, rawHaystack) {
  return (step.signals || []).filter((signal) => {
    if (/[A-Z]/.test(signal)) return rawHaystack.includes(signal);
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
  const rawHaystack = `${args.target} ${notesText} ${code.slice(0, 20000)} ${inspection.family || ''} ${signalText}`;
  const haystack = normalize(rawHaystack);
  const evidenceOf = scriptEvidence();
  // the inspector's next_tools is the one list of local tools that is checked against the file
  const nextTools = inspection.next_tools || [];
  const offered = new Set(nextTools.map((tool) => tool.script));

  const ranked = (model.toolchain_steps || []).map((step) => {
    const hits = signalHits(step, haystack, rawHaystack);
    let score = hits.length * 10 + Math.round((step.priority || 0) / 10);
    if (step.id === 'source-map-recovery' && Object.values(sourceMapHints).some(Boolean)) score += 40;
    // when the inspector offers this step's local tool, the file is what the step is for —
    // whatever words it happens to contain
    if (step.id === 'bundle-splitting' && offered.has('scripts/unbundle.js')) score += 40;
    if (step.id === 'ast-readability-pass' && code && inspection.family === 'unknown') score += 10;
    if (step.id === 'obfuscator-cleanup' && /string-table|control-flow|numeric-ascii|_0x/.test(haystack)) score += 12;
    if (step.id === 'semantic-search' && /api|url|fetch|xhr|sign|token|cookie|headers/.test(haystack)) score += 8;
    if (step.id === 'runtime-correlation' && /runtime truth|hook evidence|paused frame|browser evidence/.test(haystack)) score += 8;
    return {
      id: step.id,
      label: step.label,
      score,
      matched_signals: hits,
      ...describeStep(step, evidenceOf, step.id === 'bundle-splitting' ? bundleNote(inspection, offered) : null, offered),
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
        ...describeStep(runtimeTemplate, evidenceOf, null, offered),
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
      next_tools: nextTools,
      // a local tool that looks like the next one, and why it is not for this file
      not_offered: inspection.not_offered || [],
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
  // first, what the inspector says to run: each of these is checked against files like this one
  if (plan.inspection.next_tools.length) {
    lines.push('- From the inspector:');
    for (const tool of plan.inspection.next_tools) lines.push(`  - \`${tool.script}\` — ${tool.why}`);
  } else {
    lines.push('- From the inspector: no local tool offered for this file');
  }
  // a local tool that looks like the next one, and why it is not for this file
  if ((plan.inspection.not_offered || []).length) {
    lines.push('- Not for this file:');
    for (const tool of plan.inspection.not_offered) lines.push(`  - \`${tool.script}\` — ${tool.why}`);
  }
  lines.push('');
  lines.push('## Selected Steps');
  lines.push('');
  for (const step of plan.selected_steps) {
    lines.push(`### ${step.order}. ${step.id}`);
    lines.push('');
    lines.push(`- Matched: ${step.matched_signals.join(', ') || 'none'}`);
    lines.push(`- Tools: ${step.tools.map((tool) => `\`${tool}\``).join(', ')}`);
    if (step.tools_measured) lines.push(`- Measured here: ${step.tools_measured}`);
    lines.push(`- Local scripts: ${step.local_scripts.map((script) => `\`${script}\` (${step.local_script_evidence[script]})`).join(', ') || 'none'}`);
    if (step.note) lines.push(`- Note: ${step.note}`);
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
