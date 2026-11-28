(window["webpackJsonp"] = window["webpackJsonp"] || []).push([["lazy-b"],{

/***/ "./srcsplit/lazy-b.mjs":
/*!*****************************!*\
  !*** ./srcsplit/lazy-b.mjs ***!
  \*****************************/
/*! exports provided: runB */
/***/ (function(__webpack_module__, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "runB", function() { return runB; });
/* harmony import */ var _shared_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./shared.mjs */ "./srcsplit/shared.mjs");
/* harmony import */ var _lib_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./lib.mjs */ "./srcsplit/lib.mjs");

// lib.mjs is used by the entry too, so it stays in the main chunk

function runB(name) { return { tag: Object(_shared_mjs__WEBPACK_IMPORTED_MODULE_0__["stamp"])('b'), auth: Object(_lib_mjs__WEBPACK_IMPORTED_MODULE_1__["header"])(name) }; }


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