#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function usage() {
  console.error('Usage: node scaffold_hook_profile.js --preset <id[,id...]> [--mode summary|priority|incremental] [--out <dir>] [--target <description>]');
  process.exit(1);
}

function parseArgs(argv) {
  const args = { preset: '', mode: 'summary', out: process.cwd(), target: '' };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--preset') args.preset = argv[++i] || '';
    else if (arg === '--mode') args.mode = argv[++i] || 'summary';
    else if (arg === '--out') args.out = argv[++i] || process.cwd();
    else if (arg === '--target') args.target = argv[++i] || '';
    else usage();
  }
  if (!args.preset) usage();
  return args;
}

function readPresets() {
  const assetPath = path.resolve(__dirname, '..', 'assets', 'hook-presets.json');
  return JSON.parse(fs.readFileSync(assetPath, 'utf8'));
}

function buildPlan(presetsJson, presetIds, mode, target) {
  const modeDef = presetsJson.capture_modes.find((item) => item.id === mode);
  if (!modeDef) throw new Error(`Unknown mode: ${mode}`);
  const presets = presetIds.map((id) => {
    const preset = presetsJson.presets.find((item) => item.id === id);
    if (!preset) throw new Error(`Unknown preset: ${id}`);
    return preset;
  });
  return {
    created_at: new Date().toISOString(),
    target: target || '',
    capture_mode: modeDef,
    presets,
    next_steps: [
      'install preload instrumentation early if the target logic runs during bootstrap',
      'capture summary hook evidence before requesting raw payloads',
      'promote only matching hook evidence into claim and provenance artifacts'
    ]
  };
}

function renderMarkdown(plan) {
  const lines = [];
  lines.push('# Hook Profile');
  lines.push('');
  if (plan.target) {
    lines.push(`- Target: \`${plan.target}\``);
  }
  lines.push(`- Capture mode: \`${plan.capture_mode.id}\``);
  lines.push(`- Mode use_when: ${plan.capture_mode.use_when}`);
  lines.push('');
  lines.push('## Capture Behavior');
  lines.push('');
  for (const item of plan.capture_mode.behavior) {
    lines.push(`- ${item}`);
  }
  lines.push('');
  lines.push('## Presets');
  lines.push('');
  for (const preset of plan.presets) {
    lines.push(`### ${preset.label}`);
    lines.push('');
    lines.push(`- Preset id: \`${preset.id}\``);
    lines.push(`- Stage: \`${preset.stage}\``);
    lines.push(`- Use when: ${preset.use_when}`);
    lines.push('- Surfaces:');
    for (const surface of preset.surfaces) {
      lines.push(`  - ${surface}`);
    }
    lines.push('- Focus:');
    for (const focus of preset.focus) {
      lines.push(`  - ${focus}`);
    }
    lines.push('');
  }
  lines.push('## Next Steps');
  lines.push('');
  for (const step of plan.next_steps) {
    lines.push(`- ${step}`);
  }
  lines.push('');
  return lines.join('\n');
}

function renderSnippet(plan) {
  const lines = [];
  lines.push('/* js-reverse-ops hook profile scaffold */');
  lines.push(`/* mode: ${plan.capture_mode.id} */`);
  if (plan.target) lines.push(`/* target: ${plan.target} */`);
  lines.push('');
  for (const preset of plan.presets) {
    lines.push(`// preset: ${preset.id}`);
    lines.push(`// use_when: ${preset.use_when}`);
    lines.push(`// surfaces: ${preset.surfaces.join(', ')}`);
    lines.push(`// focus: ${preset.focus.join(', ')}`);
    lines.push('');
  }
  lines.push('// Fill this file with create_hook / hook_function / preload instrumentation specific to the target.');
  lines.push('');
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv);
  const presetsJson = readPresets();
  const presetIds = args.preset.split(',').map((id) => id.trim()).filter(Boolean);
  const plan = buildPlan(presetsJson, presetIds, args.mode, args.target);
  const outDir = path.resolve(args.out);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'hook-profile.json'), JSON.stringify(plan, null, 2));
  fs.writeFileSync(path.join(outDir, 'hook-profile.md'), renderMarkdown(plan));
  fs.writeFileSync(path.join(outDir, 'hook-profile.js'), renderSnippet(plan));
  process.stdout.write(JSON.stringify({
    out_dir: outDir,
    files: ['hook-profile.json', 'hook-profile.md', 'hook-profile.js'],
    presets: presetIds,
    mode: args.mode
  }, null, 2) + '\n');
}

main();
