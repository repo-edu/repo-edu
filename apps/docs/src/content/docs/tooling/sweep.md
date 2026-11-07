---
title: /sweep
description: Review one large source file and decide whether its current contents should be split
---

Use `/sweep` to review the largest unreviewed source file and decide whether it should be split.

## How do I run it?

Run the command in Claude chat from the Repo Edu checkout. Use `$sweep` for the same command in
Codex.

```text
/sweep          review one file, record or act on your answer, then stop
/sweep help     show the command usage without reviewing a file
/sweep -h       show the command usage without reviewing a file
/sweep --help   show the command usage without reviewing a file
/sweep ?        show the command usage without reviewing a file
```

Invoke the command again in a fresh chat for the next file unless you explicitly ask to continue
in the same one.

## When do I use it?

Use `/sweep` when you want to inspect the next source file whose current contents have no recorded
file-growth judgement. It is not a general architecture check, and file size only decides which
file appears first. A large cohesive file can be fine.

## What does it read?

The launcher runs `pnpm sweep` and reads the largest unreviewed tracked TypeScript or TSX file. The
tool uses the architecture check's source inventory and prints either one path with its line count
or `clean:`.

The assistant reads that file end to end and checks its responsibilities, natural split points and
whether it fits in one reading. If a split looks worthwhile, it also checks for an unfinished plan
on the file's primary area before recommending whether to plan or refactor it now.

## Where does it stop and what do I type?

The command shows the file, a verdict and its reason before writing or changing anything. Type one
of these answers:

1. **Fine.** Type `Fine.` The assistant runs `pnpm sweep ok <path>` and records that the current
   contents do not need splitting.
2. **Flag for later.** Type `Flag for later.` The assistant runs
   `pnpm sweep flag <path> --reason "<why>"` and adds the file to the refactor backlog.
3. **Plan now.** Type `Plan now.` The assistant opens a plan in the sibling plan checkout, then
   flags the file with that plan's stem.
4. **Refactor inline now.** Type `Refactor inline now.` The assistant refactors the agreed file,
   verifies the change and asks separately before committing. It records no sweep verdict because
   the changed contents need a fresh judgement later.
5. **Skip.** Type `Skip.` Nothing is recorded, so the same file can appear again next time.

If the command starts outside Repo Edu, move the chat to that checkout and run `/sweep` again. If
the tool prints `clean:`, the command ends without asking for an answer.

## What does it leave behind?

1. **Fine** appends the content hash and path to the gitignored
   `tools/sweep/skip-cache.tsv`.
2. **Flag for later** and **Plan now** write the path, size, reason and content hash to the tracked
   `tools/sweep/refactor-backlog.tsv`. **Plan now** also creates
   `../plan/active/<topic>.md` or `../plan/active/<topic>-widen.md`.
3. **Refactor inline now** changes the agreed source files and, after separate approval, leaves a
   Git commit. It does not write either sweep verdict file.
4. **Skip** and `clean:` leave no output file.

Changing a judged file changes its content hash, so its new contents can appear in a later sweep.

## What owns this page?

`../plan/home/claude/commands/sweep.md` owns the launcher contract;
`tools/sweep/CLAUDE.md` owns the tool and its state files.
