---
title: pnpm sweep done
description: Remove a completed source path from the tracked refactor backlog
---

Use `pnpm sweep done` to clear every outstanding backlog entry for one path.

## How do I run it?

Run the command in a terminal from the Repo Edu checkout with a repository-relative path.

```text
pnpm sweep done <path>
```

Example:

```text
pnpm sweep done packages/example/src/large-file.ts
```

## When do I use it?

Use this command after `/refactor` has completed the flagged work or proved that the backlog item no
longer belongs there. It is backlog bookkeeping, not a verdict on the file's new content.

## What does it read?

The command reads `tools/sweep/refactor-backlog.tsv` and finds every row whose path exactly matches
the argument. The path may already be absent.

## Where does it stop and what do I type?

1. **Matching entries exist.** Type nothing. The command reports how many it dropped.
2. **No entry matches.** Type nothing. The command reports that no backlog entry existed.

## What does it leave behind?

The command rewrites `tools/sweep/refactor-backlog.tsv` without the matching path, preserving the
canonical order of the remaining rows. It does not add an ok verdict to the skip cache.

## What owns this page?

`tools/sweep/CLAUDE.md`, `tools/sweep/src/main.ts` and `tools/sweep/src/sweep-store.ts` own this
page.
