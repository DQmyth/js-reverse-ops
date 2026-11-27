globalThis.__side_lib = (globalThis.__side_lib || 0) + 1;
// lib: a few exported helpers with distinct strings
export function route(name) { return '/api/v2/' + name; }
export function header(token) { return 'Bearer ' + token; }
export const MESSAGES = { ready: 'service is ready', denied: 'permission denied for this Account' };
export function classify(el) {
  return MESSAGES.ready + ': ' + Object.keys(el || {}).filter((k) => el[k]).join(' ');
}
