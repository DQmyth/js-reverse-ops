const lib = require('./lib.js');
const { sign, url } = require('./signer.js');
function boot() {
  const headers = { Authorization: lib.header('TOKEN_TABLE_PROOF_5e'), 'X-Sign': sign(lib.route('submit')) };
  return { headers, endpoint: url('items'), cls: lib.classify({ ready: true, ghost: false }) };
}
boot.lazy = function () { return import(/* webpackChunkName: "lazy" */ './lazy.js').then((m) => m.salt); };
if (typeof window !== 'undefined') { window.__boot = boot; } else { console.log(JSON.stringify(boot())); boot.lazy().then((salt) => console.log('lazy:' + salt)); }
