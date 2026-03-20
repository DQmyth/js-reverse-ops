# Recover Stage

Use this stage when the challenge is understanding or labeling packed, obfuscated, VM-like, or module-heavy code.

## Goals

- improve readability with minimal destructive transforms
- recover request neighborhoods, helper semantics, or dispatcher meaning
- preserve transformed artifacts without discarding originals

## Preferred Tools

- `inspect_obfuscation_family.js`
- `recover_string_table.js`
- `extract_module_entry_contract.js`
- `extract_packed_eval_payload.js`
- `decode_eval_wrapper.js`
- VM extraction and labeling scripts
- `run_ast_pipeline.js`

## Exit Criteria

- code neighborhood or helper semantics are readable enough to guide replay or runtime follow-up
- transformed artifacts and labels are preserved in `artifacts/derived`
