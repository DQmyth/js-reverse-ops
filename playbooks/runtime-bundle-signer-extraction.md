# Runtime Bundle Signer Extraction

Use this playbook when the useful signer is buried inside a page bundle or webpack chunk, but the delivery target only needs one small runtime helper extracted and replayed locally.

## Trigger Signals

- one `webpack.js`, app chunk, or module bundle contains the signer
- the final request only needs one or two fields such as `m+t`
- the bundle exposes browser globals like `window.btoa`, `window.md5`, or one tiny runtime bridge after bootstrap
- full-page replay feels wasteful compared with one extracted helper

## Common Failure Modes

- trying to emulate the whole page instead of extracting the minimum helper set
- assuming built-in `btoa`, `md5`, or similar browser helpers are unchanged
- copying only the visible request shape without preserving the runtime helper mutation

## Operating Sequence

1. preserve the bundle that contains the live signer
2. locate the smallest modules or bootstrap fragments that install the needed runtime helpers
3. execute only those fragments in a minimal local environment
4. expose one stable local function that returns the final request fields
5. validate the helper against one accepted request before promoting it to replay code

## Artifacts To Preserve

- the source bundle or chunk
- extracted module boundaries or offsets
- the local helper harness
- one accepted field sample and one accepted request sample
