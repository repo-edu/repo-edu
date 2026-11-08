---
title: /fix
description: Reconcile one audited round and land its authorised corrections and records
---

`/fix` ends an audit round with findings: it reconciles the report, its vet and any rebuttal, then
lands the settled corrections and the round's record.

| Fact | Detail |
| --- | --- |
| Runs in | Claude chat in the Repo Edu or plan checkout; `$fix` is the Codex counterpart |
| Owners | `../plan/home/claude/commands/fix.md` and `../plan/home/agents/skills/fix/SKILL.md` launch it; `.agents/skills/fix/references/workflow.md` and `../plan/.agents/skills/fix/references/workflow.md` own the fix; `.agents/references/round-protocol.md` owns reconciliation |

## Usage

```text
/fix                         fix the newest eligible audit round
/fix <report-file>           fix the round belonging to one named audit report
```

```text
/fix tooling-guide-usability-impl-audit-03..05-01-2-audit.oth.md
```

The command has no flags. Without a report it takes the newest eligible report from either
assistant and that round's newest vet and rebuttal twins. Invoking it grants the settled corrections
and their record commits. The whole session uses the `/simple` wording requirement.

## What it shows you

The fix reads the report and every twin, checks for head drift and reads each file a correction will
change. It then shows one outcome per finding:

1. **Agreed.** An accepted finding, or a revision or drop the auditor agreed to, stands as agreed.
2. **Decided.** For a contested verdict the fix reads the evidence and decides, with its reason.
3. **Open.** A real choice between options with different costs, or a contest the evidence leaves
   unclear, goes to you.

A choice is not open in three cases:

1. One option is at least as good as every other on every cost.
2. The finding is rare, so the option with the least upkeep wins.
3. The costlier option only guards against a mistake no round has found, so the option with the
   least upkeep wins.

Planning corrections change only the plan repo. An
implementation round may change Repo Edu, the plan repo or both, as the report's judged repos and
finding locations allow.

## Your answers

1. **Nothing is open.** You type nothing. The fix applies every outcome, runs the checks for what it
   changed and lands the record.
2. **Go.** A go on the presented outcome accepts it as shown, and the fix applies it.
3. **A reservation on one item.** The fix reads the evidence for that item again and answers before
   applying anything.
4. **A reply to an open choice.** In a hand-run chat, reply directly. In an automatic run, type the
   reply in the runner and submit it with a blank line; see
   [Answer a ruling](/repo-edu/tooling/answer-ruling/). You may ask a question first. A choice that
   stays open produces a revised ruling.

## Early stops

1. **An input is missing or ambiguous.** Rerun with the report name. Run a missing vet or rebuttal
   first when the round needs it.
2. **A required edit, check or commit fails.** Correct the named problem, then run the recovery
   command the runner printed, if any. The retained session continues the same fix; see
   [Recover a run](/repo-edu/tooling/recover-run/).

## Afterwards

The accepted changes and their record commits have landed, together with the handoff for the next
round. A finished round deletes its `-2-audit`, `-3-vet` and `-4-rebut` files. Its claim,
transcript, log, round data, rulings and watch stay until their own owner removes or archives them.
A correction that needs a CI run on pushed commits is applied and the owed run is named in the
handoff.
