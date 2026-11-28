#!/usr/bin/env node
// Builds the esbuild fixtures in this directory. The sources are the three entries in src/ and,
// through them, files of this collection that other tools built: ../srct/lib.js, ../srct/entry.js,
// ../webpack-4.development.js and ../webpack-4.production.js.
// Usage: node build.js <path to an installed esbuild package>      (built with esbuild 0.27.2)
// (esbuild is not a dependency of this package: the outputs are kept here, this script rebuilds them)
const path = require('path');
const fs = require('fs');
const esbuild = require(process.argv[2] || 'esbuild');
const here = __dirname;
const jobs = [
  // plain esbuild output: CommonJS sources, a __commonJS wrapper each
  ['esbuild-plain.cjs.js', '../srct/entry.js', { format: 'cjs' }],
  // plain, minified: esbuild renames its helpers, so nothing names the bundler any more
  ['esbuild-plain.iife.min.js', '../srct/entry.js', { format: 'iife', globalName: 'Scanner', minify: true }],
  // esbuild around one webpack bundle: the bundle keeps its bootstrap, inside a __commonJS wrapper
  ['esbuild-around-one-bundle.js', 'src/wrap-one.js', { format: 'cjs' }],
  // the same written as an ES module
  ['esbuild-around-one-bundle.mjs', 'src/wrap-one-esm.js', { format: 'esm' }],
  // esbuild around two webpack bundles: not one tree's worth
  ['esbuild-around-two-bundles.js', 'src/wrap-two.js', { format: 'cjs' }],
];
for (const [name, entry, options] of jobs) {
  esbuild.buildSync({ absWorkingDir: here, entryPoints: [path.join(here, entry)], outfile: path.join(here, name), bundle: true, platform: 'node', target: 'es2017', logLevel: 'silent', ...options });
  console.log('built', name, fs.statSync(path.join(here, name)).size, 'bytes');
}
