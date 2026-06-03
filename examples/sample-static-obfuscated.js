function demo(flag) {
  var endpoint = '/api/' + 'demo' + '/list';
  var page = 1 + 2 * 3;
  var enabled = !!flag ? true : false;
  if (false) {
    endpoint = '/api/unused';
  }
  return {
    endpoint: endpoint,
    page: page,
    enabled: enabled
  };
}

module.exports = { demo };
