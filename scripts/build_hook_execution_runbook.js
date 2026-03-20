#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function usage() {
  console.error('Usage: node build_hook_execution_runbook.js <hook-action-plan.json> [--out <dir>]');
  process.exit(1);
}

function parseArgs(argv) {
  if (argv.length < 3) usage();
  const args = { plan: argv[2], out: null };
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

function normalizeAction(action, groupLabel, stepId) {
  if (action.tool === 'hook_function') {
    return {
      step_id: stepId,
      group: groupLabel,
      execution_type: 'tool_call',
      recipient_name: 'functions.mcp__js-reverse__hook_function',
      parameters: {
        target: action.target,
        logArgs: action.params?.logArgs ?? true,
        logResult: action.params?.logResult ?? true
      }
    };
  }
  if (action.tool === 'trace_function') {
    return {
      step_id: stepId,
      group: groupLabel,
      execution_type: 'manual_or_search',
      recipient_name: 'functions.mcp__js-reverse__trace_function',
      parameters: {
        functionName: action.target_hint
      },
      note: 'Resolve the real function name or narrow urlFilter before running this trace.'
    };
  }
  if (action.tool === 'create_hook') {
    return {
      step_id: stepId,
      group: groupLabel,
      execution_type: 'tool_call',
      recipient_name: 'functions.mcp__js-reverse__create_hook',
      parameters: {
        type: action.hook_type,
        description: action.description,
        params: action.params || {}
      }
    };
  }
  return {
    step_id: stepId,
    group: groupLabel,
    execution_type: 'note',
    note: action.description || 'No executable mapping available.'
  };
}

function buildPreload(plan) {
  const lines = [];
  lines.push('(() => {');
  lines.push("  const seen = new Set();");
  lines.push("  const log = (...args) => console.log('[js-reverse-ops preload]', ...args);");
  lines.push('');
  if (plan.preload_recommended) {
    lines.push('  // Preload recommended by hook-action-plan.');
  }

  const hasCookie = JSON.stringify(plan).includes('"property":"cookie"');
  const hasScriptSrc = JSON.stringify(plan).includes('"property":"src"');

  if (hasCookie) {
    lines.push('  try {');
    lines.push("    const desc = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie') || Object.getOwnPropertyDescriptor(HTMLDocument.prototype, 'cookie');");
    lines.push('    if (desc && desc.configurable) {');
    lines.push("      Object.defineProperty(document, 'cookie', {");
    lines.push("        configurable: true,");
    lines.push("        get() { return desc.get.call(document); },");
    lines.push("        set(v) { log('document.cookie write', v); return desc.set.call(document, v); }");
    lines.push('      });');
    lines.push('    }');
    lines.push('  } catch (e) { log("cookie preload failed", String(e)); }');
    lines.push('');
  }

  if (hasScriptSrc) {
    lines.push('  try {');
    lines.push("    const srcDesc = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src');");
    lines.push('    if (srcDesc && srcDesc.configurable) {');
    lines.push("      Object.defineProperty(HTMLScriptElement.prototype, 'src', {");
    lines.push("        configurable: true,");
    lines.push("        get() { return srcDesc.get.call(this); },");
    lines.push("        set(v) { log('script src set', v); return srcDesc.set.call(this, v); }");
    lines.push('      });');
    lines.push('    }');
    lines.push('  } catch (e) { log("script src preload failed", String(e)); }');
    lines.push('');
  }

  lines.push('})();');
  lines.push('');
  return lines.join('\n');
}

function buildRunbook(plan) {
  const steps = [];
  let counter = 1;

  if (plan.preload_recommended) {
    steps.push({
      step_id: `step-${counter++}`,
      group: 'preload',
      execution_type: 'tool_call',
      recipient_name: 'functions.mcp__js-reverse__inject_preload_script',
      parameters: {
        script_file: 'hook-preload.js'
      },
      note: 'Inject before reload when bootstrap writes happen early.'
    });
    steps.push({
      step_id: `step-${counter++}`,
      group: 'preload',
      execution_type: 'tool_call',
      recipient_name: 'functions.mcp__js-reverse__navigate_page',
      parameters: {
        type: 'reload'
      }
    });
  }

  for (const group of plan.actions || []) {
    for (const action of group.actions || []) {
      steps.push(normalizeAction(action, group.label, `step-${counter++}`));
    }
  }

  steps.push({
    step_id: `step-${counter++}`,
    group: 'evidence',
    execution_type: 'tool_call',
    recipient_name: 'functions.mcp__js-reverse__get_hook_data',
    parameters: {
      view: 'summary',
      maxRecords: 50
    },
    note: 'Start with summary evidence before requesting raw payloads.'
  });

  return {
    created_at: new Date().toISOString(),
    target: plan.target || '',
    capture_mode: plan.capture_mode || 'summary',
    preload_recommended: !!plan.preload_recommended,
    steps,
    operator_notes: plan.operator_notes || []
  };
}

function renderMarkdown(runbook) {
  const lines = [];
  lines.push('# Hook Execution Runbook');
  lines.push('');
  if (runbook.target) lines.push(`- Target: \`${runbook.target}\``);
  lines.push(`- Capture mode: \`${runbook.capture_mode}\``);
  lines.push(`- Preload recommended: \`${runbook.preload_recommended}\``);
  lines.push('');
  lines.push('## Steps');
  lines.push('');
  for (const step of runbook.steps) {
    lines.push(`### ${step.step_id}`);
    lines.push('');
    lines.push(`- Group: \`${step.group}\``);
    lines.push(`- Execution type: \`${step.execution_type}\``);
    if (step.recipient_name) lines.push(`- Tool: \`${step.recipient_name}\``);
    if (step.note) lines.push(`- Note: ${step.note}`);
    if (step.parameters) lines.push(`- Parameters: \`${JSON.stringify(step.parameters)}\``);
    lines.push('');
  }
  if (runbook.operator_notes.length) {
    lines.push('## Operator Notes');
    lines.push('');
    for (const note of runbook.operator_notes) lines.push(`- ${note}`);
    lines.push('');
  }
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv);
  const planPath = path.resolve(args.plan);
  const outDir = path.resolve(args.out || path.dirname(planPath));
  const plan = loadJson(planPath);
  const runbook = buildRunbook(plan);
  const preload = buildPreload(plan);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'hook-execution-runbook.json'), JSON.stringify(runbook, null, 2));
  fs.writeFileSync(path.join(outDir, 'hook-execution-runbook.md'), renderMarkdown(runbook));
  fs.writeFileSync(path.join(outDir, 'hook-preload.js'), preload);
  process.stdout.write(JSON.stringify({
    out_dir: outDir,
    files: ['hook-execution-runbook.json', 'hook-execution-runbook.md', 'hook-preload.js'],
    steps: runbook.steps.length,
    preload_recommended: runbook.preload_recommended
  }, null, 2) + '\n');
}

main();
