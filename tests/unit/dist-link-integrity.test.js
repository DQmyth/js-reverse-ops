'use strict';
// Dist link integrity: every references/*.md link that SKILL.md points at
// must exist in the exported public bundle. Guards against the recorded
// operator mistake (v1.3.1-1.3.3 shipped a Start Here routing line whose
// target had never been added to the export manifest — a silent gap because
// the manifest patch used a mis-parenthesized ternary and reported success).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
// In the private workspace the bundle lives three levels up; inside the
// exported bundle itself (make check) the bundle IS the tree we sit in.
const IN_DIST = !fs.existsSync(path.join(ROOT, 'scripts', 'export_public_skill.js'));
const DIST = IN_DIST ? ROOT : path.join(ROOT, '..', '..', 'dist', 'public-skills', 'js-reverse-ops');

// Self-sufficient: make_release runs tests BEFORE its export gate, so on a
// fresh checkout the bundle may not exist yet — build it ourselves then.
// (Also removes any rebuild-race window: we export, then assert.)
function ensureDist() {
  if (fs.existsSync(path.join(DIST, 'SKILL.md'))) return;
  if (IN_DIST) throw new Error('bundle must contain its own SKILL.md');
  execFileSync('node', [path.join(ROOT, 'scripts', 'export_public_skill.js')], { cwd: ROOT, stdio: 'pipe' });
  assert.ok(fs.existsSync(path.join(DIST, 'SKILL.md')), 'exporter ran but produced no SKILL.md');
}

test('dist SKILL.md references resolve to files present in the export', () => {
  ensureDist();
  const md = fs.readFileSync(path.join(DIST, 'SKILL.md'), 'utf8');
  // both markdown links ](references/x.md) and backtick routes `references/x.md`
  const links = [...new Set([
    ...[...md.matchAll(/\]\((references\/[A-Za-z0-9._/-]+\.md)\)/g)].map(m => m[1]),
    ...[...md.matchAll(/`(references\/[A-Za-z0-9._/-]+\.md)`/g)].map(m => m[1]),
  ])];
  assert.ok(links.length >= 5, 'SKILL.md should route to multiple references');
  const missing = links.filter(l => !fs.existsSync(path.join(DIST, l)));
  assert.deepStrictEqual(missing, [], `dead reference links in dist SKILL.md — add the file to assets/public-export-manifest.json copyFiles: ${missing.join(', ')}`);
});

test('dist README/playbooks reference files exist (no dead relative md links)', () => {
  const roots = ['README.md', 'playbooks'];
  const missing = [];
  for (const root of roots) {
    const full = path.join(DIST, root);
    if (!fs.existsSync(full)) continue;
    const files = fs.statSync(full).isDirectory() ? fs.readdirSync(full).filter(f => f.endsWith('.md')).map(f => path.join(root, f)) : [root];
    for (const rel of files) {
      const md = fs.readFileSync(path.join(DIST, rel), 'utf8');
      for (const m of md.matchAll(/\]\((?!https?:|#|mailto:)([A-Za-z0-9._/-]+\.md)\)/g)) {
        const target = path.join(DIST, path.dirname(rel), m[1]);
        if (!fs.existsSync(target)) missing.push(`${rel} -> ${m[1]}`);
      }
    }
  }
  assert.deepStrictEqual(missing, [], `dead relative md links in dist: ${missing.join(', ')}`);
});
