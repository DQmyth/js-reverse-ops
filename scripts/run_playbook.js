#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const args = {
    target: '',
    notes: '',
    out: '',
    execute: false,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--notes') {
      args.notes = argv[index + 1] || '';
      index += 1;
    } else if (item === '--out') {
      args.out = argv[index + 1] || '';
      index += 1;
    } else if (item === '--execute') {
      args.execute = true;
    } else if (item === '--json') {
      args.json = true;
    } else if (item === '--help' || item === '-h') {
      args.help = true;
    } else if (!args.target) {
      args.target = item;
    }
  }
  return args;
}

function usage() {
  return [
    'Usage: node scripts/run_playbook.js <target-url-or-file> [--notes notes.md] [--out dir] [--execute] [--json]',
    '',
    'Turns router and playbook output into a concrete run directory.',
    'Default mode is dry-run: it writes the plan, hook scaffold, and command list without executing target scripts.',
  ].join('\n');
}

function safeTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function runJson(script, args) {
  const output = execFileSync(process.execPath, [path.join(rootDir, script), ...args, '--json'], {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(output);
}

function commandToArgv(command) {
  return command.match(/"[^"]*"|'[^']*'|\S+/g)
    .map((item) => item.replace(/^['"]|['"]$/g, ''));
}

function isExecutableLocalCommand(command) {
  const argv = commandToArgv(command);
  const script = argv.find((item) => item.startsWith('scripts/')) || '';
  if (!script) return false;
  if (/start_debug_browser|check_debug_browser|check_js_reverse_ops_deps|check_local_js_reverse_mcp/.test(script)) return false;
  return true;
}

function executeCommand(command) {
  const argv = commandToArgv(command);
  const bin = argv.shift();
  try {
    const stdout = execFileSync(bin, argv, {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { command, status: 'ok', stdout: stdout.slice(0, 20000), stderr: '' };
  } catch (error) {
    return {
      command,
      status: 'failed',
      exit_code: error.status || 1,
      stdout: String(error.stdout || '').slice(0, 20000),
      stderr: String(error.stderr || error.message || '').slice(0, 20000),
    };
  }
}

function writeHookScaffold(plan, outDir) {
  if (!plan.hook_presets || !plan.hook_presets.length) return null;
  const output = execFileSync(process.execPath, [
    path.join(rootDir, 'scripts/scaffold_hook_profile.js'),
    '--preset',
    plan.hook_presets.join(','),
    '--mode',
    'priority',
    '--target',
    plan.target || '',
    '--out',
    outDir,
  ], {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(output);
}

function renderMarkdown(run) {
  const lines = [];
  lines.push('# Playbook Run');
  lines.push('');
  lines.push(`- Target: \`${run.target}\``);
  lines.push(`- Family: \`${run.plan.family}\``);
  lines.push(`- Stage: \`${run.plan.stage}\``);
  if (run.plan.playbook) lines.push(`- Playbook: \`${run.plan.playbook}\``);
  if (run.plan.hook_presets.length) lines.push(`- Hook presets: \`${run.plan.hook_presets.join(', ')}\``);
  lines.push(`- Mode: \`${run.execute ? 'execute-local' : 'dry-run'}\``);
  lines.push('');
  lines.push('## Reasons');
  lines.push('');
  for (const reason of run.plan.reasons || []) lines.push(`- ${reason}`);
  lines.push('');
  lines.push('## Recommended Sequence');
  lines.push('');
  for (const item of run.plan.recommended_sequence || []) lines.push(`- ${item}`);
  lines.push('');
  lines.push('## Commands');
  lines.push('');
  for (const command of run.commands || []) lines.push(`- \`${command.command}\` (${command.action})`);
  if (run.executions && run.executions.length) {
    lines.push('');
    lines.push('## Execution Results');
    lines.push('');
    for (const result of run.executions) lines.push(`- ${result.status}: \`${result.command}\``);
  }
  lines.push('');
  lines.push('## Next Operator Actions');
  lines.push('');
  if (run.plan.playbook) lines.push(`- Read \`${run.plan.playbook}\` before widening analysis.`);
  if (run.hook_profile) lines.push('- Review `hook-profile.md` and fill target-specific instrumentation before browser execution.');
  lines.push('- Promote verified observations into claim, provenance, and replay artifacts before declaring completion.');
  lines.push('');
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.target) {
    console.log(usage());
    process.exit(args.help ? 0 : 1);
  }

  const planArgs = [args.target];
  if (args.notes) planArgs.push('--notes', args.notes);
  const plan = runJson('scripts/js_reverse_ops.js', planArgs);
  const outDir = path.resolve(rootDir, args.out || path.join('runs', `playbook-${safeTimestamp()}`));
  fs.mkdirSync(outDir, { recursive: true });

  const commands = (plan.next_commands || []).map((command) => ({
    command,
    action: args.execute && isExecutableLocalCommand(command) ? 'execute' : 'record',
  }));
  const executions = args.execute
    ? commands.filter((item) => item.action === 'execute').map((item) => executeCommand(item.command))
    : [];
  const hookProfile = writeHookScaffold(plan, outDir);
  const run = {
    schema: 'js-reverse-ops-playbook-run-v1',
    created_at: new Date().toISOString(),
    target: args.target,
    notes: args.notes || '',
    out_dir: outDir,
    execute: args.execute,
    plan,
    commands,
    executions,
    hook_profile: hookProfile,
  };

  fs.writeFileSync(path.join(outDir, 'playbook-run.json'), `${JSON.stringify(run, null, 2)}\n`);
  fs.writeFileSync(path.join(outDir, 'playbook-run.md'), renderMarkdown(run));

  const summary = {
    out_dir: outDir,
    family: plan.family,
    stage: plan.stage,
    playbook: plan.playbook,
    hook_presets: plan.hook_presets,
    commands: commands.length,
    executed: executions.length,
    files: ['playbook-run.json', 'playbook-run.md'].concat(hookProfile ? hookProfile.files : []),
  };
  process.stdout.write(args.json ? `${JSON.stringify(summary, null, 2)}\n` : `${renderSummary(summary)}\n`);
}

function renderSummary(summary) {
  return [
    `out_dir: ${summary.out_dir}`,
    `family: ${summary.family}`,
    `stage: ${summary.stage}`,
    summary.playbook ? `playbook: ${summary.playbook}` : 'playbook: none',
    `commands: ${summary.commands}`,
    `executed: ${summary.executed}`,
    `files: ${summary.files.join(', ')}`,
  ].join('\n');
}

main();
