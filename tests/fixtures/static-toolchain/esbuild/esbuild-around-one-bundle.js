var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// ../webpack-4.development.js
var require_webpack_4_development = __commonJS({
  "../webpack-4.development.js"() {
    (function(modules) {
      var installedModules = {};
      function __webpack_require__(moduleId) {
        if (installedModules[moduleId]) {
          return installedModules[moduleId].exports;
        }
        var module3 = installedModules[moduleId] = {
          /******/
          i: moduleId,
          /******/
          l: false,
          /******/
          exports: {}
          /******/
        };
        modules[moduleId].call(module3.exports, module3, module3.exports, __webpack_require__);
        module3.l = true;
        return module3.exports;
      }
      __webpack_require__.m = modules;
      __webpack_require__.c = installedModules;
      __webpack_require__.d = function(exports3, name, getter) {
        if (!__webpack_require__.o(exports3, name)) {
          Object.defineProperty(exports3, name, { enumerable: true, get: getter });
        }
      };
      __webpack_require__.r = function(exports3) {
        if (typeof Symbol !== "undefined" && Symbol.toStringTag) {
          Object.defineProperty(exports3, Symbol.toStringTag, { value: "Module" });
        }
        Object.defineProperty(exports3, "__esModule", { value: true });
      };
      __webpack_require__.t = function(value, mode) {
        if (mode & 1) value = __webpack_require__(value);
        if (mode & 8) return value;
        if (mode & 4 && typeof value === "object" && value && value.__esModule) return value;
        var ns = /* @__PURE__ */ Object.create(null);
        __webpack_require__.r(ns);
        Object.defineProperty(ns, "default", { enumerable: true, value });
        if (mode & 2 && typeof value != "string") for (var key in value) __webpack_require__.d(ns, key, function(key2) {
          return value[key2];
        }.bind(null, key));
        return ns;
      };
      __webpack_require__.n = function(module3) {
        var getter = module3 && module3.__esModule ? (
          /******/
          function getDefault() {
            return module3["default"];
          }
        ) : (
          /******/
          function getModuleExports() {
            return module3;
          }
        );
        __webpack_require__.d(getter, "a", getter);
        return getter;
      };
      __webpack_require__.o = function(object, property) {
        return Object.prototype.hasOwnProperty.call(object, property);
      };
      __webpack_require__.p = "";
      return __webpack_require__(__webpack_require__.s = "./src/entry.js");
    })({
      /***/
      "./src/entry.js": (
        /*!**********************!*\
          !*** ./src/entry.js ***!
          \**********************/
        /*! no static exports found */
        /***/
        (function(module3, exports3, __webpack_require__) {
          const lib = __webpack_require__(
            /*! ./lib.js */
            "./src/lib.js"
          );
          const { sign, url } = __webpack_require__(
            /*! ./signer.js */
            "./src/signer.js"
          );
          function boot() {
            const headers = { Authorization: lib.header("TOKEN_TABLE_PROOF_5e"), "X-Sign": sign(lib.route("submit")) };
            return { headers, endpoint: url("items"), cls: lib.classify({ ready: true, ghost: false }) };
          }
          if (typeof window !== "undefined") {
            window.__boot = boot;
          } else {
            console.log(JSON.stringify(boot()));
          }
        })
      ),
      /***/
      "./src/lib.js": (
        /*!********************!*\
          !*** ./src/lib.js ***!
          \********************/
        /*! no static exports found */
        /***/
        (function(module3, exports3) {
          function route(name) {
            return "/api/v2/" + name;
          }
          function header(token) {
            return "Bearer " + token;
          }
          const MESSAGES = { ready: "service is ready", denied: "permission denied for this Account" };
          function classify(el) {
            return MESSAGES.ready + ": " + Object.keys(el || {}).filter((k) => el[k]).join(" ");
          }
          module3.exports = { route, header, MESSAGES, classify };
        })
      ),
      /***/
      "./src/signer.js": (
        /*!***********************!*\
          !*** ./src/signer.js ***!
          \***********************/
        /*! no static exports found */
        /***/
        (function(module3, exports3) {
          const salt = "FIXTURE_SALT_7d41";
          function sign(name) {
            let h = 7;
            for (const ch of name + salt) h = (h * 31 + ch.charCodeAt(0)) % 100003;
            return "sig:" + h;
          }
          function url(path) {
            return "https://api.example.test/v2/" + path;
          }
          module3.exports = { sign, url };
        })
      )
      /******/
    });
  }
});

// src/wrap-one.js
module.exports = require_webpack_4_development();
