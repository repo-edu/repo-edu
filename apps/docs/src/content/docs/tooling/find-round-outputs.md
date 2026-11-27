---
title: Find round outputs
description: Locate audit, vet, rebuttal and ruler reports, transcripts, rulings, logs and retained round data
---

Every planning and implementation round writes its files in `../plan-evidence/active/`, the
`active/` folder of the private evidence checkout beside the plan and Repo Edu checkouts. The plans
themselves stay in the plan checkout's `active/` folder. The files are named so a sorted file list
shows each plan's rounds in order.

| Fact | Detail |
| --- | --- |
| Owners | `tools/audit-round/references/targets-and-files.md` sections **Round files** and **Report lifecycle**. `.agents/references/round-protocol.md` section **Handoff** owns handoffs. The plan repository's `CLAUDE.md` owns archival |

## Naming

The common form is:

```text
<target>-<round>-<order>-<kind>.<tag>.<ext>
```

The target ends in `-plan-audit` for a planning round and `-impl-audit-<a>..<b>` for an
implementation range. A one-step range repeats its endpoint. Implementation worker files use
`-impl-<step>`, so a sorted file list shows a plan's worker files, implementation audits and plan
audits as three separate groups. Commit targets begin with `commit-`, so every commit audit sorts
together. The same label opens every commit the audit lands, as
`commit-804833/commit-audit`, so `git log --oneline` shows its records beside the audited commits. A
clean commit audit lands one empty record with the label, so the log shows that the audit ran.

The terminal and log show the round title at the start of the run and again above each later
phase's start line. The title includes the file round number. For a planning round it also counts
from the plan's latest settle or reopen marker, as `(detailing round 3, file round 6)`.
The order number places the phases in reading order, and a skipped phase leaves a gap. The
three-letter tag identifies the assistant, model tier and effort that wrote the file. The claim, the
settle and reopen markers, the handoff and the queue carry no tag.

## Which file to open

| File | What it contains |
| --- | --- |
| `-0-claim.md` | Empty reservation for the round number |
| `-0-settle.md`, `-0-reopen.md` | Empty marker files showing where the plan's shape closed or reopened among its rounds |
| `-1-round.<tag>.md` | Complete audit, vet, rebuttal, ruler and fix conversation, including ruling replies. A saved watch document appears under `## Watch`. |
| `-1-round.<tag>.log` | Tool calls, phase results as JSON and prompts with supplied instruction contents omitted |
| `-2-audit.<tag>.md` | Audit report and its target, judged repositories and audited heads |
| `-3-vet.<tag>.md` | Vet report: one vetter's verdicts on every finding; a round keeps one per vetter of its panel |
| `-4-rebut.<tag>.md` | Rebuttal report: the rebuttal's answers to each vetter's revisions, drops and referrals, each naming its vetter |
| `-6-rule.<tag>.md` | Ruler report: the ruler's winner and reason for each contest or split on a C or D finding, and the sources it opened |
| `-7-ruling.<tag>.md` | The fix's current open decision |
| `-9-watch.<tag>.md` | The episode's admitted green, amber or red trajectory judgement |
| `<stem>-plan-rounds.json` | Machine-owned retained data for planning rounds |
| `<stem>-impl-rounds.json` | Machine-owned retained data for implementation rounds |
| `<commit-label>-rounds.json` | Machine-owned retained data for one commit series |
| `<target>-queue.md` | Remaining manually requested auditors, editable between rounds |

The audit report opening is the quickest authority for what was judged. It names the resolved
target, repository set and the heads captured when the audit began.

The round-data files record each round's scope, settings, phases with their reported models, landed
commits, findings, status, series answer and the resolved auditor list for new automatic rounds.
[`pnpm audit-round models`](/repo-edu/tooling/models/)
reads them, and [`pnpm audit-round disprove`](/repo-edu/tooling/disprove/) adds your later rulings
on audit findings or vet verdicts to them. They are machine artifacts and must never be edited by
hand.

## Implementation worker files

Each implementation worker writes its files in the same folder.

```text
<stem>-impl-<step>-implement.md
<stem>-impl-<step>-implement.log
<stem>-impl-<step>-implement-ruling.<tag>.md
```

Open the transcript for the worker's commentary and final summary. Open the log for prompts,
tool calls and the result as JSON. A recovery appends to both files. The ruling file holds the
worker's question when it needs your decision.

## What remains

Nothing deletes a round's files. Claims, markers, transcripts, logs, reports, rulings, watches,
handoffs and round data stay in `../plan-evidence/active/` after a fix, a ruling or a clean audit.
A manual series' queue stays there too.

At loop-close, the plan and its plan-scoped round data move into the plan's archive folder. The
runner then moves every other round file of the plan, the close log included, into
`../plan-evidence/archive/<stem>/`, so `../plan-evidence/active/` lists live work only. Look there
for a closed plan's reports by its stem, whether it shipped or was aborted. Briefs stay beside the
plan.

A commit series has no close. Its files and data stay in `../plan-evidence/active/` while it runs
or waits for you. Once every requested round has run, on a runner stop or an emptied manual queue,
the runner moves them all into `../plan-evidence/commits/<commit-label>/`. A failure, a pending
ruling or the round maximum with another auditor due leaves them in place. Auditing the same commits
again moves the series back first, so it keeps its earlier fixes and continues its round numbers.

## File split outputs

After a [split command](/repo-edu/tooling/split/) returns a result, open
`../plan-evidence/splits/<label>/`. The label begins with `split-` and includes the source file's
name and the first five characters of a hash of its path.

| File | What to open it for |
| --- | --- |
| `<label>-split.log` | The log of split calls on this source file. |
| `<label>-design-<n>.<tag>.md` | The numbered answer. To choose a designer's answer yourself, pass its path to `split run`. |
| `<label>-pick-<n>.<tag>.md` | The answers judged, the picker's reasons and any repairs. Report numbers count separately from answer numbers. |
| `<label>-designs.json` | The writer of each numbered answer and each designer's position and density. |

The next call on the same source brings the files back to `../plan-evidence/active/` before it
starts. If a session fails, its files stay there.

## Commits

The evidence checkout is a private Git repository. Every runner command that may write a round file
commits all of its uncommitted files when it ends, whatever the outcome, unless it refused its
arguments, and a round also commits just before it waits for your ruling. A file you or a hand-run
session writes there is committed by the next such command. Use `git log` in `../plan-evidence/` to
read an earlier version, such as a ruling the same fix later replaced. You push the repository
yourself.

## Handoffs

`<stem>-handoff.<sha>.md` is a short-lived brief for the next round, keyed to the six-character
commit suffix. It is not an ordered phase file. The next eligible round consumes it, while a clean
audit leaves it untouched.
