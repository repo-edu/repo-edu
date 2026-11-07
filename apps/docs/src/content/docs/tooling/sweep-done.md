---
title: pnpm sweep done
description: Remove a completed path or plan from the tracked refactor backlog
---

Use `pnpm sweep done` to clear every outstanding backlog entry for one path or
for one completed plan.

## How do I run it?

Run the command in a terminal from the Repo Edu checkout with a repository-relative path.

```text
pnpm sweep done <path>
```

Example:

```text
pnpm sweep done packages/example/src/large-file.ts
```

Loop-close uses the plan form with the plan's filename stem, without `.md` or
`-widen`:

```text
pnpm sweep done --plan <stem>
```

The path and `--plan` forms exclude each other.

## When do I use it?

Use the path form after `/refactor` has proved that one backlog item no longer
belongs there. Loop-close uses the plan form after a non-aborted plan has
shipped. It is backlog bookkeeping, not a verdict on the file's new content.

## What does it read?

The path form finds every row whose path exactly matches the argument. The plan
form finds every row whose reason is exactly `planned in <stem>`. Either match
may already be absent.

## Where does it stop and what do I type?

1. **Matching entries exist.** Type nothing. The command reports how many it dropped.
2. **No entry matches.** Type nothing. The command reports that no backlog entry existed.

The plan form reports each dropped path and whether it staged a row deletion
against `HEAD`.

## What does it leave behind?

The command rewrites `tools/sweep/refactor-backlog.tsv` without the matching
rows and preserves the canonical order of the rest. The plan form also builds
the staged backlog from the `HEAD` copy, so unrelated working backlog changes
stay unstaged. It does not add an ok verdict to the skip cache.

## What owns this page?

`tools/sweep/CLAUDE.md`, `tools/sweep/src/main.ts`,
`tools/sweep/src/sweep.ts`, `tools/sweep/src/sweep-store.ts` and
`tools/sweep/src/git-index.ts` own this page.
