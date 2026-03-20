#!/usr/bin/env node
const fs = require('fs');
const { extractIocsFromFile } = require('./lib/ioc');

function usage() {
  console.error('Usage: diff_builds.js <old.js> <new.js> [--output result.json]');
  process.exit(1);
}

if (process.argv.length < 4) {
  usage();
}

const oldPath = process.argv[2];
const newPath = process.argv[3];
const outIndex = process.argv.indexOf('--output');
const outPath = outIndex !== -1 ? process.argv[outIndex + 1] : null;

function uniq(items) {
  return [...new Set(items)].sort();
}

function setDiff(a, b) {
  const bset = new Set(b);
  return a.filter((x) => !bset.has(x));
}

function countMatches(code, re) {
  return (code.match(re) || []).length;
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function summarize(file, code) {
  return {
    file,
    size_bytes: Buffer.byteLength(code, 'utf8'),
    line_count: code.split(/\r?\n/).length,
    max_line_length: code.split(/\r?\n/).reduce((max, line) => Math.max(max, line.length), 0),
    crypto_marker_count: countMatches(code, /\b(CryptoJS|crypto\.subtle|md5|sha1|sha256|sha512|hmac|aes|rsa|digest|importKey)\b/gi),
    obfuscation_marker_count: countMatches(code, /\b(_0x[0-9a-f]+|atob|btoa)\b/gi) + countMatches(code, /while\s*\(\s*true\s*\)/g),
    eval_marker_count: countMatches(code, /\beval\b|new Function/g),
  };
}

const oldCode = read(oldPath);
const newCode = read(newPath);
const oldIocs = extractIocsFromFile(oldPath);
const newIocs = extractIocsFromFile(newPath);

const keys = uniq([...Object.keys(oldIocs), ...Object.keys(newIocs)]).filter((k) => Array.isArray(oldIocs[k]) || Array.isArray(newIocs[k]));
const iocDiff = {};
for (const key of keys) {
  const oldVals = Array.isArray(oldIocs[key]) ? oldIocs[key] : [];
  const newVals = Array.isArray(newIocs[key]) ? newIocs[key] : [];
  iocDiff[key] = {
    added: setDiff(newVals, oldVals),
    removed: setDiff(oldVals, newVals),
    common_count: oldVals.length + newVals.length - setDiff(oldVals, newVals).length - setDiff(newVals, oldVals).length,
  };
}

const result = {
  old: summarize(oldPath, oldCode),
  new: summarize(newPath, newCode),
  deltas: {
    size_bytes: Buffer.byteLength(newCode, 'utf8') - Buffer.byteLength(oldCode, 'utf8'),
    line_count: newCode.split(/\r?\n/).length - oldCode.split(/\r?\n/).length,
    max_line_length: summarize(newPath, newCode).max_line_length - summarize(oldPath, oldCode).max_line_length,
  },
  ioc_diff: iocDiff,
  hints: [],
};

if ((iocDiff.header_keys?.added || []).length || (iocDiff.header_keys?.removed || []).length) {
  result.hints.push('Header or signature field names changed; inspect request-construction helpers first.');
}
if ((iocDiff.route_fragments?.added || []).length || (iocDiff.route_fragments?.removed || []).length) {
  result.hints.push('Route fragments changed; verify that you are diffing the same feature path across builds.');
}
if (result.new.obfuscation_marker_count !== result.old.obfuscation_marker_count) {
  result.hints.push('Obfuscation density changed; normalize both files before function-level comparison.');
}
if (result.new.crypto_marker_count !== result.old.crypto_marker_count) {
  result.hints.push('Crypto marker density changed; inspect helper chains around hash/encrypt operations.');
}

const json = JSON.stringify(result, null, 2);
if (outPath) {
  fs.writeFileSync(outPath, json + '\n', 'utf8');
} else {
  console.log(json);
}
