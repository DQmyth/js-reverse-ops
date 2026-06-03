#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const repoMapPath = fs.existsSync(path.join(rootDir, 'public', 'repo-map.json'))
  ? path.join(rootDir, 'public', 'repo-map.json')
  : path.join(rootDir, 'repo-map.json');
const routesPath = fs.existsSync(path.join(rootDir, 'assets', 'public-playbook-routes.json'))
  ? path.join(rootDir, 'assets', 'public-playbook-routes.json')
  : '';
const casePatternIndexPath = fs.existsSync(path.join(rootDir, 'assets', 'case-pattern-index.json'))
  ? path.join(rootDir, 'assets', 'case-pattern-index.json')
  : '';

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function parseArgs(argv) {
  const args = { target: '', notes: '', json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--json') {
      args.json = true;
    } else if (item === '--notes') {
      args.notes = argv[index + 1] || '';
      index += 1;
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
    'Usage: node scripts/js_reverse_ops.js <target-url-or-file> [--notes notes.txt] [--json]',
    '',
    'Routes a reverse-engineering task to the next likely stage, scripts,',
    'playbooks, and hook presets without running live browser or network work.',
  ].join('\n');
}

function readTargetText(target) {
  if (!target || /^https?:\/\//i.test(target)) return '';
  try {
    const stat = fs.statSync(target);
    if (!stat.isFile()) return '';
    const text = fs.readFileSync(target, 'utf8');
    return text.slice(0, 500000);
  } catch (_err) {
    return '';
  }
}

function readNotes(notesPath) {
  if (!notesPath) return '';
  try {
    return fs.readFileSync(notesPath, 'utf8').slice(0, 200000);
  } catch (_err) {
    return notesPath;
  }
}

function classifyTarget(target, text) {
  const lowerTarget = target.toLowerCase();
  const lowerText = text.toLowerCase();
  const isUrl = /^https?:\/\//i.test(target);
  const ext = path.extname(lowerTarget);
  const looksHtml = ext === '.html' || lowerText.includes('<html') || lowerText.includes('<script');
  const looksJs = ext === '.js' || lowerText.includes('function') || lowerText.includes('=>');
  const hasWasm = lowerText.includes('webassembly') || lowerText.includes('.wasm') || lowerText.includes('wasm');
  const hasPacked = lowerText.includes('eval(function') || lowerText.includes('_0x') || lowerText.includes('while(!![])');
  const hasSigner = /\b(sign|signature|token|nonce|encrypt|decrypt|cookie)\b/i.test(text);
  const hasXhrRewrite =
    /XMLHttpRequest\.prototype\.open|\.open\s*=\s*function|open\s*\([^)]*\/api/i.test(text) ||
    /XMLHttpRequest/i.test(text) && /\b(token|sign|sig|m)=/i.test(text);
  const hasFetch = /\bfetch\s*\(|new\s+Request\b|setRequestHeader|headers\s*:/i.test(text);

  if (hasPacked) {
    return {
      family: 'packed-js',
      stage: 'recover',
      sequenceKey: 'local_js',
      reasons: ['packed or string-table-like JavaScript markers were detected'],
    };
  }
  if (hasWasm) {
    return {
      family: 'module-or-wasm',
      stage: 'runtime',
      sequenceKey: 'server_time_gated_wasm_signer',
      reasons: ['wasm or module-adjacent markers were detected'],
    };
  }
  if (hasXhrRewrite) {
    return {
      family: 'xhr-open-url-rewrite',
      stage: 'runtime',
      sequenceKey: 'xhr_open_url_rewrite_runtime_replay',
      hookPresets: ['xhr-open-rewrite', 'cookie-write'],
      reasons: ['XMLHttpRequest open or signer-in-URL markers were detected'],
    };
  }
  if (looksHtml) {
    return {
      family: 'html-page',
      stage: hasSigner ? 'runtime' : 'locate',
      sequenceKey: 'html_page',
      reasons: ['target looks like an HTML page'],
    };
  }
  if (looksJs) {
    return {
      family: 'local-js',
      stage: hasSigner || hasFetch ? 'runtime' : 'locate',
      sequenceKey: 'local_js',
      hookPresets: hasFetch ? ['fetch-signature'] : [],
      reasons: ['target looks like a JavaScript file or bundle'],
    };
  }
  if (isUrl) {
    return {
      family: 'url',
      stage: 'locate',
      sequenceKey: 'browser_backed',
      reasons: ['target is a URL; collect runtime truth before replay'],
    };
  }
  return {
    family: 'unknown',
    stage: 'locate',
    sequenceKey: 'local_js',
    reasons: ['no strong family signal was found'],
  };
}

function normalize(text) {
  return text.toLowerCase().replace(/[^a-z0-9_$.\s-]/g, ' ');
}

function scoreCasePatterns(text) {
  if (!casePatternIndexPath || !text.trim()) return [];
  const index = readJson(casePatternIndexPath);
  const haystack = normalize(text);
  return (index.patterns || [])
    .map((pattern) => {
      const hits = [];
      for (const signal of pattern.signals || []) {
        const needle = normalize(signal).trim();
        const words = needle.split(/\s+/).filter(Boolean);
        if (haystack.includes(needle) || (words.length > 1 && words.every((word) => haystack.includes(word)))) {
          hits.push(signal);
        }
      }
      return {
        id: pattern.id,
        playbook: pattern.playbook,
        stage: pattern.stage,
        score: hits.length / Math.max(1, (pattern.signals || []).length),
        hits,
        hook_presets: pattern.hook_presets || [],
        first_moves: pattern.first_moves || [],
      };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || right.hits.length - left.hits.length);
}

function buildPlan(target, notes = '') {
  const repoMap = readJson(repoMapPath);
  const routes = routesPath ? readJson(routesPath) : { patterns: [] };
  const text = readTargetText(target);
  const combinedText = `${text}\n${readNotes(notes)}`;
  const patternMatches = scoreCasePatterns(combinedText);
  const bestPattern = patternMatches[0];
  const classification = bestPattern && bestPattern.score >= 0.25
    ? {
      family: bestPattern.id.replace(/_/g, '-'),
      stage: bestPattern.stage,
      sequenceKey: bestPattern.id,
      hookPresets: bestPattern.hook_presets,
      reasons: [`matched reusable pattern signals: ${bestPattern.hits.join('; ')}`],
    }
    : classifyTarget(target, combinedText);
  const routeById = new Map((routes.patterns || []).map((item) => [item.id, item]));
  const sequence = repoMap.recommended_sequences[classification.sequenceKey] || [];
  const route = routeById.get(classification.sequenceKey);

  return {
    target,
    family: classification.family,
    stage: classification.stage,
    reasons: classification.reasons,
    recommended_sequence: sequence,
    playbook: route ? route.playbook : sequence.find((item) => item.startsWith('playbooks/')) || null,
    hook_presets: classification.hookPresets || [],
    pattern_matches: patternMatches.slice(0, 3),
    next_commands: sequence
      .filter((item) => item.startsWith('scripts/'))
      .map((script) => {
        const suffix = target && !/^https?:\/\//i.test(target) ? ` ${target}` : '';
        return `${script.endsWith('.sh') ? 'bash' : 'node'} ${script}${suffix}`;
      }),
  };
}

function renderText(plan) {
  const lines = [
    `target: ${plan.target}`,
    `family: ${plan.family}`,
    `stage: ${plan.stage}`,
    `reasons: ${plan.reasons.join('; ')}`,
    '',
    'recommended sequence:',
    ...plan.recommended_sequence.map((item) => `- ${item}`),
  ];
  if (plan.playbook) {
    lines.push('', `playbook: ${plan.playbook}`);
  }
  if (plan.hook_presets.length) {
    lines.push('', `hook presets: ${plan.hook_presets.join(', ')}`);
  }
  if (plan.pattern_matches.length) {
    lines.push('', 'pattern matches:');
    for (const match of plan.pattern_matches) {
      lines.push(`- ${match.id}: ${Math.round(match.score * 100)}% (${match.hits.join('; ')})`);
    }
  }
  if (plan.next_commands.length) {
    lines.push('', 'next commands:', ...plan.next_commands.map((item) => `- ${item}`));
  }
  return `${lines.join('\n')}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.target) {
    console.log(usage());
    process.exit(args.help ? 0 : 1);
  }
  const plan = buildPlan(args.target, args.notes);
  process.stdout.write(args.json ? `${JSON.stringify(plan, null, 2)}\n` : renderText(plan));
}

main();
