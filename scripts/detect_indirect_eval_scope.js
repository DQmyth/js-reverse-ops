#!/usr/bin/env node
// Static heuristic: warn when a target executes its payload through INDIRECT
// eval (or Function-constructor bootstrap), which constrains how the sandbox
// must be built. Verified on jsvmpzl-family shells (practice topics 24/28/29):
// a vm sandbox that receives the HOST eval/Function binds indirect-eval scope
// to the host global, producing "document is not defined" and failing every
// environment probe (misdiagnosis pattern M4).
//
// Usage: node scripts/detect_indirect_eval_scope.js <target.js> [--json]

const fs = require('fs');

function main() {
  const file = process.argv[2];
  if (!file) { console.error('usage: detect_indirect_eval_scope.js <target.js> [--json]'); process.exit(2); }
  const src = fs.readFileSync(file, 'utf8');
  const findings = [];

  const push = (id, count, note) => { if (count) findings.push({ id, count, note }); };

  // bare `eval(` occurrences (direct or indirect — count and show samples)
  const evalCalls = src.match(/(?<![.\w])eval\s*\(/g) || [];
  push('eval-call', evalCalls.length,
    'if the payload string is executed here, an INDIRECT eval resolves against the ambient global');

  // Function constructor bootstrap ("return this" global grab)
  const fnThis = src.match(/Function\s*\(\s*["']return this["']\s*\)/g) || [];
  push('function-return-this', fnThis.length,
    'bootstrap grabs the ambient global through the Function constructor — context-internal Function keeps this inside the sandbox');

  // new Function( dynamic compilation
  const newFn = src.match(/new\s+Function\s*\(/g) || [];
  push('new-function', newFn.length,
    'dynamically compiled bodies resolve free variables against the Function\'s own global');

  // implicit global writes (assignments without declaration to unknown names)
  const implicitGlobal = src.match(/(?:^|[;,{\s])([A-Za-z_$][\w$]{2,20})\s*=\s*function\b/g) || [];
  push('implicit-global-function', implicitGlobal.length,
    'undeclared function assignments become globals (e.g. a call/pagination entry) — read them from the sandbox after load');

  const risky = (evalCalls.length || 0) + fnThis.length + newFn.length;
  const verdict = risky
    ? 'TARGET EXECUTES CODE DYNAMICALLY. Sandbox rule: inject ONLY BOM/DOM stubs; never pass host eval/Function/builtins — use the vm context\'s own builtins, or indirect eval will bind to the wrong global (misdiagnosis M4).'
    : 'no dynamic-evaluation markers found by this heuristic';
  const report = { file, findings, risky_markers: risky, verdict };
  if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(verdict);
    for (const f of findings) console.log(`- ${f.id}: ${f.count}`);
  }
}

main();
