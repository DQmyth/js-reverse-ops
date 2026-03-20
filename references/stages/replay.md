# Replay Stage

Use this stage when the target flow must be rebuilt, scaffolded, or validated outside the original browser.

## Goals

- produce replay code or RPC/proxy handoff assets
- validate replay against runtime truth
- track replay maturity without overstating success

## Preferred Tools

- `replay_scaffold.py`
- external replay scaffold and validation scripts
- runtime/replay compare artifacts
- replay verification reconciler

## Exit Criteria

- replay scaffold exists and is tied to current runtime truth
- validation artifacts are preserved
- maturity is correctly recorded as scaffolded, attempted, or verified
