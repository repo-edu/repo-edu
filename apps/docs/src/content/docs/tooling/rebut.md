---
title: /rebut
description: Let an audit's original writer answer the other assistant's vet verdicts
---

`/rebut` lets the assistant that wrote an audit answer the vet's revisions, drops and ruling items
with evidence, after a vet that did not accept every finding.

| Fact | Detail |
| --- | --- |
| Runs in | Claude chat in the Repo Edu or plan checkout, in the assistant that wrote the audit; `$rebut` is the Codex counterpart |
| Owners | `../plan/home/claude/commands/rebut.md` and `../plan/home/agents/skills/rebut/SKILL.md` launch it; `.agents/skills/rebut/references/workflow.md` and `../plan/.agents/skills/rebut/references/workflow.md` own the rebuttal; `.agents/references/round-protocol.md` owns the answers |

## Usage

```text
/rebut                       answer the newest vet of this assistant's newest report
/rebut <report-file>         answer the newest vet of one named report
```

```text
/rebut tooling-guide-usability-impl-audit-03..05-01-2-audit.oth.md
```

The command has no flags. Skip it when every vet verdict was Accept. The whole session uses the
`/simple` wording requirement.

## What it shows you

The rebuttal reads the report and that round's newest vet twin. Accepted findings carry forward
without a fresh read. For every other verdict it reads the source that decides the disagreement
itself, rather than trusting either quotation: the plan, the code, a boundary or the episode's
commit bodies. It answers only revised, dropped and referred findings, in report order:

1. **Agree** keeps the vet's verdict. Agreement with a revision carries the revised correction in
   full, so the fix has one text to apply.
2. **Contest** quotes the evidence the vet misread and says what the verdict should have been. A
   difference of taste is agreement with a note, not a contest.
3. **For user's ruling** keeps a real choice open and states the auditor's position briefly.

The rebuttal is an answer, not a second audit. It edits no source, runs no formatter and lands no
commit.

## Early stops

1. **No matching report or vet is found.** Rerun with the report name. When the report has no vet
   yet, run the vet first in the other assistant.
2. **The report belongs to the other assistant.** Run `/rebut` or `$rebut` in the assistant that
   wrote it.

## Afterwards

The answers appear in chat and in the round's `-4-rebut.<tag>.md` twin under `../plan/active/`. Run
`/fix <report-file>` or `$fix <report-file>` next. The fix reconciles both views and asks you only
about a decision that stays genuinely open.
