#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const modelPath = path.join(rootDir, 'assets', 'external-skill-regression-model.json');

function usage() {
  console.error([
    'Usage: compare_external_skill_matrix.js [--focus <dimension-id>] [--json] [--markdown <out.md>]',
    '',
    'Compares js-reverse-ops against external reverse-engineering skill/toolchain capability profiles.',
  ].join('\n'));
  process.exit(1);
}

function parseArgs(argv) {
  const args = { focus: '', json: false, markdown: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--focus') {
      args.focus = argv[index + 1] || '';
      index += 1;
    } else if (item === '--json') {
      args.json = true;
    } else if (item === '--markdown') {
      args.markdown = path.resolve(rootDir, argv[index + 1] || '');
      index += 1;
    } else if (item === '--help' || item === '-h') {
      usage();
    } else {
      usage();
    }
  }
  return args;
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

function scoreJsReverseOps(dimension) {
  const required = dimension.js_reverse_ops_evidence || [];
  const present = required.filter((item) => resolveRepoPath(item));
  const evidenceScore = present.length / Math.max(1, required.length);
  const maturityScore = Number(dimension.js_reverse_ops_maturity_score || 100);
  return {
    profile_id: 'js-reverse-ops',
    score: Math.round(evidenceScore * maturityScore),
    evidence_score: Math.round(evidenceScore * 100),
    maturity_score: maturityScore,
    evidence_present: present,
    evidence_missing: required.filter((item) => !present.includes(item)),
    quality_gates: dimension.quality_gates || [],
  };
}

function profileScore(profile, dimension, jsScore) {
  if (profile.id === 'js-reverse-ops') return jsScore;
  const score = Number((profile.scores || {})[dimension.id] || 0);
  return {
    profile_id: profile.id,
    score,
    evidence_present: [],
    evidence_missing: [],
    quality_gates: [],
  };
}

function buildMatrix(args) {
  const model = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
  const dimensions = args.focus
    ? (model.dimensions || []).filter((dimension) => dimension.id === args.focus)
    : (model.dimensions || []);
  if (args.focus && !dimensions.length) {
    throw new Error(`unknown focus dimension: ${args.focus}`);
  }

  const rows = dimensions.map((dimension) => {
    const jsScore = scoreJsReverseOps(dimension);
    const scores = (model.profiles || []).map((profile) => profileScore(profile, dimension, jsScore))
      .sort((a, b) => b.score - a.score || a.profile_id.localeCompare(b.profile_id));
    const leader = scores[0] || null;
    const jsRank = scores.findIndex((item) => item.profile_id === 'js-reverse-ops') + 1;
    const jsEntry = scores.find((item) => item.profile_id === 'js-reverse-ops');
    const marketBest = scores.find((item) => item.profile_id !== 'js-reverse-ops');
    const gapToMarketBest = marketBest ? Math.max(0, marketBest.score - jsEntry.score) : 0;
    return {
      id: dimension.id,
      label: dimension.label,
      weight: dimension.weight,
      market_pressure: dimension.market_pressure,
      leader: leader && leader.profile_id,
      js_reverse_ops_rank: jsRank,
      js_reverse_ops_score: jsEntry.score,
      market_best_score: marketBest ? marketBest.score : 0,
      gap_to_market_best: gapToMarketBest,
      scores,
      next_action: gapToMarketBest > 0 ? dimension.next_action_if_behind : 'Keep this regression covered with public benchmarks and release checks.',
    };
  });

  const weightedProfiles = (model.profiles || []).map((profile) => {
    const weighted = rows.reduce((sum, row) => {
      const score = (row.scores.find((item) => item.profile_id === profile.id) || {}).score || 0;
      return sum + (score * row.weight);
    }, 0);
    const totalWeight = rows.reduce((sum, row) => sum + row.weight, 0);
    return {
      id: profile.id,
      label: profile.label,
      kind: profile.kind,
      score: totalWeight ? Math.round(weighted / totalWeight) : 0,
      notes: profile.notes,
    };
  }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  return {
    schema: 'js-reverse-ops-external-skill-regression-matrix-v1',
    generated_at: new Date().toISOString(),
    model_updated_at: model.updated_at,
    focus: args.focus || 'all',
    total_dimensions: rows.length,
    profiles: weightedProfiles,
    js_reverse_ops: weightedProfiles.find((item) => item.id === 'js-reverse-ops') || null,
    rows,
    priority_improvements: rows
      .filter((row) => row.gap_to_market_best > 0)
      .sort((a, b) => (b.gap_to_market_best * b.weight) - (a.gap_to_market_best * a.weight))
      .map((row) => ({
        dimension: row.id,
        label: row.label,
        gap_to_market_best: row.gap_to_market_best,
        next_action: row.next_action,
      })),
    interpretation: {
      use_for: [
        'choosing the next js-reverse-ops improvement against external tool pressure',
        'checking whether a new feature closes a real competitive gap',
        'keeping public claims tied to repository evidence instead of prose-only comparison'
      ],
      not_for: [
        'claiming one external project is globally better than another',
        'treating static recovery or planned MCP actions as runtime-verified evidence'
      ]
    }
  };
}

function renderMarkdown(matrix) {
  const lines = [];
  lines.push('# External Skill Regression Matrix');
  lines.push('');
  lines.push(`- Focus: \`${matrix.focus}\``);
  lines.push(`- Dimensions: \`${matrix.total_dimensions}\``);
  lines.push(`- js-reverse-ops score: \`${matrix.js_reverse_ops ? matrix.js_reverse_ops.score : 0}/100\``);
  lines.push('');
  lines.push('## Profile Scores');
  lines.push('');
  lines.push('| Profile | Score | Kind |');
  lines.push('| --- | ---: | --- |');
  for (const profile of matrix.profiles) {
    lines.push(`| ${profile.label} | ${profile.score} | ${profile.kind} |`);
  }
  lines.push('');
  lines.push('## Dimensions');
  lines.push('');
  lines.push('| Dimension | Leader | js-reverse-ops | Market best | Next action |');
  lines.push('| --- | --- | ---: | ---: | --- |');
  for (const row of matrix.rows) {
    lines.push(`| ${row.label} | ${row.leader} | ${row.js_reverse_ops_score} | ${row.market_best_score} | ${row.next_action} |`);
  }
  lines.push('');
  lines.push('## Priority Improvements');
  lines.push('');
  if (!matrix.priority_improvements.length) lines.push('- No external regression gaps in the selected dimensions.');
  for (const item of matrix.priority_improvements) {
    lines.push(`- ${item.label}: gap ${item.gap_to_market_best}; ${item.next_action}`);
  }
  lines.push('');
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  let matrix;
  try {
    matrix = buildMatrix(args);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  if (args.markdown) fs.writeFileSync(args.markdown, renderMarkdown(matrix));
  process.stdout.write(args.json ? `${JSON.stringify(matrix, null, 2)}\n` : renderMarkdown(matrix));
}

main();
