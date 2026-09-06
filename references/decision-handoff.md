# Decision Handoff Protocol

How to move between stages, sessions, or agents **without re-injecting the
whole case context**. Borrowed from community RE agent workflows
(`decision_delta` + `carry_forward_refs`) and adapted to this skill's
artifact layout.

## The rule

Authoritative state lives in files (bundle, `evidence.json`, worklog,
captures). Conversation only carries the **delta**:

1. At the end of a stage or working session, write only what **changes a
   later decision** — new verified facts, reversals, open blockers — into
   the bundle (worklog / NEXT.md / evidence).
2. Everything unchanged is a `carry_forward_ref`: a pointer to the existing
   file, not a re-serialization. Consumers read refs on demand.
3. A transition note is two fields:
   - `decision_delta`: the list of decisions/changes that alter downstream
     actions (empty is valid)
   - `carry_forward_refs`: paths to the authoritative files
4. Stop and ask the operator **only** when two or more evidence-supported
   branches lead to different next actions. If the evidence uniquely
   determines the move, proceed.

## Example

After triage of a challenge bundle, when the only legal next step is static
recovery:

```json
{
  "decision_delta": ["stage: locate -> recover", "family: remote-corejs monolith"],
  "carry_forward_refs": ["bundle/evidence.json", "bundle/captures/boot.flow.txt"]
}
```

Anti-pattern: pasting the full request capture, the token analysis, and the
playbook summary into the transition note. That is what the refs are for.

## User-instruction feasibility gate

Obey the user's **goal**, not necessarily their **step order**. Before
skipping a step the user asked to skip, check whether a known blocking
precondition exists:

| Situation | Required behavior |
|---|---|
| Requested step X can produce **valid** evidence in the current state | do X, record evidence |
| X has a known blocking precondition (e.g. "read the unpacked string table" while the bundle is still packed) | state the blocker in one line, offer the recommended order (unpack first, or a dynamic bypass), ask the user to choose |
| User **insists** on X despite the blocker | do X, record evidence with an explicit quality label (`unreadable`, `packed`, `expired`, `fake-data`), and never draw conclusions from it that the label forbids |
| User accepts the recommended order | do the precondition first, then X automatically; never present the precondition as having "completed X" |

Typical real case: "replay it with the frozen clock you already have" when
the frozen clock is two days old — the token TTL gate applies, so say so in
one line and either refresh the clock or record the result as
`quality=expired` (which is exactly how the 200-fake-data maze in
misdiagnosis M2 was finally understood).

## Where this applies in this skill

- `run_playbook.js` bundles: the `operator-review.md` / `NEXT.md` pair is the
  handoff surface.
- Stage transitions: use the exit conditions in
  [stage-gates.md](stage-gates.md) as the checklist for what the
  `decision_delta` must contain.
- Session continuation: [workspace-continuation.md](workspace-continuation.md)
  covers the physical layout; this file covers the information contract.
