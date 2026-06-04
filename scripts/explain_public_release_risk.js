#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const policyPath = path.join(rootDir, 'assets', 'release-risk-policy.json');

function usage() {
  console.error([
    'Usage: explain_public_release_risk.js [--path <path-or-label> ...] [--json] [--strict]',
    '',
    'Explains public-release data safety risk for tracked files or supplied path labels.',
  ].join('\n'));
  process.exit(1);
}

function parseArgs(argv) {
  const args = { paths: [], json: false, strict: false };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--path') {
      args.paths.push(argv[index + 1] || '');
      index += 1;
    } else if (item === '--json') {
      args.json = true;
    } else if (item === '--strict') {
      args.strict = true;
    } else if (item === '--help' || item === '-h') {
      usage();
    } else if (item.startsWith('-')) {
      usage();
    } else {
      args.paths.push(item);
    }
  }
  return args;
}

function readPolicy() {
  return JSON.parse(fs.readFileSync(policyPath, 'utf8'));
}

function toJsRegExp(pattern) {
  return new RegExp(pattern.replace(/\[\[:space:\]\]/g, '\\s'), 'i');
}

function listTrackedFiles() {
  try {
    return execFileSync('git', ['ls-files'], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).split(/\r?\n/).filter(Boolean);
  } catch (error) {
    return walkFiles(rootDir).map((file) => path.relative(rootDir, file));
  }
}

function walkFiles(startDir) {
  const out = [];
  const ignored = new Set(['.git', 'node_modules', 'tmp', 'dist', 'runs', '__pycache__']);
  for (const entry of fs.readdirSync(startDir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(startDir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function listIgnoredGenerated() {
  try {
    const status = execFileSync('git', ['status', '--short', '--ignored'], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return status.split(/\r?\n/)
      .filter((line) => line.startsWith('!! '))
      .map((line) => line.slice(3).trim())
      .filter((item) => /(^tmp\/|^runs\/|^dist\/|__pycache__\/|\.pyc$|\.pyo$)/.test(item));
  } catch (error) {
    return [];
  }
}

function readSmallTextFile(relPath) {
  const full = path.resolve(rootDir, relPath);
  if (!full.startsWith(rootDir) || !fs.existsSync(full) || !fs.statSync(full).isFile()) return '';
  const stat = fs.statSync(full);
  if (stat.size > 2 * 1024 * 1024) return '';
  const buffer = fs.readFileSync(full);
  if (buffer.includes(0)) return '';
  return buffer.toString('utf8');
}

function classifyPath(policy, relPath, content, tracked) {
  const findings = [];
  for (const riskClass of policy.risk_classes || []) {
    const allowed = (riskClass.allowed_path_patterns || []).some((pattern) => toJsRegExp(pattern).test(relPath));
    if (allowed) continue;
    for (const pattern of riskClass.path_patterns || []) {
      if (toJsRegExp(pattern).test(relPath)) {
        findings.push({
          path: relPath,
          risk_class: riskClass.id,
          label: riskClass.label,
          severity: riskClass.severity,
          match_type: 'path',
          matched_pattern: pattern,
          tracked,
          rationale: riskClass.rationale,
          recommended_action: riskClass.recommended_action,
        });
      }
    }
    if (content) {
      for (const pattern of riskClass.content_patterns || []) {
        if (toJsRegExp(pattern).test(content)) {
          findings.push({
            path: relPath,
            risk_class: riskClass.id,
            label: riskClass.label,
            severity: riskClass.severity,
            match_type: 'content',
            matched_pattern: pattern,
            tracked,
            rationale: riskClass.rationale,
            recommended_action: riskClass.recommended_action,
          });
        }
      }
    }
  }
  return findings;
}

function riskLevel(findings) {
  if (findings.some((item) => item.severity === 'high')) return 'high';
  if (findings.some((item) => item.severity === 'medium')) return 'medium';
  return 'low';
}

function buildReport(args) {
  const policy = readPolicy();
  const suppliedPaths = args.paths.filter(Boolean);
  const scanTargets = suppliedPaths.length
    ? suppliedPaths.map((item) => ({ path: item, tracked: false }))
    : listTrackedFiles().map((item) => ({ path: item, tracked: true }));

  const findings = [];
  for (const target of scanTargets) {
    const content = readSmallTextFile(target.path);
    findings.push(...classifyPath(policy, target.path, content, target.tracked));
  }

  const highTracked = findings.filter((item) => item.tracked && item.severity === 'high');
  const mediumTracked = findings.filter((item) => item.tracked && item.severity === 'medium');
  const blockingFindings = suppliedPaths.length ? findings : [...highTracked, ...mediumTracked];
  const report = {
    schema: 'js-reverse-ops-release-risk-report-v1',
    generated_at: new Date().toISOString(),
    policy: path.relative(rootDir, policyPath),
    mode: suppliedPaths.length ? 'supplied-paths' : 'tracked-files',
    scanned_count: scanTargets.length,
    risk_level: riskLevel(findings),
    ok_for_public_release: blockingFindings.length === 0,
    summary: {
      high: findings.filter((item) => item.severity === 'high').length,
      medium: findings.filter((item) => item.severity === 'medium').length,
      tracked_high: highTracked.length,
      tracked_medium: mediumTracked.length,
      ignored_generated_present: suppliedPaths.length ? 0 : listIgnoredGenerated().length,
    },
    findings,
    policy_summary: {
      tracked_file_policy: policy.tracked_file_policy,
      ignored_artifact_policy: policy.ignored_artifact_policy,
    },
    next_action: findings.length
      ? 'Review every finding before public export. High tracked findings block release; medium tracked findings require removal, rename, or documented review.'
      : 'No release-risk findings were detected by the public policy scan.',
  };
  return report;
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# Public Release Risk');
  lines.push('');
  lines.push(`- Mode: \`${report.mode}\``);
  lines.push(`- Risk level: \`${report.risk_level}\``);
  lines.push(`- OK for public release: \`${report.ok_for_public_release}\``);
  lines.push(`- Scanned paths: \`${report.scanned_count}\``);
  lines.push(`- Findings: \`${report.summary.high} high / ${report.summary.medium} medium\``);
  lines.push('');
  lines.push('## Findings');
  lines.push('');
  if (!report.findings.length) lines.push('- none');
  for (const finding of report.findings) {
    lines.push(`- \`${finding.severity}\` \`${finding.risk_class}\` ${finding.path}`);
    lines.push(`  Action: ${finding.recommended_action}`);
  }
  lines.push('');
  lines.push('## Next Action');
  lines.push('');
  lines.push(report.next_action);
  lines.push('');
  return lines.join('\n');
}

const args = parseArgs(process.argv.slice(2));
const report = buildReport(args);
process.stdout.write(args.json ? `${JSON.stringify(report, null, 2)}\n` : renderMarkdown(report));
if (args.strict && !report.ok_for_public_release) process.exit(1);
