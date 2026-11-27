const SECRET_MARKER = 'HIDDEN_9f3a_STRING_ARRAY_PROOF_7c21';
function sign(payload) {
  return 'sig:' + payload + ':' + SECRET_MARKER + ':END_MARKER_51bd';
}
function endpoint() {
  return '/api/protected/resource-9d2e';
}
module.exports = { sign, endpoint };
if (require.main === module) {
  console.log(sign('demo'), endpoint());
}
