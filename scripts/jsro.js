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
  staticplan: ['node', 'scripts/plan_static_toolchain.js'],
  statictruth: ['node', 'scripts/assess_static_recovery_truth.js'],
  handoff: ['node', 'scripts/generate_domain_handoff_plan.js'],
  releaserisk: ['node', 'scripts/explain_public_release_risk.js'],
  externalmatrix: ['node', 'scripts/compare_external_skill_matrix.js'],
  mcpsmoke: ['node', 'scripts/plan_browser_mcp_smoke.js'],
  mcpsmokeverify: ['node', 'scripts/verify_browser_mcp_smoke_record.js'],
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
    '  staticplan  Plan static deobfuscation and toolchain steps',
    '  statictruth Assess whether static recovery is inferred or verified',
    '  handoff     Plan cross-domain artifact handoff',
    '  releaserisk Explain public release data-safety risk',
    '  externalmatrix Compare against external reverse-skill profiles',
    '  mcpsmoke   Plan browser MCP adapter smoke checks',
    '  mcpsmokeverify Verify browser MCP smoke execution records',
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
