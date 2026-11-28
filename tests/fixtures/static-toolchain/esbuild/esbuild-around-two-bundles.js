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
          const lib2 = __webpack_require__(
            /*! ./lib.js */
            "./src/lib.js"
          );
          const { sign, url } = __webpack_require__(
            /*! ./signer.js */
            "./src/signer.js"
          );
          function boot() {
            const headers = { Authorization: lib2.header("TOKEN_TABLE_PROOF_5e"), "X-Sign": sign(lib2.route("submit")) };
            return { headers, endpoint: url("items"), cls: lib2.classify({ ready: true, ghost: false }) };
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

// ../webpack-4.production.js
var require_webpack_4_production = __commonJS({
  "../webpack-4.production.js"() {
    !(function(e) {
      var t = {};
      function n(r) {
        if (t[r]) return t[r].exports;
        var o = t[r] = { i: r, l: false, exports: {} };
        return e[r].call(o.exports, o, o.exports, n), o.l = true, o.exports;
      }
      n.m = e, n.c = t, n.d = function(e2, t2, r) {
        n.o(e2, t2) || Object.defineProperty(e2, t2, { enumerable: true, get: r });
      }, n.r = function(e2) {
        "undefined" != typeof Symbol && Symbol.toStringTag && Object.defineProperty(e2, Symbol.toStringTag, { value: "Module" }), Object.defineProperty(e2, "__esModule", { value: true });
      }, n.t = function(e2, t2) {
        if (1 & t2 && (e2 = n(e2)), 8 & t2) return e2;
        if (4 & t2 && "object" == typeof e2 && e2 && e2.__esModule) return e2;
        var r = /* @__PURE__ */ Object.create(null);
        if (n.r(r), Object.defineProperty(r, "default", { enumerable: true, value: e2 }), 2 & t2 && "string" != typeof e2) for (var o in e2) n.d(r, o, function(t3) {
          return e2[t3];
        }.bind(null, o));
        return r;
      }, n.n = function(e2) {
        var t2 = e2 && e2.__esModule ? function() {
          return e2.default;
        } : function() {
          return e2;
        };
        return n.d(t2, "a", t2), t2;
      }, n.o = function(e2, t2) {
        return Object.prototype.hasOwnProperty.call(e2, t2);
      }, n.p = "", n(n.s = 0);
    })([function(e, t, n) {
      const r = n(1), { sign: o, url: i } = n(2);
      function u() {
        return { headers: { Authorization: r.header("TOKEN_TABLE_PROOF_5e"), "X-Sign": o(r.route("submit")) }, endpoint: i("items"), cls: r.classify({ ready: true, ghost: false }) };
      }
      "undefined" != typeof window ? window.__boot = u : console.log(JSON.stringify(u()));
    }, function(e, t) {
      const n = { ready: "service is ready", denied: "permission denied for this Account" };
      e.exports = { route: function(e2) {
        return "/api/v2/" + e2;
      }, header: function(e2) {
        return "Bearer " + e2;
      }, MESSAGES: n, classify: function(e2) {
        return n.ready + ": " + Object.keys(e2 || {}).filter((t2) => e2[t2]).join(" ");
      } };
    }, function(e, t) {
      e.exports = { sign: function(e2) {
        let t2 = 7;
        for (const n of e2 + "FIXTURE_SALT_7d41") t2 = (31 * t2 + n.charCodeAt(0)) % 100003;
        return "sig:" + t2;
      }, url: function(e2) {
        return "https://api.example.test/v2/" + e2;
      } };
    }]);
  }
});

// ../srct/lib.js
var require_lib = __commonJS({
  "../srct/lib.js"(exports2, module2) {
    var constraint = (property) => `\`${property}\` error
`;
    function list(property, errors) {
      if (!errors || errors && Object.keys(errors).length > 1) {
        return `${`\`${property}\` errors:
`}${Object.keys(errors).map((key) => `    - ${key}: ${`\`${errors[key]}\``}
`).join()}`;
      }
      return constraint(property);
    }
    var SPECIAL = /[.*+?^${}()|[\]\\]/g;
    var escapeRe = (text2) => text2.replace(SPECIAL, "\\$&");
    function ratio(a2, b2) {
      return a2 / b2 / 2 | 0;
    }
    function afterBlock(flag) {
      if (flag) {
        return 1;
      }
    }
    var afterHead = /brace" } {\//.test("x") ? "}" : "{";
    function afterNested(a2, b2) {
      if (a2 && (b2 || a2) || b2 && a2) return /["']/g.test(`it's "quoted"`);
    }
    var text = `it's a "quoted" // not a comment /* nor this */ ${"nested 'quoted' string"} end`;
    function literalKey(key) {
      return { "a}b": 1, "c{d": 2, [`e${key}f`]: 3, "g/": /h\/i/ };
    }
    function lines(items) {
      return items.map((item) => `* ${item}
`).join("");
    }
    module2.exports = { constraint, list, escapeRe, ratio, afterBlock, afterHead, afterNested, text, literalKey, lines };
  }
});

// src/wrap-two.js
var a = () => require_webpack_4_development();
var b = () => require_webpack_4_production();
var lib = require_lib();
module.exports = { a, b, lib };
