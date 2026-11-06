---
title: /sweep
description: Review one large source file and decide whether its current contents should be split
---

`/sweep` is a periodic check against source files growing without a deliberate decision. It surfaces
the largest file that has not been judged at its current contents, then asks whether that file holds
too much responsibility. Codex uses the equivalent `$sweep` command.

## When should I use it?

Run `/sweep` from the Repo Edu checkout when you want to inspect the next unreviewed source file.
It is not a general architecture check and file size is only the ordering signal. A large cohesive
file can be fine.

The default is one file per chat. That keeps the complete read and judgement focused. Invoke the
command again in a fresh chat for the next file unless you explicitly want to continue in the same
one.

## What does it read?

The launcher checks that the working directory is Repo Edu, then runs `pnpm sweep`. The tool shares
the architecture check's tracked TypeScript and TSX source inventory. It ranks unreviewed files by
line count and prints either one `path` and line count or `clean:`.

The assistant reads that one file end to end and checks its responsibilities, natural split points
and whether it fits in one reading. If a split looks worthwhile, it also checks for an unfinished
planning episode on the file's primary area before recommending the route.

## Where does it stop for me?

The command shows the file, a verdict and its reason before it writes or changes anything. Answer
with one of these choices.

1. **Fine.** The assistant runs `pnpm sweep ok <path>` and records that the current contents do not
   need splitting.
2. **Flag for later.** The assistant runs `pnpm sweep flag <path> --reason "<why>"` and adds the
   file to the refactor backlog.
3. **Plan now.** The assistant opens a plan in the sibling plan checkout, then flags the file with
   that plan's stem.
4. **Refactor inline now.** The assistant refactors the agreed file, verifies the change and asks
   separately before committing. It records no sweep verdict because the changed contents need a
   fresh judgement later.
5. **Skip.** Nothing is recorded, so the same file can surface again next time.

If the command starts outside the Repo Edu checkout, it stops before surfacing a file and waits for
you to move the work to the correct checkout. If the tool prints `clean:`, the command ends without
a decision.

## What does it write?

An `ok` verdict appends the content hash and path to the gitignored `tools/sweep/skip-cache.tsv`. A
`flag` verdict writes the path, current size, reason and content hash to the tracked
`tools/sweep/refactor-backlog.tsv`. Changing the file changes its hash, so it becomes eligible for
review again.

Apart from a plan or inline refactor that you choose, `/sweep` writes only those bookkeeping files
through the tool. It stops after recording your answer.

## What owns this page?

This page is a mirror. The plan repo's `home/claude/commands/sweep.md` owns the shared `/sweep` and
`$sweep` contract. `home/agents/skills/sweep/SKILL.md` is the Codex launcher.
`repo-edu/tools/sweep/CLAUDE.md` owns the `pnpm sweep` commands and state files. Those sources win
when this page differs.
