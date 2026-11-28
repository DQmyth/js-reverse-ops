'use strict';
// Stands in for the page a bundle set was built for, so that the ORIGINAL files — a main bundle
// and the chunk files it loads with <script> tags while it runs — run under plain Node.
//   self, window        the global object
//   document            `currentScript`: the main bundle's own URL — webpack's default publicPath
//                       ("auto") reads it at start-up, and throws without it
//                       a `head` whose appendChild "loads" a script: it runs the file the script's
//                       `src` names, out of the directory PAGE_DIR points at, then fires `onload`
//                       on a later turn — as a real tag loads some time after it is attached
//                       `getElementsByTagName` answers nothing, `createElement` makes a script
// Usage, one file up front (preload):
//     PAGE_DIR=<dir with the files> node -r tests/helpers/page-shim.js <main.js>
// Usage, a page that loads several files up front — a build with runtimeChunk loads its runtime,
// then the entry chunk:
//     PAGE_DIR=<dir> PAGE_ORDER=runtime.js,main.js node tests/helpers/page-shim.js
// Used by tests/unit/unbundle.test.js to compare a tree cut from the files with the files.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { pathToFileURL } = require('url');

// files named on the PAGE_ORDER line are relative to PAGE_DIR; urlOf(dir, a, b) joins them
const urlOf = (...parts) => pathToFileURL(path.resolve(...parts)).href;

const dir = process.env.PAGE_DIR;
if (!dir) {
  console.error('page-shim: PAGE_DIR is not set (the directory holding the bundle and its chunk files)');
  process.exit(2);
}
const globalObject = globalThis;
globalObject.self = globalObject;
globalObject.window = globalObject;

let attached = 0;
const makeScript = () => {
  const script = { charset: '', timeout: 0, onload: null, onerror: null, parentNode: null };
  let src = '';
  Object.defineProperty(script, 'src', { get: () => src, set: (value) => { src = value; } });
  script.setAttribute = () => {};
  script.getAttribute = () => null;
  return script;
};

// the <script> the page is running right now; webpack's publicPath reads it when a file starts
globalObject.document = {
  currentScript: { tagName: 'SCRIPT', src: process.env.PAGE_ORDER ? urlOf(dir, process.env.PAGE_ORDER.split(',')[0]) : urlOf(process.argv[1]) },
  head: {
    appendChild(script) {
      const file = path.join(dir, path.basename(String(script.src)));
      attached += 1;
      setImmediate(() => {
        try {
          vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename: file });
        } catch (error) {
          if (script.onerror) script.onerror({ type: 'error', target: script });
          return;
        }
        if (script.onload) script.onload({ type: 'load', target: script });
      });
    },
  },
  getElementsByTagName: () => [],
  createElement: () => makeScript(),
};

// what the page saw, on exit, so a test can tell "loaded by script tag" from "already there"
process.on('exit', () => {
  process.stderr.write(`page-shim: ${attached} script tag(s) attached\n`);
});

// the page's own <script> tags, in order
if (require.main === module && process.env.PAGE_ORDER) {
  let failed = 0;
  for (const name of process.env.PAGE_ORDER.split(',')) {
    const file = path.join(dir, name);
    globalObject.document.currentScript = { tagName: 'SCRIPT', src: urlOf(file) };
    try {
      vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename: file });
    } catch (error) {
      failed = 1;
      console.error(error && error.stack ? error.stack : error);
    }
  }
  process.exitCode = failed;
}
