var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

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
    function ratio(a, b) {
      return a / b / 2 | 0;
    }
    function afterBlock(flag) {
      if (flag) {
        return 1;
      }
    }
    var afterHead = /brace" } {\//.test("x") ? "}" : "{";
    function afterNested(a, b) {
      if (a && (b || a) || b && a) return /["']/g.test(`it's "quoted"`);
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

// ../srct/entry.js
var lib = require_lib();
var out = {
  constraint: lib.constraint("name"),
  list: lib.list("age", { a: 1, b: 2 }),
  one: lib.list("age", { a: 1 }),
  escaped: lib.escapeRe("a.b*c"),
  ratio: lib.ratio(7, 2),
  afterBlock: lib.afterBlock(true),
  afterHead: lib.afterHead,
  nested: lib.afterNested(1, 0),
  text: lib.text,
  keys: Object.keys(lib.literalKey("k")).sort(),
  lines: lib.lines(["x", "y"])
};
console.log(JSON.stringify(out));
