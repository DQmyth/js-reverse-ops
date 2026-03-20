# Accepted Response Hidden DOM

Use this playbook when the network contract looks accepted, but the browser-visible values still appear scrambled, partial, shifted, or contradictory.

## When To Use It

Reach for this playbook when:

- the protected request returns `200` or another accepted application response
- the response payload already contains display fragments, HTML, or render data
- the page immediately hides one class, subtree, or layer after the response arrives
- the final browser-visible order does not match raw DOM order

This is a presentation-decode problem first, not proof that the transport, signer, or cookie logic is still wrong.

## Fast Checklist

1. Confirm the request is genuinely accepted.
2. Capture the page-side render function, not only the network payload.
3. Find any post-response hide/filter/suppress step.
4. Recompute visible-element order after suppression.
5. Validate against browser-visible output before generalizing.

## Typical Signals

- response contains `info`, `html`, `view`, or fragment-like fields
- success callback mutates DOM before values become readable
- one hash-derived class is hidden after the response
- inline elements reflow after a hidden layer is removed
- OCR looks unstable because visible order was reconstructed from the wrong DOM layer

## Recommended Sequence

1. Use `scripts/profile_page_family.js` on the page source to confirm presentation-heavy family signals.
2. Use `scripts/extract_page_contract.js` to locate render entrypoints, response fields, and class/style manipulation.
3. Inspect page-side success/render code and isolate:
   - response field used for DOM injection
   - metadata used to choose a hidden class or subtree
   - layout rules that affect final visible order
4. Rebuild the visible DOM state after suppression.
5. Only then decode text, digits, or visual fragments.

## Common Failure Modes

- treating raw DOM order as final visual order
- decoding both visible and hidden layers together
- assuming accepted response plus wrong-looking page means signer failure
- using OCR before reconstructing the actual visible layer

## Expected Output

Prefer producing:

- a short note identifying the suppression rule
- the render-path function or callback responsible for visible-layer selection
- a deterministic reconstruction rule for visible-element order
- a decoder that matches browser-visible output, not merely raw payload structure
