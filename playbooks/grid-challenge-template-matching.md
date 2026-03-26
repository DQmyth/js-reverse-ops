# Grid Challenge Template Matching

Use this playbook when a challenge image is split into a small fixed grid and the target asks for clicking a subset of visible glyphs, symbols, or short labels.

## Trigger Signals

- one challenge endpoint returns a square image plus `targets`, `need`, or similar click instructions
- the image is visibly arranged as a fixed grid such as `3x3`
- the challenge is not blocked by one heavy crypto signer, but by selecting the right cells
- each cell contains one prominent glyph or symbol that can be isolated from borders and background noise

## Common Failure Modes

- treating the target as a signer problem instead of a challenge-routing problem
- trusting the verify endpoint as the final truth before checking the protected data endpoint
- using full-image OCR before proving the grid layout and one-glyph-per-cell structure

## Operating Sequence

1. preserve one full challenge payload, including image, target list, native width, and native height
2. prove the grid layout and crop each cell with stable margins
3. normalize each cell into one foreground mask or contour image
4. build target-side templates from safe local fonts, rendered glyphs, or equivalent symbol sources
5. solve the target-to-cell mapping as a minimum-cost assignment instead of one independent OCR guess per cell
6. preserve the exact click coordinates submitted to the verify endpoint
7. make the downstream data endpoint the final acceptance oracle unless the verify endpoint is proven authoritative

## Artifacts To Preserve

- one challenge JSON payload
- one decoded challenge image
- per-cell crops or masks
- target templates or render sources
- the assignment result and submitted click coordinates
- one accepted data response from the same solve attempt
