---
title: pnpm audit-round settle
description: Record that a widening plan's shape is settled
---

Use `pnpm audit-round settle` to end widening and give the active plan its settled filename.

## How do I run it?

Run the command in a terminal from the Repo Edu or plan checkout.

```text
pnpm audit-round settle <stem>   settle the named active widening plan
pnpm audit-round settle          settle the plan printed by pnpm audit-round plan
```

The stem is the plan filename without `.md` or `-widen`.

## When do I use it?

Use this command after a widening series recommends settle and you agree that no concrete shape
question remains. The command is the lifecycle decision; it runs no assistant.

## What does it read?

The runner resolves the active `-widen.md` plan and checks that the target plan has no untracked,
staged or unstaged change. It leaves unrelated work in the plan checkout alone.

## Where does it stop and what do I type?

1. **The plan passes its gate.** Type nothing. The rename and marker land immediately.
2. **The plan is not widening or has pending changes.** Resolve the named condition, then run the
   command again.

## What does it leave behind?

The plan file is renamed from `<stem>-widen.md` to `<stem>.md`. The plan repository receives the
tag-free `<stem>/settle` commit, and the runner claims and prints the empty settle marker beside the
plan's round files.

## What owns this page?

`tools/audit-round/CLAUDE.md` and `tools/audit-round/src/lifecycle.ts` own this page; the plan
doctrine owns when a plan is ready to settle.
