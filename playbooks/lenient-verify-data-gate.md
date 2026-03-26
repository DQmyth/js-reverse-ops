# Lenient Verify, Strict Data Gate

Use this playbook when a challenge or verification endpoint reports partial failure or noisy status, but the downstream data endpoint is the real acceptance oracle.

## Trigger Signals

- one challenge endpoint returns `ok:false`, partial picks, or noisy verification text
- the next data endpoint still returns accepted data after the same attempt
- the target is a captcha, click challenge, or verify-then-fetch chain
- the verification response looks unreliable or lagging compared with the data response

## Common Failure Modes

- treating verify `ok:false` as proof that the attempt failed
- stopping at the challenge response instead of checking the data endpoint
- promoting the verify response into the final contract without proving the gate semantics

## Operating Sequence

1. preserve the exact challenge response, verify response, and data response from the same attempt
2. classify whether the verify endpoint is advisory, lagging, or only partially authoritative
3. make the data endpoint the final acceptance oracle unless proven otherwise
4. keep the verify payload for debugging, but do not over-trust it in automation
5. validate several attempts so the lenient gate is proven, not inferred from one lucky sample

## Artifacts To Preserve

- one challenge payload
- one verify payload
- one accepted data payload from the same attempt
- solver details that explain which clicks or inputs were submitted
