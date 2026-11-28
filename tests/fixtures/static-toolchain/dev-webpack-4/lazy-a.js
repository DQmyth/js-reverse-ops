(window["webpackJsonp"] = window["webpackJsonp"] || []).push([["lazy-a"],{

/***/ "./srcsplit/deep.mjs":
/*!***************************!*\
  !*** ./srcsplit/deep.mjs ***!
  \***************************/
/*! exports provided: deep */
/***/ (function(__webpack_module__, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "deep", function() { return deep; });
// only lazy-a uses this: it stays in lazy-a's chunk
function deep(n) { return Array.from({ length: n }, (_, i) => i * i).join('+'); }


/***/ }),

/***/ "./srcsplit/lazy-a.mjs":
/*!*****************************!*\
  !*** ./srcsplit/lazy-a.mjs ***!
  \*****************************/
/*! exports provided: runA */
/***/ (function(__webpack_module__, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "runA", function() { return runA; });
/* harmony import */ var _shared_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./shared.mjs */ "./srcsplit/shared.mjs");
/* harmony import */ var _deep_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./deep.mjs */ "./srcsplit/deep.mjs");
/* harmony import */ var _signer_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./signer.mjs */ "./srcsplit/signer.mjs");


// signer.mjs is used by the entry too, so it stays in the main chunk: a chunk that needs the main bundle

function runA(name) { return { tag: Object(_shared_mjs__WEBPACK_IMPORTED_MODULE_0__["stamp"])('a'), sig: Object(_signer_mjs__WEBPACK_IMPORTED_MODULE_2__["sign"])(name + _shared_mjs__WEBPACK_IMPORTED_MODULE_0__["SHARED_SALT"]), deep: Object(_deep_mjs__WEBPACK_IMPORTED_MODULE_1__["deep"])(4) }; }


/***/ }),

/***/ "./srcsplit/shared.mjs":
/*!*****************************!*\
  !*** ./srcsplit/shared.mjs ***!
  \*****************************/
/*! exports provided: SHARED_SALT, stamp */
/***/ (function(__webpack_module__, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "SHARED_SALT", function() { return SHARED_SALT; });
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "stamp", function() { return stamp; });
// used by both lazy modules: webpack puts a module like this in a chunk of its own
const SHARED_SALT = 'FIXTURE_SPLIT_SALT_91c2';
function stamp(tag) { return `[${tag}] ${new Date(0).toISOString()}`; }


/***/ })

}]);