#!/usr/bin/env node
// generate_capability_truth_scorecard — score ACTUAL capability against the
// truth model, on the same rubric as tier-1 comparators. Unlike the
// completeness scorecard (which measures repo structure and happily prints
// 100/100), every point here traces to an evidence entry that (a) carries a
// level, (b) decays without re-verification, and (c) can be invalidated to 0
// while staying listed — negative results are part of the truth.
//
// Usage: node scripts/generate_capability_truth_scorecard.js [--json] [--markdown <out.md>]
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MODEL = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'capability-truth-model.json'), 'utf8'));
const EVID = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'capability-truth-evidence.json'), 'utf8'));

const NOW = new Date();
const daysSince = (iso) => Math.max(0, Math.floor((NOW - new Date(iso)) / 86400000));

// effective level after decay / invalidation
function effectiveLevel(entry, kind) {
  if (entry.invalidated) return 0;
  const base = entry.level ?? 0;
  if (!entry.last_verified || base < 2) return base; // doc claims don't decay
  const rate = kind === 'gate' ? 1 : 0.5; // gates drift faster than corpora
  const decays = Math.floor(daysSince(entry.last_verified) / MODEL.decay.decay_days * rate);
  const floor = MODEL.decay.floor[String(base)] ?? 1;
  return Math.max(floor, base - decays);
}

// ---------- dimension scorers (0-100 each, weighted by model) ----------
const D = {};
{
  // 1. solve_record: tier-weighted target points, level-scaled
  const t = EVID.self.solve_record.targets;
  let points = 0, levelSum = 0;
  for (const x of t) {
    const lvl = effectiveLevel({ ...x, level: 2 }, 'corpus'); // corpus entries
    levelSum += lvl;
    const tierPoints = Object.entries(x.tier_mix).reduce((a, [tier, n]) => a + Number(tier) * n, 0);
    points += tierPoints * (lvl / 2);
  }
  const avgLvl = t.length ? levelSum / t.length : 0;
  D.solve_record = { raw: `${points.toFixed(0)} tier-points @avg-level ${avgLvl}`, score: Math.min(100, points / 1.4) };
}
{
  // 2. pure_delivery
  const pd = EVID.self.pure_delivery;
  D.pure_delivery = { raw: `${pd.ratio}%`, score: pd.ratio * (effectiveLevel(pd, 'corpus') / 2) };
}
{
  // 3. gate_coverage: effective families after decay/invalidation (level>=2 counts)
  const fams = EVID.self.gate_coverage.families;
  const eff = fams.filter(f => effectiveLevel(f, 'gate') >= 2 && !f.invalidated);
  const invalid = fams.filter(f => f.invalidated);
  const partial = eff.filter(f => f.partial).length;
  // partial = handshake proven on a test key only — counts half a family
  const effectiveCount = eff.reduce((a, f) => a + (f.partial ? 0.5 : 1), 0);
  D.gate_coverage = { raw: `${effectiveCount} effective (${partial} partial/test-key, ${invalid.length} invalidated kept on record)`, score: Math.min(100, effectiveCount * 12.5) };
}
{
  // 4. failure_knowledge
  const fk = EVID.self.failure_knowledge;
  D.failure_knowledge = { raw: `${fk.patterns} patterns, ${fk.gym_encoded} gym-encoded`, score: Math.min(100, fk.patterns * 7.7) };
}
{
  // 5. self_regression
  const sr = EVID.self.self_regression;
  D.self_regression = { raw: `${sr.flavors} flavors via ${sr.generic_solver}`, score: Math.min(100, sr.flavors * 9.1) * (effectiveLevel(sr, 'gate') / 3) };
}
{
  // 6. evidence_integrity
  const ei = EVID.self.evidence_integrity;
  D.evidence_integrity = { raw: `${ei.re_runnable_ratio}% re-runnable`, score: ei.re_runnable_ratio };
}
{
  // 7. engineering_safety: 20/checklist-item up to 5
  const es = EVID.self.engineering_safety;
  D.engineering_safety = { raw: es.gates.join(' + '), score: Math.min(100, es.gates.length * 20) };
}
{
  // 8. ecosystem_absorption: absorbed/evaluated quality + dep health
  const ea = EVID.self.ecosystem_absorption;
  const ratio = ea.absorbed / Math.max(1, ea.evaluated);
  const neg = Math.min(1, (ea.rejected_with_evidence || 0) / 3); // honest rejections count
  D.ecosystem_absorption = { raw: `${ea.absorbed}/${ea.evaluated} absorbed, ${ea.rejected_with_evidence} evidence-backed rejections`, score: 60 * ratio + 40 * neg };
}
{
  // 9. adoption: log-scale, NOT capability — small weight says so
  const ad = EVID.self.adoption;
  D.adoption = { raw: `${ad.stars}★ ${ad.forks} forks ${ad.external_prs} ext-PRs`, score: Math.min(100, 50 * Math.log10(ad.stars + 1) / 3.5 + 25 * (ad.external_prs > 0 ? 1 : 0)) };
}
{
  // 10. freshness
  const fr = EVID.self.freshness;
  const dRel = daysSince(fr.last_release), dLive = daysSince(fr.last_live_verification);
  let s = Math.max(0, 100 - Math.min(dRel, dLive) * 2);
  if (!fr.maintained) s = Math.min(s, 60);
  D.freshness = { raw: `release ${dRel}d ago, live-verify ${dLive}d ago, maintained=${fr.maintained}`, score: s };
}

// ---------- comparator scoring on the same rubric ----------
function scoreComparator(c) {
  const lvl = (x) => (x && !x.invalidated ? (x.level ?? 0) : 0);
  const d = {};
  const srLvl = lvl(c.solve_record);
  const scope = c.solve_record && c.solve_record.scope === 'single-family' ? 0.3 : 1;
  d.solve_record = { raw: c.solve_record ? c.solve_record.note : '—', score: (srLvl / 3) * 100 * scope * (srLvl === 3 ? 0.6 : 0.5) }; // live single-family caps below corpus breadth
  d.pure_delivery = { raw: c.pure_delivery ? c.pure_delivery.note || '' : '—', score: (lvl(c.pure_delivery) / 3) * 100 };
  const gc = c.gate_coverage || {};
  d.gate_coverage = { raw: gc.note || '—', score: Math.min(100, (gc.families ?? (lvl(gc) >= 2 ? 2 : lvl(gc))) * 12.5 * (lvl(gc) / 3 || 1)) };
  d.failure_knowledge = { raw: `${(c.failure_knowledge || {}).patterns ?? 0} patterns`, score: Math.min(100, ((c.failure_knowledge || {}).patterns ?? 0) * 7.7) };
  d.self_regression = { raw: `${(c.self_regression || {}).flavors ?? 0} flavors`, score: Math.min(100, ((c.self_regression || {}).flavors ?? 0) * 9.1) };
  const ei = (c.evidence_integrity || {}).re_runnable_ratio ?? 20;
  d.evidence_integrity = { raw: `${ei}% re-runnable`, score: ei };
  const gates = (c.engineering_safety || {}).gates || [];
  d.engineering_safety = { raw: gates.join(' + ') || 'none visible', score: Math.min(100, gates.length * 20) };
  const ea = c.ecosystem_absorption || {};
  d.ecosystem_absorption = { raw: `${ea.absorbed ?? 0}/${ea.evaluated ?? 0}`, score: ea.evaluated ? 60 * (ea.absorbed / ea.evaluated) : 10 };
  const ad = c.adoption || { stars: 0, forks: 0, external_prs: 0 };
  d.adoption = { raw: `${ad.stars}★`, score: Math.min(100, 50 * Math.log10(ad.stars + 1) / 3.5 + 25 * (ad.external_prs > 0 ? 1 : 0)) };
  const fr = c.freshness || {};
  const dRel = fr.last_release ? daysSince(fr.last_release + (fr.last_release.length === 7 ? '-15' : '')) : 999;
  let fs = Math.max(0, 100 - dRel * 2);
  if (!fr.maintained) fs = Math.min(fs, 60);
  d.freshness = { raw: `${fr.last_release || '—'} maintained=${!!fr.maintained}`, score: fs };
  return d;
}

const weighted = (d) => MODEL.dimensions.reduce((a, dim) => a + d[dim.id].score * dim.weight / 100, 0);

const selfTotal = weighted(D);
const comparators = EVID.comparators.map(c => {
  const dims = scoreComparator(c);
  return { id: c.id, label: c.label, total: weighted(dims), dims };
});

const report = {
  schema: 'js-reverse-ops-capability-truth-scorecard-v1',
  generated_at: new Date().toISOString(),
  model: MODEL.schema,
  self: { id: EVID.self.id, label: EVID.self.label, total: Math.round(selfTotal * 10) / 10, dimensions: D },
  comparators: comparators.map(c => ({ ...c, total: Math.round(c.total * 10) / 10 })).sort((a, b) => b.total - a.total),
  reading: 'capability-weighted (solve record 25%, gates 15%); adoption is deliberately 5% — stars are not skills; comparator scores derive from public record + our hands-on where noted; corrections welcome via issues',
};

const WANT_JSON = process.argv.includes('--json');
const mdIdx = process.argv.indexOf('--markdown');
if (WANT_JSON) console.log(JSON.stringify(report, null, 2));
else {
  const rows = [['dimension', 'weight', 'SELF', ...comparators.map(c => c.id)]];
  for (const dim of MODEL.dimensions) {
    rows.push([dim.id, String(dim.weight), `${Math.round(D[dim.id].score)}`, ...comparators.map(c => String(Math.round(c.dims[dim.id].score)))]);
  }
  const w = rows[0].map((_, i) => Math.max(...rows.map(r => String(r[i]).length)) + 2);
  const line = (r) => '| ' + r.map((c, i) => String(c).padEnd(w[i] - 1)).join('| ') + '|';
  const out = [
    `# Capability truth scorecard (model ${MODEL.schema})`,
    `SELF total: **${report.self.total}**`,
    ...comparators.map(c => `${c.id}: **${c.total}**`),
    '', line(rows[0]), line(rows[0].map((_, i) => '-'.repeat(w[i] - 1))),
    ...rows.slice(1).map(line), '', report.reading, '',
    'SELF evidence notes:',
    ...MODEL.dimensions.map(dim => `- ${dim.id}: ${D[dim.id].raw}`),
  ].join('\n');
  if (mdIdx >= 0) fs.writeFileSync(process.argv[mdIdx + 1], out + '\n');
  else console.log(out);
}
