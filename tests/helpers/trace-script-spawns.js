'use strict';
// Preloaded with `--require` by scripts/trace_script_evidence.js — and a no-op everywhere else.
// Writes one JSON line per child process that starts and per scripts/ file that is require()d
// in-process, so that evidence about a script is "a test started it, with these arguments", not
// "some test file mentions its name". Nested processes inherit NODE_OPTIONS, so a script that
// starts another script is traced as well.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const Module = require('module');

const LOG = process.env.JSRO_EVIDENCE_LOG;
const TEST = process.env.JSRO_EVIDENCE_TEST || '';

if (LOG) {
  const write = (entry) => {
    try { fs.appendFileSync(LOG, `${JSON.stringify({ test: TEST, pid: process.pid, ...entry })}\n`); } catch (_err) { /* never break the test */ }
  };
  const stringify = (args) => {
    const list = Array.isArray(args) ? args : typeof args === 'string' ? [args] : [];
    return list.map((a) => { try { return String(a); } catch (_err) { return ''; } });
  };
  for (const name of ['spawn', 'spawnSync', 'execFile', 'execFileSync']) {
    const original = cp[name];
    cp[name] = function traced(file, args) {
      write({ kind: 'spawn', file: String(file), args: stringify(args) });
      return original.apply(this, arguments);
    };
  }
  const SCRIPT_FILE = /[/\\]scripts[/\\][^/\\]+\.(js|py|sh)$/;
  const originalLoad = Module._load;
  Module._load = function tracedLoad(request, parent, isMain) {
    let resolved = '';
    try { resolved = Module._resolveFilename(request, parent, isMain); } catch (_err) { /* the real load reports it */ }
    if (resolved && SCRIPT_FILE.test(resolved)) write({ kind: 'require', file: resolved, args: [] });
    return originalLoad.apply(this, arguments);
  };
  const mainFile = require.main && require.main.filename;
  if (mainFile && SCRIPT_FILE.test(mainFile)) write({ kind: 'main', file: mainFile, args: process.argv.slice(2) });
}
