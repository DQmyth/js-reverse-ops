#!/usr/bin/env node
const fs = require('fs');

function usage() {
  console.error('Usage: extract_dispatch_adapter_contract.js <object-provenance.json> [--output <result.json>]');
  process.exit(1);
}

if (process.argv.length < 3) usage();

const args = process.argv.slice(2);
const input = args[0];
let outputPath = '';

for (let i = 1; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--output') outputPath = args[++i] || '';
  else usage();
}

const data = JSON.parse(fs.readFileSync(input, 'utf8'));
const adapter = ((data.critical_slots || {}).dispatch_adapter_slot) || null;

function parseSignature(expr) {
  const match = expr.match(/^function\s*\(([^)]*)\)/);
  if (!match) return [];
  return match[1].split(',').map((item) => item.trim()).filter(Boolean);
}

function branch(opcode, argExpr, arity) {
  return {
    opcode_test: `${opcode} == o`,
    trampoline_target: `Z.$[1][Z.$[0]]`,
    first_argument: argExpr,
    forwarded_args: ['b', 'C'].concat(arity >= 4 ? ['m'] : []).concat(arity >= 5 ? ['r'] : [])
  };
}

const expr = adapter ? adapter.expression : '';
const params = parseSignature(expr);
const branches = [];
if (expr.includes('7==o')) branches.push(branch(7, 'Z.$[3]', 5));
if (expr.includes('2==o')) branches.push(branch(2, 'Z.$[o]', 4));
if (expr.includes('Z.$[o],b,C)')) {
  branches.push({
    opcode_test: 'default',
    trampoline_target: 'Z.$[1][Z.$[0]]',
    first_argument: 'Z.$[o]',
    forwarded_args: ['b', 'C']
  });
}

const result = {
  input,
  source: data.source || input,
  inferred: {
    has_dispatch_adapter: Boolean(adapter),
    parameter_count: params.length,
    branch_count: branches.length
  },
  adapter: adapter ? {
    label: adapter.label,
    signature: params,
    expression: expr
  } : null,
  branches,
  recommendations: [
    'Treat o as the adapter opcode selector and Z.$[o] / Z.$[3] as receiver candidates, not business payload fields.',
    'If the trampoline still fails, validate what value Z.$[1][Z.$[0]] resolves to for each branch.',
    'Use this contract when building a minimal local executor for adapter branches.'
  ]
};

if (outputPath) fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
