---
title: pnpm sweep ok
description: Record that one source file is not worth splitting at its current content
---

Use `pnpm sweep ok` to keep one reviewed file out of the sweep until its content changes.

## How do I run it?

Run the command in a terminal from the Repo Edu checkout with a repository-relative source path.

```text
pnpm sweep ok <path>
```

Example:

```text
pnpm sweep ok tools/sweep/src/main.ts
```

## When do I use it?

Use this command after reviewing the file selected by `pnpm sweep` and deciding that splitting its
current content would not improve ownership or readability.

## What does it read?

The command validates the path against the shared tracked-source inventory, reads its working-tree
bytes and computes the Git blob hash. It also reads the existing local skip cache.

## Where does it stop and what do I type?

1. **The path is a tracked source file.** Type nothing. The command prints the path and recorded
   hash.
2. **The path is invalid.** Correct it to the repository-relative path printed by `pnpm sweep` and
   run the command again.

## What does it leave behind?

The command appends `<hash><TAB><path>` to the gitignored `tools/sweep/skip-cache.tsv`. Editing the
file changes its hash, so the new content appears in a later sweep.

## What owns this page?

`tools/sweep/CLAUDE.md`, `tools/sweep/src/main.ts` and `tools/sweep/src/sweep-store.ts` own this
page.
