---
title: pnpm audit-round disprove
description: Record your later ruling on an audit finding or a vetter's revision
---

`pnpm audit-round disprove` records your later judgement on an audit finding.
The model read-out uses that judgement to count the finding and credit the models that
were right. See [`pnpm audit-round models`](/repo-edu/tooling/models/).

| Fact | Detail |
| --- | --- |
| Runs in | A terminal at the Repo Edu or plan checkout root |
| Owners | `tools/audit-round/CLAUDE.md`, `tools/audit-round/src/command.ts` and `tools/audit-round/src/round-data.ts` |

## Usage

```text
pnpm audit-round disprove <stem> <target> <round> <finding> <reason>  disprove a retained finding
pnpm audit-round disprove <stem> <target> <round> <finding> --vet <reason>
                                                    record that the finding stood as written
pnpm audit-round disprove <stem> <target> <round> <finding> --revision <tag> <reason>
                                                    credit one vetter's revision
pnpm audit-round disprove <stem> <target> --by "<model> <effort>" <reason>
                                                    disprove a finding the round data lacks
pnpm audit-round disprove -h | --help               show the command's help
```

```text
pnpm audit-round disprove example example-plan-audit 2 1 "The cited behaviour was absent."
pnpm audit-round disprove example example-plan-audit 2 1 --vet "A vetter dropped a valid finding."
pnpm audit-round disprove example example-plan-audit 2 1 --revision abx "The smaller correction was enough."
pnpm audit-round disprove example example-plan-audit --by "gpt-5.6-sol high" "The report predates the data."
```

For a recorded finding, copy the target exactly as stored, including any older spelling.
Take the round and finding numbers from the same record. For `--by`, use `<stem>-plan-audit`
or `<stem>-impl-audit-<scope>`. The reason is the rest of the line. Quote it so the shell
keeps it whole.

## Behaviour

The command finds the plan in `../plan/active/` or in the archive. For a recorded finding,
it uses the plan's file that contains the exact target and round number. It starts no
assistant and reads no settings.

1. **The attached finding form** checks that the round and finding exist, then records that the
   finding was wrong. The model read-out stops counting it as kept for its auditor and coder. In
   the vetter-pair and vetters-by-auditor tables it makes the vetters that dropped the finding
   right, and it counts as your ruling in the tables by judge.
2. **The attached `--vet` form** records that the finding stood as written. You can restore a
   finding even if every vetter accepted it. The finding counts as kept at its reported tier.
   The auditor and all vetters who accepted it get credit.
3. **The attached `--revision <tag>` form** records that one vetter's correction was right.
   Use the tag of a vetter who revised this finding. Only that vetter gets credit. The revision
   supplies the final tier. If the vetter kept the reported tier, the finding keeps it too.
4. **One retained ruling per finding** means that any attached form replaces the earlier entry
   for the same target, round and finding.
5. **The `--by` form** records the date, full reason and the named model and effort, for a finding
   the round data never held. It creates the round-data file when none exists. Each such ruling
   appends, because two unrecorded findings by one auditor may both be real.

The command never rewrites the old audit report, commit or finding metadata.

## Output

1. **An active plan.** The entry goes into the round-data file in `../plan-evidence/active/`. The
   command prints
   `Recorded the later ruling in <path>. Loop-close will commit it with the archive move.`

2. **An archived plan.** The entry goes into the archived round-data file, which is committed alone
   in the plan repo as `<stem>/disprove: <target> round <n> finding <n>`,
   `<stem>/disprove: <target> round <n> vet finding <n>` or
   `<stem>/disprove: <target> by <model> <effort>`, with the reason as the body. The command prints
   `Committed <sha>: <subject>`. A winning revision uses the plain `finding <n>` subject.

## Refuses when

An argument error exits with status 2. Conflicting options and an invalid `--by` value get
the parser's `error:` prefix. Other refusals get the runner's `audit-round:` prefix.
A refusal while looking up the plan, finding or revision exits with status 1.

1. **The stem is a path, or the target does not start with `<stem>-`.**
2. **The reason is empty, or the round or finding is not a positive number.**
3. **Two of `--vet`, `--revision` and `--by` appear together.**
4. **The `--by` value is not `"<model> <effort>"`** with effort `low`, `medium`, `high` or `xhigh`.
5. **No active or archived plan has the stem**, or more than one archived plan does.
6. **The `--by` target has an unknown form.** Use one of the two forms under Usage.
7. **The plan has no matching round or the round has no such finding.** Check the stored target
   and numbers. Use `--by` for a finding the round data never held.
8. **The named vetter gave no revision on this finding.** Use the tag from the finding's
   recorded reviews.
