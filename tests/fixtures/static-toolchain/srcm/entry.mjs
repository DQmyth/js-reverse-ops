import { route, header, classify } from './lib.mjs';
import { sign, url } from './signer.mjs';
function boot() {
  const headers = { Authorization: header('TOKEN_TABLE_PROOF_5e'), 'X-Sign': sign(route('submit')) };
  return { headers, endpoint: url('items'), cls: classify({ ready: true, ghost: false }) };
}
if (typeof window !== 'undefined') { window.__boot = boot; } else { console.log(JSON.stringify(boot())); }
