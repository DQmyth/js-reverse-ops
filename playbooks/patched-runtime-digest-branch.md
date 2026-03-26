# Patched Runtime Digest Branch

Use this playbook when a target advertises a familiar digest name such as `sm3Digest`, `md5`, or `sha*`, but the accepted value only appears after the page's runtime mutates the digest implementation.

## Trigger Signals

- the page exposes a digest helper with a familiar algorithm name, but standard library outputs do not match browser output
- one external bundle or CoreJS file installs the digest helper
- the request contract is otherwise simple, often something like `token = digest(server_time + page)`
- browser output can be explained by a small number of runtime patch points such as initial registers, byte transforms, or round constants

## Misleading Signals

- assuming the target is solved because the algorithm name matches a standard library primitive
- emulating the whole browser page when replay only needs one patched digest helper
- blaming transport before proving whether the local digest helper really matches browser output

## First Actions

1. freeze one accepted request and preserve one browser-known input/output pair for the digest helper
2. isolate the smallest script or bundle that installs the digest function
3. compare browser output against:
   - the unpatched helper in a local JS runtime
   - the standard library implementation
4. locate the smallest runtime patch surface, for example:
   - custom IV or initial register state
   - byte preprocessing or string-to-bytes mutation
   - custom round constants or step functions
5. promote a local JS helper that applies only the proved patches, then hand off the accepted digest back to Python or Node replay code

## Delivery Pattern

- Python or Node owns network transport
- one local JS helper owns the patched digest runtime
- the final replay contract keeps the time source, digest input shape, and transport contract separate

## Operator Warning

Do not call the target "standard SM3" or "standard MD5" once browser output diverges. Treat the browser digest as a runtime-specific branch until your local helper reproduces at least one known accepted sample exactly.
