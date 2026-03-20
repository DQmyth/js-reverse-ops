# Locate Stage

Use this stage when the main problem is discovering the right request, family, entrypoint, or source neighborhood.

## Goals

- identify the protected request or best candidate
- classify the target family
- preserve minimal artifacts needed for downstream runtime or static work

## Typical Inputs

- target URL
- HTML page snapshot
- single script or small bundle
- launcher page plus data page pair

## Preferred Tools

- `triage_js.sh`
- `extract_iocs.js`
- `extract_request_contract.js`
- `profile_page_family.js`
- `extract_page_contract.js`
- `inspect_module_hybrid.js`
- `classify_reverse_pattern.js`

## Exit Criteria

- family is classified or narrowed to a short list
- best protected request candidate is known or runtime-first has been justified
- launcher/helper/misleading signals are explicitly recorded
