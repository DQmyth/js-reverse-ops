"use strict";
(Array.isArray(self["webpackChunk"]) ? self["webpackChunk"] : (self["webpackChunk"] = [])).push([["lazy-a"],{

/***/ "./srcsplit/deep.mjs"
/*!***************************!*\
  !*** ./srcsplit/deep.mjs ***!
  \***************************/
(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   deep: () => (/* binding */ deep)
/* harmony export */ });
// only lazy-a uses this: it stays in lazy-a's chunk
function deep(n) { return Array.from({ length: n }, (_, i) => i * i).join('+'); }


/***/ },

/***/ "./srcsplit/lazy-a.mjs"
/*!*****************************!*\
  !*** ./srcsplit/lazy-a.mjs ***!
  \*****************************/
(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   runA: () => (/* binding */ runA)
/* harmony export */ });
/* harmony import */ var _shared_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./shared.mjs */ "./srcsplit/shared.mjs");
/* harmony import */ var _deep_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./deep.mjs */ "./srcsplit/deep.mjs");
/* harmony import */ var _signer_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./signer.mjs */ "./srcsplit/signer.mjs");


// signer.mjs is used by the entry too, so it stays in the main chunk: a chunk that needs the main bundle

function runA(name) { return { tag: (0,_shared_mjs__WEBPACK_IMPORTED_MODULE_0__.stamp)('a'), sig: (0,_signer_mjs__WEBPACK_IMPORTED_MODULE_2__.sign)(name + _shared_mjs__WEBPACK_IMPORTED_MODULE_0__.SHARED_SALT), deep: (0,_deep_mjs__WEBPACK_IMPORTED_MODULE_1__.deep)(4) }; }


/***/ }

}]);