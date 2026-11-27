// 24 distinct strings: enough for a table detector that insists on >=15 entries.
function route(name) {
  return '/api/v2/' + name;
}
function header(token) {
  return 'Bearer ' + token;
}
const MESSAGES = {
  ready: 'service is ready',
  busy: 'service is busy, retry later',
  down: 'service is down for maintenance',
  auth: 'authentication required',
  denied: 'permission denied for this Account',
  missing: 'resource not found in the registry',
  rate: 'rate limit exceeded, slow down',
  stale: 'cached copy is stale, refresh it',
};
const CLASSES = ['panel', 'panel-wide', 'is-active', 'is-hidden', 'has-focus', 'no-scroll', 'theme-dark', 'theme-light'];
function classify(el) {
  const out = [];
  for (const c of CLASSES) {
    if (el && el[c]) out.push(c);
  }
  return MESSAGES.ready + ': ' + out.join(' ') + ' | ' + route('status');
}
module.exports = { route, header, MESSAGES, CLASSES, classify };
if (require.main === module) {
  console.log(header('TOKEN_TABLE_PROOF_5e'), route('items'), MESSAGES.denied, CLASSES.join(','));
}
