#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const indexPath = path.join(rootDir, 'assets', 'case-pattern-index.json');

function parseArgs(argv) {
  const args = { input: '', text: '', json: false, top: 5 };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--json') args.json = true;
    else if (item === '--text') {
      args.text = argv[index + 1] || '';
      index += 1;
    } else if (item === '--top') {
      args.top = Number(argv[index + 1] || '5') || 5;
      index += 1;
    } else if (item === '--help' || item === '-h') {
      args.help = true;
    } else if (!args.input) {
      args.input = item;
    }
  }
  return args;
}

function usage() {
  return [
    'Usage: node scripts/map_case_to_pattern.js <notes-file> [--json] [--top N]',
    '       node scripts/map_case_to_pattern.js --text "observed symptoms" [--json]',
    '',
    'Maps sanitized reverse-engineering observations to reusable playbooks.',
  ].join('\n');
}

function readInput(args) {
  if (args.text) return args.text;
  if (!args.input) return '';
  return fs.readFileSync(args.input, 'utf8');
}

function normalize(text) {
  return text.toLowerCase().replace(/[^a-z0-9_$.\s-]/g, ' ');
}

function scorePattern(pattern, text) {
  const haystack = normalize(text);
  const hits = [];
  for (const signal of pattern.signals || []) {
    const needle = normalize(signal).trim();
    if (!needle) continue;
    const words = needle.split(/\s+/).filter(Boolean);
    const exact = haystack.includes(needle);
    const partial = words.length > 1 && words.every((word) => haystack.includes(word));
    if (exact || partial) hits.push(signal);
  }
  const score = hits.length / Math.max(1, (pattern.signals || []).length);
  return {
    id: pattern.id,
    playbook: pattern.playbook,
    stage: pattern.stage,
    score,
    hits,
    first_moves: pattern.first_moves || [],
    hook_presets: pattern.hook_presets || [],
    avoid: pattern.avoid || [],
  };
}

function rankPatterns(text, top) {
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  return (index.patterns || [])
    .map((pattern) => scorePattern(pattern, text))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || right.hits.length - left.hits.length)
    .slice(0, top);
}

function renderText(results) {
  if (!results.length) return 'no matching pattern found\n';
  const lines = [];
  for (const [index, result] of results.entries()) {
    lines.push(`${index + 1}. ${result.id} (${Math.round(result.score * 100)}%)`);
    lines.push(`   playbook: ${result.playbook}`);
    lines.push(`   stage: ${result.stage}`);
    if (result.hits.length) lines.push(`   hits: ${result.hits.join('; ')}`);
    if (result.hook_presets.length) lines.push(`   hook presets: ${result.hook_presets.join(', ')}`);
    if (result.first_moves.length) lines.push(`   first move: ${result.first_moves[0]}`);
  }
  return `${lines.join('\n')}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || (!args.input && !args.text)) {
    console.log(usage());
    process.exit(args.help ? 0 : 1);
  }
  const text = readInput(args);
  const results = rankPatterns(text, args.top);
  process.stdout.write(args.json ? `${JSON.stringify({ results }, null, 2)}\n` : renderText(results));
}

main();
