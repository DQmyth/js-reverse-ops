# jsdom Native VM Differential

Use this playbook when a custom JS VM (interpreter plus encoded payload) must run locally for token generation, and the goal is a browser-free oracle plus divergence localization against one captured ground-truth run.

## Trigger Signals

- the signer lives in a JS VM: interpreter head, encoded payload string, exotic identifier sets, no reachable crypto APIs
- a vm-context stub sandbox dies silently in the bootstrap chain or crashes on DOM gaps
- tokens change per invocation by design (random IV), so naive output diffing between environments is meaningless

## Common Failure Modes

- stubbing the DOM piecemeal in a bare vm context while the VM walks real page markup
- assigning `window.navigator = proxy` or `window.screen = proxy`, which silently no-ops because they are getter-only own properties
- installing a guarded Function constructor without `shim.prototype = Function.prototype`, so a VM bootstrap `&&` chain that truth-tests `Function.prototype.call` dies silently
- chasing a "divergent digit" that is actually a per-run random IV

## Operating Sequence

1. Run the page natively in a DOM implementation instead of a stubbed vm context: real page markup (scripts stripped), a request interceptor serving the local jquery and challenge script files, a frozen time endpoint, and a pre-script that installs the environment kit.
2. Install the environment kit before the challenge script: exact user agent, exact cookie string including order, presence objects for browser-only globals, viewport geometry (inner/outer/screen plus rect methods), navigator subsystem stubs, and native-masked wrappers for any instrumented natives.
3. Capture one ground-truth run from the real browser by serving an instrumented copy of the challenge script through a debug-protocol response override, never by patching page globals late.
4. Diff at increasing depth until the divergence localizes: request stream, then VM instruction stream (log the interpreter dispatch type at entry), then decoded constant values (wrap the bound constant decoder created in the bootstrap chain).
5. Separate randomness from environment gates before patching further: run the local oracle twice and diff it against itself; a digit that varies between identical local runs is a random IV, not a gate.
6. Verify each alignment step against the server, not just against the stream diff; the target is an accepted response, not an identical trace.

## Artifacts To Preserve

- the local page-runner harness with the environment kit
- the renamed, instrumented challenge script used on both sides
- per-level stream dumps (instructions, constants, string reads, character builds)
- the determinism-check result that classified each divergence as random or gated
