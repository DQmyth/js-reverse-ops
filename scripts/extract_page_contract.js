#!/usr/bin/env node
const fs = require('fs');

if (process.argv.length < 3) {
  console.error('Usage: extract_page_contract.js <page.html>');
  process.exit(1);
}

const file = process.argv[2];
const html = fs.readFileSync(file, 'utf8');

function uniq(items) {
  return [...new Set(items)].sort();
}

function collect(re) {
  return uniq([...html.matchAll(re)].map((m) => m[1] || m[0]));
}

function findSnippet(needle) {
  if (!needle) return null;
  const idx = html.indexOf(needle);
  if (idx === -1) return null;
  return html.slice(Math.max(0, idx - 200), Math.min(html.length, idx + needle.length + 260));
}

const scriptSrcs = collect(/<script[^>]+src="([^"]+)"/g);
const apiPaths = collect(/\/api\/[A-Za-z0-9_./-]+/g);
const methods = collect(/type:\s*["'](GET|POST|PUT|DELETE|PATCH)["']/gi);
const callTargets = collect(/\b(call|submit)\s*\(([^)]*)\)/g);
const formActions = collect(/<form[^>]+action="([^"]+)"/gi);
const formMethods = collect(/<form[^>]+method="([^"]+)"/gi).map((m) => m.toUpperCase());
const onsubmits = collect(/onsubmit="([^"]+)"/gi);
const hiddenFieldNames = collect(/<input[^>]+type="hidden"[^>]+name="([^"]+)"/gi);
const bodyKeys = collect(/['"]([A-Za-z0-9_-]+)['"]\s*:/g)
  .filter((s) => /^(page|token|sign|signature|nonce|timestamp|now|serial|answer|data|yt\d+)$/i.test(s));
const onclicks = collect(/onclick="([^"]+)"/g);
const authGateScripts = collect(/jQuery\.modalbox\(([^)]+page=login[^)]*)\)/gi);
const loginHints = collect(/page=login|action=["'][^"']*login|Se connecter|Créer un compte/gi);
const hasChallengeScript = scriptSrcs.some((s) => /match\d+\.js|corejs|flutter|main\.dart|yew|wasm/i.test(s));
const endpointCandidate =
  apiPaths.find((s) => /\/api\/[A-Za-z0-9_-]+\/\d+/.test(s)) ||
  apiPaths.find((s) => /\/api\/answer/.test(s)) ||
  formActions[0] ||
  apiPaths[0] ||
  null;
const helperEndpoints = ['/api/answer', '/api/loginInfo', '/api/logout'];
const helperEndpointRisk = hasChallengeScript && helperEndpoints.includes(endpointCandidate);
const authGateRisk = authGateScripts.length > 0 || loginHints.length >= 3;

const result = {
  file,
  title: (html.match(/<title>([^<]+)<\/title>/i) || [null, null])[1],
  inferred: {
    endpoint: endpointCandidate,
    method: methods[0] || formMethods[0] || null,
    body_keys: uniq([...bodyKeys, ...hiddenFieldNames]),
    call_like_handlers: callTargets,
    form_actions: formActions,
    form_onsubmit_handlers: onsubmits,
    external_scripts: scriptSrcs.filter((s) => /match\d+\.js|corejs|yew|wasm/i.test(s)),
    helper_endpoint_risk: helperEndpointRisk,
    auth_gate_risk: authGateRisk,
  },
  snippets: {
    endpoint: findSnippet(apiPaths[0] || null),
    submit: findSnippet('submit('),
    call: findSnippet('call('),
    onclick_submit: findSnippet('onclick="submit()'),
    form_action: findSnippet(formActions[0] || null),
    onsubmit: findSnippet(onsubmits[0] || null),
    auth_gate: findSnippet('page=login') || findSnippet('jQuery.modalbox('),
  },
  raw: {
    api_paths: apiPaths,
    methods,
    form_actions: formActions,
    form_methods: formMethods,
    onsubmits,
    onclicks,
    hidden_field_names: hiddenFieldNames,
    auth_gate_scripts: authGateScripts,
    login_hints: loginHints,
  }
};

console.log(JSON.stringify(result, null, 2));
