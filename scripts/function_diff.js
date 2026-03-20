#!/usr/bin/env node
const fs = require('fs');
const crypto = require('crypto');
const esprima = require('esprima');
const estraverse = require('estraverse');
const escodegen = require('escodegen');

function usage() {
  console.error('Usage: function_diff.js <old.js> <new.js> [--top N] [--output result.json]');
  process.exit(1);
}

if (process.argv.length < 4) usage();

const oldPath = process.argv[2];
const newPath = process.argv[3];
const topIndex = process.argv.indexOf('--top');
const topN = topIndex !== -1 ? Number(process.argv[topIndex + 1] || '10') : 10;
const outIndex = process.argv.indexOf('--output');
const outPath = outIndex !== -1 ? process.argv[outIndex + 1] : null;

const KEYWORD_RE = /sign|signature|token|nonce|encrypt|decrypt|cookie|timestamp|md5|sha|hmac|aes|rsa|crypto|digest|payload|headers|authorization/i;

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function hash(text) {
  return crypto.createHash('sha1').update(text).digest('hex').slice(0, 12);
}

function functionNameFromParent(parent) {
  if (!parent) return null;
  if (parent.type === 'VariableDeclarator' && parent.id.type === 'Identifier') return parent.id.name;
  if (parent.type === 'AssignmentExpression') {
    const left = parent.left;
    if (left.type === 'Identifier') return left.name;
    if (left.type === 'MemberExpression') return escodegen.generate(left);
  }
  if (parent.type === 'Property') {
    if (parent.key.type === 'Identifier') return parent.key.name;
    if (parent.key.type === 'Literal') return String(parent.key.value);
  }
  return null;
}

function collectFunctions(file) {
  const code = read(file);
  const ast = esprima.parseScript(code, { range: true, tolerant: true });
  const list = [];
  const anonCount = { value: 0 };
  estraverse.traverse(ast, {
    enter(node, parent) {
      if (!['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(node.type)) return;
      let name = node.id && node.id.name;
      if (!name) name = functionNameFromParent(parent);
      if (!name) {
        anonCount.value += 1;
        name = `<anonymous:${anonCount.value}>`;
      }
      const source = code.slice(node.range[0], node.range[1]);
      const calls = [];
      estraverse.traverse(node.body || node, {
        enter(inner) {
          if (inner.type === 'CallExpression') calls.push(escodegen.generate(inner.callee));
        },
        fallback: 'iteration',
      });
      const keywordHits = (source.match(new RegExp(KEYWORD_RE.source, 'gi')) || []).length;
      list.push({
        name,
        file,
        start: node.range[0],
        end: node.range[1],
        length: node.range[1] - node.range[0],
        source,
        hash: hash(source),
        calls: [...new Set(calls)].slice(0, 20),
        keyword_hits: keywordHits,
        score: keywordHits * 5 + Math.min(calls.length, 10) + Math.min(Math.floor((node.range[1] - node.range[0]) / 80), 10),
      });
    },
    fallback: 'iteration',
  });
  return list;
}

function mapByName(funcs) {
  const map = new Map();
  for (const fn of funcs) {
    if (!map.has(fn.name)) map.set(fn.name, []);
    map.get(fn.name).push(fn);
  }
  return map;
}

function summarizeChange(oldFn, newFn) {
  return {
    name: newFn ? newFn.name : oldFn.name,
    old_hash: oldFn ? oldFn.hash : null,
    new_hash: newFn ? newFn.hash : null,
    old_length: oldFn ? oldFn.length : null,
    new_length: newFn ? newFn.length : null,
    old_score: oldFn ? oldFn.score : null,
    new_score: newFn ? newFn.score : null,
    keyword_shift: (newFn?.keyword_hits || 0) - (oldFn?.keyword_hits || 0),
    calls_added: newFn ? newFn.calls.filter((x) => !((oldFn?.calls || []).includes(x))) : [],
    calls_removed: oldFn ? oldFn.calls.filter((x) => !((newFn?.calls || []).includes(x))) : [],
    preview_old: oldFn ? oldFn.source.slice(0, 220) : null,
    preview_new: newFn ? newFn.source.slice(0, 220) : null,
  };
}

const oldFns = collectFunctions(oldPath);
const newFns = collectFunctions(newPath);
const oldMap = mapByName(oldFns);
const newMap = mapByName(newFns);
const names = [...new Set([...oldMap.keys(), ...newMap.keys()])].sort();

const changed = [];
const added = [];
const removed = [];
for (const name of names) {
  const oldGroup = oldMap.get(name) || [];
  const newGroup = newMap.get(name) || [];
  if (!oldGroup.length) {
    for (const fn of newGroup) added.push(summarizeChange(null, fn));
    continue;
  }
  if (!newGroup.length) {
    for (const fn of oldGroup) removed.push(summarizeChange(fn, null));
    continue;
  }
  const pairs = Math.max(oldGroup.length, newGroup.length);
  for (let i = 0; i < pairs; i += 1) {
    const oldFn = oldGroup[i] || null;
    const newFn = newGroup[i] || null;
    if (!oldFn || !newFn || oldFn.hash !== newFn.hash) changed.push(summarizeChange(oldFn, newFn));
  }
}

changed.sort((a, b) => ((b.new_score || 0) + Math.abs(b.keyword_shift)) - ((a.new_score || 0) + Math.abs(a.keyword_shift)));
added.sort((a, b) => (b.new_score || 0) - (a.new_score || 0));
removed.sort((a, b) => (b.old_score || 0) - (a.old_score || 0));

const result = {
  old_file: oldPath,
  new_file: newPath,
  totals: {
    old_functions: oldFns.length,
    new_functions: newFns.length,
    changed: changed.length,
    added: added.length,
    removed: removed.length,
  },
  top_changed: changed.slice(0, topN),
  top_added: added.slice(0, topN),
  top_removed: removed.slice(0, topN),
  hints: [],
};

if (result.top_changed.some((x) => (x.keyword_shift || 0) !== 0)) {
  result.hints.push('Keyword density changed inside candidate functions; inspect signature and header helpers first.');
}
if (result.top_changed.some((x) => x.calls_added.length || x.calls_removed.length)) {
  result.hints.push('Call graph edges moved in changed functions; inspect helper neighborhoods around the listed callees.');
}
if (result.top_added.some((x) => (x.new_score || 0) >= 8)) {
  result.hints.push('A new high-signal function appeared; verify whether the algorithm was split into a fresh helper.');
}

const json = JSON.stringify(result, null, 2);
if (outPath) fs.writeFileSync(outPath, json + '\n', 'utf8');
else console.log(json);
