#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function usage() {
  console.error('Usage: node build_hook_action_plan.js <hook-profile.json> [--out <dir>]');
  process.exit(1);
}

function parseArgs(argv) {
  if (argv.length < 3) usage();
  const args = { profile: argv[2], out: null };
  for (let i = 3; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--out') args.out = argv[++i] || null;
    else usage();
  }
  return args;
}

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function surfaceToActions(surface, mode) {
  const common = { capture_mode: mode };
  switch (surface) {
    case 'fetch':
      return [{ tool: 'hook_function', target: 'fetch', params: { logArgs: true, logResult: true }, ...common }];
    case 'Request':
      return [{ tool: 'create_hook', hook_type: 'function', description: 'Inspect Request construction when fetch wrappers hide fields', params: { targetHint: 'Request' }, ...common }];
    case 'Headers':
      return [{ tool: 'create_hook', hook_type: 'function', description: 'Inspect Headers mutations for auth or signature fields', params: { targetHint: 'Headers' }, ...common }];
    case 'XMLHttpRequest.prototype.open':
    case 'XMLHttpRequest.prototype.send':
    case 'XMLHttpRequest.prototype.setRequestHeader':
    case 'localStorage.getItem':
    case 'localStorage.setItem':
    case 'sessionStorage.getItem':
    case 'sessionStorage.setItem':
      return [{ tool: 'hook_function', target: surface, params: { logArgs: true, logResult: false }, ...common }];
    case 'document.cookie':
      return [{ tool: 'create_hook', hook_type: 'property', description: 'Observe document.cookie reads and writes', params: { objectHint: 'document', property: 'cookie' }, ...common }];
    case 'document.createElement':
      return [{ tool: 'hook_function', target: 'Document.prototype.createElement', params: { logArgs: true, logResult: true }, ...common }];
    case 'Node.prototype.appendChild':
      return [{ tool: 'hook_function', target: 'Node.prototype.appendChild', params: { logArgs: true, logResult: false }, ...common }];
    case 'HTMLScriptElement.src':
      return [{ tool: 'create_hook', hook_type: 'property', description: 'Observe script src assignment for JSONP or dynamic loaders', params: { objectHint: 'HTMLScriptElement.prototype', property: 'src' }, ...common }];
    case 'cookie helper wrappers':
    case 'writeck/setCookie helpers':
    case 'named business function':
    case 'submit or call helpers':
    case 'module-local request builder':
    case 'md5 helpers':
    case 'sha helpers':
    case 'aes helpers':
    case 'rsa helpers':
      return [{ tool: 'trace_function', target_hint: surface, params: { logArgs: true }, ...common }];
    case 'crypto.subtle':
      return [{ tool: 'create_hook', hook_type: 'function', description: 'Observe crypto.subtle method usage', params: { targetHint: 'crypto.subtle' }, ...common }];
    default:
      return [{ tool: 'note', description: `No direct MCP mapping yet for surface: ${surface}`, ...common }];
  }
}

function buildPlan(profile) {
  const plan = {
    created_at: new Date().toISOString(),
    target: profile.target || '',
    capture_mode: profile.capture_mode?.id || 'summary',
    actions: [],
    preload_recommended: false,
    operator_notes: []
  };

  if ((profile.capture_mode?.id || 'summary') !== 'incremental') {
    plan.operator_notes.push('Start with summary hook evidence before collecting raw payloads.');
  }

  for (const preset of profile.presets || []) {
    plan.actions.push({
      preset_id: preset.id,
      label: preset.label,
      use_when: preset.use_when,
      focus: preset.focus,
      actions: preset.surfaces.flatMap((surface) => surfaceToActions(surface, profile.capture_mode?.id || 'summary'))
    });
    if (['cookie-write', 'jsonp-insert', 'storage-bootstrap'].includes(preset.id)) {
      plan.preload_recommended = true;
    }
  }

  if (plan.preload_recommended) {
    plan.operator_notes.push('Install preload instrumentation if bootstrap writes happen before manual interaction.');
  }
  plan.operator_notes.push('Promote only matching hook evidence into claim and provenance artifacts.');
  return plan;
}

function renderMarkdown(plan) {
  const lines = [];
  lines.push('# Hook Action Plan');
  lines.push('');
  if (plan.target) lines.push(`- Target: \`${plan.target}\``);
  lines.push(`- Capture mode: \`${plan.capture_mode}\``);
  lines.push(`- Preload recommended: \`${plan.preload_recommended}\``);
  lines.push('');
  lines.push('## Action Sets');
  lines.push('');
  for (const group of plan.actions) {
    lines.push(`### ${group.label}`);
    lines.push('');
    lines.push(`- Preset id: \`${group.preset_id}\``);
    lines.push(`- Use when: ${group.use_when}`);
    lines.push(`- Focus: ${group.focus.join(', ')}`);
    lines.push('- Planned actions:');
    for (const action of group.actions) {
      const base = action.tool === 'hook_function'
        ? `${action.tool} target=\`${action.target}\``
        : action.tool === 'trace_function'
          ? `${action.tool} target_hint=\`${action.target_hint}\``
          : `${action.tool} ${action.description || ''}`.trim();
      lines.push(`  - ${base}`);
    }
    lines.push('');
  }
  lines.push('## Operator Notes');
  lines.push('');
  for (const note of plan.operator_notes) {
    lines.push(`- ${note}`);
  }
  lines.push('');
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv);
  const profilePath = path.resolve(args.profile);
  const outDir = path.resolve(args.out || path.dirname(profilePath));
  const profile = loadJson(profilePath);
  const plan = buildPlan(profile);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'hook-action-plan.json'), JSON.stringify(plan, null, 2));
  fs.writeFileSync(path.join(outDir, 'hook-action-plan.md'), renderMarkdown(plan));
  process.stdout.write(JSON.stringify({
    out_dir: outDir,
    files: ['hook-action-plan.json', 'hook-action-plan.md'],
    action_groups: plan.actions.length,
    preload_recommended: plan.preload_recommended
  }, null, 2) + '\n');
}

main();
