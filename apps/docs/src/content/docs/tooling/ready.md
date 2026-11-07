---
title: pnpm audit-round ready
description: Assign a coder and mark a settled plan ready for implementation
---

Use `pnpm audit-round ready` to record that detailing is complete and assign the plan's coder.

## How do I run it?

Run the command in a terminal from the Repo Edu or plan checkout.

```text
pnpm audit-round ready <stem>   mark the named active settled plan ready
pnpm audit-round ready          use the plan printed by pnpm audit-round plan
```

## When do I use it?

Use this command after a detailing series recommends ready and you agree that the implementation
brief is complete. It records the lifecycle decision without starting an assistant.

## What does it read?

The runner reads the active settled plan, its Git history and the ordered `coders` list in
`tools/audit-round/settings.json`. It refuses a widening plan, pending changes to the target plan or
a stem whose history already has a ready marker.

## Where does it stop and what do I type?

1. **The plan passes its gate.** Type nothing. The coder assignment lands immediately.
2. **A gate fails.** Resolve the named plan state or worktree condition, then run the command again.

## What does it leave behind?

The plan repository receives the empty, tag-free `<stem>/ready` commit. Its body names the assigned
coder. A list entry that says `default` is recorded as the model and effort it read from `defaults`,
so a later change to `defaults` leaves the assignment as it was. Later implementation workers use
that assignment's assistant and effort, resolving its model release when the implementation command
starts.

## What owns this page?

`tools/audit-round/CLAUDE.md` and `tools/audit-round/src/lifecycle.ts` own this page; the plan
doctrine owns the ready marker.
