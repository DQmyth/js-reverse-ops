#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const defaultCasesPath = path.join(rootDir, 'assets', 'public-benchmark-cases.json');

function parseArgs(argv) {
  const args = { cases: defaultCasesPath, json: false, out: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--json') args.json = true;
    else if (item === '--cases') {
      args.cases = path.resolve(rootDir, argv[index + 1] || '');
      index += 1;
    } else if (item === '--out') {
      args.out = path.resolve(rootDir, argv[index + 1] || '');
      index += 1;
    } else if (item === '--help' || item === '-h') {
      args.help = true;
    }
  }
  return args;
}

function usage() {
  return [
    'Usage: node scripts/run_public_benchmarks.js [--json] [--out result.json]',
    '',
    'Runs the sanitized public benchmark suite against router and pattern-memory scripts.',
  ].join('\n');
}

function runNode(script, args) {
  const output = execFileSync(process.execPath, [path.join(rootDir, script), ...args], {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(output);
}

function resolveRepoPath(relPath) {
  const candidates = [
    path.join(rootDir, relPath),
    path.join(rootDir, 'public', relPath),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.join(rootDir, relPath);
}

function assertEqual(errors, label, actual, expected) {
  if (actual !== expected) errors.push(`${label}: expected ${expected}, got ${actual}`);
}

function assertIncludes(errors, label, values, expected) {
  if (!Array.isArray(values) || !values.includes(expected)) {
    errors.push(`${label}: expected to include ${expected}`);
  }
}

function runPatternCase(testCase) {
  const result = runNode('scripts/map_case_to_pattern.js', ['--text', testCase.text || '', '--json']);
  const top = result.results && result.results[0];
  const errors = [];
  if (!top) {
    errors.push('no pattern result returned');
  } else {
    assertEqual(errors, 'top pattern', top.id, testCase.expect.top_pattern);
    if (typeof testCase.expect.min_score === 'number' && top.score < testCase.expect.min_score) {
      errors.push(`score: expected >= ${testCase.expect.min_score}, got ${top.score}`);
    }
    if (testCase.expect.playbook) assertEqual(errors, 'playbook', top.playbook, testCase.expect.playbook);
    if (testCase.expect.hook_preset) assertIncludes(errors, 'hook presets', top.hook_presets, testCase.expect.hook_preset);
  }
  return { id: testCase.id, type: testCase.type, ok: errors.length === 0, errors, observed: top || null };
}

function runRouteCase(testCase) {
  const args = [testCase.target, '--json'];
  if (testCase.notes) args.splice(1, 0, '--notes', testCase.notes);
  const plan = runNode('scripts/js_reverse_ops.js', args);
  const errors = [];
  if (testCase.expect.family) assertEqual(errors, 'family', plan.family, testCase.expect.family);
  if (testCase.expect.stage) assertEqual(errors, 'stage', plan.stage, testCase.expect.stage);
  if (testCase.expect.playbook) assertEqual(errors, 'playbook', plan.playbook, testCase.expect.playbook);
  if (testCase.expect.hook_preset) assertIncludes(errors, 'hook presets', plan.hook_presets, testCase.expect.hook_preset);
  if (testCase.expect.sequence_item) {
    assertIncludes(errors, 'recommended sequence', plan.recommended_sequence, testCase.expect.sequence_item);
  }
  return {
    id: testCase.id,
    type: testCase.type,
    ok: errors.length === 0,
    errors,
    observed: {
      family: plan.family,
      stage: plan.stage,
      playbook: plan.playbook,
      hook_presets: plan.hook_presets,
      pattern_matches: plan.pattern_matches,
    },
  };
}

function runPlaybookCase(testCase) {
  const args = [testCase.target, '--json'];
  if (testCase.notes) args.push('--notes', testCase.notes);
  if (testCase.out) args.push('--out', testCase.out);
  const summary = runNode('scripts/run_playbook.js', args);
  const errors = [];
  if (testCase.expect.family) assertEqual(errors, 'family', summary.family, testCase.expect.family);
  if (testCase.expect.stage) assertEqual(errors, 'stage', summary.stage, testCase.expect.stage);
  if (testCase.expect.playbook) assertEqual(errors, 'playbook', summary.playbook, testCase.expect.playbook);
  for (const file of testCase.expect.files || []) {
    assertIncludes(errors, 'generated files', summary.files, file);
  }
  let validation = null;
  try {
    validation = runNode('scripts/validate_delivery_artifacts.js', [path.relative(rootDir, summary.out_dir), '--json']);
    if (!validation.ok) {
      errors.push(`delivery validation failed: ${(validation.errors || []).join('; ')}`);
    }
  } catch (error) {
    errors.push(`delivery validation failed: ${error.message}`);
  }
  return {
    id: testCase.id,
    type: testCase.type,
    ok: errors.length === 0,
    errors,
    observed: { ...summary, delivery_validation: validation },
  };
}

function runStaticRecoverCase(testCase) {
  const outPath = path.join(rootDir, testCase.out || 'tmp/static-recovered.js');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const result = execFileSync(process.execPath, [
    path.join(rootDir, 'scripts/run_ast_pipeline.js'),
    resolveRepoPath(testCase.target),
    outPath,
  ], {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const output = fs.readFileSync(outPath, 'utf8');
  const errors = [];
  for (const item of testCase.expect.contains || []) {
    if (!output.includes(item)) errors.push(`recovered output missing ${item}`);
  }
  return {
    id: testCase.id,
    type: testCase.type,
    ok: errors.length === 0,
    errors,
    observed: {
      out: path.relative(rootDir, outPath),
      stderr_json: result ? String(result).slice(0, 2000) : '',
      output_preview: output.slice(0, 500),
    },
  };
}

function runCase(testCase) {
  if (testCase.type === 'pattern') return runPatternCase(testCase);
  if (testCase.type === 'route') return runRouteCase(testCase);
  if (testCase.type === 'playbook_run') return runPlaybookCase(testCase);
  if (testCase.type === 'static_recover') return runStaticRecoverCase(testCase);
  return { id: testCase.id || 'unknown', type: testCase.type || 'unknown', ok: false, errors: ['unknown case type'] };
}

function renderText(summary) {
  const lines = [
    `public benchmarks: ${summary.passed}/${summary.total} passed`,
    `pattern cases: ${summary.pattern_passed}/${summary.pattern_total} passed`,
    `route cases: ${summary.route_passed}/${summary.route_total} passed`,
    `playbook runner cases: ${summary.playbook_passed}/${summary.playbook_total} passed`,
    `static recovery cases: ${summary.static_recover_passed}/${summary.static_recover_total} passed`,
  ];
  for (const item of summary.results) {
    lines.push(`${item.ok ? 'PASS' : 'FAIL'} ${item.id}`);
    for (const error of item.errors || []) lines.push(`  - ${error}`);
  }
  return `${lines.join('\n')}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  const suite = JSON.parse(fs.readFileSync(args.cases, 'utf8'));
  const results = (suite.cases || []).map(runCase);
  const patternResults = results.filter((item) => item.type === 'pattern');
  const routeResults = results.filter((item) => item.type === 'route');
  const playbookResults = results.filter((item) => item.type === 'playbook_run');
  const staticRecoverResults = results.filter((item) => item.type === 'static_recover');
  const summary = {
    schema: 'js-reverse-ops-public-benchmark-result-v1',
    cases_file: path.relative(rootDir, args.cases),
    total: results.length,
    passed: results.filter((item) => item.ok).length,
    failed: results.filter((item) => !item.ok).length,
    pattern_total: patternResults.length,
    pattern_passed: patternResults.filter((item) => item.ok).length,
    route_total: routeResults.length,
    route_passed: routeResults.filter((item) => item.ok).length,
    playbook_total: playbookResults.length,
    playbook_passed: playbookResults.filter((item) => item.ok).length,
    static_recover_total: staticRecoverResults.length,
    static_recover_passed: staticRecoverResults.filter((item) => item.ok).length,
    results,
  };

  if (args.out) fs.writeFileSync(args.out, `${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(args.json ? `${JSON.stringify(summary, null, 2)}\n` : renderText(summary));
  if (summary.failed) process.exit(1);
}

main();
