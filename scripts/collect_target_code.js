#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function usage() {
  console.error('Usage: node collect_target_code.js <target> [--mode summary|priority|incremental] [--top N] [--out file]');
  process.exit(1);
}

function parseArgs(argv) {
  if (argv.length < 3) usage();
  const args = { target: argv[2], mode: 'summary', top: 20, out: null };
  for (let i = 3; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--mode') args.mode = argv[++i];
    else if (arg === '--top') args.top = Number(argv[++i]);
    else if (arg === '--out') args.out = argv[++i];
    else usage();
  }
  if (!['summary', 'priority', 'incremental'].includes(args.mode)) usage();
  return args;
}

function walk(target, out = []) {
  const stat = fs.statSync(target);
  if (stat.isFile()) {
    out.push(target);
    return out;
  }
  for (const entry of fs.readdirSync(target)) {
    const full = path.join(target, entry);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (['node_modules', '.git', 'tmp_cases'].includes(entry)) continue;
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

function isInteresting(file) {
  return /\.(js|mjs|cjs|ts|html|json)$/i.test(file);
}

function scoreFile(file) {
  const base = path.basename(file).toLowerCase();
  let score = 0;
  if (/\b(main|index|app|bundle|core|runtime|vendor|chunk|match|news)\b/.test(base)) score += 5;
  if (/\.(html|js|mjs|cjs)$/i.test(base)) score += 3;
  if (/min|obf|packed|webpack|crypto|sign|token|wasm|dart/.test(base)) score += 4;
  try {
    const size = fs.statSync(file).size;
    if (size > 500 && size < 2_000_000) score += 2;
  } catch (_) {}
  return score;
}

function sha1File(file) {
  const hash = crypto.createHash('sha1');
  hash.update(fs.readFileSync(file));
  return hash.digest('hex');
}

function buildRecords(files) {
  return files
    .filter(isInteresting)
    .map((file) => {
      const stat = fs.statSync(file);
      return {
        file,
        size: stat.size,
        mtime_ms: stat.mtimeMs,
        score: scoreFile(file),
        sha1: sha1File(file),
      };
    });
}

function previousManifest(target) {
  const file = path.join(target, '.js-reverse-ops-collect.json');
  if (!fs.existsSync(file)) return { file, records: [] };
  return { file, records: JSON.parse(fs.readFileSync(file, 'utf8')).records || [] };
}

function main() {
  const args = parseArgs(process.argv);
  const target = path.resolve(args.target);
  const files = walk(target);
  const records = buildRecords(files);
  const manifestInfo = fs.statSync(target).isDirectory() ? previousManifest(target) : null;

  let selected = records;
  if (args.mode === 'priority') {
    selected = [...records].sort((a, b) => b.score - a.score || b.size - a.size).slice(0, args.top);
  } else if (args.mode === 'incremental') {
    const previous = new Map((manifestInfo ? manifestInfo.records : []).map((r) => [r.file, r.sha1]));
    selected = records.filter((r) => previous.get(r.file) !== r.sha1);
  }

  const result = {
    mode: args.mode,
    target,
    total_files_seen: records.length,
    selected_count: selected.length,
    selected,
  };

  if (manifestInfo) {
    result.manifest_file = manifestInfo.file;
    fs.writeFileSync(manifestInfo.file, JSON.stringify({ updated_at: new Date().toISOString(), records }, null, 2));
  }

  const payload = JSON.stringify(result, null, 2);
  if (args.out) fs.writeFileSync(path.resolve(args.out), payload);
  else process.stdout.write(payload + '\n');
}

main();
