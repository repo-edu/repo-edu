---
title: /rebut
description: Let the assistant that wrote an audit answer every vetter's verdicts
---

`/rebut` lets the assistant that wrote an audit answer the vetters' revisions, drops and ruling
items with evidence, after any vetter that did not accept every finding.

| Fact | Detail |
| --- | --- |
| Runs in | Claude chat in the Repo Edu or plan checkout, in the assistant that wrote the audit; `$rebut` is the Codex counterpart |
| Owners | `../plan/home/claude/commands/rebut.md` and `../plan/home/agents/skills/rebut/SKILL.md` launch it; `.agents/skills/rebut/references/workflow.md` and `../plan/.agents/skills/rebut/references/workflow.md` own the rebuttal; `.agents/references/round-protocol.md` owns the answers |

## Usage

```text
/rebut                       answer every vetter of this assistant's newest audit report
/rebut <report-file>         answer every vetter of one named audit report
```

```text
/rebut tooling-guide-usability-impl-audit-03..05-01-2-audit.oth.md
```

The command has no flags. Skip it when every vetter's verdict was Accept. The whole session uses the
`/simple` wording requirement.

## What it shows you

The rebuttal reads the audit report and every vet report of that round. Accepted findings carry
forward without a fresh read. For every other verdict it reads the source that decides the
disagreement itself, rather than trusting either quotation: the plan, the code, a boundary or the
episode's commit bodies. It answers each vetter's revisions, drops and referrals, in audit report
order, and names on each answer line the vetter it answers by that vetter's tag:

1. **Agree** keeps the vetter's verdict. Agreement with a revision carries the revised correction in
   full, so the fix has one text to apply.
2. **Contest** quotes the evidence the vetter misread and says what the verdict should have been. A
   difference of taste is agreement with a note, not a contest.
3. **For user's ruling** keeps a real choice open and states the audit report's position briefly.

Agreeing with two vetters' different revisions of one finding leaves the choice between them to the
fix. Contesting or referring either one of them sends an A-tier or B-tier finding to you.

The rebuttal is an answer, not a second audit. It edits no source, runs no formatter and lands no
commit.

## Early stops

1. **No matching audit report or vet report is found.** Rerun with the audit report name. When the
   audit report has no vet report yet, run the vet first.
2. **The audit report belongs to another assistant.** Run `/rebut` or `$rebut` in the assistant that
   wrote it.

## Afterwards

The answers appear in chat and in the round's `-4-rebut.<tag>.md` rebuttal report under
`../plan-evidence/active/`. Run `/fix <report-file>` or `$fix <report-file>` next. The fix
reconciles both views and asks you only about a decision that stays genuinely open.
