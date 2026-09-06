#!/usr/bin/env node
// Generate a jsdom "<script>" prelude from an anti-detection profile.
// Bridges the anti-detection profile library (assets/anti-detection-profiles.json)
// with the verbatim-execution harness recipes (references/env-rebuild-recipes.md):
// pick a profile -> emit the exact head-injected <script> that aligns the
// environment face a VM shell probes.
//
// Usage:
//   node scripts/scaffold_env_prelude.js --profile chrome-verbatim-sandbox \
//        [--auth-cookie "auth=<value>"] [--ua "<ua>"] [--out prelude.html]
//   node scripts/scaffold_env_prelude.js --list
//
// The emitted prelude is the verified environment-alignment set from practice
// topic 24; classes not in the profile are skipped.

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const argOf = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };

if (args.includes('--list')) {
  const profiles = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'assets', 'anti-detection-profiles.json'), 'utf8')).profiles;
  for (const p of profiles) console.log(p.id.padEnd(28), p.label);
  process.exit(0);
}

const profileId = argOf('--profile', 'chrome-verbatim-sandbox');
const index = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'assets', 'anti-detection-profiles.json'), 'utf8'));
const profile = index.profiles.find(p => p.id === profileId);
if (!profile) { console.error('profile not found:', profileId); process.exit(1); }

const sessionCookie = argOf('--auth-cookie', 'auth=<value>');
const ua = argOf('--ua', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36');

const has = (cls) => profile.patch_classes.includes(cls);
const L = [];
L.push('<script>');
L.push('(function () {');
if (has('cookie-shape')) {
  L.push(`  const ck = "${sessionCookie}";`);
  L.push('  try { Object.defineProperty(document, "cookie", { configurable: true, get() { return ck; }, set() {} }); } catch (e) {}');
}
if (has('ua-override')) {
  L.push(`  const UA = ${JSON.stringify(ua)};`);
  L.push('  const nav = window.navigator, proto = Object.getPrototypeOf(nav);');
  L.push('  const ov = { userAgent: UA, appVersion: UA.replace(/^Mozilla\\//, ""), platform: "MacIntel", vendor: "Google Inc.", webdriver: false };');
  L.push('  for (const k of Object.keys(ov)) { try { const t = nav.hasOwnProperty(k) ? nav : proto; Object.defineProperty(t, k, { configurable: true, get() { return ov[k]; } }); } catch (e) {} }');
}
if (has('plugins-5-pdf')) {
  L.push('  try {');
  L.push('    const names = ["PDF Viewer", "Chrome PDF Viewer", "Chromium PDF Viewer", "Microsoft Edge PDF Viewer", "WebKit built-in PDF"];');
  L.push('    const plugins = { length: 5, item(i) { return this[i] || null; }, namedItem() { return null; }, refresh() {} };');
  L.push('    for (let i = 0; i < 5; i++) plugins[i] = { name: names[i], filename: "internal-pdf-viewer", description: "Portable Document Format", length: 2 };');
  L.push('    Object.defineProperty(navigator, "plugins", { configurable: true, get() { return plugins; } });');
  L.push('  } catch (e) {}');
}
if (has('mimetypes-2-pdf')) {
  L.push('  try {');
  L.push('    const mimes = { length: 2, item(i) { return this[i] || null; }, namedItem() { return null; } };');
  L.push('    mimes[0] = { type: "application/pdf", suffixes: "pdf", description: "Portable Document Format" };');
  L.push('    mimes[1] = { type: "text/pdf", suffixes: "pdf", description: "Portable Document Format" };');
  L.push('    Object.defineProperty(navigator, "mimeTypes", { configurable: true, get() { return mimes; } });');
  L.push('  } catch (e) {}');
}
if (has('languages-zh')) {
  L.push('  try { Object.defineProperty(navigator, "languages", { configurable: true, get() { return ["zh-CN", "zh"]; } }); } catch (e) {}');
}
if (has('chrome-object-keyorder')) {
  L.push('  try { window.chrome = { loadTimes() { return {}; }, csi() { return {}; }, app: { isInstalled: false, getDetails() {}, getIsInstalled() {}, installState() { return "not_installed"; }, runningState() { return "cannot_run"; }, InstallState: { DISABLED: "disabled", INSTALLED: "installed", NOT_INSTALLED: "not_installed" }, RunningState: { CANNOT_RUN: "cannot_run", READY_TO_RUN: "ready_to_run", RUNNING: "running" } } }; } catch (e) {}');
}
if (has('indexeddb-tostringtag')) {
  L.push('  try { if (!window.indexedDB) { const idb = { open() { return {}; } }; idb[Symbol.toStringTag] = "IDBFactory"; Object.defineProperty(window, "indexedDB", { configurable: true, get() { return idb; } }); } } catch (e) {}');
}
if (has('devicepixelratio-1')) {
  L.push('  try { Object.defineProperty(window, "devicePixelRatio", { configurable: true, get() { return 1; } }); } catch (e) {}');
}
if (has('outer-viewport-zero')) {
  L.push('  try { for (const k of ["outerWidth", "outerHeight", "screenX", "screenY"]) Object.defineProperty(window, k, { configurable: true, get() { return 0; } }); } catch (e) {}');
}
if (has('inner-viewport-756x469')) {
  L.push('  try { Object.defineProperty(window, "innerWidth", { configurable: true, get() { return 756; } }); Object.defineProperty(window, "innerHeight", { configurable: true, get() { return 469; } }); } catch (e) {}');
  L.push('  try { const de = document.documentElement; Object.defineProperty(de, "clientWidth", { configurable: true, get() { return 756; } }); Object.defineProperty(de, "clientHeight", { configurable: true, get() { return 469; } }); } catch (e) {}');
}
if (has('screen-1920x1080')) {
  L.push('  try { Object.defineProperty(window, "screen", { configurable: true, get() { return { width: 1920, height: 1080, availWidth: 1920, availHeight: 1055, colorDepth: 24, pixelDepth: 24 }; } }); } catch (e) {}');
}
if (has('history-length-3')) {
  L.push('  try { const h = window.history; Object.defineProperty(h, "length", { configurable: true, get() { return 3; } }); } catch (e) {}');
}
if (has('document-hidden')) {
  L.push('  try { Object.defineProperty(document, "hidden", { configurable: true, get() { return true; } }); Object.defineProperty(document, "visibilityState", { configurable: true, get() { return "hidden"; } }); } catch (e) {}');
}
if (has('caches-speechsynthesis-stubs')) {
  L.push('  try { window.caches = { open() { return Promise.resolve({}); } }; } catch (e) {}');
  L.push('  try { window.speechSynthesis = { getVoices() { return []; }, speak() {}, cancel() {} }; } catch (e) {}');
}
if (has('performance-timing')) {
  L.push('  try { if (window.performance && !window.performance.timing) window.performance.timing = { navigationStart: Date.now() - 3000 }; } catch (e) {}');
}
if (has('gbcr-min-rect')) {
  L.push('  try {');
  L.push('    const g = Element.prototype.getBoundingClientRect;');
  L.push('    Element.prototype.getBoundingClientRect = function () { const r = g.call(this); if (r && r.width === 0 && r.height === 0) return { x: 0, y: 0, top: 0, left: 0, right: 756, bottom: 469, width: 756, height: 469, toJSON() { return this; } }; return r; };');
  L.push('  } catch (e) {}');
}
L.push('})();');
L.push('</script>');

const prelude = L.join('\n');
const out = argOf('--out');
if (out) { fs.writeFileSync(out, prelude); console.error('written:', out); }
else console.log(prelude);
