function buildRequest(page) {
  const token = "demo-token-" + String(page);
  return {
    url: "/api/demo/list",
    method: "POST",
    body: {
      page,
      token,
      nonce: Date.now()
    }
  };
}

module.exports = { buildRequest };
