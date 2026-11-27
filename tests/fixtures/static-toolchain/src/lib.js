// lib: a few exported helpers with distinct strings
function route(name) { return '/api/v2/' + name; }
function header(token) { return 'Bearer ' + token; }
const MESSAGES = { ready: 'service is ready', denied: 'permission denied for this Account' };
function classify(el) {
  return MESSAGES.ready + ': ' + Object.keys(el || {}).filter((k) => el[k]).join(' ');
}
module.exports = { route, header, MESSAGES, classify };
