#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function usage() {
  console.error('Usage: scaffold_proxy_rpc_delivery.js --bundle-dir <dir> [--mode <python-replay|jsrpc-bridge|proxy-injector>]');
  process.exit(1);
}

const args = process.argv.slice(2);
if (!args.length) usage();

const options = {
  bundleDir: '',
  mode: 'python-replay',
};

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  const next = args[i + 1] || '';
  if (arg === '--bundle-dir') {
    options.bundleDir = path.resolve(next);
    i += 1;
  } else if (arg === '--mode') {
    options.mode = next;
    i += 1;
  } else {
    usage();
  }
}
if (!options.bundleDir) usage();

function readJson(name, fallback = {}) {
  const file = path.join(options.bundleDir, name);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback;
}
function writeJson(name, data) {
  fs.writeFileSync(path.join(options.bundleDir, name), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}
function writeText(name, content) {
  fs.writeFileSync(path.join(options.bundleDir, name), `${content}\n`, 'utf8');
}

function modeFile(name) {
  return `${options.mode}-${name}`;
}

const evidence = readJson('evidence.json');
const maturity = readJson('maturity-summary.json', {});
const runtime = evidence.runtime_evidence || {};
const request = runtime.request || {};

const deliveryPlan = {
  mode: options.mode,
  maturity: maturity.maturity || evidence.status || 'unknown',
  ready_for_production: false,
  target_request: {
    method: request.method || null,
    url: request.url || null,
    fields: request.fields || [],
  },
  missing_inputs: [],
  notes: [],
};

if (!request.url) deliveryPlan.missing_inputs.push('runtime request URL');
if (!(request.fields || []).length) deliveryPlan.missing_inputs.push('runtime request fields');
if ((evidence.runtime_evidence || {}).synthetic) deliveryPlan.notes.push('runtime evidence is synthetic');
if (deliveryPlan.maturity !== 'runtime-accepted' && deliveryPlan.maturity !== 'replay-verified') {
  deliveryPlan.notes.push('delivery artifacts are scaffolds only and should not be treated as production-ready');
}

const deliveryNotes = [
  '# Delivery Notes',
  '',
  `- mode: ${deliveryPlan.mode}`,
  `- maturity: ${deliveryPlan.maturity}`,
  `- request: ${request.method || 'UNKNOWN'} ${request.url || 'unknown'}`,
  `- fields: ${(request.fields || []).join(', ') || 'none'}`,
  '',
  '## Missing Inputs',
  '',
  ...(deliveryPlan.missing_inputs.length ? deliveryPlan.missing_inputs.map((item) => `- ${item}`) : ['- none']),
  '',
  '## Notes',
  '',
  ...(deliveryPlan.notes.length ? deliveryPlan.notes.map((item) => `- ${item}`) : ['- none']),
].join('\n');

const proxyIntegration = [
  '# Proxy and RPC Integration',
  '',
  `- selected_mode: ${deliveryPlan.mode}`,
  '',
  '## Suggested Hand-off',
  '',
  deliveryPlan.mode === 'python-replay'
    ? '- use `replay.py` as the primary delivery artifact'
    : deliveryPlan.mode === 'jsrpc-bridge'
      ? '- build a small JS runtime bridge around the recovered signing logic'
      : '- patch outgoing traffic in a proxy tool using the recovered request fields and signing logic',
  '',
  '## Guardrails',
  '',
  '- do not treat this integration scaffold as verified delivery until replay or runtime acceptance is real',
].join('\n');

let bridgeContent = '';
let mitmAddon = '';
let burpConfig = null;
if (options.mode === 'jsrpc-bridge') {
  bridgeContent = `const http = require('http');

function mergeDefaults(input) {
  const defaults = ${JSON.stringify(
    Object.fromEntries((request.fields || []).map((field) => [field, `<${field}>`])),
    null,
    2
  )};
  return { ...defaults, ...(input || {}) };
}

async function signRequest(input) {
  const merged = mergeDefaults(input);
  // Replace this placeholder with recovered signing logic or browser-connected RPC logic.
  return merged;
}

if (require.main === module) {
  const server = http.createServer(async (req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'method not allowed' }));
      return;
    }
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        const input = body ? JSON.parse(body) : {};
        const output = await signRequest(input);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, output }));
      } catch (error) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: String(error) }));
      }
    });
  });
  const port = process.env.JS_RPC_PORT || 17890;
  server.listen(port, () => {
    console.log(JSON.stringify({ ok: true, port, target: ${JSON.stringify(request.url || null)} }));
  });
}

module.exports = { signRequest };
`;
  writeText('jsrpc-bridge.js', bridgeContent);
  mitmAddon = `from mitmproxy import http
import json
import requests

RPC_URL = "http://127.0.0.1:17890"
TARGET_URL = ${JSON.stringify(request.url || "")}
TARGET_METHOD = ${JSON.stringify((request.method || '').toUpperCase())}


def request(flow: http.HTTPFlow) -> None:
    if flow.request.pretty_url != TARGET_URL:
        return
    if flow.request.method.upper() != TARGET_METHOD:
        return

    payload = {}
    try:
        if flow.request.text:
            payload = json.loads(flow.request.text)
    except Exception:
        payload = {}

    resp = requests.post(RPC_URL, json=payload, timeout=10)
    data = resp.json()
    output = data.get("output", {})
    flow.request.text = json.dumps(output, ensure_ascii=False)
`;
  writeText(modeFile('mitmproxy-addon.py'), mitmAddon);
  burpConfig = {
    mode: 'jsrpc-bridge',
    target_url: request.url || null,
    target_method: request.method || null,
    rpc_url: 'http://127.0.0.1:17890',
    note: 'Use Burp Match and Replace or an extension to forward the body to the local JSRPC bridge before forwarding the request.'
  };
  writeJson(modeFile('burp-match-and-replace.json'), burpConfig);
}

if (options.mode === 'proxy-injector') {
  mitmAddon = `from mitmproxy import http
import json

TARGET_URL = ${JSON.stringify(request.url || "")}
TARGET_METHOD = ${JSON.stringify((request.method || '').toUpperCase())}
DEFAULT_FIELDS = ${JSON.stringify(
    Object.fromEntries((request.fields || []).map((field) => [field, `<${field}>`])),
    null,
    2
  )}


def request(flow: http.HTTPFlow) -> None:
    if flow.request.pretty_url != TARGET_URL:
        return
    if flow.request.method.upper() != TARGET_METHOD:
        return

    payload = {}
    try:
        if flow.request.text:
            payload = json.loads(flow.request.text)
    except Exception:
        payload = {}

    for key, value in DEFAULT_FIELDS.items():
        payload.setdefault(key, value)

    flow.request.text = json.dumps(payload, ensure_ascii=False)
`;
  writeText(modeFile('mitmproxy-addon.py'), mitmAddon);
  burpConfig = {
    mode: 'proxy-injector',
    target_url: request.url || null,
    target_method: request.method || null,
    default_fields: Object.fromEntries((request.fields || []).map((field) => [field, `<${field}>`])),
    note: 'Use this as a field-completion baseline only. Replace placeholders with recovered runtime-backed values.'
  };
  writeJson(modeFile('burp-match-and-replace.json'), burpConfig);
}

writeJson('delivery-plan.json', deliveryPlan);
writeText('delivery-notes.md', deliveryNotes);
writeText('proxy-integration.md', proxyIntegration);
writeJson(modeFile('delivery-plan.json'), deliveryPlan);
writeText(modeFile('delivery-notes.md'), deliveryNotes);
writeText(modeFile('proxy-integration.md'), proxyIntegration);

const artifactIndex = readJson('artifact-index.json', { output_dir: options.bundleDir, root_files: [], groups: { original: [], derived: [], evidence: [] } });
if (!artifactIndex.groups) artifactIndex.groups = { original: [], derived: [], evidence: [] };
if (!Array.isArray(artifactIndex.groups.derived)) artifactIndex.groups.derived = [];
for (const name of [
  'delivery-plan.json',
  'delivery-notes.md',
  'proxy-integration.md',
  modeFile('delivery-plan.json'),
  modeFile('delivery-notes.md'),
  modeFile('proxy-integration.md'),
  ...(options.mode === 'jsrpc-bridge' ? ['jsrpc-bridge.js', modeFile('mitmproxy-addon.py'), modeFile('burp-match-and-replace.json')] : []),
  ...(options.mode === 'proxy-injector' ? [modeFile('mitmproxy-addon.py'), modeFile('burp-match-and-replace.json')] : [])
]) {
  const full = path.join(options.bundleDir, name);
  if (!artifactIndex.groups.derived.some((entry) => entry.destination === full)) {
    artifactIndex.groups.derived.push({
      status: 'generated',
      source: full,
      destination: full,
    });
  }
}
writeJson('artifact-index.json', artifactIndex);

console.log(JSON.stringify({
  bundle_dir: options.bundleDir,
  mode: options.mode,
  outputs: [
    'delivery-plan.json',
    'delivery-notes.md',
    'proxy-integration.md',
    modeFile('delivery-plan.json'),
    modeFile('delivery-notes.md'),
    modeFile('proxy-integration.md'),
    ...(options.mode === 'jsrpc-bridge' ? ['jsrpc-bridge.js', modeFile('mitmproxy-addon.py'), modeFile('burp-match-and-replace.json')] : []),
    ...(options.mode === 'proxy-injector' ? [modeFile('mitmproxy-addon.py'), modeFile('burp-match-and-replace.json')] : [])
  ],
}, null, 2));
