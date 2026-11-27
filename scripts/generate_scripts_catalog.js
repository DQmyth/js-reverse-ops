#!/usr/bin/env node
// Regenerate references/scripts-catalog.md from script header comments —
// eliminates hand-maintained drift. Convention: the first comment block of
// each script is its description (// block for .js; first # block after the
// shebang for .sh and comment-headed .py; first docstring paragraph for
// documented .py). Lines starting with "Usage:" are left out.
// History worth knowing: the .js matcher used to require the file itself to
// start with "//", so the shebang on line 1 hid every header — for months the
// catalog listed all scripts as "(no header)" while still reporting success.
// The indexed set is what the public export ACTUALLY ships in scripts/: the
// manifest skip list is applied and manifest-copied scripts are included, so
// the catalog never lists a script the bundle does not contain (it once
// listed five skipped ones and omitted every .py/.sh).
// Third column: what the test suite proves about each script, read from
// assets/script-evidence.json (scripts/trace_script_evidence.js records which tests start which
// scripts, and on what input). It is a column because it was invisible: three recover-stage
// tools had green tests on hand-written samples while recovering nothing on real output, and
// 120 of 162 scripts were never started by any test.
// Usage: node scripts/generate_scripts_catalog.js [--check]   (--check: exit 1 if stale)
const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..'); const scriptsDir = path.join(__dirname);
const EVIDENCE_LABEL = { 'real-sample': 'real sample', 'input-not-from-a-tool': 'not from a tool', untested: 'untested' };
let evidence = null;
try { evidence = JSON.parse(fs.readFileSync(path.join(root, 'assets', 'script-evidence.json'), 'utf8')); }
catch (_) { /* no evidence file: every entry reads "untested" */ }
const evidenceOf = (name) => {
  const record = evidence && evidence.scripts && evidence.scripts[name];
  return (record && EVIDENCE_LABEL[record.tier]) || 'untested';
};
const catPath = path.join(root, 'references', 'scripts-catalog.md');

let manifest = null;
try { manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets', 'public-export-manifest.json'), 'utf8')); }
catch (_) { /* inside the exported bundle there is no manifest — there, scripts/ IS the shipped set */ }

const skipped = new Set();
if (manifest) {
  for (const f of manifest.skippedScriptFiles || []) skipped.add(path.basename(f));
  for (const d of manifest.copyDirectories || []) if (d.from === 'scripts') for (const n of [...(d.skipFiles || []), ...(d.skipNames || [])]) skipped.add(n);
}
const entries = fs.readdirSync(scriptsDir)
  .filter(f => /\.(js|py|sh)$/.test(f) && !f.startsWith('.') && !skipped.has(f))
  .map(f => ({ name: f, file: path.join(scriptsDir, f) }));
if (manifest) for (const d of manifest.copyDirectories || []) {
  if (d.to !== 'scripts') continue;
  const fromDir = path.join(root, d.from);
  const skipD = new Set([...(d.skipNames || []), ...(d.skipFiles || [])]);
  for (const f of fs.readdirSync(fromDir)) {
    if (!/\.(js|py|sh)$/.test(f) || f.startsWith('.') || skipD.has(f) || entries.some(e => e.name === f)) continue;
    entries.push({ name: f, file: path.join(fromDir, f) });
  }
}
if (manifest) for (const c of manifest.copyFiles || []) {
  if (!c.to.startsWith('scripts/') || c.to.endsWith('/')) continue;
  const from = path.join(root, c.from);
  if (entries.some(e => e.name === path.basename(c.to)) || !fs.existsSync(from)) continue;
  entries.push({ name: path.basename(c.to), file: from });
}

function describe(src, ext) {
  let lines = src.split('\n');
  if (lines[0].startsWith('#!')) lines = lines.slice(1);   // the shebang sat above every // block and hid them all
  if (ext === 'js') {
    let k = 0;
    while (k < lines.length && lines[k].trim() === '') k++;            // a blank line after the shebang is layout, not content
    if (/^['"]use strict['"];?\s*$/.test(lines[k])) k++;
    const block = [];
    for (const l of lines.slice(k)) { if (l.startsWith('//')) block.push(l); else break; }   // first contiguous block
    return block.map(l => l.replace(/^\/\/\s?/, '')).filter(l => !/^Usage:/i.test(l)).join(' ').replace(/\s+/g, ' ').trim();
  }
  if (ext === 'py') {
    const doc = lines.join('\n').match(/^\s*(?:"""|''')([\s\S]*?)(?:"""|''')/);
    if (doc) return doc[1].split(/\n\s*\n/)[0].replace(/\s+/g, ' ').trim();
  }
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i++;
  const block = [];
  for (; i < lines.length && lines[i].startsWith('#'); i++) block.push(lines[i]);
  return block.map(l => l.replace(/^#\s?/, '')).join(' ').replace(/Usage:[^\n]*/gi, '').replace(/\s+/g, ' ').trim();
}

const rows = entries
  .map(e => ({ ...e, desc: describe(fs.readFileSync(e.file, 'utf8'), path.extname(e.name).slice(1)) || '(no header)' }))
  .map(e => ({ f: e.name, desc: e.desc.slice(0, 160), ev: evidence ? evidenceOf(e.name) : 'untested' }))
  .sort((a, b) => a.f.localeCompare(b.f));
const tally = (label) => rows.filter(r => r.ev === label).length;
const body = `# Scripts Catalog\n\nAUTO-GENERATED by scripts/generate_scripts_catalog.js — do not edit by hand;\nrun \`node scripts/generate_scripts_catalog.js\` after adding a script.\n\n- total scripts: \`${rows.length}\`\n- evidence (assets/script-evidence.json, recorded by \`node scripts/trace_script_evidence.js --strict\`): \`${tally('real sample')}\` run by a passing test on real tool output, \`${tally('not from a tool')}\` run only on plain or hand-made input, \`${tally('untested')}\` never started by a test\n\n| Script | Description (from header) | Evidence |\n|---|---|---|\n` + rows.map(r => `| \`${r.f}\` | ${r.desc.replace(/\|/g, '\\|')} | ${r.ev} |`).join('\n') + '\n';
if (process.argv.includes('--check')) {
  const cur = fs.existsSync(catPath) ? fs.readFileSync(catPath, 'utf8') : '';
  if (cur !== body) { console.error('scripts-catalog.md is STALE — regenerate'); process.exit(1); }
  console.log('catalog up to date');
} else { fs.writeFileSync(catPath, body); console.log(`catalog regenerated: ${rows.length} scripts (${rows.filter(r => r.f.endsWith('.js')).length} js, ${rows.filter(r => r.f.endsWith('.py')).length} py, ${rows.filter(r => r.f.endsWith('.sh')).length} sh)`); }
