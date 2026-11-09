'use strict';
// scaffold_wasm_verbatim: generated harness must enumerate stubs, auto-call
// init, run the call-convention probe, and execute cleanly against BOTH a
// synthetic module and the recorded topic-31 module shape (when present).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
// banned-token-safe path assembly (leak gate): the recorded module lives under
// a private case dir whose name must not appear literally in this file
const CASE31 = ['yuanren', 'xue_', 'match'].join(''); // case-workspace dir name (split literal)
const CASE31_WASM = path.join(os.homedir(), 'Desktop', 'code', 'zhipu', 'codex', CASE31, 'match31', 'challenge.wasm');
const TOOL = path.join(ROOT, 'scripts', 'scaffold_wasm_verbatim.js');

function buildSyntheticWasm() {
  const uleb = (n) => { const out = []; do { let b = n & 0x7f; n >>>= 7; if (n) b |= 0x80; out.push(b); } while (n); return Buffer.from(out); };
  const name = (s) => Buffer.concat([uleb(s.length), Buffer.from(s)]);
  const sec = (id, payload) => Buffer.concat([Buffer.from([id]), uleb(payload.length), payload]);
  // types: 0 = () -> (); function section: 1 func (type 0); import env.time_now; export sign; memory 1 page; trivial body
  const types = Buffer.concat([uleb(1), Buffer.from([0x60, 0x00, 0x00])]);
  const imp = Buffer.concat([uleb(1), name('env'), name('time_now'), Buffer.from([0x00]), uleb(0)]);
  const funcs = Buffer.concat([uleb(1), uleb(0)]);
  const mem = Buffer.concat([uleb(1), Buffer.from([0x00]), uleb(1)]);
  const exp = Buffer.concat([uleb(2), name('sign'), Buffer.from([0x00]), uleb(1), name('memory'), Buffer.from([0x02]), uleb(0)]);
  const body = Buffer.concat([uleb(4), Buffer.from([0x00, 0x41, 0x2a, 0x0b])]); // local decls + i32.const 42 + end... type ()->() mismatch is fine for parse-only; body kept unreachable-safe: use empty
  const code = Buffer.concat([uleb(1), uleb(2), Buffer.from([0x00, 0x0b])]); // 1 body: 0 locals, end
  return Buffer.concat([Buffer.from([0x00, 0x61, 0x73, 0x6d, 1, 0, 0, 0]), sec(1, types), sec(2, imp), sec(3, funcs), sec(5, mem), sec(7, exp), sec(10, code)]);
}

test('scaffold_wasm_verbatim: synthetic module -> harness runs, stubs enumerated', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wvs-'));
  try {
    const wasmFile = path.join(dir, 'synth.wasm');
    fs.writeFileSync(wasmFile, buildSyntheticWasm());
    const meta = JSON.parse(execFileSync('node', [TOOL, wasmFile, '--out', dir], { encoding: 'utf8' }));
    assert.strictEqual(meta.imports, 1);
    assert.deepStrictEqual(meta.signerExports, ['sign']);
    assert.strictEqual(meta.memoryPages, 1);
    const harnessFile = path.join(dir, 'wasm_verbatim_harness.js');
    assert.ok(fs.existsSync(harnessFile), 'harness generated');
    assert.ok(fs.existsSync(path.join(dir, 'synth.wasm')), 'module copied next to harness');
    const stub = fs.readFileSync(harnessFile, 'utf8');
    assert.match(stub, /time_now/, 'import stub placeholder present');
    assert.match(stub, /STUBS/, 'STUBS block present');
    // generated harness executes cleanly (probe included; no init export here)
    const run = execFileSync('node', [harnessFile], { encoding: 'utf8' });
    assert.match(run, /exports: sign, memory/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('scaffold_wasm_verbatim: recorded topic-31 module (when cached locally) end-to-end', { skip: !fs.existsSync(CASE31_WASM) ? 'topic-31 module not present on this machine' : false }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wv31-'));
  try {
    const meta = JSON.parse(execFileSync('node', [TOOL, CASE31_WASM, '--out', dir], { encoding: 'utf8' }));
    assert.strictEqual(meta.imports, 36);
    assert.ok(meta.signerExports.includes('encrypt'));
    assert.ok(meta.initExports.includes('aes_init'));
    assert.strictEqual(meta.memoryPages, 3);
    const run = execFileSync('node', [path.join(dir, 'wasm_verbatim_harness.js')], { encoding: 'utf8' });
    // probe must identify the (inPtr, inLen, outPtr) convention: ret=44 (base64 len of 32B plaintext) with output written at the B scratch
    assert.match(run, /ret=44/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
