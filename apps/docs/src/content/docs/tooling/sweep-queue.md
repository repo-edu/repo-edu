---
title: pnpm sweep queue
description: Print the tracked refactor backlog in current size order
---

Use `pnpm sweep queue` to see every file still waiting for the `/refactor` workflow.

## How do I run it?

Run the command in a terminal from the Repo Edu checkout.

```text
pnpm sweep queue
```

## When do I use it?

Use this command before `/refactor` to choose the largest outstanding file and read the reason it
was flagged. The command does not decide whether that earlier reason still holds.

## What does it read?

The command reads `tools/sweep/refactor-backlog.tsv` and the current line count of each listed
source file. The stored flag-time line count and hash remain in the machine-owned row; the printed
queue uses the current size.

## Where does it stop and what do I type?

1. **The backlog has entries.** Type nothing. Each entry prints as `<path> (<lines> lines)` followed
   by its indented reason, largest first.
2. **The backlog is empty.** Type nothing. The command prints `queue: empty.`

## What does it leave behind?

The command changes no file. Its terminal output is the backlog view used to start `/refactor`.

## What owns this page?

`tools/sweep/CLAUDE.md` and `tools/sweep/src/main.ts` own this page.
