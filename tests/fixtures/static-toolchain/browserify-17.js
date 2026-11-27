(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
const lib = require('./lib.js');
const { sign, url } = require('./signer.js');
function boot() {
  const headers = { Authorization: lib.header('TOKEN_TABLE_PROOF_5e'), 'X-Sign': sign(lib.route('submit')) };
  return { headers, endpoint: url('items'), cls: lib.classify({ ready: true, ghost: false }) };
}
if (typeof window !== 'undefined') { window.__boot = boot; } else { console.log(JSON.stringify(boot())); }

},{"./lib.js":2,"./signer.js":3}],2:[function(require,module,exports){
// lib: a few exported helpers with distinct strings
function route(name) { return '/api/v2/' + name; }
function header(token) { return 'Bearer ' + token; }
const MESSAGES = { ready: 'service is ready', denied: 'permission denied for this Account' };
function classify(el) {
  return MESSAGES.ready + ': ' + Object.keys(el || {}).filter((k) => el[k]).join(' ');
}
module.exports = { route, header, MESSAGES, classify };

},{}],3:[function(require,module,exports){
const salt = 'FIXTURE_SALT_7d41';
function sign(name) {
  let h = 7;
  for (const ch of name + salt) h = (h * 31 + ch.charCodeAt(0)) % 100003;
  return 'sig:' + h;
}
function url(path) { return 'https://api.example.test/v2/' + path; }
module.exports = { sign, url };

},{}]},{},[1]);
