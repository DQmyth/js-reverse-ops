#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const modelPath = path.join(rootDir, 'assets', 'market-leading-gap-model.json');

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
    'Usage: node scripts/generate_market_gap_scorecard.js [--json] [--out scorecard.json] [--markdown scorecard.md]',
    '',
    'Generates a market-leading reverse-skill gap scorecard from repository evidence.',
  ].join('\n');
}

function resolveRepoPath(relPath) {
  const candidates = [
    path.join(rootDir, relPath),
    path.join(rootDir, 'public', relPath),
    path.join(rootDir, relPath.replace(/^public\//, '')),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function scoreDimension(dimension) {
  const baselineRequired = dimension.evidence || [];
  const advancedRequired = dimension.advanced_evidence || [];
  const baselinePresent = baselineRequired.filter((item) => resolveRepoPath(item));
  const advancedPresent = advancedRequired.filter((item) => resolveRepoPath(item));
  const baselineMissing = baselineRequired.filter((item) => !baselinePresent.includes(item));
  const advancedMissing = advancedRequired.filter((item) => !advancedPresent.includes(item));
  const baselineScore = baselinePresent.length / Math.max(1, baselineRequired.length);
  const advancedScore = advancedRequired.length ? advancedPresent.length / advancedRequired.length : 1;
  const score = (baselineScore * 0.6) + (advancedScore * 0.4);
  let status = 'covered';
  if (baselineScore < 0.75) status = 'gap';
  else if (advancedScore < 1) status = 'partial';
  return {
    id: dimension.id,
    label: dimension.label,
    weight: dimension.weight,
    score,
    baseline_score: baselineScore,
    advanced_score: advancedScore,
    weighted_score: score * dimension.weight,
    status,
    market_signal: dimension.market_signal,
    target_behavior: dimension.target_behavior,
    evidence_present: baselinePresent,
    evidence_missing: baselineMissing,
    advanced_evidence_present: advancedPresent,
    advanced_evidence_missing: advancedMissing,
  };
}

function buildScorecard() {
  const model = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
  const dimensions = (model.dimensions || []).map(scoreDimension);
  const totalWeight = dimensions.reduce((sum, item) => sum + item.weight, 0);
  const weightedScore = dimensions.reduce((sum, item) => sum + item.weighted_score, 0);
  const priorities = dimensions
    .filter((item) => item.status !== 'covered')
    .sort((a, b) => (b.weighted_gap || (b.weight * (1 - b.score))) - (a.weighted_gap || (a.weight * (1 - a.score))))
    .map((item) => ({
      id: item.id,
      label: item.label,
      status: item.status,
      missing: item.evidence_missing,
      advanced_missing: item.advanced_evidence_missing,
      next_action: item.target_behavior,
    }));
  return {
    schema: 'js-reverse-ops-market-gap-scorecard-v1',
    generated_at: new Date().toISOString(),
    model_updated_at: model.updated_at,
    total_score: totalWeight ? Math.round((weightedScore / totalWeight) * 100) : 0,
    comparison_scope: model.comparison_scope || [],
    summary: {
      covered: dimensions.filter((item) => item.status === 'covered').length,
      partial: dimensions.filter((item) => item.status === 'partial').length,
      gap: dimensions.filter((item) => item.status === 'gap').length,
      total: dimensions.length,
    },
    dimensions,
    priorities,
  };
}

function renderMarkdown(scorecard) {
  const lines = [];
  lines.push('# Market Gap Scorecard');
  lines.push('');
  lines.push(`- Total score: \`${scorecard.total_score}/100\``);
  lines.push(`- Coverage: \`${scorecard.summary.covered} covered / ${scorecard.summary.partial} partial / ${scorecard.summary.gap} gap\``);
  lines.push('');
  lines.push('## Comparison Scope');
  lines.push('');
  for (const item of scorecard.comparison_scope) lines.push(`- ${item}`);
  lines.push('');
  lines.push('## Dimensions');
  lines.push('');
  lines.push('| Dimension | Score | Baseline | Advanced | Status | Advanced gap |');
  lines.push('| --- | ---: | ---: | ---: | --- | --- |');
  for (const item of scorecard.dimensions) {
    lines.push(`| ${item.label} | ${Math.round(item.score * 100)} | ${Math.round(item.baseline_score * 100)} | ${Math.round(item.advanced_score * 100)} | ${item.status} | ${item.advanced_evidence_missing.join(', ') || '-'} |`);
  }
  lines.push('');
  lines.push('## Priority Improvements');
  lines.push('');
  if (!scorecard.priorities.length) {
    lines.push('- No uncovered market-gap dimensions in the current evidence model.');
  } else {
    for (const item of scorecard.priorities) {
      lines.push(`- ${item.label}: ${item.next_action}`);
      if (item.advanced_missing.length) lines.push(`  Missing advanced evidence: ${item.advanced_missing.join(', ')}`);
    }
  }
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
