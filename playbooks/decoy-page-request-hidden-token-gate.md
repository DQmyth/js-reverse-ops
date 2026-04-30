# Decoy Page Request, Hidden Token Gate

Use this playbook when the page exposes one simple request path or one obvious helper field, but live acceptance actually depends on a second hidden token contract.

## Reach For This Playbook When

- page one or the first request works with a plain visible contract, but later pages fail with one token- or signature-shaped error
- inline page code appears to request one simple endpoint such as `?page=n`, yet browser-side success still implies extra hidden state
- the page exposes one tempting field or helper endpoint that looks signer-related, but replay with that field alone never regains parity
- older writeups mention one path or one token shape, but the current live path has changed while some deeper acceptance rule still survives

## Core Idea

Treat the visible page request as one observation, not as proof that the visible contract is complete.

The common live shape is:

1. the page renders or even loads page one with a plain direct fetch
2. later pages or later rounds fail with a gate such as `token failed`
3. the page or VM layer leaves behind misleading hints such as one stored field, one dummy helper request, or one intercepted `ajax` call
4. the real acceptance contract lives in one hidden query field, header, cookie, or encrypted token that only matters once the target leaves the easiest route

## Common Failure Modes

- over-trusting the first visible XHR and assuming the interface has no hidden token at all
- promoting one decoy field from inline page code into the replay contract without proving it changes server behavior
- trying to fully devirtualize one VM before checking whether a simpler legacy or side-channel token path still works
- assuming an old writeup is fully stale instead of testing whether the token algorithm survived under a new route shape

## Operating Sequence

1. freeze one accepted easy-path sample and one rejected gated-path sample
2. compare what changes between them before widening into full VM recovery:
   - page number or round number
   - user-agent or client profile
   - query keys
   - cookies
   - hidden fields in paused locals or wrapped host methods
3. inspect host-object mutations before chasing raw VM semantics:
   - `XMLHttpRequest.prototype.open`
   - `XMLHttpRequest.prototype.send`
   - `XMLHttpRequest.prototype.setRequestHeader`
   - `fetch`
   - `Date.now`
4. classify any exposed helper field as one of:
   - real acceptance input
   - bootstrap-only side effect
   - pure decoy
5. if a legacy writeup exists, re-test only the smallest durable ideas:
   - token field names
   - crypto family
   - time source
   - path migration
6. promote the replay contract only after one hidden token variable is proven to flip the server from rejected to accepted

## What To Preserve

- one accepted sample from the easy path
- one rejected sample from the gated path
- the exact server error that marks the hidden gate
- the smallest hidden token contract that restores acceptance
- any extra non-crypto constraint such as page-specific user-agent or client-profile drift

## Modeling Guidance

Do not collapse this family into generic "VM signer" work too early.

First prove whether the target is really asking for:

- one hidden token added onto an otherwise plain direct fetch
- one decoy page helper plus a separate real data gate
- or a true full-runtime signer that cannot be separated from the page

Many targets that look VM-heavy at first only need a much smaller replay contract once the hidden gate is isolated.

## Verification Standard

Promote a replay path only after all of the following are true:

- the visible direct request has been shown insufficient on the gated path
- the decoy field or helper theory has been retired or proven
- the hidden token location and construction rule are verified
- any additional gating constraint such as user-agent or transport profile is preserved
- the rebuilt request regains accepted data outside the browser
