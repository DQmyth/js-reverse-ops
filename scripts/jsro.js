#!/usr/bin/env node

const { spawnSync } = require('child_process');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

const COMMANDS = {
  route: ['node', 'scripts/js_reverse_ops.js'],
  pattern: ['node', 'scripts/map_case_to_pattern.js'],
  run: ['node', 'scripts/run_playbook.js'],
  validate: ['node', 'scripts/validate_delivery_artifacts.js'],
  promote: ['node', 'scripts/promote_delivery_evidence.js'],
  benchmark: ['node', 'scripts/run_public_benchmarks.js'],
  scorecard: ['node', 'scripts/generate_capability_scorecard.js'],
  marketgap: ['node', 'scripts/generate_market_gap_scorecard.js'],
  capturegaps: ['node', 'scripts/diagnose_runtime_capture_gaps.js'],
  envpatch: ['node', 'scripts/plan_env_patch_from_divergence.js'],
  check: ['bash', 'scripts/check_public_release.sh'],
  install: ['bash', 'scripts/install_local.sh'],
  publish: ['bash', 'scripts/publish_release.sh'],
};

function usage() {
  return [
    'Usage: jsro <command> [...args]',
    '',
    'Commands:',
    '  route       Route a target to stage, scripts, and playbook',
    '  pattern     Map notes to reusable reverse patterns',
    '  run         Generate a playbook run directory',
    '  validate    Validate a playbook run delivery directory',
    '  promote     Promote hook or MCP evidence into a run directory',
    '  benchmark   Run public benchmarks',
    '  scorecard   Generate capability scorecard',
    '  marketgap   Generate market-leading reverse-skill gap scorecard',
    '  capturegaps Diagnose missing runtime capture surfaces',
    '  envpatch    Plan smallest environment patch from replay divergence',
    '  check       Run public release check',
    '  install     Install the skill locally',
    '  publish     Run release workflow',
  ].join('\n');
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === '--help' || command === '-h') {
    console.log(usage());
    process.exit(command ? 0 : 1);
  }
  const entry = COMMANDS[command];
  if (!entry) {
    console.error(`Unknown command: ${command}\n`);
    console.error(usage());
    process.exit(1);
  }
  const [bin, script] = entry;
  const result = spawnSync(bin, [path.join(rootDir, script), ...args], {
    cwd: rootDir,
    stdio: 'inherit',
  });
  process.exit(result.status || 0);
}

main();
