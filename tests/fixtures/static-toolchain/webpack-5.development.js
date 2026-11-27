/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ "./src/lib.js"
/*!********************!*\
  !*** ./src/lib.js ***!
  \********************/
(module) {

// lib: a few exported helpers with distinct strings
function route(name) { return '/api/v2/' + name; }
function header(token) { return 'Bearer ' + token; }
const MESSAGES = { ready: 'service is ready', denied: 'permission denied for this Account' };
function classify(el) {
  return MESSAGES.ready + ': ' + Object.keys(el || {}).filter((k) => el[k]).join(' ');
}
module.exports = { route, header, MESSAGES, classify };


/***/ },

/***/ "./src/signer.js"
/*!***********************!*\
  !*** ./src/signer.js ***!
  \***********************/
(module) {

const salt = 'FIXTURE_SALT_7d41';
function sign(name) {
  let h = 7;
  for (const ch of name + salt) h = (h * 31 + ch.charCodeAt(0)) % 100003;
  return 'sig:' + h;
}
function url(path) { return 'https://api.example.test/v2/' + path; }
module.exports = { sign, url };


/***/ }

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	const __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		const cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		const module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		if (!(moduleId in __webpack_modules__)) {
/******/ 			delete __webpack_module_cache__[moduleId];
/******/ 			const e = new Error("Cannot find module '" + moduleId + "'");
/******/ 			e.code = 'MODULE_NOT_FOUND';
/******/ 			throw e;
/******/ 		}
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
// This entry needs to be wrapped in an IIFE because it needs to be isolated against other modules in the chunk.
(() => {
/*!**********************!*\
  !*** ./src/entry.js ***!
  \**********************/
const lib = __webpack_require__(/*! ./lib.js */ "./src/lib.js");
const { sign, url } = __webpack_require__(/*! ./signer.js */ "./src/signer.js");
function boot() {
  const headers = { Authorization: lib.header('TOKEN_TABLE_PROOF_5e'), 'X-Sign': sign(lib.route('submit')) };
  return { headers, endpoint: url('items'), cls: lib.classify({ ready: true, ghost: false }) };
}
if (typeof window !== 'undefined') { window.__boot = boot; } else { console.log(JSON.stringify(boot())); }

})();

/******/ })()
;