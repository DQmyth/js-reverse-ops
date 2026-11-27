# Changelog

All notable changes to the public `js-reverse-ops` repository will be recorded in this file.

## [1.9.0] - 2026-11-27

### Added — a way to see what is actually tested, and tools measured by it

- **every script now shows what the test suite proves about it.** `scripts/trace_script_evidence.js` runs each test file with a tracer preloaded, records which scripts a passing test starts and on what input, and grades them by `tests/fixtures/provenance.json`: *real sample* (run on output of the third-party tool named there), *not from a tool* (run, but only on plain / hand-made / temporary input), *untested*. The scripts catalog prints it as a third column and `scripts-catalog.test.js` pins the untested list — it may only shrink. First measurement, 164 scripts: **10 real sample, 42 not from a tool, 112 never started by a test.** Until now the number was not known; three recover-stage tools had green tests on hand-written samples while recovering nothing on real output. The release pipeline re-measures before every release and stops if a test file fails or the environment cannot produce complete evidence
- 32 inputs under tests/fixtures are registered with their origin: output of javascript-obfuscator 0.27.4 / 2.19.1 / 4.1.1 / 5.10.1, webpack 5.113 (production, development, ESM multi-module), browserify 17, terser 5.51, one hand-written source set, one hand-written imitation, one payload rebuilt from the public packer algorithm (called that, not a capture)
- **`scripts/unbundle.js`** (new): splits a webpack (4 / 5, single chunk) or browserify bundle into one file per module without rewriting a byte of the bundle — each factory is moved verbatim into `modules/`, its place taken by a stub that forwards to the file, so `node runtime.js` does what `node <bundle>` does. webcrack 2.16 returned no bundle for default webpack 5 output in the 1.8.7 review; this is the dependency-free route. Verified on four real bundles: each tree runs and prints exactly what its bundle prints; every module file holds the bundle's own bytes for that factory; the bundle's string literals are shared out between `runtime.js` and the module files, none lost, none added
- four locate-stage extractors (`extract_iocs.js`, `extract_request_contract.js`, `extract_request_neighborhood.js`, `extract_tail_contract.js`) are held to what the fixture source contains; what they are known to miss is listed in the test and may only shrink

### Changed — `inspect_obfuscation_family.js` decides by shape

- it used one rule, "more than 500 hex identifiers", with the result that every small obfuscator.io file read `unknown`, and it did not know bundles or eval shells at all; its self-defending counter looked for the word "debugger", which that option never emits. It now recognises the structures each tool emits — the table function and rotation of a javascript-obfuscator string table (with layout and key scheme: plain / base64 / rc4, by the rc4 key schedule, not by a number that appears), the webpack bootstrap `map[id](module, exports, require)` and its module map, browserify's map of `[factory, deps]` pairs, the `eval(function(p,a,c,k,e,d){…})` shell — and answers `unknown` with the list of what it checked. `next_tools` names what to run next
- verified on 20 files: output of four tools (javascript-obfuscator ×11, webpack ×3, browserify ×1, terser ×1), one rebuilt packer payload, and three plain sources — all 20 read correctly, including the plain source that holds an ordinary array of strings. A 127 KB live obfuscator.io file not used for tuning reads as a string table with an rc4 key and self-defending markers, in 0.04 s. One fact learned on the way: webpack 5.9x+ keeps the entry out of the module map and inlines it after the bootstrap — the inspector reports which layout a bundle has. NOT verified: webpack 4, multi-chunk webpack, parcel, rollup; the self-defending marker was seen on javascript-obfuscator 5.10.1 only

### Fixed

- `scripts/run_ast_pipeline.js` crashed on raw obfuscator.io output — escodegen refuses a negative numeric literal, which constant folding made. Negative results print as unary minus now. It also refuses (`--force` to override) a file that still carries its string table and points at `recover_string_table.js`; measured reason: self-defending code that was beautified does not finish when run. Nine tests; the previous build fails four of them
- `scripts/decode_eval_wrapper.js` found a shell only as the exact string `eval(function(` — any other spacing, or `window.eval ( function…`, and it exited 0 having written nothing. The classic shell is now recognised by shape and unpacked by arithmetic (the packer's own algorithm in reverse), so nothing from the sample is executed; other packers still take the vm route. Nested shells peel one per call; nothing to unpack is exit 1 with a reason. `extract_packed_eval_payload.js` names the classic family, its base and dictionary size. Seven tests; the previous build fails five

### Found, not fixed

- **112 scripts are never started by a test.** They include the VM extraction and labeling family, `profile_page_family.js`, `extract_page_contract.js`, `inspect_module_hybrid.js`, `classify_reverse_pattern.js`, `extract_module_entry_contract.js`, `triage_js.sh`. A smoke run on real bundles shows all of these start and return JSON; nothing checks what they answer. The list is in `tests/unit/scripts-catalog.test.js`
- `extract_request_contract.js` and `extract_tail_contract.js` do not report a header written as an unquoted object key, the host of a base URL, or a token literal passed into a header (`extract_request_neighborhood.js` shows all three in context)
- `simulate_vm_slots.js` and `extract_dispatch_adapter_contract.js` exit with a raw stack trace when the input is not the JSON they expect
- no real HTML page is a fixture: the two page tools have only the hand-written example page
- the eval-packer payload is rebuilt from the public algorithm, not captured from a site; there is no webpack 4 sample and no multi-chunk webpack sample

The suite went from 71 to 131 tests (130 pass, 1 skipped by design on the recording machine).

## [1.8.7] - 2026-11-27

### Fixed — a review of 1.8.5 and 1.8.6: what the record got wrong

- **the 1.8.6 entry below was rewritten.** As published it named a missing `rg` as the cause of the red CI and spoke of "27 runs across eight releases". A review replayed the release check for every tag from v1.3.4 to v1.8.6 under CI's conditions, and neither the cause nor the numbers held: the `rg` calls never failed a run, the runs were 25, and the releases 25. The entry now carries the replayed causes
- the README's feature list still called the dependency-free decoder "immune to obfuscator.io v4 proxy variants" — the claim 1.8.5 removed from one place and missed in another. Gone
- 1.8.5 repeated an older documentation line that had never been checked: that `webcrack` unpacks webpack bundles. Measured on bundles built for the review: webcrack 2.16 unpacks a browserify 17 bundle (3 modules), and returns **no bundle** for a default webpack 5.113 build — production and development mode alike. webcrack is used here for string tables; the documentation no longer offers it as an unbundler
- 1.8.5's Node 20 note said `npm install` "skips" webcrack after "51 packages". Precisely: webcrack and its native part are not installed and no version of npm warns — with npm 11 the clone still received 51 packages from webcrack's own subtree, CI's npm 10 installs only the 5 that are needed
- the same review ran the rest of the recover stage over real samples and found more that does not hold up; that is work for the next releases, listed in the project notes rather than fixed here: the obfuscation-family inspector answers `unknown` for obfuscator.io output under 500 hex identifiers, and the AST pipeline crashes on raw obfuscator.io output instead of saying "decode the string table first"

### Fixed — the tools

- `scripts/recover_string_table.js`: a value-taking option with no value (`--output` last on the line) recovered the table, exited 0 and wrote no file. It is a usage error now (exit 2)
- `scripts/decode_string_array_runtime.js`: `--max` with a non-number ended in "answered no index". It is a usage error now (exit 2)
- `scripts/check_public_release.sh`: when the release-risk gate rejects the tree, its report is printed. For 25 runs that report went to `/dev/null` and a red run left nothing to read

### Not changed

CI still runs on Node 20 only, so the webcrack-backed cases are skipped there (62 cases: 46 pass, 0 fail, 16 skipped — 7 of them those cases, 3 needing `curl_cffi`). A second CI line is prepared; a push that changes a workflow file needs a credential with the `workflow` scope.

## [1.8.6] - 2026-11-27

### Fixed — CI had been red for 25 runs

- looked at GitHub after pushing 1.8.5 and found the check failing. The last green run was on 2026-11-09; the 25 runs after that — every release from v1.3.4 to v1.8.5 — failed at the same step, `scripts/check_public_release.sh`. Nothing in those releases broke the repository's content; the script that guards it did not get to say "passed" once
- the causes were established afterwards by replaying the check for every tag under CI's conditions (clean checkout, `npm install`, Node 20, no ripgrep) and are not the ones this entry first carried (see 1.8.7):
  - **v1.3.4** — the strict release-risk gate rejected `references/header-fingerprint-tokens.md`, a methodology note added that day, because its *name* contains "token" (the rule `suspicious_fixture_names`). A filename heuristic, never a leak. Allowed by path from v1.4.0 on
  - **v1.4.0 through v1.8.5, 24 releases** — the same gate, run over the tree's untracked files, was handed everything `npm install` had just written into `node_modules/`. That folder was not in `.gitignore`, so after CI's install step it counted as unexported files, and the rule `dependency_install_artifacts` flagged it (`medium`, exit 1 under `--strict`). The script sends that command's output to `/dev/null`, so the CI log showed an exit code and nothing else
  - **v1.8.6** — passes
- `node_modules/` is in `.gitignore` now and excluded from the scans
- `rg` never failed a run: its three calls sat in `if` … and `|| true` positions and the script carried on. What they did was worse in kind. The CI image has no `rg`, so the sensitive-content scan **ran as a no-op in every CI run — in the green ones before 2026-11-09 as well**. It is `git grep` over the tracked files (hidden ones included, which ripgrep skipped) and `grep` over the untracked ones now, and it runs there. Checked on a clean copy: a home path planted in a tracked file and an access token planted in an untracked one are both rejected; the same under `tmp/` or `node_modules/` is not
- why the release pipeline did not see the 24: it does run this script (`make check` → `validate`), but in a tree that has no `node_modules` of its own — its dependencies resolve through an ancestor folder on the release machine, so the untracked-files gate had nothing to look at. `scripts/make_release.sh` (private workspace) gained a **CI rehearsal** before any push: a clean copy of the export → `npm install` → the release check with ripgrep off `PATH` → the test suite. Either it passes on the clean copy or the release stops. Under those conditions 1.8.5 fails at the gate above and 1.8.6 passes
- CI on this commit: **success** — the first green run since 2026-11-09 (62 cases: 46 pass, 0 fail, 16 skipped with reasons)

Not changed here: CI still runs on Node 20 only. A second line on Node 24 — the line webcrack is built for, without which the webcrack-backed test cases are skipped — is prepared, but publishing it needs a credential with the `workflow` scope.

## [1.8.5] - 2026-11-27

### Fixed — webcrack was never absorbed, and the string-table tools did not work on real output

- asked whether this skill had absorbed webcrack. It had not: the name stood in 11 lines of documentation, a few data files and a "webcrack FIRST" routing hint — 23 mentions in all — and no script, test or dependency used it. The in-house tool those documents sent people to instead, `scripts/recover_string_table.js`, had never recovered a string from real output. Measured on the previous release: six files produced by javascript-obfuscator (0.27, 2.19, 4.1, 5.10; plain table and hardened) and one live 127 KB bundle — **0 strings recovered on all seven, exit code 0, and an "output" file written** that was the re-printed input. It had no test and no fixture. Its built-in pattern matching wants a layout none of those obfuscator releases produces
- correcting the record: the 1.7.2 entry below says "webcrack/kuizuo absorbed as dependencies (conflict)". That was not true. Neither was a dependency; js-deobfuscator is a second-opinion row in a documentation table and stays that way. From this release webcrack is a dependency and an engine, and the evidence file counts it as absorbed from here, not retroactively

### Added — `recover_string_table.js` runs on webcrack

- webcrack is now an optional dependency (`optionalDependencies`, MIT) and the tool's engine, required as a library. Measured with webcrack 2.16.0 on Node 24: javascript-obfuscator 2.19 / 4.1 / 5.10 output — plain string table, and rc4 + rotation + control-flow flattening + dead code + self-defending — and the live 127 KB bundle all come out with every lookup replaced by a literal (14 KB back to 390 B against a 334 B source; the live bundle 127,000 B to 4,630 B, 1,024 lookups to 0), and **the output runs and prints what the sample prints**
- what it refuses, and says so: the 2019 layout (javascript-obfuscator 0.27) is left as it is, and a half-finished webcrack pass is detected by the placeholders it leaves behind (its own markers `__STRING_ARRAY__`, `__DECODE_n__`) instead of being handed over as a recovery
- exit codes mean what they say: 0 is a recovery, or "this file has no string table"; 1 is a string table present and nothing recovered — **no output file is written** and stderr names the reason (webcrack missing, on a Node it has no native build for, unable to finish, or disabled by flag); 2 is usage
- `--builtin-only` keeps the older dependency-free pass. It matches a layout no real obfuscator output has (it is tested against one hand-written sample so the path cannot rot), and it evaluates the sample's own table code in Node's `vm`, which is not a security boundary. Nothing runs sample code in `vm` by default any more; webcrack evaluates inside isolated-vm
- cost of the dependency: about 40 MB and 32 packages after `npm install`. `npm install --omit=optional` skips it, and the tool then exits 1 with the install hint instead of pretending
- webcrack 2.16 declares Node 22 or 24. On Node 20 `npm install` **silently skips it** — measured on a fresh clone: 51 packages, no warning — and the tool then exits 1 saying webcrack is not installed and which Node lines it is built for. CI runs on Node 20 only, as before: there the recovery cases are skipped with that reason and everything else runs (fresh clone on Node 20: 62 cases, 50 pass, 0 fail, 12 skipped). A second CI line on Node 24 is prepared but was **not published** in this release: the credential this repository is released with has no `workflow` scope, and GitHub refuses a push that changes a workflow file without it. So the recovery cases were verified by hand on Node 24 instead — fresh clone, `npm install` (12s, 40 MB), 62 cases: 56 pass, 0 fail, and the 5 recovery cases executed

### Fixed — `decode_string_array_runtime.js` decoded nothing on real output either

- the README called this tool "v4-immune". Tried on real output it found no lookup: the pattern meant to match `function NAME(a, b)` demanded a doubled "(" and so only ever matched `NAME = function (a, b)`, the form of its hand-written test samples. Its tests had been green throughout. Now: function declarations are matched; the table function that wraps the array (every release from 2.x on) is followed; the dump starts where the table starts instead of at index 0, where real tables throw
- it no longer runs the program. It used to execute everything up to the lookup — the sample's own top-level code included. It now runs only the top-level statements that name the array, its wrapper or the lookup, and refuses a table it cannot isolate from the program (the live bundle above: "103 KB of other code share top-level statements with it")
- rc4 tables are refused by behaviour, not by guessing at code shape: the same index is asked under two keys in two fresh sandboxes (one sandbox would not do — the lookup caches by index). The second key must not repeat the first, because "k" and "kk" are one RC4 key. Measured: 5 of 5 rc4 files refused, nothing printed
- measured, dependency-free on any Node: plain-string tables from 0.27.4 / 2.19.1 / 4.1.1 / 5.10.1 and base64 tables from 2.19.1 / 4.1.1 / 5.10.1 — every string of the source (three characters and up; the obfuscator leaves shorter ones inline) is in the dump. The 2019 layout that webcrack cannot finish is among them, so the two tools now cover each other's gap

### Added — real obfuscator output as fixtures, and tests that fail on the old code

- `tests/fixtures/recover-string-table/`: six obfuscator outputs built from one source, the source itself, and one hand-written legacy-layout sample that is labelled as such. `tests/fixtures/decode-string-array-runtime/`: nine outputs from the same source, with their configs. Regeneration steps are in the READMEs
- 26 cases. The invariant that ties them: an output file exists only on exit 0, and whenever it exists it has fewer lookups than the sample, carries the source's string literals and no others, and prints what the sample prints
- the tests were run against the previous releases' code to make sure they can fail: the old `recover_string_table.js` fails 14 of 14 runnable cases, the old decoder 11 of 12 (the twelfth only checks the fixtures)

### Changed

- routing and descriptions in `README.md`, `SKILL.md`, `jsro-deobfuscate`, the cookbook, the toolchain and setup notes: string tables go through `recover_string_table.js` first, `decode_string_array_runtime.js` for plain/base64 tables without webcrack. "v4-immune" is gone
- `package.json`: version kept equal to the release from now on (it still read 0.1.14 while releases passed 1.8; the release script now syncs it)

What this does not change: rc4 tables and tables nested inside a program's own wrapper need webcrack, and so a Node it is built for; webcrack is third-party and the tool follows whatever its current release does; everything here was measured on macOS arm64, the webcrack path on Node 24, and CI has no Node 24 line yet — it cannot confirm that part until a workflow change is pushed with the right scope.

## [1.8.4] - 2026-11-27

### Added — a first-time user can actually follow the route (dry run on a fresh clone)

- asked whether somebody else could use the skill to fetch these PDFs, and dry-ran it as a first-time user on a fresh clone of the public repo. Triage worked out of the box. The clearance step stopped at "cfsolve binary not found" with no hint of where to get it, there was no Python dependency manifest, and nothing in the package could fetch the remaining URLs with the harvested clearance
- `scripts/cf_fetch_with_clearance.py` (new): fetch the other URLs of a zone with a clearance harvested by `cf_clearance_harvest.py`, over plain HTTP. The cookie and the User-Agent are read from the harvest file, bytes are written as read, a transport hiccup is retried, a URL from another host is refused (a clearance is issued per zone), and a challenge page stops the run with exit 3 instead of hammering the site
- `cf_clearance_harvest.py`: `--profile` is optional (defaults to the solver's bundled profile); `CFSOLVE_DIR` points the tool at a solver checkout once and it finds the binary and the profile from there; the missing-solver message gives the full acquisition steps instead of one line
- `requirements.txt`: the Python dependency (`curl_cffi`), until now mentioned only in prose
- `references/cf-gate-triage.md` now opens with a step-by-step recipe: triage → harvest → fetch → audit
- end to end on the fresh clone, using nothing but the exported package and a solver built from scratch inside that clone: triage → L2; solver build 161s; steps 2-3 under the audit → **PASS**, 98 samples over 30s (process tree `{bash, challenge, python3}`, external port 443 only); six PDFs fetched, byte-identical to the earlier runs

What this does not change: the solver is third-party and not bundled, it breaks each time Cloudflare ships a challenge build, a clearance only lasts as long as the site allows, and all of it was verified on macOS arm64 from a single network.

## [1.8.3] - 2026-11-27

### Added — the zero-browser claim gets its own audit

- `scripts/audit_browser_free.py`: run a command and report whether any local browser took part. It samples the subject's process tree (ps) and TCP table (lsof) for the command's whole lifetime and fails on a browser engine executable in the tree, browser-automation flags on a command line, or a loopback TCP connection (debug ports live on localhost). The report carries the sample count, duration and the subject's exit code; **a subject that exits non-zero is INCONCLUSIVE, never a pass** — a flow that never completed proves nothing about itself. `--report <file>` yields a machine-readable report, separate from the subject's own stderr
- 6 tests: a pure computation passes; an automation-flag child, a loopback connection, and a REAL headless Chrome started by the subject all fail; a failing subject is INCONCLUSIVE; empty usage is an error

### Fixed — the scripts catalog had never actually worked

- `audit_browser_free.py` did not show up in the catalog, which exposed three old defects in the generator: it only indexed `.js`; its matcher required the FILE to start with `//`, so the shebang on line 1 hid every header and all 148 entries read "(no header)"; and it listed five scripts the export skips while omitting all nine `.py` and eight `.sh`. Rewritten — js/py/sh indexed, shebang-aware, export skip list applied, `public/scripts` included: the catalog now equals what the bundle ships (161 entries)
- 66 entries carry a real description (it was zero): one-line headers added to the 12 `.py`/`.sh` scripts that had none and to the 25 scripts already described in the README quick-reference. **95 older `.js` scripts have no header and still read "(no header)"** — pinned by a unit test as a known list that can only shrink
- the public `make check` now fails when the catalog is stale
- why it went unnoticed: every release log printed "catalog regenerated" and the freshness gate only compared the file against the generator's own output — a generator producing an empty catalog passed, because both sides were equally empty. The new test checks content (coverage, described-entry count, the headerless list) instead

### Changed

- the production-site L2 run is now audited rather than merely asserted: **PASS**, 83 samples over 25s — process tree `{python3, challenge}`, no engine, no automation flag, no loopback peer, external peers on port 443 only. Three independent runs cleared the site and returned byte-identical PDFs each time
- attribution stated plainly in the reference: the challenge solver is the third-party cfsolve and its "real browser" answers are a recorded profile replayed by code; this repo contributes the triage, the harvest/replay tool, the binding-rule verification and the audit
- delivery principle (both SKILL.md versions): when a zero-browser claim carries weight, prove it with the audit instead of asserting it

## [1.8.2] - 2026-11-27

### Fixed — `cf_clearance_harvest.py` on its first production target; first L2 evidence from a production site

- fixed: `--json --replay` printed a status line into stdout after the JSON, so the output could not be parsed by a program (only spotted on first real use — the earlier check only eyeballed the tail); status text now goes to stderr
- fixed: `--replay` reported `len(resp.text)` as the body size, which is wrong for binary resources; it now reports raw bytes
- **first verified L2 on a production site**: an international court's site serving public judgment PDFs behind a path-scoped managed challenge with its own production sitekey. `cf_gate_triage.js` verdict L2 correct; cfsolve cleared it in 14-27s (5 of 7 attempts — two early attempts against the home page timed out and two later retries passed); the clearance replayed from plain-HTTP curl_cffi; 6 PDFs downloaded complete (85/44/44/163/3/3 pages, byte lengths equal to `content-length`, `qpdf --check` clean on five, two benign in-file stream warnings on the sixth)
- two lessons recorded: challenge rules can be **path-scoped** (on the proxy exit the home page was released while the file URLs stayed challenged), so clear against a URL that is actually challenged; and **solve with cfsolve, download with a normal HTTP client** — its CLI saves the cleared response decoded as text, and that copy of a PDF fails `qpdf --check`
- the standalone-Turnstile entry stays partial: the widget inside a production challenge page is now covered, but no production form-embedded widget has been tested

## [1.8.1] - 2026-11-27

### Changed — Cloudflare claims re-verified against live targets: one retraction, three downgrades, one broken path repaired

Asked "what can it actually solve on Cloudflare right now" and re-tested every claim instead of quoting the docs. Four of them did not survive:

- **RETRACTED — "`cf_clearance` is TLS-stack-bound" (published in 1.6.0).** It is false. Controlled re-test on the same target: no clearance → 403 challenge; clearance + the profile's exact User-Agent → 200 from curl_cffi with safari AND chrome fingerprints; same clearance from another exit IP → 403; clearance + a UA differing only in the version token → 403. The binding is **(exit IP, User-Agent)**. The 11-19 experiment had a hand-typed UA (`Version/26.0`; the profile says `Version/26.6.3`) — recorded as misdiagnosis **M15 (hand-transcribed inputs poison the conclusion)**, now first in the triage order. The wrong claim had also told users to "harvest on the solver's stack"; that is withdrawn — plain HTTP from any client works after acquisition
- `scripts/cf_clearance_harvest.py` (new): solves a challenge page with cfsolve and returns the clearance with the UA parsed from `profile.json`; `--replay` fetches the protected page over plain HTTP to prove the pair holds (live: collected, replayed 200)
- **L2 challenge page — the vendored solver was silently broken.** The binary built from the 11-17 upstream commit failed 0/2 today ("challenge did not complete after the interaction POST", on both direct and proxy exits; probes 40 → 38). Upstream pushed `3d2f67e fix for new build` on 11-26; a rebuild cleared **5/5** on two demo sites, plus two more runs through the shipped tools. Build drift is now an observed operating condition: run the verifier before relying on it, rebuild on CF build changes (~2.5 min)
- **L1 downgraded: no current success.** The single recorded pass (11-19) had drifted site-side within two days; today stockx and depop both still return 403 after the curl_cffi upgrade (0/2). The triage verdict remains accurate; the residential-IP rung is untested
- **L2b Turnstile downgraded to partial.** The tokens were issued on Cloudflare's official TEST sitekey (`3x00000000000000000000FF` = "Forces interactive challenge"). That proves the protocol handshake for the current build, not a production sitekey's scoring. No production widget has been tested
- `cf_gate_triage.js` no longer reports a 404 / origin error as "L0": such statuses are now `NON-GATE` (a missing demo page was being presented as "no gate"); route text for L2 corrected
- stale rows synced: hcaptcha passive (**not passed** — 4 of 5 legs live, the behavior scorer rejects), recaptcha v3 (token issued, **score never verified** — a token is not a passing score)
- capability-truth score re-graded against one standard (a gate counts only with server-acceptance evidence): gate coverage 100 → 68.8, **total 89.6 → 85.0**

## [1.8.0] - 2026-11-27

### Changed — hcaptcha passive: completion matrix exhausted, work order precise

- every quick path disproven by live test: SDK-solve-without-options, naive motionData, 280-point bezier motionData, and **href-bound `n`** (hsw called with the article's exact options shape) all receive the IDENTICAL `{"success": false, "error-codes": []}` scorer verdict — the rejection is invariant to everything except genuine vmdata, confirming the cross-check hypothesis
- verified no public project ships the parent-page executor (CircuitSavage = crypto only, zero postMessage modeling in its polyfill; QIN2DIM all tags = LLM/browser era; GitHub-wide = nothing) — the article's `parent-manifest.cjs` remains private
- the remaining work order is recorded precisely in `references/hcaptcha-passive-route.md`: jsdom + real login HTML + real api.js, model the iframe postMessage boundary (checkbox-ready → site-setup → checkbox-loaded → checkbox-selected `{action:"mouse"}` → capture `create-challenge.contents.{manifest,vmdata}`), feed vmdata to BOTH hsw and motionData — a dedicated-session build

## [1.7.9] - 2026-11-27

### Changed — hcaptcha passive: final leg bounded honestly (4/5 live; the wall is the behavior scorer)

- end-of-day status: transport, config, `n` (SDK, 0.5s), and wire encoding all live-verified; the passive pass itself NOT achieved — getcaptcha answers `{"success": false, "error-codes": []}`, and an EMPTY error-code failure is the scorer's "insufficient evidence" verdict (format/`n` faults return specific codes)
- two synthetic motionData attempts scored identically (6-point naive; 280-point bezier with jitter + real time distribution) — the grader checks deep consistency, most plausibly the **vmdata cross-check**: genuine vmdata feeds both `hsw()` (into `n`) and motionData; a matching pair we do not yet produce
- the recording-oracle walls are recorded too: the target's auth0 layer rejected the REAL browser while curl_cffi passes (inverted-fingerprint case), and a Fetch-injected hostpage rendered the widget but cross-origin iframe click routing never fired the flow
- remaining paths, in effort order: parent-page executor on the real api.js (genuine manifest/vmdata) → per-frame execution contexts for the injected oracle → stealth-browser HSW run as recorder

## [1.7.8] - 2026-11-27

### Added — HSW warm-up SOLVED: a usable project exists, and the chain now reaches the last mile

- the environment-warm-up blocker is solved by absorbing `CircuitSavage/hcaptcha-hsj-hsw-reversed`: a working HSW execution environment (preconfigured Node+jsdom runtime) plus the reversed crypto — n-token cipher solved as AES-256-CTR (`iv‖be32`), six build-static keys with a refresh workflow, documented wire formats, and an `HSWBridge` SDK
- hands-on: `HSWBridge.solve(fresh_c_req)` produced a **live 13k-char `n` in 0.5s** on a challenge we minted seconds earlier; our assembled getcaptcha (MessagePack `[cJSON, ExtType(18, encrypted)]`, article format) returned **HTTP 200 with a rotated challenge — not a format rejection**: wire encoding and `n` accepted
- the passive-pass remainder is now precisely one thing: **realistic motionData/vmdata** (the article's parent-page executor leg); alternatives recorded for it — the wasm deobfuscator for understanding, and running HSW in a stealth browser as a motionData-recording oracle

## [1.7.7] - 2026-11-27

### Changed — hcaptcha passive route: from documented (L1) to HALF-CHAIN LIVE-REPRODUCED

- hands-on reproduction against the live target: request ① login HTML with the documented container + sitekey ✓, request ② checksiteconfig exact config shape (`c.type=hsw`, `enc_get_req`, JWT-shaped `c.req` with `l`/`i` claims) ✓, request ③ 1.63MB HSW download whose SHA-256→SRI matched `claims.i` **byte-for-byte** ✓ — the article's protocol claims are real (those legs now evidence level 3)
- execution leg partial: the original HSW injects into iv8, `window.hsw` is callable and returns a Promise, and the debug access log shows the PoW wasm actively decoding (1400+ atob calls, WebAssembly instantiation, probes on permissions/connection/devicePixelRatio/plugins) — but `n` did not resolve: the HSW waits on environment warm-up state (incl. the recorded canvas-trace consumption) that we have not built. Remaining work scoped honestly: parent-page executor (motionData/vmdata) + warm-up build + getcaptcha submission

## [1.7.6] - 2026-11-27

### Changed — hcaptcha reclassified: the passive route is a protocol gate (our blocked premise was wrong)

- a full-chain field walkthrough (no-image flow on a large airline login) corrects our own family table: hcaptcha is NOT uniformly a perception gate. The **passive/no-task flow is request-replay + verbatim HSW execution** — five requests on one curl_cffi session: authorize→login-HTML, checksiteconfig (`c.req` JWT carrying HSW path+SRI), SRI-verified HSW+api.js fetch, three local engine calls (parent-page executor → motionData/vmdata; `hsw(c.req,opts)` → proof `n`; MessagePack + `hsw(1,bytes)` encryption), getcaptcha with `[cJSON, ExtType(18,encrypted)]` body → `pass:true` + `P1_` token (120s TTL). No CV, no paid service
- absorbed as `references/hcaptcha-passive-route.md` (protocol structure, success predicates, mapping onto our verbatim/two-shell/page-truth doctrines, and where pyv8c/iv8 slot in — iv8's API-access logging is the natural tool to discover HSW's env dependencies); family table splits hcaptcha into passive (protocol) vs image-task (perception); evidence matrix updated — level 1, honestly not yet reproduced
- incidental: WeChat article walls (environment-anomaly interstitial) yield to a real-Chrome CDP fetch — the article about bypassing gates was itself behind one

## [1.7.5] - 2026-11-27

### Changed — the new engines are now WEAPONIZED on a real obfuscated target (and one claim corrected)

- iv8 debug-mode ran the recorded spiderbuf corpus file (obfuscator-v4 + site second-layer) end-to-end with an offline-injected contract: **one run auto-produced what previously took webcrack + manual source reading** — the target's full probe sequence (navigator.webdriver x40, plugins, mimeTypes, languages) grepped straight from 435k API-access log lines, and the complete POST contract (`{p: <token>}`) captured by netLog; the offline replay loop closed with resources-injected responses
- honest correction: pyv8c's "V8 Inspector from Python" was our hands-on claim — the Inspector exists in the pyv8 native layer (documented), but the sync_api exposes no debugger entry, so debugger-in-sandbox for pyv8c is downgraded to documented-not-verified; iv8's debug-mode access logging is the verified in-sandbox observability today

## [1.7.4] - 2026-11-27

### Added — iv8 absorbed: the reverse-workflow execution engine (third option, live-probed)

- iv8 (C++-native BOM/DOM on V8, pip wheel py3.9-3.14) passes the same full calibration card as pyv8c (document.all [[IsHTMLDDA]], native-masked constructors, eval-this, plugins 5/mimeTypes 2, Worker/WebSocket) — and adds the reverse-workflow weapons pyv8c lacks, all verified hands-on: **debug-mode API-access chain logging** (the M-family environment-probe diagnosis, built in — 207KB access log from a five-line probe snippet), **logical time** (sleep(5000) completes instantly), `debugger;` neutralized, `netLog` intercepted-request inspection (request-contract capture built in), `hookNative`/`wrapNative`, offline-by-default XHR/fetch with `add_resource` replay injection, per-Isolate threading with GIL released
- execution-surface ladder is now a two-engine rung with a recorded selection guide: pyv8c (standard Inspector debugging, newer IDL, active) vs iv8 (probe-hunting, logical-time determinism, offline contract replay, threading); caveats noted — community/Pro split, quiet since 2026-10-13, macOS author-untested

## [1.7.3] - 2026-11-27

### Added — pyv8c absorbed as execution rung #3 (live-probed with our calibration cards)

- pyv8c (real V8, Chromium-154 IDL baseline, deterministic Python BOM/DOM, pip single wheel incl. V8, CPython 3.12+) evaluated hands-on: **every recorded jsdom gap probe passed in one shot** — document.all [[IsHTMLDDA]] correct, constructors native-masked (M5), eval-this===window (M4), plugins=5/mimeTypes=2, Worker+WebSocket native — the full M4/M5/M5b family that jsdom stubs for
- bonus capabilities recorded: **V8 Inspector from Python** (breakpoints inside the delivery sandbox — closes the debug-in-Chrome/deliver-in-Node context gap), deterministic frame clock (M1/M3/M6 discrimination), local-Chrome reference tooling matching our calibration-oracle recipe
- execution-surface ladder updated in env-rebuild-recipes: Node vm → jsdom → **pyv8c** → real-Chrome-oracle; caveats noted (younger project, interfaces-present ≠ implemented, env-profile/IDL mismatch warning expected)

## [1.7.2] - 2026-11-22

### Changed — comparator set to 15: reverse-skill category and the obfuscator ecosystem now represented

- added five (anonymized T1-K..T1-O): the broad-spectrum security/RE skill router (45k★, same shape as us — 44 routing rules, 45 modules, 221 claimed regression cases), an app-clone reverse skill pack (10k★), a game-modding reverse suite (9.8k★, very active), an Android APK-RE skill (8.8k★, adjacent domain we explicitly exclude), and the JavaScript obfuscator itself (16k★, protection-side head included as the difficulty yardstick with an explicit category-mismatch note)
- the reading moved where it should: the 45k★ same-shape router takes the top-comparator spot at **33.4** (its 221 claimed regression cases score fully on self-regression) — evidence the rubric rewards genuine strength, not just our own shape; SELF stays 89.6, best comparator now 33.4
- ob-ecosystem exclusions recorded for cause: webcrack/kuizuo absorbed as dependencies (conflict), synchrony/ben-sb below head threshold, de4js not a repo ecosystem

## [1.7.1] - 2026-11-22

### Changed — comparator set expanded to 10 true head projects

- added five head comparators across the adjacent categories that matter to users choosing a tool: LLM-era crawling infrastructure (206k★), open-source LLM crawler (87k★), web-scraping framework (26k★), stealth browser build (12k★), classic stealth driver (13k★, unmaintained) — anonymized as T1-F..T1-J
- reading unchanged in shape: SELF 89.6 vs best comparator 32.1 (the single-family request-level CF solver); the new heads land at 13.5-22.6 — highest on adoption and freshness (they are the most-used and best-maintained projects in the space), lowest on solve record / failure knowledge / self-regression (none publish verifiable target-solving evidence or capability regression)
- rejected for cause: tls-client (2k★) and synchrony (1.3k★) below head threshold; PyPasser excluded as an absorbed dependency (conflict of interest)

## [1.7.0] - 2026-11-22

### Added — capability TRUTH scorecard: capability measured by evidence, not repo completeness

- the completeness scorecard (structure) happily prints 100/100 and says nothing about skill; the new truth scorecard scores **what was actually done**: 10 capability-weighted dimensions (solve record 25%, gate coverage 15%, pure delivery, failure knowledge, blind self-regression, evidence integrity, engineering safety, absorption, adoption at a deliberate 5%, freshness)
- every point traces to an evidence entry with a **level** (live-verified / corpus-verified / doc-claimed / none) — comparators score on the same rubric from their public record, plus our hands-on evaluation where marked (comparator IDs anonymized in the public bundle; corrections welcome via issues with verifiable evidence)
- **evidence decays**: live gate evidence loses a level per 30 days without re-verification (corpora at half rate; the 2-day site-side expiry of a recorded L1 case is encoded as an explicit invalidation that scores 0 but stays listed — negative results are part of the truth)
- first reading: SELF 89.6 vs best comparator 32.1 — with SELF scoring BELOW every major comparator on adoption (43 vs 85), because stars are not skills and the weights say so
- `node scripts/generate_capability_truth_scorecard.js [--json] [--markdown out.md]`; 4 unit tests pin the model schema, decay math, doc-claim scoring caps, and public anonymization

## [1.6.3] - 2026-11-21

### Changed — dependency-health round: three live-verified negative/positive facts

- **Node has no L1-capable impersonation client (yet)**: got-scraping (apify, header-generator + http2 fingerprint) live-tested against both recorded L1 targets — 403 on each. The L1 bar is TLS-level; the matrix now says so explicitly (stay on curl_cffi for L1)
- **curl_cffi 0.13 → 0.17 verified chain-identical**: the recorded c14 three-gate chain reproduced CPC 34.14 on both versions; rolled the main env back to 0.13 because yfinance pins <0.14 — upgrade when that pin moves
- **L1 evidence is time-bound**: stockx accepted the 0.13 chrome impersonation on 2026-11-19 and rejected the identical client two days later (site-side tightening, confirmed on both versions) — the matrix gains a drift rule: re-triage before reusing any L1 verdict
- toolchain: js-deobfuscator (kuizuo, 1191★) recorded as the SECOND-OPINION deobfuscator — same-sample parity with webcrack on the recorded v4 corpus file (both recover the main logic)

## [1.6.2] - 2026-11-21

### Changed — ecosystem re-scan absorbed, two gate classifications corrected by live tests

- **PyPasser absorbed and live-verified** (631★, MIT): GeeTest v4 **wire solver** cleared the official adaptive demo in 2.6s over pure HTTP (full lot/pass_token/captcha_output tuple), and the reCAPTCHA **v3 anchor forge** produced a real response token in 0.9s. Two family-table classifications are corrected by these tests: reCAPTCHA v3 is a **score gate** (protocol-forgeable, NOT a perception gate — only v2 image grids are), and GeeTest v4 is a **protocol gate** (wire-solvable; the client-side-judgment prior now applies to gt3/legacy variants only)
- live evidence matrix +2 rows; toolchain gains the PyPasser entry (with the numpy/pillow import-time trap)
- ecosystem notes: playwright-captcha (365★) evaluated WEAKER than the current stack (turnstile via stealth clicking vs request-level cfsolve; reCAPTCHA via paid APIs only vs own CV) — no absorption; cfsolve grew 791→864★ since evaluation
- operational hardening: verified solver assets moved out of /tmp into a persistent vendor/ (cfsolve binary+profiles, recaptcha solver+models, arm64 chromedriver), `verify_cf_solve_capability.sh` defaults to the vendor path (live re-verified post-move; the path-resolution fix is itself recorded)

## [1.6.1] - 2026-11-19

### Added — L2b turnstile acquisition live-verified; the ladder gets a one-command re-verifier

- **Turnstile widget solve live-tested**: cfsolve three-pass protocol (POST → interaction/proof-worker → complete) against a live widget via HTTP proxy — real `1.<token>` issued; a wrong sitekey is rejected HTTP 400 at the widget route (sitekey is part of the route). The CF acquisition family is now fully live-verified: L2 challenge page AND L2b widget
- `scripts/verify_cf_solve_capability.sh`: one-command capability re-verifier for both acquisition modes — asserts "Cleared the challenge" or a token pattern, prints the artifact, and carries the recorded traps in its header (brew-rust build notes, proxy requirement, exact-sitekey rule, and the TLS-stack-binding discovery). Self-tested against the live turnstile demo (second token proves repeatability)
- live evidence matrix consolidated at the top of `references/cf-gate-triage.md`: every gate × result × date × re-verify command — including the honest gaps (depop partial, hcaptcha blocked on a service key)

## [1.6.0] - 2026-11-19

### Added — the whole CF ladder is now live-verified, plus one real discovery

- **cfsolve built and live-tested** (mac arm64: brew rust 1.100 ignores the pinned 1.98, ~10min build incl. BoringSSL): solved a live L2 challenge page through an HTTP proxy with the shipped Safari/iOS profile — challenge cleared, protected page fetched in-stack, `cf_clearance` issued. The maintainer-retirement risk had NOT materialized against the current CF build at test time
- **discovery: `cf_clearance` is TLS-stack-bound** — replaying a solver-issued clearance through curl_cffi's safari fingerprint (identical proxy exit + UA) was rejected with a fresh 403 challenge, while the solving stack kept passing. The clearance lifecycle discipline is corrected accordingly: pool key must include the client STACK, or harvest on the solver's stack
- **L1 closed end-to-end**: stockx.com triaged L1 by the plain-Node probe (403, no challenge markers) → documented upgrade route (curl_cffi chrome, direct) returned the full page 200 ✓; depop.com triaged L1 but stayed 403 after upgrade — next rung (clean residential IP) untested, recorded as partial
- README capability surface refreshed to v1.5.x reality: gym 11 flavors, the anti-gate triage row in the capability matrix, the five new tools in the quick-reference, the pure-delivery principle and the live-verified reCAPTCHA rung

## [1.5.1] - 2026-11-19

### Added — the reCAPTCHA rung is now live-verified end-to-end

- `scripts/verify_recaptcha_capability.py`: capability verifier that solves a REAL reCAPTCHA v2 (official demo) and confirms the outcome from the PAGE — real `g-recaptcha-response` token, never the solver's own return value. Header records the three mac-arm64 traps that each cost a failed run: undetected_chromedriver's auto-download fetching the wrong arch (errno 86), Gatekeeper SIGKILL (-9) on unsigned drivers (xattr -cr + ad-hoc codesign), and selenium 4's `Service()` API
- live result recorded in toolchain + family table: **3/4 on the official demo, 7-10s per passing round, real 2.5KB token** — including one challenge class (buildings) that exercised the OIV7 fallback detector, proving the two-stage classifier→detector design works as claimed

## [1.5.0] - 2026-11-19

### Added — captcha-family triage: the full human-verification gate map

- `cf_gate_triage.js` gains a `captcha_family` dimension, orthogonal to the CF ladder (verdict = can you FETCH; family = what guards the SUBMIT): turnstile / recaptcha / hcaptcha / geetest / named-slider families from component-level markers scanned over the full body. Live-tested — the first live pass found two real issues, both fixed: a bare-word `geetest` marker false-positived on marketing copy (a captcha-service demo page), and single-family reporting hid genuine multi-widget pages (now an honest array; the same demo page really embeds recaptcha + hcaptcha)
- `references/cf-gate-triage.md`: human-verification widget family table — perception gates (recaptcha/hcaptcha) are not pure-algorithmable by nature and route to the external CV rung (recaptcha_ia_solver: fine-tuned YOLOv8s-cls, 9-10/10 official demo) or captcha services; geetest/slider route to client-side-judgment priors (extract embedded data FIRST — recorded corpus cases never needed the drag)
- `references/browser-hooks.md`: five interaction-robustness rules absorbed from a production reCAPTCHA solver — iframe anchors on `@src` not localized `@title`, deadline-bounded wait loops, stale-element re-anchoring (the recorded silent "looks-solved" failure), confidence floors under asymmetric error cost (wrong submissions escalate difficulty), and `requestSubmit()` to beat the z-index overlay race
- toolchain: recaptcha_ia_solver entry (optional perception-gate acquisition)

## [1.4.1] - 2026-11-17

### Fixed — live-tested the triage tool against real Cloudflare targets

- `cf_gate_triage.js` shipped mock-tested only; live verification against real targets found one real bug: a 200 page with an embedded Turnstile widget (the typical L2b form) was misjudged L0 by a naive `200 → L0` shortcut. Classification order fixed — intercept state (cf-mitigated / 503 / challenge markers on non-200) outranks the widget check; the widget alone on a loadable page is L2b
- live results recorded in `references/cf-gate-triage.md`: challenge page → L2 ✓, turnstile form → L2b ✓, clean CF-CDN 200 → L0 ✓, unreachable → UNKNOWN ✓ (honest route); L1 documented as corpus-evidenced (no live sample this round)

## [1.4.0] - 2026-11-17

### Added — Cloudflare capability: diagnose in-skill, solve by ladder

- `scripts/cf_gate_triage.js`: escalating two-stage probe (thin headers → full Chrome header set) that classifies a blocked URL into L0 / L1 / L2 challenge / L2b Turnstile from the reliable markers (`cf-mitigated` header, challenge-page body markers, turnstile markers, `__cf_bm`) and prints the per-level route. Unit-tested against a local mock server impersonating each level plus the unreachable path
- `references/cf-gate-triage.md`: the full L0-L3 ladder — signal table, cf_clearance lifecycle discipline (pin IP+UA, pool by (host, proxy session), ~20min TTL, invalidate on `cf-mitigated`), the behavior-telemetry record/materialize/replay pattern (check dimensions observed in the wild: engine/transport/timeline/intervals/orchestrator/interaction/resource_timing), and external-solver notes (cfsolve: request-based acquisition with sudden-death caveats — maintainer retired, `Error::Unsupported` on new CF builds)
- client matrix extended with the Cloudflare ladder row; toolchain adds curl_cffi (L1) and cfsolve (L2/L2b acquisition) entries
- gym flavor **behavior_telemetry** (11 flavors): a CF-style telemetry gate that accepts only real asynchronous timer chains with natural jitter — synchronous uniform forgeries stay decoy; the existing generic decision tree (M3 timer-wait) solves it blind with zero new flavor-specific code
- Task Router / Start Here route Cloudflare-gated targets through the triage tool first

## [1.3.4] - 2026-11-09

### Fixed — export integrity (found by the 3-pass review)

- `references/header-fingerprint-tokens.md` was announced in 1.3.1 but never actually exported: a mis-parenthesized ternary in a manifest patch reported success while leaving the entry out. The file ships now (three-gate model, error-string bisection, client pass matrix)
- new link-integrity gate (`tests/unit/dist-link-integrity.test.js`): every `references/*.md` route that the exported SKILL.md names (markdown links AND backtick routes) must exist in the bundle; README/playbooks relative md links checked too. This class of silent gap cannot ship again
- public SKILL.md no longer routes to the internal skill-comparison note (deliberately private; the dead route read as a missing file)

## [1.3.3] - 2026-11-09

### Added — two tools, one principle, two patterns, one gym flavor

- `scripts/decode_string_array_runtime.js`: the M13 recipe as a tool — executes the target's own string-array machinery (array + rotation IIFE + lookup) in a stubbed Node vm and returns index→value mappings. Immune to obfuscator.io v4 proxy variants that blind the static `recover_string_table.js`; the two are complementary (static-fast vs runtime-proof). Unit-tested against synthetic v4 fixtures and the recorded misspelled-field case
- `scripts/scaffold_wasm_verbatim.js`: generates a ready-to-fill Node harness for wasm signers — enumerates every func import as a stub placeholder, auto-calls init exports, ships a call-convention probe (identified `(inPtr, inLen, outPtr)` on the recorded topic-31 module out of the box) and an M12 bruteStub recovery helper. The embedded VM is never reversed
- **pure-algorithm-default** core principle + Task Router row: delivery is zero-browser by default (Node verbatim / wasm verbatim / pure-HTTP); browsers are for sampling and cross-validation, not delivery
- **misdiagnosis M14 (aggregation-target mismatch)**: pipeline verified but verify rejects → enumerate the answer space (column × filter × sum/mean × client-rendered derived) instead of re-touching the pipeline; quick-list order now M10 → M13 → M14 → M2b → M12 → M5 → M11 → M8
- client pass matrix in `references/header-fingerprint-tokens.md`: measured plain-curl / Node-undici / curl_cffi results across the header-set, data-API, and token-registration gates
- gym flavor **m13** (fallback-data gate, 10 flavors now): wrong contract → 200 + static decoy; the generic solver learned ONE new generic move (decoy outputs → sweep adjacent decode/hint/lookup oracles → retry with recovered strings) and still solves all flavors blind

## [1.3.2] - 2026-11-09

### Added — M13: fallback-data gates, and the external corpus at 39/39 zero-browser

- **misdiagnosis M13 (fallback-data gates)**: lenient gated APIs answer invalid signatures with HTTP 200 + static decoy data — status-code checking passes, aggregation fails, verify rejects everything. Disproof: fingerprint the payload across signature variants (byte-identical = decoy). The real contract is often a deliberately misspelled field name or hidden separator (recorded: `signture`, md5 sep `spiderbuf`), recoverable by runtime-evaluating the obfuscator.io v4 string array in a Node vm (truncate-at-lookup + balanced-brace location + stub rotation IIFE — recipe in the pattern)
- triage-order quick list added to the misdiagnosis reference (M10 → M13 → M2b → M12 → M5 → M11 → M8)
- external corpus round 2: 13/14 spiderbuf challenges re-closed pure-HTTP with exact-match answers (c10 jsl_clearance two-round, c11 dual-signature worker contract, c12 double-layer AES, c13 range-chain); one partial recorded honestly as a server-side dataset/verify desync

## [1.3.1] - 2026-11-09

### Added — header-fingerprint-bound tokens: the pure-HTTP route

- `references/header-fingerprint-tokens.md`: three-gate model (header-set gate → decoy-token registration gate → header-fingerprint binding) with the one-request error-string bisection (`Invalid Token` fixes the GET, `Invalid Fingerprint` fixes the POST). Measured fingerprint contents: `sec-ch-ua-full-version-list` (high-entropy client hint) is the decisive header; analytics cookies participate by presence AND timestamp freshness (synthesizable — no real analytics round-trip needed); TLS JA3 did not. Closed a browser-detection challenge pure-HTTP with zero browser after its 2026-09 browser-assisted delivery; the external corpus is now 39/39 zero-browser
- `header_fingerprint_bound_token` outcome pattern registered (4 applications, all solved)
- SKILL.md Start Here routing updated for the new failure signature

## [1.3.0] - 2026-11-09

### Added — M12: hook self-poisoning, and the observer-free sampler

- **misdiagnosis M12 (hook self-poisoning)**: offline token matches the browser byte-for-byte yet the server 403s — because wrapping `WebAssembly.instantiate` (or any global) to sample import stubs is detectable, and the loader routes to a decoy key schedule. Diagnosis fingerprint: compare CBC block-1 token prefixes across sampling methods; recovery: brute-force the single suspect stub against one genuine (plaintext, token) pair. Full symptom → disproof → cause → fix record in `references/misdiagnosis-patterns.md`
- `scripts/sample_via_fetch_injection.js`: observer-free CALL-trace sampler — injects tracing INSIDE the target's own JSVMP interpreter by rewriting its script response via CDP Fetch-domain interception. Zero globals touched, so loader-side hook detection cannot fire (the technique that made M12 solvable)
- M11 resolution note: the WASM-embedded-VM family does NOT require VM reversal — verbatim Node execution with reconstructed import stubs (`encrypt(inPtr,inLen,outPtr)` contract) closed a triple-layer target (JSVMP → WASM VM → addition-only AES-CBC) with zero browser; `wasm_embedded_vm` fingerprint updated accordingly
- two new evidence-backed outcome patterns: `fetch_domain_in_target_trace` and `wasm_verbatim_stub_replay`

## [1.2.2] - 2026-11-06

### Changed

- merged community PRs #1 (replay_scaffold md5→sha256) and #2 (function_diff sha1-truncated→sha256) — first external contributions; synced back to the private workspace (single source of truth preserved)
- INTENTIONAL-WEAK-CRYPTO disclaimers added to gym files (challenge material uses md5/sha1 by design; automated scanners please do not flag) and dedup-key notes on content-hashing call sites
- new issue template: capability questions (guides "can this solve X" asks toward fingerprint-ready descriptions)

## [1.2.1] - 2026-09-20

### Added

- `scripts/make_release.sh`: atomic release pipeline — nine short-circuit gates (preflight → tests → catalog/changelog → export leak-gate → dist check → dist release-scan → commit → tag → optional push). Makes the recorded operator mistake ("export failed but a half-updated state was pushed") structurally impossible; negative-tested (missing changelog entry aborts at step 3 with zero git operations)

## [1.2.0] - 2026-09-15

### Changed — scientific-rigor hardening

- **generic gym solver** (`scripts/gym_generic_solver.js`): ONE recipe decision tree (boot → entrypoint discovery → M3 timer-wait → stub-tier escalation → frozen-randomness retest → standard digest enumeration), ZERO per-flavor code paths, solves all 9 challenges blind — breaking the author-equals-solver circularity of the per-flavor runners. Acceptance constants live in challenge fixtures (data), not solution code; the anti-circularity rule is now documented and enforced in `references/gym-challenge-format.md`, which also opens third-party challenge contribution
- `scripts/generate_scripts_catalog.js`: the scripts catalog is now auto-generated from script headers (`--check` mode for CI) — hand-maintained drift eliminated (143 scripts indexed)
- telemetry v2: every outcome record carries a `source` label (`organic` at-solve vs `backfilled` historical) so ranking weights can weigh evidence honestly

### Added

- performance regression layer (`tests/performance/perf-smoke.test.js`): budgeted hot-path assertions for the interactive tools, closing the four-layer test gap (unit/property/integration/performance)

## [1.1.0] - 2026-09-15

### Added — capability expansion (intake, session, supply, wasm)

- `scripts/scaffold_signer_service.js`: turn a solved signer into a long-running local signing service (zero-dep HTTP wrapper: POST /sign, /health, /stats; realm rules honored; fail-fast calibration hook) — production supply for crawlers instead of one-shot collectors
- `scripts/har_to_bundle.js`: import devtools/burp HAR captures into runtime-summary bundles (candidate protected requests by url/header signish markers, cookie-write timeline, full requests.jsonl)
- `scripts/session_snapshot.js`: dump/restore cookies + localStorage + sessionStorage from a debug Chrome tab — reusable login state without re-doing auth flows
- `scripts/wasm_triage.js`: zero-dependency wasm binary reconnaissance (native section parser: imports/exports/classification into crypto-ish / time-dependent / randomness / signer-shaped; wabt optional for wat output)
- three new integration tests (real HTTP round-trip for the signing service; synthetic HAR; synthetic wasm module with time import + sign export) — caught a real CommonJS `exports` shadowing bug in wasm_triage on first run

## [1.0.2] - 2026-09-15

### Fixed

- embedded-font-mapping pattern: added shorter generic signals so woff-blob queries route correctly; regression case added to the public benchmarks (50 cases now)

## [1.0.1] - 2026-09-15

### Fixed

- pattern index now routes to ALL 19 playbooks (10 were unreachable dead assets): added patterns for hidden-DOM scrambling, decoy token gates, embedded font mapping, seeded-signer ladders, grid challenges, script-warmup chains, verify/data gate splits, mobile-shell pivots, patched digest branches, and prior-round stateful replay

### Added

- battle telemetry backfilled from real solved targets (15 recorded solves across five patterns) — ranking weights now reflect the full solved history from day one
- obfuscation fingerprint library extended to 9 families (+ Huffman-window tokens, RSA-chained tokens, webpack module bundles)

## [1.0.0] - 2026-09-07

Stability milestone: capability, testing, and distribution surfaces are complete.

### Added

- **level-2 composite gym challenge** (`combo_all`): one target stacking an env-gated IV, timer self-check, random-IV tail, and helper decoy — the standard recipes must be applied in combination; 9/9 gym challenges green
- **TUTORIAL.md**: zero-to-first-solve walkthrough (~5 min) using gym targets as safe teaching material — every code sample is executed and verified, including the control experiment

### Changed

- SKILL.md compressed to 475 lines (within the official <500 guidance) by linking out sections duplicated in references

### Why 1.0.0 now

- capability: 9 gym challenges, 8 misdiagnosis patterns, 6-family fingerprint library, 19 playbooks, 130+ scripts
- testing: three test layers + 49 routing benchmarks + 24 trigger evals + leak-gate blocking test, all in `make check` and CI
- distribution: plugin marketplace, npx-skills, git-clone paths; bilingual README + tutorial; 40 tagged releases

## [0.1.40] - 2026-09-07

### Changed

- README (zh + en): full capability-positioning rewrite — differentiation and the unique-in-class capabilities (capability gym, divergence auto-triage, JSVMP catch hook, family fingerprints, three test layers, release safety gate, zero-dependency execution surface) stated as capability claims without naming any specific external project
- changelog history entries neutralized (no project names / star counts); the internal skill-comparison research doc is no longer part of the public export; adapter-map descriptions stay adapter-factual

## [0.1.39] - 2026-09-07

### Added

- **reverse gym** (first of its kind in this tool class): `scripts/gym_generate_targets.js` synthesizes one self-contained challenge per misdiagnosis pattern M1-M8; `scripts/gym_run.js` solves each end-to-end with the standard recipes only (verbatim vm realm, real timers, native-masked classes, controlled require surface) and asserts the control groups — the wrong approach must fail exactly as documented. 8/8 green, wired into `make check` and CI
- **obfuscation family fingerprints**: `assets/obfuscation-family-signatures.json` (6 families: jsvmpzl VM, eval-packer, opaque-predicate bloat, string-array rotation, env-gated constants, timer-selfcheck shells) + `scripts/detect_obfuscation_family.js` — validated against two real solved targets (exact family hits, score 6 and 5)
- **learning-loop harvester**: `scripts/harvest_pattern_case.js` turns a solved/failed real target into telemetry + a sanitized benchmark draft (review-gated, never auto-committed)

### Learned

- gym construction surfaced a portable pitfall: Math members are non-enumerable, so `{...Math}` copies nothing — now asserted in the m6 solver with an inline note

## [0.1.38] - 2026-09-07

### Added

- three-layer test suite on Node's built-in `node:test` (zero dependencies), closing the engineering gap to the strongest community MCP repos:
  - `tests/unit/`: leak-scanner flagging, router scoring, indirect-eval detection on synthetic samples (exporter-dependent cases skip gracefully in the public bundle)
  - `tests/property/`: randomized-parameter iron-rule invariants — every valid harness-generator combination must compile and carry the rules; invalid ones must be rejected; the interpreter-catch hook may only grow its input
  - `tests/integration/`: the export leak gate BLOCKS planted banned tokens end-to-end on isolated copies; playbook runs emit the complete artifact set; benchmarks/trigger evals stay green
- `make tests` wired into `make check`; CI runs unit+property layers
- the suite caught a real doc-code drift on its first run (M8 missing from the playbook checklist) and a scanner-by-design tension (test fixtures must assemble banned tokens at runtime)

## [0.1.37] - 2026-09-06

### Added

- live validation of the community reverse-MCP pairing (against a real target): handshake via a hand-rolled stdio probe, 24-tool enumeration, page control, in-page triggered token-request capture, XHR-breakpoint hit confirmation; findings folded into the adapter map
- misdiagnosis pattern M8: execution-surface fingerprints — stealth (Patchright-style) navigation can itself be probed by VM shells, silently suppressing the protected request; plain-CDP comparison is the fast disproof

## [0.1.36] - 2026-09-06

### Added

- market-research-backed MCP pairing: `mcp-server-adapter-map.json` now documents the actual JS-reverse MCP leaders (community CDP reverse-engineering MCP servers — minified-safe breakpoints, XHR breakpoints with paused-frame inspection, logpoint tracing, stealth/anti-detection modes, browser takeover) plus a new `parameter_blueprint_mcp` family (knowledge-base MCPs with verified pure-Node parameter blueprints)
- `references/mcp-playbooks.md`: pairing section defining division of labor — market MCPs pull triggers, this skill owns stage gates, misdiagnosis triage, verification, and delivery; `cdp_minibrowser.js` remains the zero-dependency fallback

## [0.1.35] - 2026-09-06

### Added

- `Makefile` mirroring every CI job (`make check` = benchmarks + trigger evals + syntax + release checks), Trail-of-Bits style: local signal must stay trustworthy
- `AGENTS.md` contributor guide: official doc references, external complexity-ladder examples, development loop, and authoring conventions (evidence labels, catalog registration, sanitized-language rule, telemetry recording)
- SKILL.md "When NOT to Use" section (positive + negative trigger boundaries, gold-standard pattern)
- `plugin.json` author block

### Benchmarked against the actual market leaders (research, not shipped code)

- skills.sh top-installed leaderboard: zero reverse-engineering skills (the niche is open)
- gold-standard security skill collections: monorepo plugin structure, Makefile-as-CI-mirror, validator self-tests, contributor ladder — patterns absorbed above
- closest community JS-RE skill packs are prompt-only; their slash-command UX was absorbed in 0.1.34

## [0.1.34] - 2026-09-06

### Added

- slash-command thin entries (`commands/jsro-triage|jsro-sign-crack|jsro-deobfuscate|jsro-env-rebuild.md`) with `argument-hint` frontmatter — scene-direct entrypoints for Claude Code users that route into the full skill, closing the UX gap observed in the closest community competitor (prompt-only skill packs)

## [0.1.33] - 2026-09-06

### Added

- **Agent Skills spec alignment**: SKILL.md frontmatter now carries `license` / `compatibility` / `allowed-tools` / `metadata` per the official anthropics/skills convention, plus a negative clause in the description (no crawler-writing, no general frontend dev, no binary/APK RE) for trigger accuracy
- **trigger evals** (`assets/skill-trigger-evals.json` + `scripts/run_trigger_evals.js`): 24 should-trigger / should-not-trigger user queries with a lexical smoke runner (word-boundary matching, out-of-scope target detection) — the eval already caught and fixed a `design`-matches-`sign` false positive; wired into CI
- **distribution**: `.claude-plugin/marketplace.json` + `plugin.json` (installable via `/plugin marketplace add DQmyth/js-reverse-ops`), bilingual README install sections covering the three install paths (plugin marketplace, `npx -y skills add`, plain git clone)
- `README.en.md` restored into the public source tree (was previously dist-only and lost to an export overwrite)

### Changed

- `references/external-corpus-manifest.json`: 14 absolute workspace paths replaced with a `${SKILL_ROOT}` placeholder for portability

## [0.1.32] - 2026-09-06

### Added

- `scripts/cdp_minibrowser.js`: minimal zero-dependency CDP client (`list` / `new` / `eval` / `capture`) — the minimal trigger-pulling surface for runtime-truth capture without a full MCP setup
- `scripts/scaffold_env_prelude.js` + the `chrome-verbatim-sandbox` anti-detection profile: pick a profile, emit the verified environment-alignment prelude (UA/cookie shape/plugins/chrome keys/viewport/rects/...) for jsdom verbatim harnesses
- capability scorecard: new `battle_tested_outcomes` dimension driven by `pattern-outcome-stats.json` — with no telemetry recorded the completeness score is capped at 0.2 (self-report guard); recorded solve-rate scales it honestly

### Changed

- practice solution shells now record pattern outcomes back into `pattern-outcome-stats.json` after submission (solved on code 1/2, failed otherwise), closing the telemetry loop end to end

## [0.1.31] - 2026-09-06

### Added

- `references/stage-gates.md`: hard entry/exit evidence conditions per stage (Locate/Runtime/Recover/Replay), stage time-boxes with continue-vs-stop rule, and the ordered fallback chain for stuck stages — closes the "replay before runtime truth" class of failures recorded in the practice corpus
- `references/decision-handoff.md`: delta-only handoff protocol (`decision_delta` + `carry_forward_refs`) between stages and sessions, plus the user-instruction feasibility gate (obey goals, not step orders; explicit evidence-quality labels like `unreadable`/`expired`/`fake-data`)

## [0.1.30] - 2026-09-06

### Added

- runnable gate demo in `examples/`: `sample-env-gated-signer.js` (a mini signer with a native-print IV gate and a per-byte encoding branch) + `sample-verbatim-harness.js` (browser-like vs host-flavored sandboxes, calibration assertions) — demonstrates in one file why verbatim execution with precise stubs beats hand-porting, and surfaces the cross-realm array-comparison pitfall on the way
- `README.en.md` linked from the Chinese README; public README gained a latest-capabilities section

## [0.1.29] - 2026-09-06

### Fixed

- removed compiled `__pycache__` artifacts (some were previously tracked in the public bundle) from both the workspace and the export; export policy now also ignores `__pycache__/`
- refreshed the hand-curated scripts catalog (counts and the six divergence-triage / harness tools)
- public SKILL.md now indexes the sanitized case walkthroughs

### Changed

- SKILL.md: folded the Scripts Catalog section into Tooling Guidance (489 lines, was 565 at v0.1.22)

## [0.1.28] - 2026-09-06

### Added

- private workspace now version-controlled (git); tmp_cases validation corpus archived out of the tree
- `run_playbook.js`: `--playbook <path>` override and per-run recommended-scripts list parsed from the selected playbook's own references (zero-maintenance: playbook edits update recommendations automatically)
- `detect_env_divergence.js`: `--plan` mode prints ordered control-experiment plans (what to re-capture, what to observe, which misdiagnosis each outcome confirms) for empty-later-tokens / key-differs / total-unstable symptoms
- public README: English overview (`README.en.md`)

## [0.1.27] - 2026-09-06

### Added

- outcome telemetry loop: `map_case_to_pattern.js` reads `assets/pattern-outcome-stats.json` and biases pattern ranking by solve rate (0.8x all-failed .. 1.2x all-solved)
- stage references (`replay`, `recover`) now link `references/misdiagnosis-patterns.md` for "almost works" flows
- public README: latest-capabilities section (recipe cards, misdiagnosis patterns, divergence triage, case walkthroughs)

## [0.1.26] - 2026-09-06

### Added

- `scripts/detect_env_divergence.js`: executable misdiagnosis triage — feed run captures (`{clock, keys[]}`) and get a verdict classifying random-IV vs time-derived-key vs timer-selfcheck vs environment-gate divergence (patterns M6/M1/M3)
- `scripts/hook_vm_interpreter_catch.js`: runtime-patches JSVMP interpreter catch clauses to log bytecode-swallowed exceptions to a global, separating exceptions from silent branches (patterns M3/M4); canonical + bracket-variant patterns with custom override
- `scripts/detect_indirect_eval_scope.js`: static heuristic flagging indirect-eval / Function-constructor bootstraps and printing the sandbox rule they impose (pattern M4)
- `scripts/update_pattern_index_stats.js` + `assets/pattern-outcome-stats.json`: pattern outcome telemetry (applied/solved/failed) kept out of the benchmark schema
- `scripts/test_scaffold_verbatim_harness.js`: regression tests for the harness generator (compilation, verified-rule presence, invalid-combination rejection)
- 7 misdiagnosis regression benchmark cases (M1-M7) with matching pattern-index signals; router now recognizes timer-self-check, host-eval leak, fake-data maze, and class-leak scenarios
## [0.1.25] - 2026-09-06

### Added

- two sanitized case walkthroughs in `examples/`: combinatorial environment gates (why hand-porting fails, verbatim execution + calibration oracles) and timer self-checks / time-derived keys / the 200-fake-data maze (why stable totals are the only honest success metric)
- the verbatim-harness generator is now distributable: auth-cookie names are parameterized instead of hard-coded

## [0.1.24] - 2026-09-06

### Added

- `run_playbook.js` now emits `misdiagnosis-checklist.json` and an Operator Review quick-check section re-surfacing the seven recurring wrong attributions from `references/misdiagnosis-patterns.md`
- `references/env-rebuild-recipes.md` cards are now directly actionable: the private workspace also ships a parameterized verbatim-execution harness generator built on the same rules

### Changed

- `SKILL.md`: new Harness Scaffolding section documenting the generator and its verified rules; Playbook Runner section lists the misdiagnosis checklist artifact

## [0.1.23] - 2026-09-06

### Added

- `references/env-rebuild-recipes.md`: 10 verbatim-execution recipe cards distilled from practice-set topics 22-29/24 (native-masked classes, class-tag probes, no-host-builtins rule, real timers, getter-only redefinition, fresh-context-per-page, inline proxy, calibration oracles)
- `references/misdiagnosis-patterns.md`: 7 recurring wrong attributions with decoy symptom, fast disproof test, and real cause (time-derived data mistaken for env gates, 200-with-fake-data mazes, timer-driven self-checks, host-eval scope leaks, class-source leakage, random-IV vs gate classification)
- `references/toolchain-bootstrap.md`: dependency health, harness conventions (exit/explicit timers/memory), and offline fallbacks in one page
- `references/standard-workflow-cookbook.md`: the full command-by-command standard workflow, loadable per stage

### Changed

- `SKILL.md`: added a Start Here quick-start block and a Default Sandbox Context statement; Standard Workflow slimmed into a stage-goal table pointing at the cookbook (565 -> 458 lines); Task Router now routes "environment rebuild" and "rebuild almost-works" cases to the new references

## [0.1.22] - 2026-09-06

### Added

- extend `env-gated-crypto-differential` with step 5e: time-derived key strings are not environment gates (re-diff captures minutes apart; frozen-clock sandboxes always differ from live browsers), and TTL/fingerprint mazes answer 200 with random plausible data — only a cross-run stable total is an honest success metric (verified against practice-set topic 24)

## [0.1.21] - 2026-09-06

### Added

- extend `env_gated_crypto_differential` pattern index with timer-self-check and indirect-eval signals plus verbatim-execution avoid rules (verified against public practice-set topics 26/28/29)

## [0.1.20] - 2026-09-06

### Added

- extend `env-gated-crypto-differential` playbook with three verified lessons: combinatorial gates (verbatim vm execution + in-process IV calibration instead of hand-transcribed constants), timer-driven environment self-checks inside `setTimeout`/`setInterval` callbacks (real timers required or later tokens silently go empty; deliberate probe throws escape via Promise microtasks), and never passing host `eval`/builtins into `vm.createContext` when the target uses indirect eval

## [0.1.19] - 2026-09-04

### Added

- new playbook `short-ttl-inline-proxy`: TTL boundary probing (immediate vs delayed replay) and zero-loss delivery by proxying the real request from inside the token-computing harness interceptor, with per-page user-agent switching in the proxy

## [0.1.18] - 2026-09-04

### Added

- new playbook `jsdom-native-vm-differential`: running VM-protected pages natively in a DOM implementation, multi-level runtime diffs (instructions, decoded constants), randomness-versus-gate classification, and the Function-shim / getter-only-global pitfalls

## [0.1.17] - 2026-09-04

### Added

- new playbook `browser-assisted-token-replay`: replay-tolerance probe as the delivery-mode decision gate for stateful VM signers, ordered browser capture across the page set, protocol-level user-agent override for last-page gates

## [0.1.16] - 2026-09-04

### Added

- env-gated crypto playbook: global-class `instanceof` probes and page-DOM signer inputs as known gates, plus a minimal-alignment order (satisfy the gate, then source-level literal patch, then global redefinition)
- anti-analysis classes for Function-constructor escapes (guarded realm-faithful shim) and class-probe alignment

## [0.1.15] - 2026-09-04

### Added

- new playbook `env-gated-crypto-differential`: bisecting crypto primitives that take different branches in real browsers versus local sandboxes (source -> tables -> behavior -> encoder inputs), with the known environment gates list
- hardened-sandbox checklist for replaying browserified bundles in `local-rebuild` guidance
- anti-analysis pattern entries for global-configurability probes (`delete window`) and environment-keyed crypto constants

## 2026-04-30 (0.1.14)

### Added

- `references/scripts-catalog.md` and `references/scripts-catalog.json` as generated indexes for the private script directory, including public-export status and stage grouping
- a manifest-driven public export contract so the published bundle is copied from one explicit allowlist instead of a hard-coded mix of file and directory rules

### Changed

- playbook routing snippets in README, AGENTS, AI usage, SKILL, and repo-map now derive from one shared route configuration instead of being hand-maintained in multiple files
- public release checks now scan the full public repository tree and include broader generic secret markers
- bumped public repository version from `0.1.13` to `0.1.14`

## 2026-04-30 (0.1.13)

### Added

- `playbooks/decoy-page-request-hidden-token-gate.md` as a dedicated operator guide for targets where the page advertises one simple request or helper field, but real acceptance depends on a second hidden token contract
- generic family-library guidance for decoy request surfaces, host-object mutation checks, and hidden token gates that only appear after the easiest route

### Changed

- README, AGENTS, AI usage, SKILL, and repo-map now route decoy-request hidden-token targets into a dedicated playbook instead of collapsing them into generic VM or transport work
- bumped public repository version from `0.1.12` to `0.1.13`

## 2026-04-28 (0.1.12)

### Added

- `playbooks/same-page-prior-round-signer-replay.md` as a dedicated operator guide for targets where round one is reproducible but later rounds require prior-round replay inside the same page-state timeline
- expanded generic family-library guidance for host-object drift inside minimal local JS helpers, including destructive-looking dynamic global assignments
- generic family-library guidance for stateful signers that only regain parity after replaying earlier rounds in order

### Changed

- README now calls out stateful same-page multi-round signers as a first-class reverse pattern and links the new playbook in the reading order
- the fresh-reload step-key ladder playbook now explicitly tells operators to test prior-round replay and browser-like interception of destructive dynamic global assignments before rewriting downstream crypto
- evidence rules now explicitly require retiring disproved theories and preserving browser-known parity pairs plus replay-negative evidence
- bumped public repository version from `0.1.11` to `0.1.12`

## 2026-03-26 (0.1.11)

### Added

- `playbooks/patched-runtime-digest-branch.md` for targets where a familiar digest helper name such as `sm3Digest` or `md5` actually resolves to a browser-specific patched runtime branch instead of a standard library primitive
- generic family-library guidance for proving browser-known digest input/output pairs, isolating patch points such as IV or round constants, and promoting a minimal local JS helper instead of full-page emulation

### Changed

- README, AGENTS, AI usage, SKILL, and repo-map now route patched-runtime digest targets into a dedicated playbook instead of collapsing them into generic signer or transport failures
- bumped public repository version from `0.1.10` to `0.1.11`

## 2026-03-26 (0.1.10)

### Added

- `playbooks/grid-challenge-template-matching.md` for fixed small-grid click challenges where target glyphs or symbols must be mapped onto cells before submission
- generic family-library guidance for grid-based challenge matching instead of collapsing these targets into generic signer or OCR work

### Changed

- README, AGENTS, AI usage, SKILL, and repo-map now route fixed-grid challenge targets into a dedicated template-matching playbook
- bumped public repository version from `0.1.9` to `0.1.10`

## 2026-03-26 (0.1.9)

### Added

- `playbooks/server-time-gated-wasm-signer.md` for targets where one server-issued time value gates a wasm or module-backed signer
- `playbooks/runtime-bundle-signer-extraction.md` for extracting one minimal runtime helper from a large bundle instead of emulating the full page
- `playbooks/transport-profile-ladder.md` for targets where acceptance diverges by HTTP client profile or protocol stack
- `playbooks/lenient-verify-data-gate.md` for challenge chains where verify responses are noisy but the downstream data endpoint is the real acceptance oracle
- generic family-library guidance for server-time-gated wasm signers, runtime bundle signer extraction, transport-profile-gated direct fetches, and lenient verify/data split targets

### Changed

- README, AGENTS, AI usage, SKILL, and repo-map now route these four newer reverse patterns into dedicated playbooks instead of collapsing them into generic signer or transport failures
- bumped public repository version from `0.1.8` to `0.1.9`

## 2026-03-25 (0.1.8)

### Added

- `playbooks/iterative-script-warmup-same-endpoint.md` as a dedicated operator guide for targets where one stable endpoint returns script first and real data only after replaying the same path with one newly emitted cookie or field
- generic family-library guidance for same-endpoint iterative warmup chains that would otherwise be mistaken for stale or missing second endpoints

### Changed

- README, AGENTS, AI usage, and repo-map now route same-endpoint script-then-data targets into a dedicated iterative warmup playbook instead of collapsing them into generic cookie or transport failures
- bumped public repository version from `0.1.7` to `0.1.8`

## 2026-03-25 (0.1.7)

### Added

- `playbooks/embedded-runtime-font-mapping.md` as a dedicated operator guide for accepted-response targets that encode values through one page-local embedded font
- generic family-library guidance for response-decoding targets that require per-page glyph enumeration and one-to-one glyph mapping

### Changed

- README, AGENTS, AI usage, SKILL, and repo-map now route accepted-response font-encoding targets into a dedicated embedded-font decode path instead of collapsing them into generic OCR or signer work
- bumped public repository version from `0.1.6` to `0.1.7`

## 2026-03-23 (0.1.6)

### Added

- `playbooks/bootstrap-digest-ladder.md` as a dedicated operator guide for bootstrap-time multi-digest token chains that later emit a wrapped cookie
- generic family-library guidance for replay targets that depend on transitional digest writes plus one wrapped-cookie contract

### Changed

- README, AGENTS, AI usage, SKILL, repo-map, and release checks now treat staged bootstrap token chains as a first-class reverse family instead of collapsing them into generic signer failures
- bumped public repository version from `0.1.5` to `0.1.6`

## 2026-03-20 (0.1.5)

### Added

- `playbooks/accepted-response-hidden-dom.md` as a dedicated operator guide for accepted-response targets that still hide, filter, or reorder browser-visible DOM

### Changed

- README, AGENTS, AI usage, SKILL, and repo-map entries now route accepted-response presentation-decode work into the dedicated playbook
- bumped public repository version from `0.1.4` to `0.1.5`

## 2026-03-20 (0.1.4)

### Added

- repo-map routing entry for accepted-response targets that still require DOM-side hidden-layer or reorder analysis

### Changed

- AGENTS and SKILL guidance now treat post-response DOM suppression and reflow as a first-class reverse task instead of a transport failure
- bumped public repository version from `0.1.3` to `0.1.4`

## 2026-03-20 (0.1.3)

### Added

- family-library guidance for response-presentation targets that suppress one DOM layer from response metadata and require post-hide reflow-aware ordering

### Changed

- README now calls out DOM-side filtering, style-noise suppression, and visible-layer reordering as first-class `js-reverse-ops` strengths
- AI usage notes now tell operators to inspect post-response render code before escalating accepted-response targets into fake signer theories
- bumped public repository version from `0.1.2` to `0.1.3`

## 2026-03-20 (0.1.2)

### Added

- family-library guidance for cookie-writer helper responses that arrive as raw JavaScript snippets instead of JSON seeds

### Changed

- clarify that cookie-family captures should preserve first-replay rejection evidence when runtime prerequisites are still incomplete
- bumped public repository version from `0.1.1` to `0.1.2`

## 2026-03-20 (0.1.1)

### Added

- generic family-library entries for direct question fetch targets
- generic family-library entries for page-derived lightweight query signers
- generic family-library entries for response-presentation-noise targets

### Changed

- bumped public repository version from `0.1.0` to `0.1.1`

## 2026-03-20

### Added

- `VERSION` 文件，明确公开版版本号
- `RELEASE.md`，明确版本策略和 tag 流程
- 初始公开仓库导出链路
- 中文 README 与项目摘要
- `CONTRIBUTING.md`
- `SECURITY.md`
- `LICENSE`
- `CHECKLIST.md`
- `scripts/check_public_release.sh`
- GitHub Actions 公开版检查工作流
- issue / PR 模板
- README 常用脚本索引与命令速查
- README 新手路径与推荐阅读顺序

### Changed

- 公开导出器改为保留 `.git`
- 文档去站点化，避免公开仓库暴露私有测试语料
