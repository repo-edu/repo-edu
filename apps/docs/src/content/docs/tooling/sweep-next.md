---
title: pnpm sweep
description: Print the largest source file not yet judged at its current content
---

Use `pnpm sweep` to select the next Repo Edu source file for file-growth review.

## How do I run it?

Run the command in a terminal from the Repo Edu checkout.

```text
pnpm sweep        run the default next command
pnpm sweep next   spell the same command explicitly
```

## When do I use it?

Use this command to find the next file for `/sweep`. It ranks the tracked source inventory by line
count and skips files already judged at their current content.

## What does it read?

The command reads the architecture check's shared source inventory, the working-tree bytes of each
candidate, `tools/sweep/skip-cache.tsv` and `tools/sweep/refactor-backlog.tsv`. A verdict matches a
path only while that file has the same Git blob hash.

## Where does it stop and what do I type?

1. **A file remains.** Type nothing. The command prints `<path><TAB><lines>` for the largest one.
2. **Every file is judged.** Type nothing. The command prints `clean: every source file is judged
   at its current content.`

## What does it leave behind?

The command changes no file. Its single output line is input for the `/sweep` chat command or for a
manual inspection.

## What owns this page?

`tools/sweep/CLAUDE.md` and `tools/sweep/src/main.ts` own this page.
