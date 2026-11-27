const salt = 'FIXTURE_SALT_7d41';
function sign(name) {
  let h = 7;
  for (const ch of name + salt) h = (h * 31 + ch.charCodeAt(0)) % 100003;
  return 'sig:' + h;
}
function url(path) { return 'https://api.example.test/v2/' + path; }
module.exports = { sign, url };
