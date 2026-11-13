---
title: pnpm audit-round disprove
description: Record later evidence that disproved an audit finding or vet verdict
---

`pnpm audit-round disprove` records your later ruling that an audit finding or vet verdict was
wrong. [`pnpm audit-round models`](/repo-edu/tooling/models/) then reads the finding in the
direction you chose.

| Fact | Detail |
| --- | --- |
| Runs in | A terminal at the Repo Edu or plan checkout root |
| Owners | `tools/audit-round/CLAUDE.md`, `tools/audit-round/src/command.ts` and `tools/audit-round/src/round-data.ts` |

## Usage

```text
pnpm audit-round disprove <stem> <target> <round> <finding> <reason>  disprove a retained finding
pnpm audit-round disprove <stem> <target> <round> <finding> --vet <reason>
                                                    disprove that finding's vet verdict
pnpm audit-round disprove <stem> <target> --by "<model> <effort>" <reason>
                                                    disprove a finding the round data lacks
pnpm audit-round disprove -h | --help               show the command's help
```

```text
pnpm audit-round disprove example example-plan-audit 2 1 "The cited behaviour was absent."
pnpm audit-round disprove example example-plan-audit 2 1 --vet "The vet dropped a valid finding."
pnpm audit-round disprove example example-plan-audit --by "gpt-5.6-sol high" "The report predates the data."
```

`<target>` is the round-data target exactly as stored: `<stem>-plan-audit` or
`<stem>-impl-audit-<scope>`. Read the round and finding numbers from that plan's round data. The
reason is the rest of the line; quote it so the shell keeps it whole.

## Behaviour

The command finds the plan in `../plan/active/` or, failing that, in the archive, and picks the
planning or implementation round-data file from the target. It starts no assistant and reads no
settings.

1. **The attached finding form** checks that the round and finding exist, then records that the
   finding was wrong. The model read-out stops counting it as kept for its auditor and coder.
2. **The attached `--vet` form** requires a `Revise`, `Drop` or `Needs user's ruling` verdict and
   records that the verdict was wrong. Every table then reads the finding as kept, including the
   coder table for an implementation audit.
3. **One retained ruling per finding** means that either attached form replaces the earlier entry
   for the same round and finding, including an entry in the other direction.
4. **The `--by` form** records the date, full reason and the named model and effort, for a finding
   the round data never held. It creates the round-data file when none exists. Each such ruling
   appends, because two unrecorded findings by one auditor may both be real.

The command never rewrites the old report, commit or finding metadata.

## Output

1. **An active plan.** The entry goes into the gitignored round-data file in `../plan/active/`, and
   the command names the side it recorded:

   1. Without `--vet`, it prints `Recorded the disproved finding in <path>. Loop-close will commit
      it with the archive move.`
   2. With `--vet`, it prints `Recorded the disproved vet verdict in <path>. Loop-close will commit
      it with the archive move.`
2. **An archived plan.** The entry goes into the archived round-data file, which is committed alone
   in the plan repo as `<stem>/disprove: <target> round <n> finding <n>`,
   `<stem>/disprove: <target> round <n> vet finding <n>` or
   `<stem>/disprove: <target> by <model> <effort>`, with the reason as the body. The command prints
   `Committed <sha>: <subject>`.

## Refuses when

The runner prints `audit-round: <reason>` and records nothing. Item 3 is a refusal from the argument
parser, which prints its own `error:` line without that prefix. An argument refusal exits with
status 2 and any other with status 1.

1. **The stem is a path, or the target does not start with `<stem>-`.**
2. **The reason is empty, or the round or finding is not a positive number.**
3. **`--vet` appears with `--by`, or the attached finding has no non-`Accept` vet verdict.**
4. **The `--by` value is not `"<model> <effort>"`** with effort `low`, `medium`, `high` or `xhigh`.
5. **No active or archived plan has the stem**, or more than one archived plan does.
6. **The target is neither the plan audit nor a stored implementation-audit target.**
7. **The attached finding does not resolve.** `No round data exists at <path>.`,
   `No <target> round <n> exists in <path>.` or `No finding <n> exists in <target> round <n>.` Read
   the numbers from the round data and run the command again, or use `--by`.
