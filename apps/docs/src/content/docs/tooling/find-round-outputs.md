---
title: Find round outputs
description: Locate reports, reviews, transcripts, rulings, logs and retained round data
---

Every planning and implementation round writes its files beside the active plans in the plan
checkout's `active/` folder.

## How are round files named?

The common form is:

```text
<target>-<round>-<order>-<kind>.<tag>.<ext>
```

The target ends in `-plan-audit` for a planning round and `-impl-audit-<a>..<b>` for an
implementation range. A one-step range repeats its endpoint. Implementation worker logs use
`-impl-<step>`, so a sorted file list shows a plan's worker logs, implementation audits and plan
audits as three separate groups. Commit targets begin with `commit-`. The round number is not
a commit number. The three-letter tag identifies the assistant, model tier and effort that wrote
the file.

## Which file should I open?

| File | What it contains |
| --- | --- |
| `-0-claim.md` | Empty reservation for the round number |
| `-1-round.<tag>.md` | Complete audit, vet, rebuttal and fix conversation, including ruling replies |
| `-1-round.<tag>.log` | Tool calls and phase prompts, with supplied instruction contents omitted |
| `-2-audit.<tag>.md` | Audit report and its target, judged repositories and audited heads |
| `-3-vet.<tag>.md` | The other assistant's verdicts on every finding |
| `-4-rebut.<tag>.md` | The auditor's answers to revised, dropped and referred findings |
| `-7-ruling.<tag>.md` | The fix's current open decision |
| `-9-watch.<tag>.md` | The episode's admitted green, amber or red trajectory judgement |
| `<stem>-plan-rounds.json` | Machine-owned retained data for planning rounds |
| `<stem>-impl-rounds.json` | Machine-owned retained data for implementation rounds |
| `<commit-label>-rounds.json` | Machine-owned retained data for one commit series |
| `<target>-queue.md` | Remaining manually requested auditors, editable between rounds |

The audit report opening is the quickest authority for what was judged. It names the resolved
target, repository set and the heads captured when the audit began.

## Where are implementation worker files?

Implementation workers use two simpler names in the same folder:

```text
<stem>-impl-<step>-implement.log
<stem>-impl-<step>-implement-ruling.<tag>.md
```

The log keeps the first turn and every recovery turn. The ruling exists only when the worker needed
the user's decision.

## What remains after a round finishes?

A finished fix removes only its audit, vet and rebuttal twins. Claims, transcripts, logs, rulings,
watches and round data remain. A direct clean automatic audit retains its report because no fix
phase consumes it. The sequence queue disappears when the sequence ends.

At loop-close, the plan and its plan-scoped round data move into the plan's archive folder. Close
deletes the plan's handoffs, claims, audit reports, vet and rebuttal twins, phase-change markers and
yield reports. Round transcripts and logs, implementation logs, briefs, rulings, watches and the
close log stay in `active/`. Commit series data stays there beside its round files until those files
are removed by hand. The JSON files are machine artifacts and must never be edited manually.

## What is separate from the round files?

`<stem>-handoff.<sha>.md` is a short-lived brief for the next round, keyed to the six-character
commit suffix. It is not an ordered phase file. The next eligible round consumes it, while a clean
audit leaves it untouched.

## What owns this page?

`tools/audit-round/CLAUDE.md` sections **Round files** and **Report lifecycle** own this page; the
plan repository's `CLAUDE.md` owns handoffs and archival.
