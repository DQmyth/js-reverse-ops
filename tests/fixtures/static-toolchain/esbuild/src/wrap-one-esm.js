// the same wrapper, written as an ES module: esbuild keeps `require()` for the CommonJS bundle
// by adding `createRequire` from node:module, and writes the file as an ES module
export { default } from './wrap-one.js';
