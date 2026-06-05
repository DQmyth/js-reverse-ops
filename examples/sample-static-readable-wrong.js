function buildRequest(input) {
  // readable but wrong: this shadow signer is intentionally not runtime equivalent.
  var token = "looks-correct:" + input.page;
  return {
    url: "/api/demo/list",
    token: token
  };
}

module.exports = { buildRequest };
