#!/usr/bin/env node
// Classify WHY two (or more) sandbox/browser runs of the same target diverge.
// Encodes the fast disproof tests from references/misdiagnosis-patterns.md:
//   M6 random-IV vs environment gate, M1 time-derived vs env-gate,
//   M3 timer-driven self-check (empty later tokens).
//
// Input JSON: {"runs":[{"clock":"<ms>","keys":["<token-or-key>", ...]}, ...]}
//   runs[0..n-1] in capture order. `clock` is the ms timestamp the run's
//   frozen/emitted time endpoint returned. `keys` are the token strings (or
//   the trailing key strings) captured per page/run.
// Usage:
//   node scripts/detect_env_divergence.js --runs <runs.json> [--json]
// Exit code 0 always; the verdict is the product.

function normalizeDigits(s) {
  // extract the "number-as-charcode" payloads commonly embedded in keys
  return String(s).replace(/[^0-9]/g, '');
}

function classify(pair) {
  const [a, b] = pair;
  if (!a || !b) return 'insufficient-data';
  if (a === b) return 'stable';
  // digits-only projection identical but rest differs => padding/random-iv family
  if (normalizeDigits(a) === normalizeDigits(b)) return 'random-iv-family';
  return 'divergent';
}

function main() {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--runs');
  if (i < 0 || !argv[i + 1]) { console.error('usage: detect_env_divergence.js --runs <runs.json> [--json]'); process.exit(2); }
  const input = JSON.parse(fs.readFileSync(argv[i + 1], 'utf8'));
  const runs = input.runs || [];
  if (runs.length < 2) { console.error('need >= 2 runs'); process.exit(2); }
  const fs2 = require('fs');

  const findings = [];

  // M6: same-clock or near-clock stability of the FIRST key (boot token)
  const [r1, r2] = runs;
  const firstPair = [r1.keys && r1.keys[0], r2.keys && r2.keys[0]];
  const firstClass = classify(firstPair);
  const clockDriftMs = Math.abs(Number(r2.clock) - Number(r1.clock));
  if (firstClass === 'divergent' || firstClass === 'random-iv-family') {
    findings.push({
      pattern: 'M6-random-iv-vs-gate',
      evidence: `two runs ${clockDriftMs}ms apart produce different first keys (${firstClass})`,
      note: 'Same-env divergence means a random IV/padding exists. Re-run BOTH sides with a frozen clock before diffing; only cross-env divergence under identical clocks is an environment gate.',
    });
  } else {
    findings.push({ pattern: 'M6-random-iv-vs-gate', evidence: 'first keys stable across runs', note: 'signer appears deterministic; gate theory needs cross-env evidence' });
  }

  // M1: time-derived keys — later-page keys differ while the clock differs a lot
  const perRunKeyLen = runs.map(r => (r.keys || []).map(k => String(k || '').length));
  const laterKeys = runs.map(r => (r.keys || []).slice(1).join(''));
  const laterDiverge = runs.length >= 2 && laterKeys[0] !== '' && laterKeys[1] !== '' && laterKeys[0] !== laterKeys[1];
  if (laterDiverge && clockDriftMs > 60000) {
    findings.push({
      pattern: 'M1-time-derived-not-env-gate',
      evidence: `later keys differ between runs whose clocks are ${Math.round(clockDriftMs / 60000)} minutes apart`,
      note: 'Re-capture one side minutes apart and re-diff; strings that track wall-clock time are TIME-DERIVED, not environment gates. Refresh the clock per page instead of hunting fingerprints.',
    });
  }

  // M3: empty later tokens
  const emptyLater = runs.some(r => (r.keys || []).slice(1).some(k => !k));
  if (emptyLater) {
    findings.push({
      pattern: 'M3-timer-driven-self-check',
      evidence: 'later tokens are empty strings with no visible exception',
      note: 'Arm real timers (try/catch-wrapped callbacks), wait after boot, and no-op uncaughtException/unhandledRejection; self-checks escape via microtasks. Runtime-patch the interpreter catch to log swallowed exceptions; zero entries confirms a branch, not an exception.',
    });
  }

  const verdict = [];
  if (findings.some(f => f.pattern === 'M3-timer-driven-self-check')) verdict.push('timer-selfcheck-suspect');
  if (findings.some(f => f.pattern === 'M1-time-derived-not-env-gate')) verdict.push('time-derived-key');
  if (findings.some(f => f.pattern === 'M6-random-iv-vs-gate' && /random-iv-family/.test(f.evidence))) verdict.push('random-iv-present');
  if (!verdict.length) verdict.push('environment-gate-likely');

  const report = {
    schema: 'js-reverse-ops-env-divergence-verdict-v1',
    runs: runs.length,
    clock_drift_ms: clockDriftMs,
    verdict,
    findings,
  };
  if (argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else {
    console.log('verdict:', verdict.join(', '));
    for (const f of findings) console.log(`- [${f.pattern}] ${f.evidence}\n    → ${f.note}`);
  }
}

const fs = require('fs');
main();
