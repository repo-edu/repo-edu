---
title: pnpm sweep flag
description: Add one reviewed source file to the tracked refactor backlog
---

Use `pnpm sweep flag` to record that a source file is worth refactoring and why.

## How do I run it?

Run the command in a terminal from the Repo Edu checkout with a repository-relative source path.

```text
pnpm sweep flag <path> --reason <reason>
pnpm sweep flag <path> -r <reason>
```

Example:

```text
pnpm sweep flag packages/example/src/large-file.ts --reason "Two owners share one file."
```

Quote a reason that contains spaces. An empty reason is refused.

## When do I use it?

Use this command after reviewing the file selected by `pnpm sweep` and deciding that a specific
ownership or readability problem makes refactoring worthwhile.

## What does it read?

The command validates the path against the shared tracked-source inventory, reads its current bytes
and line count and computes its Git blob hash. It reads the existing backlog so a later flag for the
same path can replace the earlier row.

## Where does it stop and what do I type?

1. **The path and reason are valid.** Type nothing. The command prints the path, hash and reason.
2. **An input is invalid.** Correct the repository-relative path or give a non-empty reason, then
   run the command again.

## What does it leave behind?

The command rewrites `tools/sweep/refactor-backlog.tsv` in canonical order with one row per path:
`<lines><TAB><path><TAB><reason><TAB><hash>`. The tracked file records a real backlog change.

## What owns this page?

`tools/sweep/CLAUDE.md`, `tools/sweep/src/main.ts` and `tools/sweep/src/sweep-store.ts` own this
page.
