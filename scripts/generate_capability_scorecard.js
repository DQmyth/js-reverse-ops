#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const modelPath = path.join(rootDir, 'assets', 'capability-scorecard-model.json');

function parseArgs(argv) {
  const args = { json: false, out: '', markdown: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--json') args.json = true;
    else if (item === '--out') {
      args.out = path.resolve(rootDir, argv[index + 1] || '');
      index += 1;
    } else if (item === '--markdown') {
      args.markdown = path.resolve(rootDir, argv[index + 1] || '');
      index += 1;
    } else if (item === '--help' || item === '-h') {
      args.help = true;
    }
  }
  return args;
}

function usage() {
  return [
    'Usage: node scripts/generate_capability_scorecard.js [--json] [--out scorecard.json] [--markdown scorecard.md]',
    '',
    'Generates a public capability scorecard from repository evidence and benchmark results.',
  ].join('\n');
}

function exists(relPath) {
  return resolveRepoPath(relPath) !== null;
}

function resolveRepoPath(relPath) {
  const candidates = [
    path.join(rootDir, relPath),
    path.join(rootDir, 'public', relPath),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function runBenchmarks() {
  try {
    const output = execFileSync(process.execPath, [path.join(rootDir, 'scripts/run_public_benchmarks.js'), '--json'], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return JSON.parse(output);
  } catch (error) {
    return {
      total: 0,
      passed: 0,
      failed: 1,
      error: String(error.stderr || error.message || ''),
    };
  }
}

function scoreDimension(dimension, benchmark) {
  const present = (dimension.evidence || []).filter(exists);
  let score = present.length / Math.max(1, (dimension.evidence || []).length);
  const notes = [];
  if (present.length !== (dimension.evidence || []).length) {
    notes.push(`missing: ${(dimension.evidence || []).filter((item) => !present.includes(item)).join(', ')}`);
  }
  if (dimension.id === 'public_benchmarks') {
    const passRate = benchmark.total ? benchmark.passed / benchmark.total : 0;
    score = Math.min(score, passRate);
    notes.push(`benchmark pass rate: ${benchmark.passed || 0}/${benchmark.total || 0}`);
  }
  if (dimension.id === 'delivery_artifacts') {
    const runnerCase = (benchmark.results || []).find((item) => item.type === 'playbook_run');
    if (!runnerCase || !runnerCase.ok) score = Math.min(score, 0.5);
    else notes.push('playbook-run delivery validation passed');
  }
  if (dimension.id === 'evidence_promotion') {
    const promoteCase = (benchmark.results || []).find((item) => item.type === 'promote_evidence');
    if (!promoteCase || !promoteCase.ok) score = Math.min(score, 0.5);
    else notes.push('runtime evidence promotion validation passed');
  }
  return {
    id: dimension.id,
    label: dimension.label,
    weight: dimension.weight,
    score,
    weighted_score: score * dimension.weight,
    evidence_present: present,
    evidence_required: dimension.evidence || [],
    notes,
  };
}

function buildScorecard() {
  const model = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
  const benchmark = runBenchmarks();
  const dimensions = (model.dimensions || []).map((dimension) => scoreDimension(dimension, benchmark));
  const totalWeight = dimensions.reduce((sum, item) => sum + item.weight, 0);
  const weightedScore = dimensions.reduce((sum, item) => sum + item.weighted_score, 0);
  return {
    schema: 'js-reverse-ops-capability-scorecard-v1',
    generated_at: new Date().toISOString(),
    total_score: totalWeight ? Math.round((weightedScore / totalWeight) * 100) : 0,
    benchmark_summary: {
      total: benchmark.total || 0,
      passed: benchmark.passed || 0,
      failed: benchmark.failed || 0,
      pattern_total: benchmark.pattern_total || 0,
      route_total: benchmark.route_total || 0,
      playbook_total: benchmark.playbook_total || 0,
      static_recover_total: benchmark.static_recover_total || 0,
      static_truth_total: benchmark.static_truth_total || 0,
      promote_evidence_total: benchmark.promote_evidence_total || 0,
      external_matrix_total: benchmark.external_matrix_total || 0,
      mcp_smoke_total: benchmark.mcp_smoke_total || 0,
    },
    dimensions,
    interpretation: {
      strong_when: [
        'the task needs staged reverse workflow rather than one-off tool execution',
        'observations should map to reusable playbooks and auditable delivery artifacts',
        'public-safe release and benchmark gates matter',
      ],
      weaker_when: [
        'the task requires a very large built-in live browser MCP tool surface',
        'the task is exclusively deep static deobfuscation with no replay or runtime objective',
        'the task requires npm or registry-based distribution instead of repository scripts',
      ],
    },
  };
}

function renderMarkdown(scorecard) {
  const lines = [];
  lines.push('# Capability Scorecard');
  lines.push('');
  lines.push(`- Total score: \`${scorecard.total_score}/100\``);
  lines.push(`- Benchmarks: \`${scorecard.benchmark_summary.passed}/${scorecard.benchmark_summary.total}\``);
  lines.push('');
  lines.push('| Dimension | Score | Evidence |');
  lines.push('| --- | ---: | --- |');
  for (const item of scorecard.dimensions) {
    lines.push(`| ${item.label} | ${Math.round(item.score * 100)} | ${item.evidence_present.join(', ')} |`);
  }
  lines.push('');
  lines.push('## Strong When');
  lines.push('');
  for (const item of scorecard.interpretation.strong_when) lines.push(`- ${item}`);
  lines.push('');
  lines.push('## Weaker When');
  lines.push('');
  for (const item of scorecard.interpretation.weaker_when) lines.push(`- ${item}`);
  lines.push('');
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  const scorecard = buildScorecard();
  if (args.out) fs.writeFileSync(args.out, `${JSON.stringify(scorecard, null, 2)}\n`);
  if (args.markdown) fs.writeFileSync(args.markdown, renderMarkdown(scorecard));
  process.stdout.write(args.json ? `${JSON.stringify(scorecard, null, 2)}\n` : renderMarkdown(scorecard));
}

main();
