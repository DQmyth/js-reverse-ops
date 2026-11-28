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
// Usage (preload): PAGE_DIR=<dir with the files> node -r tests/helpers/page-shim.js <main.js>
// Used by tests/unit/unbundle.test.js to compare a tree cut from the files with the files.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { pathToFileURL } = require('url');

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

globalObject.document = {
  currentScript: { tagName: 'SCRIPT', src: pathToFileURL(path.resolve(process.argv[1])).href },
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
