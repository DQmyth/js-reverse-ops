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
  loads chunks at run time. Real-sample evidence (22 outputs of four tools — javascript-obfuscator
  ×11, webpack ×9, browserify ×1, terser ×1 — one rebuilt payload, three plain sources)
- `unbundle.js` — webpack (4 / 5) and browserify bundles whose modules are all in the file, and
  webpack chunk files: one file per module, moved verbatim, plus a `runtime.js` that does what the
  file did. A bundle that loads chunks at run time is refused (exit 1, nothing written): a tree
  across several files is not implemented. Real-sample evidence (webpack 4.47 ×2, webpack 5.113 ×3,
  browserify 17, and one chunk file each from webpack 4 and webpack 5)
- `decode_eval_wrapper.js` — peels one eval shell per call; the classic shell by arithmetic,
  nothing from the sample is run. Evidence: a rebuilt classic payload only
- `recover_string_table.js` (webcrack inside, optional dependency) — exit 0 before going on.
  Real-sample evidence
- `decode_string_array_runtime.js` — plain / base64 tables the previous line could not finish;
  refuses rc4. Real-sample evidence
- `run_ast_pipeline.js` — refuses a file that still carries its table; cleans what is decoded and
  keeps behaviour. Real-sample evidence
- `extract_iocs.js`, `extract_request_contract.js`, `extract_request_neighborhood.js`,
  `extract_tail_contract.js` — real-sample evidence; what they are known to miss is listed in
  tests/unit/locate-extractors.test.js
- run by a test, on rebuilt input only: `extract_packed_eval_payload.js`
- no test starts these: `extract_module_entry_contract.js`, the VM extraction and labeling
  scripts (they start and answer on real input; nothing checks what they answer)

## Exit Criteria

- code neighborhood or helper semantics are readable enough to guide replay or runtime follow-up
- transformed artifacts and labels are preserved in `artifacts/derived`

When a rebuilt flow "almost works" — a valid first token but later failures, 200 responses with wrong answers, or key strings that differ across environments — stop and read [misdiagnosis-patterns.md](../misdiagnosis-patterns.md) before adding stubs.
