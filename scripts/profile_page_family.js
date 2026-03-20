#!/usr/bin/env node
const fs = require('fs');

if (process.argv.length < 3) {
  console.error('Usage: profile_page_family.js <page.html>');
  process.exit(1);
}

const file = process.argv[2];
const html = fs.readFileSync(file, 'utf8');

function uniq(items) {
  return [...new Set(items)].sort();
}

function collect(re, text = html) {
  return uniq([...text.matchAll(re)].map((m) => m[1] || m[0]));
}

const scriptSrcs = collect(/<script[^>]+src="([^"]+)"/g);
const moduleScripts = collect(/<script[^>]+type="module"[^>]+src="([^"]+)"/g);
const modulePreloads = collect(/<link[^>]+modulepreload[^>]+href="([^"]+)"/g);
const hasInlineCall = /\bcall\s*\(/.test(html);
const hasInlineSubmit = /\bsubmit\s*\(/.test(html) || /onclick="submit\(\)"/.test(html);
const hasLoginModal = /jQuery\.modalbox\([^)]*page=login/i.test(html) || /setTimeout\([^)]*page=login/i.test(html);
const hasAuthPrompt = /Se connecter|Créer un compte|page=login/i.test(html);
const apiHints = collect(/\/api\/[A-Za-z0-9_./-]+/g);
const appBundleHints = uniq([
  ...scriptSrcs.filter((s) => /(flutter|main\.dart|canvaskit|dart\.js|manifest\.json|engit\.js)/i.test(s)),
  ...collect(/([A-Za-z0-9_./-]+(?:flutter|main\.dart|canvaskit|manifest\.json|engit)\.[A-Za-z0-9._-]+)/gi),
]);
const wasmHints = [
  ...collect(/([A-Za-z0-9_./-]+\.wasm)/g),
  ...(html.includes('WebAssembly') ? ['WebAssembly'] : []),
  ...scriptSrcs.filter((s) => /(canvaskit|flutter|main\.dart)/i.test(s)),
];
const coreScripts = scriptSrcs.filter((s) => /match\d+\.js/.test(s));

const flags = {
  has_remote_corejs: coreScripts.length > 0,
  has_module_script: moduleScripts.length > 0,
  has_modulepreload: modulePreloads.length > 0,
  has_wasm_hints: wasmHints.length > 0 || moduleScripts.some((s) => /yew|wasm/i.test(s)) || modulePreloads.some((s) => /yew|wasm/i.test(s)),
  has_app_bundle_hints: appBundleHints.length > 0,
  has_inline_call: hasInlineCall,
  has_inline_submit: hasInlineSubmit,
  has_login_modal: hasLoginModal,
  has_auth_prompt: hasAuthPrompt,
  uses_fonteditor: /fonteditor/.test(html),
  uses_canvas: /<canvas[\s>]/i.test(html) || /(canvaskit|flutter)/i.test(html),
};

const families = [];
if (flags.has_remote_corejs) families.push('remote-corejs');
if (flags.has_remote_corejs && !flags.has_module_script && !flags.has_wasm_hints) families.push('remote-corejs-monolith');
if (!flags.has_remote_corejs && (flags.has_inline_call || flags.has_inline_submit || apiHints.includes('/api/answer'))) families.push('inline-page-challenge');
if (flags.has_module_script || flags.has_modulepreload || flags.has_wasm_hints) families.push('module-or-wasm-hybrid');
if (flags.has_app_bundle_hints) families.push('app-bundle-hybrid');
if (flags.uses_fonteditor || flags.uses_canvas) families.push('font-or-canvas-presentation');
if (flags.has_login_modal || flags.has_auth_prompt) families.push('login-gated-public-page');

const result = {
  file,
  title: (html.match(/<title>([^<]+)<\/title>/i) || [null, null])[1],
  script_srcs: scriptSrcs,
  module_scripts: moduleScripts,
  module_preloads: modulePreloads,
  api_hints: apiHints,
  app_bundle_hints: appBundleHints,
  flags,
  families,
};

console.log(JSON.stringify(result, null, 2));
