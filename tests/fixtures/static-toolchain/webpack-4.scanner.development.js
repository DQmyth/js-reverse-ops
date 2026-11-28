/******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId]) {
/******/ 			return installedModules[moduleId].exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			i: moduleId,
/******/ 			l: false,
/******/ 			exports: {}
/******/ 		};
/******/
/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/
/******/ 		// Flag the module as loaded
/******/ 		module.l = true;
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/
/******/
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;
/******/
/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;
/******/
/******/ 	// define getter function for harmony exports
/******/ 	__webpack_require__.d = function(exports, name, getter) {
/******/ 		if(!__webpack_require__.o(exports, name)) {
/******/ 			Object.defineProperty(exports, name, { enumerable: true, get: getter });
/******/ 		}
/******/ 	};
/******/
/******/ 	// define __esModule on exports
/******/ 	__webpack_require__.r = function(exports) {
/******/ 		if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 			Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 		}
/******/ 		Object.defineProperty(exports, '__esModule', { value: true });
/******/ 	};
/******/
/******/ 	// create a fake namespace object
/******/ 	// mode & 1: value is a module id, require it
/******/ 	// mode & 2: merge all properties of value into the ns
/******/ 	// mode & 4: return value when already ns object
/******/ 	// mode & 8|1: behave like require
/******/ 	__webpack_require__.t = function(value, mode) {
/******/ 		if(mode & 1) value = __webpack_require__(value);
/******/ 		if(mode & 8) return value;
/******/ 		if((mode & 4) && typeof value === 'object' && value && value.__esModule) return value;
/******/ 		var ns = Object.create(null);
/******/ 		__webpack_require__.r(ns);
/******/ 		Object.defineProperty(ns, 'default', { enumerable: true, value: value });
/******/ 		if(mode & 2 && typeof value != 'string') for(var key in value) __webpack_require__.d(ns, key, function(key) { return value[key]; }.bind(null, key));
/******/ 		return ns;
/******/ 	};
/******/
/******/ 	// getDefaultExport function for compatibility with non-harmony modules
/******/ 	__webpack_require__.n = function(module) {
/******/ 		var getter = module && module.__esModule ?
/******/ 			function getDefault() { return module['default']; } :
/******/ 			function getModuleExports() { return module; };
/******/ 		__webpack_require__.d(getter, 'a', getter);
/******/ 		return getter;
/******/ 	};
/******/
/******/ 	// Object.prototype.hasOwnProperty.call
/******/ 	__webpack_require__.o = function(object, property) { return Object.prototype.hasOwnProperty.call(object, property); };
/******/
/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";
/******/
/******/
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(__webpack_require__.s = "./srct/entry.js");
/******/ })
/************************************************************************/
/******/ ({

/***/ "./srct/entry.js":
/*!***********************!*\
  !*** ./srct/entry.js ***!
  \***********************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

// srct/entry.js: calls every helper of ./lib.js and prints what comes back
const lib = __webpack_require__(/*! ./lib.js */ "./srct/lib.js");
const out = {
  constraint: lib.constraint('name'),
  list: lib.list('age', { a: 1, b: 2 }),
  one: lib.list('age', { a: 1 }),
  escaped: lib.escapeRe('a.b*c'),
  ratio: lib.ratio(7, 2),
  afterBlock: lib.afterBlock(true),
  afterHead: lib.afterHead,
  nested: lib.afterNested(1, 0),
  text: lib.text,
  keys: Object.keys(lib.literalKey('k')).sort(),
  lines: lib.lines(['x', 'y']),
};
console.log(JSON.stringify(out));


/***/ }),

/***/ "./srct/lib.js":
/*!*********************!*\
  !*** ./srct/lib.js ***!
  \*********************/
/*! no static exports found */
/***/ (function(module, exports) {

// srct/lib.js: constructs a token scanner has to get right. Everything here is ordinary code that
// real bundles carry — each line broke, or could break, a scanner that reads to the first
// backtick, or that calls a slash after `)` a regex
const constraint = (property) => `\`${property}\` error\n`;
// a template whose interpolation holds a template of its own, which holds one again
function list(property, errors) {
  if (!errors || (errors && Object.keys(errors).length > 1)) {
    return `${`\`${property}\` errors:\n`}${Object.keys(errors).map((key) => `    - ${key}: ${`\`${errors[key]}\``}\n`).join()}`;
  }
  return constraint(property);
}
// a regex with quotes, braces, and an escaped bracket inside a character class
const SPECIAL = /[.*+?^${}()|[\]\\]/g;
const escapeRe = (text) => text.replace(SPECIAL, '\\$&');
// division, twice; then a regex after the closing brace of a block
function ratio(a, b) { return (a / b / 2) | 0; }
function afterBlock(flag) { if (flag) { return 1; } }
const afterHead = /brace" } {\//.test('x') ? '}' : '{';
// a regex after `)` that closed an if-head with parentheses nested in it
function afterNested(a, b) { if ((a && (b || a)) || (b && a)) return /["']/g.test('it\'s "quoted"'); }
// quotes, slashes and comment marks inside template text — all of them just text
const text = `it's a "quoted" // not a comment /* nor this */ ${'nested \'quoted\' string'} end`;
/* a comment holding braces } { and a quote ' and a backtick ` */
function literalKey(key) { return { 'a}b': 1, 'c{d': 2, [`e${key}f`]: 3, 'g/': /h\/i/ }; }
function lines(items) { return items.map((item) => `* ${item}\n`).join(''); }
module.exports = { constraint, list, escapeRe, ratio, afterBlock, afterHead, afterNested, text, literalKey, lines };


/***/ })

/******/ });