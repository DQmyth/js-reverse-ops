globalThis.__side_signer = (globalThis.__side_signer || 0) + 1;
const salt = 'FIXTURE_SALT_7d41';
export function sign(name) {
  let h = 7;
  for (const ch of name + salt) h = (h * 31 + ch.charCodeAt(0)) % 100003;
  return 'sig:' + h;
}
export function url(path) { return 'https://api.example.test/v2/' + path; }
