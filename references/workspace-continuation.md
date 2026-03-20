# Workspace Continuation

Long reverse tasks should not rely on memory alone. Every serious bundle should carry a small continuation surface.

## Required Files

- `NEXT.md`: the next concrete actions
- `WORKLOG.md`: what was tried and when
- `dead-ends.md`: failed or misleading paths
- `anti-detection-profile.md`: the current stealth or patch profile in use

## Rules

- Update `NEXT.md` whenever maturity changes.
- Record dead ends when a helper path, static guess, or bypass attempt fails.
- If anti-analysis symptoms appear, record them in `anti-detection-profile.md` before patching.
- Prefer short factual entries over narrative prose.

## Initialization

Use `scripts/init_bundle_worklog.js --bundle-dir <dir>` to create the continuation files for a bundle.

## Re Loop

Use `node skills/js-reverse-ops/scripts/re_loop_bundle.js --bundle-dir <dir>` to refresh `NEXT.md` from current maturity, claims, and risks instead of manually rewriting it every time.
