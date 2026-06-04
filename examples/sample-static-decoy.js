var table = [
  "/api/demo/list",
  "/api/demo/unused",
  "fake token",
  "real seed"
];

function buildRequest(input) {
  var decoy = table[2] + ":" + input.page;
  if (false) {
    return {
      url: table[1],
      token: decoy
    };
  }
  return {
    url: table[0],
    token: table[3] + ":" + input.page
  };
}

module.exports = { buildRequest };
