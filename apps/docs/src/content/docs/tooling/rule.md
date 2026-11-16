---
title: /rule
description: Name the winner of each contest or split on a C or D finding
---

`/rule` names the winner of each contest or split on a C or D finding of an audit round, after the
rebuttal and before the fix. A contest or split on an A or B finding stays yours.

| Fact | Detail |
| --- | --- |
| Runs in | Claude chat in the Repo Edu or plan checkout, in a session that wrote none of the round's reports; `$rule` is the Codex counterpart |
| Owners | `../plan/home/claude/commands/rule.md` and `../plan/home/agents/skills/rule/SKILL.md` launch it; `.agents/skills/rule/references/workflow.md` and `../plan/.agents/skills/rule/references/workflow.md` own the ruler; `.agents/references/round-protocol.md` owns its duties |

## Usage

```text
/rule                        judge the newest audit report's round
/rule <report-file>          judge one named audit report's round
```

```text
/rule tooling-guide-usability-impl-audit-03..05-01-2-audit.oth.md
```

The command has no flags. Run it only when the rebuttal report leaves a contest or split on a C or D
finding. The runner runs it by itself in an automatic round, on the `ruler` selection of the work
class's audit level in `tools/audit-round/settings.json`. Run it by hand when a failed rebuttal or
ruler prints it as a step. The whole session uses the `/simple` wording requirement.

## What it shows you

The ruler reads the audit report, every vet report and the rebuttal report. A dispute goes to it
when the rebuttal contests a vetter's verdict, or two vetters give different verdicts, on a finding
whose highest grade from the audit report or any vetter is C or D. For each such finding it lists
the points the sides differ on and opens every source behind them itself. It then names one winner
with a one-line reason:

1. **`report`.** The audit report was right.
2. **Vetter tags.** Those vetters' verdicts were right.
3. **`neither`.** No side was right, or a real choice remains. A real choice stays yours: the fix
   stops for your ruling.

The ruler is read-only. It edits no source, runs no formatter and lands no commit.

## Early stops

1. **No matching audit report or rebuttal report is found.** Rerun with the audit report name. Run
   the rebuttal first when the round has none.
2. **A source cannot be opened.** In an automatic round the runner sends the ruler back once to open
   each source its report names but its session did not open. A second miss fails the round.

## Afterwards

The winners appear in chat and in the round's `-6-rule.<tag>.md` ruler report under
`../plan-evidence/active/`. Run `/fix <report-file>` or `$fix <report-file>` next. The fix applies
each winner without judging it again.
