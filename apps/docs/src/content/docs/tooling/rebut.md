---
title: /rebut
description: Let an audit's original writer answer the other assistant's vet verdicts
---

Use `/rebut` to let the audit's original writer answer revisions, drops and ruling items from the
other assistant's vet.

## How do I run it?

Run the command in Claude chat from the Repo Edu or plan checkout. Use `$rebut` for the same command
in Codex.

```text
/rebut                       answer the newest vet of this assistant's newest report
/rebut <report-file>         answer the newest vet of one named report
```

Example:

```text
/rebut tooling-guide-usability-impl-audit-03..05-01-2-audit.oth.md
```

The command has no flags. Run it in the assistant that wrote the audit report, not the assistant
that wrote the vet.

## When do I use it?

Use `/rebut` when the vet revised or dropped a finding, or said that a finding needs your ruling.
Skip it when every finding was accepted. The rebuttal is the auditor's evidence-based answer, not a
second audit.

## What does it read?

The rebuttal reads the audit report and that round's newest vet twin. It carries accepted findings
forward without rereading them. For every other verdict it reads the current source that decides
the disagreement, including the plan, code, governing boundary or retained record where needed.

Each answer is Agree, Contest or For user's ruling. The rebuttal answers only revised, dropped and
referred findings, in report order.

## Where does it stop and what do I type?

1. **No matching report or vet is found.** Run `/rebut <report-file>` with the audit report. If the
   report has not been vetted, run the vet first in the other assistant.
2. **The report belongs to the other assistant.** Return to the auditor that wrote it and run the
   matching `/rebut` or `$rebut` command there.
3. **The answers are complete.** Run `/fix <report-file>` or `$fix <report-file>`. The fix
   reconciles both assistants' views and asks you only about a decision that remains genuinely
   open.

## What does it leave behind?

The command writes its answers to chat and to the round's `-4-rebut.<tag>.md` twin under the plan
checkout's `active/` folder. It makes no source edit, runs no formatter and creates no commit.

## What owns this page?

`../plan/.agents/skills/rebut/references/workflow.md` and
`.agents/skills/rebut/references/workflow.md` own this page; the shared round protocol owns answers.
