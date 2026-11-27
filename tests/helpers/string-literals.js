'use strict';
// Every string literal in a JavaScript source, as its value — read from the AST so that quote
// style, escapes and object keys do not matter. Shared by the string-table tests to assert
// "nothing lost, nothing invented" against the unobfuscated source a sample was built from.
const esprima = require('esprima');
const estraverse = require('estraverse');

function stringLiterals(code) {
  const found = [];
  estraverse.traverse(esprima.parseScript(code), {
    enter(node) {
      if (node.type === 'Literal' && typeof node.value === 'string') found.push(node.value);
    }
  });
  return found.sort();
}

module.exports = { stringLiterals };
