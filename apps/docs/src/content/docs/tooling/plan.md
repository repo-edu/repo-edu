---
title: pnpm audit-round plan
description: Print the active plan an omitted runner target would select
---

Use `pnpm audit-round plan` to see which active plan an omitted target would use.

## How do I run it?

Run the command in a terminal from the Repo Edu or plan checkout.

```text
pnpm audit-round plan
```

The command takes no argument or option.

## When do I use it?

Use this command before `pnpm audit-round round`, `settle`, `ready` or `close` when you intend to
omit the stem and want to check the selection first.

## What does it read?

The runner scans active plan artifacts and both repositories' stem histories. It selects the active
plan whose newest stem commit is newest across the two histories. It does not inspect that plan's
implementation steps.

## Where does it stop and what do I type?

1. **A plan resolves.** Type nothing. The command prints its absolute path.
2. **No active plan resolves.** Name the intended stem explicitly in the later command or restore
   the expected active artifact.

## What does it leave behind?

The command writes nothing, starts no assistant and loads no model settings. Its only output is the
absolute path of the selected plan.

## What owns this page?

`tools/audit-round/CLAUDE.md` and `tools/audit-round/src/default-target.ts` own this page.
