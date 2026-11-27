'use strict';
// Preloaded into a child process with `--require`, so that `require('webcrack')` in the subject
// fails the way it does where the optional dependency is absent. Needed because that situation
// cannot be produced by uninstalling: on a machine where webcrack is installed it sits in the same
// node_modules as the esprima/escodegen the subject needs to start.
const Module = require('module');

const originalLoad = Module._load;
Module._load = function hideWebcrack(request, ...rest) {
  if (request === 'webcrack') {
    const err = new Error("Cannot find module 'webcrack'");
    err.code = 'MODULE_NOT_FOUND';
    throw err;
  }
  return originalLoad.call(this, request, ...rest);
};
