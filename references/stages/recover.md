# Recover Stage

Use this stage when the challenge is understanding or labeling packed, obfuscated, VM-like, or module-heavy code.

## Goals

- improve readability with minimal destructive transforms
- recover request neighborhoods, helper semantics, or dispatcher meaning
- preserve transformed artifacts without discarding originals

## Preferred Tools

In order — each line is what the line before names in its `next_tools` or its exit code. What the
test suite proves about a script is the Evidence column of references/scripts-catalog.md
(`node scripts/trace_script_evidence.js --strict` re-measures it); "real-sample evidence" below
means a passing test ran it on output of the tool named in tests/fixtures/provenance.json.

- `inspect_obfuscation_family.js` — decides by shape, not by counts: javascript-obfuscator string
  table (with layout and key scheme), webpack 4 / webpack 5 bundle, webpack chunk file, browserify
  bundle, eval shell; answers `unknown` with the list of what it checked, and says when a bundle
  loads chunks at run time and names every chunk it asks for. Real-sample evidence (28 outputs of
  four tools — javascript-obfuscator ×11, webpack ×15, browserify ×1, terser ×1 — one rebuilt
  payload, three plain sources)
- `unbundle.js` — webpack (4 / 5) and browserify output: a bundle on its own when every module is
  in it; a bundle with the chunk files it loads, `unbundle.js main.js <chunk.js>…`, as one tree
  (the chunks registered before the bundle starts, so the tree does what the whole set did; a
  generated `page.js` stands in for what the set needs of a page — webpack's default publicPath
  reads the document at start-up); a chunk file on its own, to read. A bundle that loads chunks,
  handed over alone, is refused with the chunk ids it asks for. Real-sample evidence (webpack 4.47
  ×2, webpack 5.113 ×3, browserify 17, and four bundle + chunk file sets: webpack 4 and 5, each
  with webpack's default splitting and with splitChunks — each tree prints what the source prints,
  which is what the files print on a page)
- after the split: `trace_module_graph.js` follows the imports and relative requires of the files
  (a tree's `runtime.js` leads to every module file) and `extract_module_entry_contract.js` reads
  what stands at the edges of one module. Real-sample evidence for both; what each still misses is
  asserted in tests/unit/module-graph.test.js
- `decode_eval_wrapper.js` — peels one eval shell per call; the classic shell by arithmetic,
  nothing from the sample is run. Evidence: a rebuilt classic payload only
- `recover_string_table.js` (webcrack inside, optional dependency) — exit 0 before going on.
  Real-sample evidence
- `decode_string_array_runtime.js` — plain / base64 tables the previous line could not finish;
  refuses rc4. Real-sample evidence
- `run_ast_pipeline.js` — refuses a file that still carries its table; cleans what is decoded and
  keeps behaviour. Real-sample evidence. Reads syntax up to ES2019 (esprima 4.0): a file with
  `?.` or `??` — every webpack 5 chunk runtime — is refused with that said, not fixed
- `extract_iocs.js`, `extract_request_contract.js`, `extract_request_neighborhood.js`,
  `extract_tail_contract.js` — real-sample evidence; what they are known to miss is listed in
  tests/unit/locate-extractors.test.js
- run by a test, on rebuilt input only: `extract_packed_eval_payload.js`
- no test starts the VM extraction and labeling scripts (they start and answer on real input;
  nothing checks what they answer)

## Exit Criteria

- code neighborhood or helper semantics are readable enough to guide replay or runtime follow-up
- transformed artifacts and labels are preserved in `artifacts/derived`

When a rebuilt flow "almost works" — a valid first token but later failures, 200 responses with wrong answers, or key strings that differ across environments — stop and read [misdiagnosis-patterns.md](../misdiagnosis-patterns.md) before adding stubs.
