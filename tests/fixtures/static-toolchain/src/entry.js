const lib = require('./lib.js');
const { sign, url } = require('./signer.js');
function boot() {
  const headers = { Authorization: lib.header('TOKEN_TABLE_PROOF_5e'), 'X-Sign': sign(lib.route('submit')) };
  return { headers, endpoint: url('items'), cls: lib.classify({ ready: true, ghost: false }) };
}
if (typeof window !== 'undefined') { window.__boot = boot; } else { console.log(JSON.stringify(boot())); }
