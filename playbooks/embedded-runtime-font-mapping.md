# Embedded Runtime Font Mapping

Use this playbook when the request is already accepted, but the returned values are encoded through a page-scoped embedded font such as `woff`, `ttf`, or base64 font payloads.

## Trigger Signals

- response body includes `woff`, `font`, base64 font blobs, or entity-coded rows that do not decode into visible digits directly
- each page or response carries a fresh font instead of reusing one static asset
- the hard part is not transport replay, but turning page-local glyphs back into digits or symbols

## Misleading Signals

- assuming one static glyph map can be reused across pages
- OCRing full rows before proving single-glyph identities
- treating the target as a signer failure when the response is already accepted

## Operator Procedure

1. Preserve one accepted raw payload with the embedded font and encoded rows.
2. Extract the page-local font as a standalone `ttf` or equivalent artifact.
3. Enumerate the unique glyphs actually referenced by the encoded rows.
4. Render each glyph individually before attempting row-level decoding.
5. Collect candidate digits or symbols per glyph across multiple render sizes or OCR passes.
6. Solve the glyph map as a one-to-one assignment problem for the current page, rather than as independent greedy guesses.
7. Decode all rows with the page-local map and preserve the mapping artifact alongside the page sum or decoded values.
8. If network fetches are stable but one page fails intermittently, add fetch retries before changing the decode model.

## Verification Targets

- prove that the page uses exactly one local glyph map for that response
- show the unique-glyph inventory and the resolved per-page mapping
- verify decoded output on at least one accepted page before promoting the method to replay

## Output Shape

Prefer emitting:

- accepted raw payload
- extracted font artifact
- unique glyph inventory
- per-glyph candidate table
- resolved page-local glyph mapping
- decoded rows or totals
