---
title: pnpm audit-round disprove
description: Record later evidence that disproved an audit finding
---

Use `pnpm audit-round disprove` to add the user's later ruling that an audit finding was wrong.

## How do I run it?

Run the command in a terminal from the Repo Edu or plan checkout.

```text
pnpm audit-round disprove <stem> <target> <round> <finding> <reason>
pnpm audit-round disprove <stem> <target> --by "<model> <effort>" <reason>
```

Examples:

```text
pnpm audit-round disprove example example-plan 2 1 "The cited behaviour was absent."
pnpm audit-round disprove example example-plan --by "gpt-5.6-sol high" "The report predates the data."
```

Use the target, round and finding numbers stored in the plan's round data. Use `--by` only when the
finding is absent from that data.

## When do I use it?

Use this command when later evidence proves that a retained audit finding should no longer count as
valid model evidence. It does not rewrite the old report, commit or finding metadata.

## What does it read?

The command resolves the named active or archived plan and reads its checked round-data file. The
ordinary form verifies the exact retained finding. The `--by` form verifies the model-and-effort
shape and records an unattached finding under that auditor.

## Where does it stop and what do I type?

1. **The target is valid.** Type nothing. The ruling is recorded immediately.
2. **The plan, target or finding does not resolve.** Correct the command from the stored round data
   and run it again.

## What does it leave behind?

For an active plan, the command updates the ignored round-data file in `../plan/active/`. For an
archived plan, it updates and commits that plan's archived round data alone. Repeating the attached
form replaces that finding's earlier disproval; each `--by` ruling appends a separate entry.

## What owns this page?

`tools/audit-round/CLAUDE.md` and `tools/audit-round/src/round-data.ts` own this page.
