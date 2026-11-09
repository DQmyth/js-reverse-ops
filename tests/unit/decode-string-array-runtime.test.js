'use strict';
// decode_string_array_runtime: the M13 recipe as a tested tool.
// Fixtures: obfuscator.io-v4-shaped samples — base64 string array, rotation
// IIFE, two-arg lookup — plus noise and self-defense no-ops the sandbox must
// survive (Function-constructor probe, setInterval console trap stubbed away).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const TOOL = path.join(ROOT, 'scripts', 'decode_string_array_runtime.js');

function runTool(f, args) {
  return execFileSync('node', [TOOL, f, ...args], { encoding: 'utf8' });
}

test('rotation + lookup decode + noise-function tolerance', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sar-'));
  try {
    // rotation 5: lookup('0x0') reads staticItems[(0+5)%20], etc.
    const items = ['c2hhZG93', 'aGVsbG8=', 'd29ybGQ=', 'c2lnbnR1cmU=', 'c3BpZGVyYnVm',
      'dG9rZW4=', 'bWQ1', 'anNvbg==', 'YmFzZTY0', 'd3JpdGU=',
      'cmFuZG9t', 'dGltZXN0YW1w', 'aHR0cA==', 'ZmV0Y2g=', 'c2VjcmV0',
      'a2V5', 'c2FsdA==', 'c2ln', 'dmVyaWZ5', 'ZGF0YQ=='];
    const f = path.join(dir, 'fixture.min.js');
    fs.writeFileSync(f, `
const _0xarr=[${items.map(s => `'${s}'`).join(',')}];
(function(_0xa,_0xb){const _0xc=function(_0xd){while(--_0xd){_0xa['push'](_0xa['shift']());}};_0xc(++_0xb);}(_0xarr,5));
function _0xnoise(_0xq,_0xr){ return _0xarr[_0xq]; }
const _0xlookup=function(_0x1,_0x2){_0x1=_0x1-0x0;let _0x3=_0xarr[_0x1];if(_0xlookup['__init']===undefined){(function(){try{Function('return (function(){})')();}catch(e){}_0xlookup['__init']=true;})()}return atob(_0x3);};
function page(){ document.getElementById('x').innerHTML=_0xlookup('0x3','k'); }
`);
    // whichever two-arg array-referencing function the tool locks onto, the
    // VALUES must be recoverable: the decoding lookup yields plaintext, the
    // raw one yields base64 that maybeDecode() decodes for free.
    const j = JSON.parse(runTool(f, ['--indexes', '0x3,0x0', '--json']));
    assert.match(String(j.values['0x3']), /base64/);   // items[8] 'YmFzZTY0'
    assert.match(String(j.values['0x0']), /token/);    // items[5] 'dG9rZW4='
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('M13 regression shape: misspelled field + hidden separator + dump + known-gate', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sar2-'));
  try {
    // rotation 2 → '0x2'=items[0]='c2lnbnR1cmU='(signture), '0x3'=items[1]='c3BpZGVyYnVm'(spiderbuf)
    const items = ['c2lnbnR1cmU=', 'c3BpZGVyYnVm', 'dGltZXN0YW1w', 'cmFuZG9t',
      'c2VjcmV0', 'a2V5', 'c2FsdA==', 'aHR0cA==', 'ZmV0Y2g=', 'anNvbg==',
      'bWQ1', 'c2hh', 'c2hhZG93', 'aGVsbG8=', 'd29ybGQ=', 'dG9rZW4='];
    const f = path.join(dir, 'm13.js');
    fs.writeFileSync(f, `const _0xt=[${items.map(s => `'${s}'`).join(',')}];
(function(a,b){const c=function(d){while(--d){a.push(a.shift());}};c(++b);}(_0xt,0xe));
const _0xl=function(i,k){i=i-0x0;return atob(_0xt[i]);};
`);
    const j = JSON.parse(runTool(f, ['--dump', '--max', '8', '--json']));
    assert.match(String(j.values['0x2']), /signture/);
    assert.match(String(j.values['0x3']), /spiderbuf/);
    runTool(f, ['--indexes', '0x2', '--known', '0x2=signture']);
    assert.throws(() => runTool(f, ['--indexes', '0x2', '--known', '0x2=wrong']), /assertion failed/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('failure modes: no array / missing file report cleanly', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sar3-'));
  try {
    const f = path.join(dir, 'plain.js');
    fs.writeFileSync(f, 'console.log("no table here");\n');
    assert.throws(() => runTool(f, ['--dump']), /string array not found/);
    assert.throws(() => runTool('/nonexistent/x.js', ['--dump']), /no such file/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
