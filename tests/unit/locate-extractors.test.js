'use strict';
// The locate-stage extractors against REAL bundles, graded by what the fixture source contains.
// None of them had a test before v1.9.0 (scripts-catalog: 120 scripts "untested"). A smoke run
// showed they all start and answer; these cases hold what they answer to the source:
//   reported, and must stay reported:   endpoint /api/v2, header X-Sign, host api.example.test
//   known misses, may only shrink:      header `Authorization` (an unquoted object key in the
//                                        source), the host the contract, the token literal put
//                                        into a header
// Sources: tests/fixtures/static-toolchain/src/{entry,signer,lib}.js — bundled by browserify 17
// and by webpack 5.113 (development and production).
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPTS = path.join(__dirname, '..', '..', 'scripts');
const ST = path.join(__dirname, '..', 'fixtures', 'static-toolchain');
const OPT = { timeout: 120000 };
const BUNDLES = ['browserify-17.js', 'webpack-5.development.js', 'webpack-5.production.js'];

// What the source has and these extractors do NOT surface yet. Remove a line when one of them
// starts reporting it — a NEW miss must not be added here.
const KNOWN_MISSES = {
  'extract_request_contract.js': ['header Authorization (unquoted object key)', 'host in the contract', 'token literal passed into a header'],
  'extract_tail_contract.js': ['header Authorization (unquoted object key)', 'host in the contract', 'token literal passed into a header'],
  'extract_iocs.js': ['header Authorization (unquoted object key)', 'bundler markers (browserify / webpack)'],
};

function report(tool, sample, ...args) {
  const file = path.join(ST, sample);
  const r = spawnSync(process.execPath, [path.join(SCRIPTS, tool), file, ...args], { encoding: 'utf8', timeout: 60000 });
  assert.strictEqual(r.status, 0, `${tool} on ${sample}: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

for (const sample of BUNDLES) {
  test(`extract_iocs.js reports the URL, the route and the quoted header of the source: ${sample}`, OPT, () => {
    const j = report('extract_iocs.js', sample);
    for (const url of ['https://api.example.test/v2/']) assert.ok(j.urls.includes(url), `urls: ${JSON.stringify(j.urls)}`);
    assert.ok(j.route_fragments.includes('/api/v2/'), JSON.stringify(j.route_fragments));
    assert.ok(j.header_keys.includes('X-Sign'), JSON.stringify(j.header_keys));
    assert.ok(j.crypto_terms.length === 0 && j.suspicious_apis.length === 0, 'the source uses no crypto or exotic APIs');
  });

  for (const tool of ['extract_request_contract.js', 'extract_tail_contract.js']) {
    test(`${tool} infers an endpoint and a header the source really has: ${sample}`, OPT, () => {
      const j = report(tool, sample);
      assert.ok(String(j.inferred.endpoint).includes('/api/v2'), JSON.stringify(j.inferred));
      assert.ok(j.inferred.header_keys.includes('X-Sign'), JSON.stringify(j.inferred));
      assert.strictEqual(j.inferred.method, null, 'the source makes no request: no method is the right answer');
      assert.deepStrictEqual(j.inferred.body_keys, [], 'the source sends no body');
    });
  }
}

test('extract_request_neighborhood.js puts the header assignment and the token literal in a neighbourhood', OPT, () => {
  for (const sample of ['browserify-17.js', 'webpack-5.development.js']) {
    const j = report('extract_request_neighborhood.js', sample);
    const labels = new Set(j.neighborhoods.flatMap((n) => n.labels));
    assert.ok(labels.has('api-route') && labels.has('request-field'), [...labels].join(','));
    const text = j.neighborhoods.map((n) => n.excerpt).join('\n');
    for (const truth of ['Authorization', 'X-Sign', 'TOKEN_TABLE_PROOF_5e', 'https://api.example.test/v2/']) {
      assert.ok(text.includes(truth), `${sample}: ${truth} is in some neighbourhood`);
    }
  }
});
