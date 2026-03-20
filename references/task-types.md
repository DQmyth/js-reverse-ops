# Task Types

Route the task before choosing tools.

## 1. Signature Recovery

Use when the real objective is to reproduce browser-generated request material such as:

- `sign`, `signature`, `token`, `nonce`, `h5st`
- encrypted request bodies
- derived cookies or anti-bot parameters
- timestamp choreography or request ordering dependencies

Primary method:

- find the exact network request
- correlate it to initiator code
- hook the generation chain
- export enough evidence to replay offline
- for cookies, prove whether the browser wrote them locally or only received them via `Set-Cookie`

## 2. Offline Deobfuscation

Use when the user already has a JS file or bundle and wants readability or logic recovery.

Primary method:

- fingerprint bundler and obfuscation family
- preserve original bytes
- take the shortest path to readable code: source map, unpacking, unminify, AST passes
- record every transform applied

## 3. Runtime Tracing

Use when code shape alone is not enough because behavior depends on execution order, browser state, closures, workers, or bootstrap timing.

Primary method:

- preload early instrumentation
- hook `fetch`, XHR, storage, crypto, and candidate functions
- capture summary first, raw later
- fall back to breakpoint inspection only for scoped variables

## 4. Environment Rebuild

Use when the user needs a stable local implementation in Node or Python.

Primary method:

- export the smallest reproducible target
- patch environment from observed requirements only
- track the first divergence after each patch
- generate Python after the algorithm is stable enough

## 5. Version Diffing

Use when comparing old and new builds to isolate algorithm drift.

Primary method:

- normalize formatting first
- compare extracted IOC sets and suspicious call sites
- diff target function bodies or AST neighborhoods
- confirm behavior delta with runtime samples if possible

## 6. Remote CoreJS Monolith

Use when a thin HTML page delegates the real challenge logic to a remote `corejs` or challenge script.

Primary method:

- fetch HTML and enumerate external scripts
- download the remote challenge script
- triage it as a standalone artifact
- inspect the tail request builder first
- climb upward only into the helper chain that feeds the final request fields

## 7. Browserify or Crypto Bundle

Use when the file is a packaged dependency bundle and the request contract is explicit inside a normal module rather than hidden at the tail.

Primary method:

- fingerprint the bundle loader first
- search for explicit route strings and crypto libraries
- recover the request builder module before attempting broad deobfuscation
- prefer full-file contract extraction over tail-only heuristics

## 8. Inline Page Challenge

Use when the page HTML itself contains the useful control flow and there is little or no external challenge script.

Primary method:

- profile the page HTML first
- inspect inline `call(...)`, `submit(...)`, and direct DOM event handlers
- treat the page HTML as the primary artifact, not a missing script

## 9. Module or WASM Hybrid

Use when the page uses `type="module"`, `modulepreload`, framework runtime loaders, or WebAssembly hints.

Primary method:

- profile the page and collect module entrypoints
- capture runtime requests before attempting static reconstruction
- treat JS glue code, module graph, and wasm loader as separate artifacts
- expect endpoint discovery to come from runtime or module source, not monolithic tail decoding

## 10. App-Bundle Hybrid

Use when the target is a browser app bundle such as Flutter, CanvasKit, or a generated Dart frontend where the outer HTML page is mostly a launcher and the real data flow lives in a secondary app shell or runtime bundle.

Primary method:

- treat the landing page and the data app shell as separate artifacts
- look for launcher assets such as `flutter.js`, `main.dart*.js`, `canvaskit.js`, `manifest.json`, or similar bundle markers
- do not assume the first HTML page is the data page
- capture runtime requests from the app shell before attempting bundle deobfuscation
- expect routing and request assembly to live in generated runtime code rather than obvious business helpers
