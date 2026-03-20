#!/usr/bin/env node
const fs = require('fs');
const esprima = require('esprima');
const estraverse = require('estraverse');
const escodegen = require('escodegen');

function usage() {
  console.error('Usage: run_ast_pipeline.js <input.js> <output.js> [--passes pass1,pass2,...] [--labels <labeled-semantics.json>]');
  process.exit(1);
}

if (process.argv.length < 4) {
  usage();
}

const inputPath = process.argv[2];
const outputPath = process.argv[3];
const passesArgIndex = process.argv.indexOf('--passes');
const labelsArgIndex = process.argv.indexOf('--labels');
const requestedPasses = passesArgIndex !== -1 && process.argv[passesArgIndex + 1]
  ? process.argv[passesArgIndex + 1].split(',').map((x) => x.trim()).filter(Boolean)
  : null;
const labelsPath = labelsArgIndex !== -1 && process.argv[labelsArgIndex + 1]
  ? process.argv[labelsArgIndex + 1]
  : '';

const ALL_PASSES = [
  'normalize-literals',
  'fold-constants',
  'if-prune',
  'conditional-prune',
  'sequence-split',
  'string-array-inline',
  'object-map-inline',
  'proxy-inline',
  'switch-loop-unroll',
  'computed-to-static',
  'runtime-opcode-labels',
  'empty-prune',
];

let ast = esprima.parseScript(fs.readFileSync(inputPath, 'utf8'), {
  range: true,
  comment: true,
  tokens: true,
  tolerant: true,
});
ast = escodegen.attachComments(ast, ast.comments, ast.tokens);
const activePasses = requestedPasses || ALL_PASSES;
const stats = {};
const runtimeLabels = loadRuntimeLabels(labelsPath);

function bump(name, count = 1) {
  stats[name] = (stats[name] || 0) + count;
}

function clone(node) {
  return JSON.parse(JSON.stringify(node));
}

function loadRuntimeLabels(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return {
      slots: new Map(),
      patterns: new Map(),
      defaultCases: [],
    };
  }
  let data;
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_err) {
    return {
      slots: new Map(),
      patterns: new Map(),
      defaultCases: [],
    };
  }
  const slots = new Map();
  const patterns = new Map();
  const defaultCases = [];
  for (const entry of (data.label_map || [])) {
    const pattern = String(entry.pattern || '');
    const label = String(entry.label || '');
    if (!label) continue;
    const slotMatch = /^Z\.\$\[(\d+)\]$/.exec(pattern);
    if (slotMatch) {
      const slot = Number(slotMatch[1]);
      slots.set(slot, label);
      if (/^DEFAULT_BRANCH_OPCODE_\d+_/.test(label)) {
        defaultCases.push([slot, label]);
      }
      continue;
    }
    patterns.set(pattern, label);
  }
  return { slots, patterns, defaultCases };
}

function identifier(name) {
  return { type: 'Identifier', name };
}

function hasPatternLabel(pattern) {
  return runtimeLabels.patterns.has(pattern);
}

function getPatternLabel(pattern) {
  return runtimeLabels.patterns.get(pattern);
}

function hasSlotLabel(idx) {
  return runtimeLabels.slots.has(idx);
}

function getSlotLabel(idx) {
  return runtimeLabels.slots.get(idx);
}

function getDefaultBranchSlotCases() {
  return runtimeLabels.defaultCases.slice().sort((a, b) => a[0] - b[0]);
}

function inferDefaultBranchFamily(label) {
  if (/ARRAY_(PUSH|POP)/.test(label)) return 'ARRAY_STACK_MUTATOR';
  if (/ARRAY_(CONCAT|SLICE)/.test(label)) return 'ARRAY_COPY_HELPER';
  return 'UNKNOWN_HELPER_FAMILY';
}

function literalNode(value) {
  if (value === undefined) return identifier('undefined');
  if (Number.isNaN(value)) {
    return {
      type: 'BinaryExpression',
      operator: '/',
      left: { type: 'Literal', value: 0, raw: '0' },
      right: { type: 'Literal', value: 0, raw: '0' },
    };
  }
  if (value === Infinity) {
    return {
      type: 'BinaryExpression',
      operator: '/',
      left: { type: 'Literal', value: 1, raw: '1' },
      right: { type: 'Literal', value: 0, raw: '0' },
    };
  }
  return { type: 'Literal', value, raw: typeof value === 'string' ? JSON.stringify(value) : String(value) };
}

function evaluate(node) {
  if (!node) return { confident: false };
  if (node.type === 'Literal') return { confident: true, value: node.value };
  if (node.type === 'Identifier' && node.name === 'undefined') return { confident: true, value: undefined };

  if (node.type === 'UnaryExpression') {
    const arg = evaluate(node.argument);
    if (!arg.confident) return { confident: false };
    switch (node.operator) {
      case '!': return { confident: true, value: !arg.value };
      case '+': return { confident: true, value: +arg.value };
      case '-': return { confident: true, value: -arg.value };
      case '~': return { confident: true, value: ~arg.value };
      case 'void': return { confident: true, value: undefined };
      case 'typeof': return { confident: true, value: typeof arg.value };
      default: return { confident: false };
    }
  }

  if (node.type === 'ArrayExpression') {
    const values = [];
    for (const el of node.elements) {
      const item = evaluate(el);
      if (!item.confident) return { confident: false };
      values.push(item.value);
    }
    return { confident: true, value: values };
  }

  if (node.type === 'ObjectExpression') {
    const out = {};
    for (const prop of node.properties) {
      if (!prop || prop.type !== 'Property' || prop.kind !== 'init') return { confident: false };
      let key;
      if (prop.key.type === 'Identifier') key = prop.key.name;
      else if (prop.key.type === 'Literal') key = String(prop.key.value);
      else return { confident: false };
      const val = evaluate(prop.value);
      if (!val.confident) return { confident: false };
      out[key] = val.value;
    }
    return { confident: true, value: out };
  }

  if (node.type === 'BinaryExpression') {
    const left = evaluate(node.left);
    const right = evaluate(node.right);
    if (!left.confident || !right.confident) return { confident: false };
    switch (node.operator) {
      case '+': return { confident: true, value: left.value + right.value };
      case '-': return { confident: true, value: left.value - right.value };
      case '*': return { confident: true, value: left.value * right.value };
      case '/': return { confident: true, value: left.value / right.value };
      case '%': return { confident: true, value: left.value % right.value };
      case '<<': return { confident: true, value: left.value << right.value };
      case '>>': return { confident: true, value: left.value >> right.value };
      case '>>>': return { confident: true, value: left.value >>> right.value };
      case '|': return { confident: true, value: left.value | right.value };
      case '&': return { confident: true, value: left.value & right.value };
      case '^': return { confident: true, value: left.value ^ right.value };
      case '==': return { confident: true, value: left.value == right.value };
      case '===': return { confident: true, value: left.value === right.value };
      case '!=': return { confident: true, value: left.value != right.value };
      case '!==': return { confident: true, value: left.value !== right.value };
      case '<': return { confident: true, value: left.value < right.value };
      case '<=': return { confident: true, value: left.value <= right.value };
      case '>': return { confident: true, value: left.value > right.value };
      case '>=': return { confident: true, value: left.value >= right.value };
      default: return { confident: false };
    }
  }

  if (node.type === 'LogicalExpression') {
    const left = evaluate(node.left);
    const right = evaluate(node.right);
    if (!left.confident || !right.confident) return { confident: false };
    switch (node.operator) {
      case '&&': return { confident: true, value: left.value && right.value };
      case '||': return { confident: true, value: left.value || right.value };
      default: return { confident: false };
    }
  }

  if (node.type === 'ConditionalExpression') {
    const test = evaluate(node.test);
    if (!test.confident) return { confident: false };
    return evaluate(test.value ? node.consequent : node.alternate);
  }

  return { confident: false };
}

function isZSlotAccess(node) {
  return node
    && node.type === 'MemberExpression'
    && node.computed === true
    && node.object
    && node.object.type === 'MemberExpression'
    && node.object.computed === false
    && node.object.object
    && node.object.object.type === 'Identifier'
    && node.object.object.name === 'Z'
    && node.object.property
    && node.object.property.type === 'Identifier'
    && node.object.property.name === '$';
}

function isDispatchKeyAccess(node) {
  return node
    && node.type === 'MemberExpression'
    && node.computed === true
    && node.object
    && node.object.type === 'Identifier'
    && node.object.name === 'DISPATCH_KEY';
}

function isSlotContainerAccess(node) {
  return isZSlotAccess(node) || isDispatchKeyAccess(node);
}

function getSlotIndex(node) {
  if (!isSlotContainerAccess(node)) return null;
  const idx = evaluate(node.property);
  if (!idx.confident || typeof idx.value !== 'number') return null;
  return idx.value;
}

function isPatternedMember(node, objectType, propertyName) {
  return node
    && node.type === 'MemberExpression'
    && node.computed === false
    && node.object
    && node.object.type === objectType
    && node.property
    && node.property.type === 'Identifier'
    && node.property.name === propertyName;
}

function isTruthyNode(node) {
  const result = evaluate(node);
  return result.confident ? Boolean(result.value) : null;
}

function withComments(nextAst, prevAst) {
  if (prevAst.comments && prevAst.tokens) return escodegen.attachComments(nextAst, prevAst.comments, prevAst.tokens);
  return nextAst;
}

function substitute(node, bindings) {
  return estraverse.replace(clone(node), {
    enter(child) {
      if (child.type === 'Identifier' && Object.prototype.hasOwnProperty.call(bindings, child.name)) {
        return clone(bindings[child.name]);
      }
    },
  });
}

function collectConstStringArrays(tree) {
  const arrays = new Map();
  for (const stmt of tree.body) {
    if (stmt.type !== 'VariableDeclaration') continue;
    for (const decl of stmt.declarations) {
      if (!decl.id || decl.id.type !== 'Identifier' || !decl.init || decl.init.type !== 'ArrayExpression') continue;
      const values = [];
      let ok = true;
      for (const el of decl.init.elements) {
        const v = evaluate(el);
        if (!v.confident || typeof v.value !== 'string') { ok = false; break; }
        values.push(v.value);
      }
      if (ok) arrays.set(decl.id.name, values);
    }
  }
  return arrays;
}

function collectConstObjectMaps(tree) {
  const maps = new Map();
  for (const stmt of tree.body) {
    if (stmt.type !== 'VariableDeclaration') continue;
    for (const decl of stmt.declarations) {
      if (!decl.id || decl.id.type !== 'Identifier' || !decl.init || decl.init.type !== 'ObjectExpression') continue;
      const val = evaluate(decl.init);
      if (val.confident) maps.set(decl.id.name, val.value);
    }
  }
  return maps;
}

function collectProxyFunctions(tree) {
  const proxies = new Map();
  for (const stmt of tree.body) {
    if (stmt.type !== 'FunctionDeclaration' || !stmt.id || stmt.body.body.length !== 1) continue;
    const ret = stmt.body.body[0];
    if (!ret || ret.type !== 'ReturnStatement' || !ret.argument) continue;
    const expr = ret.argument;
    if (!['BinaryExpression', 'LogicalExpression', 'CallExpression', 'MemberExpression'].includes(expr.type)) continue;
    proxies.set(stmt.id.name, {
      params: stmt.params.map((p) => p.type === 'Identifier' ? p.name : null),
      expr,
    });
  }
  return proxies;
}

function flattenSequence(expr) {
  if (!expr || expr.type !== 'SequenceExpression') return [expr];
  const parts = [];
  for (const item of expr.expressions) {
    if (item.type === 'SequenceExpression') parts.push(...flattenSequence(item));
    else parts.push(item);
  }
  return parts;
}

function rewriteBodies(tree, transform) {
  function visitContainer(container) {
    if (!container || !Array.isArray(container.body)) return;
    const nextBody = [];
    for (let i = 0; i < container.body.length; i += 1) {
      const stmt = container.body[i];
      if (stmt.type === 'BlockStatement') visitContainer(stmt);
      if (stmt.type === 'IfStatement') {
        if (stmt.consequent && stmt.consequent.type === 'BlockStatement') visitContainer(stmt.consequent);
        if (stmt.alternate && stmt.alternate.type === 'BlockStatement') visitContainer(stmt.alternate);
      }
      if (stmt.type === 'WhileStatement' && stmt.body && stmt.body.type === 'BlockStatement') visitContainer(stmt.body);
      const out = transform(stmt, i, container.body);
      if (Array.isArray(out)) nextBody.push(...out.filter(Boolean));
      else if (out) nextBody.push(out);
    }
    container.body = nextBody;
  }

  visitContainer(tree);
  return tree;
}

function getCaseKey(test) {
  const v = evaluate(test);
  if (v.confident) return v.value;
  return null;
}

function getStateAssignment(consequent, stateName) {
  for (let i = consequent.length - 1; i >= 0; i -= 1) {
    const stmt = consequent[i];
    if (stmt.type !== 'ExpressionStatement' || stmt.expression.type !== 'AssignmentExpression') continue;
    const expr = stmt.expression;
    if (expr.left.type === 'Identifier' && expr.left.name === stateName && expr.operator === '=') {
      const val = evaluate(expr.right);
      if (val.confident) return { index: i, nextState: val.value };
    }
  }
  return null;
}

function stripTrailingBreaks(nodes) {
  const out = nodes.slice();
  while (out.length && (out[out.length - 1].type === 'BreakStatement' || out[out.length - 1].type === 'ContinueStatement')) {
    out.pop();
  }
  return out;
}

function unrollSwitchLoop(body, whileIndex, stateDeclIndex, stateName, initialState) {
  const whileStmt = body[whileIndex];
  if (!whileStmt || whileStmt.type !== 'WhileStatement') return null;
  const test = evaluate(whileStmt.test);
  if (!test.confident || test.value !== true) return null;
  if (!whileStmt.body || whileStmt.body.type !== 'BlockStatement' || whileStmt.body.body.length !== 1) return null;
  const switchStmt = whileStmt.body.body[0];
  if (!switchStmt || switchStmt.type !== 'SwitchStatement' || switchStmt.discriminant.type !== 'Identifier' || switchStmt.discriminant.name !== stateName) return null;

  const cases = new Map();
  for (const c of switchStmt.cases) {
    if (!c.test) return null;
    const key = getCaseKey(c.test);
    if (key === null || cases.has(key)) return null;
    cases.set(key, c.consequent.map(clone));
  }

  const visited = new Set();
  const out = [];
  let current = initialState;
  let safety = 0;
  while (cases.has(current) && safety < 100) {
    safety += 1;
    if (visited.has(current)) return null;
    visited.add(current);
    let consequent = stripTrailingBreaks(cases.get(current));
    const stateAssign = getStateAssignment(consequent, stateName);
    let nextState = null;
    if (stateAssign) {
      nextState = stateAssign.nextState;
      consequent = consequent.filter((_, idx) => idx !== stateAssign.index);
    }
    for (const stmt of consequent) out.push(stmt);
    const terminal = consequent.some((stmt) => stmt.type === 'ReturnStatement' || stmt.type === 'ThrowStatement');
    if (terminal || !nextState) break;
    current = nextState;
  }

  if (!out.length) return null;
  bump('switch-loop-unroll');
  return out;
}

function applySwitchLoopUnroll(tree) {
  function visitContainer(container) {
    if (!container || !Array.isArray(container.body)) return;
    const nextBody = [];
    for (let i = 0; i < container.body.length; i += 1) {
      const stmt = container.body[i];
      if (stmt.type === 'BlockStatement') visitContainer(stmt);
      if (stmt.type === 'IfStatement') {
        if (stmt.consequent && stmt.consequent.type === 'BlockStatement') visitContainer(stmt.consequent);
        if (stmt.alternate && stmt.alternate.type === 'BlockStatement') visitContainer(stmt.alternate);
      }
      if (stmt.type === 'WhileStatement' && i > 0) {
        const prev = container.body[i - 1];
        if (prev && prev.type === 'VariableDeclaration' && prev.declarations.length === 1) {
          const decl = prev.declarations[0];
          if (decl.id && decl.id.type === 'Identifier' && decl.init) {
            const initial = evaluate(decl.init);
            if (initial.confident) {
              const unrolled = unrollSwitchLoop(container.body, i, i - 1, decl.id.name, initial.value);
              if (unrolled) {
                nextBody.pop();
                nextBody.push(...unrolled);
                continue;
              }
            }
          }
        }
      }
      nextBody.push(stmt);
    }
    container.body = nextBody;
  }

  visitContainer(tree);
  return tree;
}

const passImpl = {
  'normalize-literals': () => {
    ast = estraverse.replace(ast, {
      enter(node) {
        if (node.type === 'UnaryExpression') {
          const result = evaluate(node);
          if (result.confident) {
            bump('normalize-literals');
            return literalNode(result.value);
          }
        }
      },
    });
  },

  'fold-constants': () => {
    ast = estraverse.replace(ast, {
      enter(node) {
        if (node.type === 'BinaryExpression' || node.type === 'LogicalExpression') {
          const result = evaluate(node);
          if (result.confident) {
            bump('fold-constants');
            return literalNode(result.value);
          }
        }
      },
    });
  },

  'if-prune': () => {
    ast = estraverse.replace(ast, {
      enter(node) {
        if (node.type !== 'IfStatement') return;
        const truthy = isTruthyNode(node.test);
        if (truthy === null) return;
        bump('if-prune');
        if (truthy) return clone(node.consequent);
        if (node.alternate) return clone(node.alternate);
        return { type: 'EmptyStatement' };
      },
    });
  },

  'conditional-prune': () => {
    ast = estraverse.replace(ast, {
      enter(node) {
        if (node.type !== 'ConditionalExpression') return;
        const truthy = isTruthyNode(node.test);
        if (truthy === null) return;
        bump('conditional-prune');
        return truthy ? clone(node.consequent) : clone(node.alternate);
      },
    });
  },

  'sequence-split': () => {
    ast = rewriteBodies(ast, (stmt) => {
      if (!stmt || stmt.type !== 'ExpressionStatement' || stmt.expression.type !== 'SequenceExpression') return stmt;
      const parts = flattenSequence(stmt.expression).map((expr) => ({ type: 'ExpressionStatement', expression: expr }));
      if (parts.length > 1) bump('sequence-split', parts.length - 1);
      return parts;
    });
  },

  'string-array-inline': () => {
    const arrays = collectConstStringArrays(ast);
    if (!arrays.size) return;
    ast = estraverse.replace(ast, {
      enter(node) {
        if (node.type !== 'MemberExpression' || node.computed !== true || node.object.type !== 'Identifier') return;
        if (!arrays.has(node.object.name)) return;
        const idx = evaluate(node.property);
        if (!idx.confident || typeof idx.value !== 'number') return;
        const values = arrays.get(node.object.name);
        if (!Number.isInteger(idx.value) || idx.value < 0 || idx.value >= values.length) return;
        bump('string-array-inline');
        return literalNode(values[idx.value]);
      },
    });
  },

  'object-map-inline': () => {
    const maps = collectConstObjectMaps(ast);
    if (!maps.size) return;
    ast = estraverse.replace(ast, {
      enter(node) {
        if (node.type !== 'MemberExpression' || node.object.type !== 'Identifier') return;
        if (!maps.has(node.object.name)) return;
        let key;
        if (!node.computed && node.property.type === 'Identifier') key = node.property.name;
        else {
          const val = evaluate(node.property);
          if (!val.confident) return;
          key = String(val.value);
        }
        const map = maps.get(node.object.name);
        if (!Object.prototype.hasOwnProperty.call(map, key)) return;
        bump('object-map-inline');
        return literalNode(map[key]);
      },
    });
  },

  'proxy-inline': () => {
    const proxies = collectProxyFunctions(ast);
    if (!proxies.size) return;
    ast = estraverse.replace(ast, {
      enter(node) {
        if (node.type !== 'CallExpression' || node.callee.type !== 'Identifier') return;
        const meta = proxies.get(node.callee.name);
        if (!meta) return;
        if (meta.params.some((p) => p === null) || node.arguments.length < meta.params.length) return;
        const bindings = {};
        for (let i = 0; i < meta.params.length; i += 1) bindings[meta.params[i]] = node.arguments[i];
        bump('proxy-inline');
        return substitute(meta.expr, bindings);
      },
    });
  },

  'switch-loop-unroll': () => {
    ast = applySwitchLoopUnroll(ast);
  },

  'computed-to-static': () => {
    ast = estraverse.replace(ast, {
      enter(node) {
        if (node.type !== 'MemberExpression' || !node.computed || !node.property || node.property.type !== 'Literal') return;
        const value = node.property.value;
        if (typeof value !== 'string') return;
        if (!/^[$A-Z_a-z][$\w]*$/.test(value)) return;
        bump('computed-to-static');
        node.computed = false;
        node.property = identifier(value);
        return node;
      },
    });
  },

  'runtime-opcode-labels': () => {
    if (!runtimeLabels.slots.size && !runtimeLabels.patterns.size) return;
    ast = estraverse.replace(ast, {
      enter(node) {
        if (node.type === 'FunctionExpression'
          && !node.id
          && node.params.length === 5
          && node.params.every((p, idx) => p.type === 'Identifier' && ['o', 'b', 'C', 'm', 'r'][idx] === p.name)
          && node.body
          && node.body.type === 'BlockStatement'
          && node.body.body.length === 1
          && node.body.body[0].type === 'ReturnStatement'
          && hasPatternLabel('function(o,b,C,m,r){return 7==o?Z.$[1][Z.$[0]](Z.$[3],b,C,m,r):2==o?Z.$[1][Z.$[0]](Z.$[o],b,C,m):Z.$[1][Z.$[0]](Z.$[o],b,C)}')) {
          bump('runtime-opcode-labels');
          node.id = identifier(getPatternLabel('function(o,b,C,m,r){return 7==o?Z.$[1][Z.$[0]](Z.$[3],b,C,m,r):2==o?Z.$[1][Z.$[0]](Z.$[o],b,C,m):Z.$[1][Z.$[0]](Z.$[o],b,C)}'));
          return node;
        }
        if (node.type === 'MemberExpression'
          && node.computed === true
          && isSlotContainerAccess(node.object)) {
          const inner = getSlotIndex(node.object);
          const outer = getSlotIndex(node.property);
          if (inner === 1 && outer === 0 && hasPatternLabel('Z.$[1][Z.$[0]]')) {
            bump('runtime-opcode-labels');
            return identifier(getPatternLabel('Z.$[1][Z.$[0]]'));
          }
        }
        if (isSlotContainerAccess(node)) {
          const idx = evaluate(node.property);
          if (idx.confident && typeof idx.value === 'number' && hasSlotLabel(idx.value)) {
            bump('runtime-opcode-labels');
            return identifier(getSlotLabel(idx.value));
          }
        }
        if (isPatternedMember(node, 'Identifier', 'bind') && node.object.name === 'Z' && hasPatternLabel('Z.bind')) {
          bump('runtime-opcode-labels');
          return identifier(getPatternLabel('Z.bind'));
        }
        if (isPatternedMember(node, 'Identifier', 'apply') && node.object.name === 'Z' && hasPatternLabel('Z.apply')) {
          bump('runtime-opcode-labels');
          return identifier(getPatternLabel('Z.apply'));
        }
        if (isPatternedMember(node, 'Identifier', 'call') && node.object.name === 'Z' && hasPatternLabel('Z.call')) {
          bump('runtime-opcode-labels');
          return identifier(getPatternLabel('Z.call'));
        }
        if (isPatternedMember(node, 'ArrayExpression', 'push') && node.object.elements.length === 0 && hasPatternLabel('[].push')) {
          bump('runtime-opcode-labels');
          return identifier(getPatternLabel('[].push'));
        }
        if (isPatternedMember(node, 'ArrayExpression', 'pop') && node.object.elements.length === 0 && hasPatternLabel('[].pop')) {
          bump('runtime-opcode-labels');
          return identifier(getPatternLabel('[].pop'));
        }
        if (isPatternedMember(node, 'ArrayExpression', 'concat') && node.object.elements.length === 0 && hasPatternLabel('[].concat')) {
          bump('runtime-opcode-labels');
          return identifier(getPatternLabel('[].concat'));
        }
        if (isPatternedMember(node, 'ArrayExpression', 'slice') && node.object.elements.length === 0 && hasPatternLabel('[].slice')) {
          bump('runtime-opcode-labels');
          return identifier(getPatternLabel('[].slice'));
        }
        if (isPatternedMember(node, 'Identifier', '$') && node.object.name === 'Z' && hasPatternLabel('Z.$="1.1"')) {
          const parent = this.parents && this.parents[this.parents.length - 1];
          if (!parent || parent.type !== 'AssignmentExpression' || parent.left !== node) {
            bump('runtime-opcode-labels');
            return identifier(getPatternLabel('Z.$="1.1"'));
          }
        }
      },
      fallback: 'iteration',
    });
  },

  'empty-prune': () => {
    ast = rewriteBodies(ast, (stmt) => {
      if (!stmt) return null;
      if (stmt.type === 'EmptyStatement') { bump('empty-prune'); return null; }
      if (stmt.type === 'BlockStatement' && stmt.body.length === 0) { bump('empty-prune'); return null; }
      return stmt;
    });
  },
};

for (const pass of activePasses) {
  if (!passImpl[pass]) {
    console.error(`Unknown pass: ${pass}`);
    process.exit(2);
  }
  const prevAst = ast;
  passImpl[pass]();
  ast = withComments(ast, prevAst);
}

const output = escodegen.generate(ast, {
  comment: true,
  format: {
    indent: { style: '  ' },
    semicolons: true,
    preserveBlankLines: false,
  },
});

let finalOutput = output;
if (hasPatternLabel('Z.$[1][Z.$[0]]')) {
  const callTrampolineLabel = getPatternLabel('Z.$[1][Z.$[0]]');
  finalOutput = finalOutput.split('Z.$[1][Z.$[0]]').join(callTrampolineLabel);
  finalOutput = finalOutput.split('DISPATCH_KEY[1][DISPATCH_KEY[0]]').join(callTrampolineLabel);
}

if (finalOutput.includes('CALL_TRAMPOLINE(DISPATCH_KEY[o],')) {
  const defaultCases = getDefaultBranchSlotCases();
  const familyGroups = new Map();
  for (const [slot, label] of defaultCases) {
    const family = inferDefaultBranchFamily(label);
    if (!familyGroups.has(family)) familyGroups.set(family, []);
    familyGroups.get(family).push(slot);
  }
  const helperLines = defaultCases.length
    ? [
        'function DEFAULT_BRANCH_FAMILY(opcode) {',
        '  switch (opcode) {',
        ...Array.from(familyGroups.entries()).flatMap(([family, slots]) => slots.map((slot) => `  case ${slot}: return '${family}';`)),
        "  default: return 'UNKNOWN_HELPER_FAMILY';",
        '  }',
        '}',
        '',
        'function DEFAULT_BRANCH_RECEIVER(table, opcode) {',
        '  switch (opcode) {',
        ...defaultCases.map(([slot, label]) => `  case ${slot}: return ${label};`),
        '  default: return table[opcode];',
        '  }',
        '}',
      ]
    : [
        'function DEFAULT_BRANCH_RECEIVER(table, opcode) {',
        '  return table[opcode];',
        '}',
      ];
  finalOutput = [
    ...helperLines,
    '',
    finalOutput,
  ].join('\n');
  finalOutput = finalOutput.split('CALL_TRAMPOLINE(DISPATCH_KEY[o],').join('CALL_TRAMPOLINE(DEFAULT_BRANCH_RECEIVER(DISPATCH_KEY, o),');
}

fs.writeFileSync(outputPath, finalOutput, 'utf8');
console.error(JSON.stringify({ input: inputPath, output: outputPath, activePasses, labelsPath: labelsPath || null, stats }, null, 2));
