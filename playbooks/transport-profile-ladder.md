# Transport Profile Ladder

Use this playbook when the request contract looks correct, yet acceptance still depends on the HTTP client profile or protocol stack.

## Trigger Signals

- the endpoint is direct and stable, but one client gets `200` while another gets `400` or a gate response
- plain `requests` fails, but `httpx(http2=True)`, `tls_client`, or one browser-backed stack succeeds
- no extra signer or cookie is visible, yet replay still depends on transport choice

## Common Failure Modes

- inventing hidden signer fields before exhausting transport differences
- treating all HTTP clients as equivalent once headers look the same
- ignoring protocol requirements such as `h2` or more browser-like client profiles

## Operating Sequence

1. freeze one accepted request and one rejected request with the same visible contract
2. compare the transport stacks before widening the signer theory
3. escalate through a ladder instead of jumping straight to custom TLS hacks:
   - plain HTTP client
   - HTTP/2-capable client
   - browser-profiled client
4. only promote a transport requirement after proving the lower rung fails and the higher rung succeeds
5. preserve the minimum successful client profile in the final replay contract

## Artifacts To Preserve

- one accepted request sample
- one rejected request sample
- the transport rung that first succeeds
- any protocol requirement such as HTTP/2 or browser-profiled TLS
