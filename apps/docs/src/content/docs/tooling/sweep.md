---
title: Sweep
description: Find growing source files one at a time, judge whether each should be split and keep the refactor backlog
---

The sweep surfaces the largest Repo Edu source file nobody has judged at its current content, so
you can decide whether it should be split.

| Fact | Detail |
| --- | --- |
| `/sweep` runs in | Claude chat in the Repo Edu checkout; `$sweep` is the Codex counterpart |
| `pnpm sweep` runs in | A terminal at the Repo Edu root |
| Owners | `../plan/home/claude/commands/sweep.md` owns the chat command; `tools/sweep/CLAUDE.md` owns the tool and its state files |

## Usage

```text
/sweep                          judge the largest unreviewed source file, record or act on
                                your answer, then stop; run /sweep again in a fresh chat
/sweep help | -h | --help | ?   show the usage

pnpm sweep [next]                        print the largest file not yet judged at its content
pnpm sweep ok <path>                     record an ok verdict for the file at its content
pnpm sweep flag <path> -r|--reason <why> flag the file for refactor at its content
pnpm sweep queue                         print the refactor backlog, largest first, with reasons
pnpm sweep done <path>                   drop a path from the refactor backlog
pnpm sweep done --plan <stem>            drop one plan's rows from the refactor backlog
pnpm sweep -h | --help | help [command]  show the tool's help
```

## Why it exists

An AI coder adds to source files without weighing their size. Nothing in its own work stops a file
from growing, so a sweep from outside is the one check it will not do for itself.

The sweep asks one question per file: should this file be split? You weigh whether the file holds
more than one responsibility, whether it has natural seams and whether it is too large to hold in
one reading. Size only decides which file you see first. A large file with one clear job passes.
No metric decides the verdict; the assistant reads the file and judges it in context. Coverage and
ownership questions belong to `pnpm area-view`, not here.

The default is to judge, not to act. A verdict is recorded and the work waits for `/refactor`.
Acting in the same chat, by planning or refactoring now, happens only when you choose it for that
file.

## The loop

The sweep is one half of a loop that ends when a refactor lands or a plan ships.

1. **Surface and judge.** `/sweep` runs `pnpm sweep`, reads the file it prints and asks for your
   verdict.
2. **Record.** A fine file goes to the skip cache and stays quiet until it changes. A file worth
   refactoring goes to the refactor backlog with its reason. Planning it now opens a plan and flags
   the file with the reason `planned in <stem>`.
3. **Drain.** [`/refactor`](/repo-edu/tooling/refactor/) takes the largest backlog file. It either
   refactors it inline and runs `pnpm sweep done <path>`, or routes it to a new plan and re-flags
   it as `planned in <stem>`.
4. **Close.** When a completed plan is archived, [loop-close](/repo-edu/tooling/close/) runs
   `pnpm sweep done --plan <stem>` and commits the staged backlog deletion. An aborted plan keeps
   its row.
5. **Resurface.** A refactor changes the file's content, so the file and any new sibling files
   come back in a later sweep for a fresh judgement.

## How a file is chosen

The candidates are the architecture check's source inventory: every `.ts` and `.tsx` file under
`apps/*/src`, `packages/*/src` and `tools/*/src` that Git tracks or would track, minus deleted
files. Sweep imports that inventory and its line counter, so both tools agree on what a source file
is and how long it is. Candidates rank by line count, largest first, with the path as tie-break.

Every verdict is keyed on the file's path and the Git blob hash of its working-tree bytes. A file
is skipped while its current path and hash appear in either state file. Editing the file changes
its hash, so an ok verdict silences only that exact content. Uncommitted edits count, because the
hash is taken from the working tree.

## Chat command

`/sweep` handles one file per chat. Reading and judging a file fills the chat's context, and the
next file is read better in a fresh one. Ask explicitly to continue in the same chat.

### What it shows you

The assistant reads the surfaced file end to end and shows you the file, its verdict and the
reason. When the verdict is to refactor, it also recommends planning now or refactoring inline now.
It weighs whether the change preserves behaviour, how obvious the seams are and whether a shared
contract is involved. When an earlier plan on the file's primary area never reached its ready
marker, it recommends a plan instead of an inline refactor. Nothing is recorded or changed before
you answer.

### Your answers

1. **Fine.** The assistant runs `pnpm sweep ok <path>`.
2. **Flag for later.** The assistant runs `pnpm sweep flag <path> --reason "<why>"`, which hands
   the file to `/refactor`.
3. **Plan now.** The assistant opens `<topic>.md` in the plan checkout while the file is fresh, then
   runs `pnpm sweep flag <path> --reason "planned in <stem>"`. Without that flag the unchanged file
   would top every later sweep.
4. **Refactor inline now.** The assistant refactors the agreed files, folds any new file whose
   surface only extends another into that one and runs Repo Edu's checks and tests. It commits only
   after you approve separately and records no verdict.
5. **Skip.** Nothing is recorded, so the file comes back next time.

You can also redirect the verdict in your own words; the five answers are the routes it can take.

### Afterwards

Fine adds a row to the skip cache. Flag for later and plan now write a backlog row; plan now also
leaves a new plan in `../plan/active/`. Refactor inline now leaves changed source files and, after
your approval, a Repo Edu commit. Skip leaves nothing. The assistant then reports what it did and
stops without surfacing the next file.

### Early stops

1. **The chat is not in the Repo Edu checkout.** The assistant names the current directory, warns
   that the sweep works on Repo Edu and waits. Move the chat to the Repo Edu checkout and run
   `/sweep` again.
2. **`pnpm sweep` prints `clean:`.** Every source file has a verdict at its current content. The
   assistant says so and stops without asking anything.

## Terminal commands

Every subcommand runs from the Repo Edu root and takes repository-relative paths. A refused command
prints its reason and exits with status 1 without writing a state file. A missing argument or
required option is refused by the argument parser with its own `error:` line.

### `next`

`pnpm sweep` and `pnpm sweep next` are the same command. It ranks the inventory and prints the
first file whose path and current hash appear in neither state file, as `<path><TAB><lines>`. When
none is left it prints `clean: every source file is judged at its current content.` It writes
nothing.

### `ok`

`pnpm sweep ok <path>` records that the file at its current content is not worth splitting. It
appends `<hash><TAB><path>` to the skip cache and prints `ok <path> @ <hash>`. It takes no reason.

**Refuses when** the path is not in the source inventory: `Not a tracked source file: <path>`. Use
the path exactly as `pnpm sweep` printed it.

### `flag`

`pnpm sweep flag <path> --reason "<why>"` records that the file is worth refactoring. It stores the
current line count, path, reason and hash as one backlog row and prints
`flagged <path> @ <hash>: <reason>`. Runs of whitespace in the reason, including tabs and line
breaks, become single spaces. Flagging a path again replaces its earlier row, so the backlog holds
one outstanding refactor per path.

**Refuses when** the reason is empty (`A flag needs a non-empty --reason.`) or the path is not in
the source inventory.

### `queue`

`pnpm sweep queue` prints the backlog, largest first by current line count. Each entry is
`<path> (<lines> lines)` with its reason indented below and a blank line between entries. An empty
backlog prints `queue: empty.` A flagged file that no longer exists shows 0 lines. The command
writes nothing and does not judge whether a stored reason still holds; `/refactor` does that.

### `done`

`pnpm sweep done <path>` drops every backlog row for the path and prints how many it dropped, or
`done: no backlog entry for <path>.` It does not check the inventory, so a deleted or renamed file
can still be cleared. It adds no ok verdict.

`pnpm sweep done --plan <stem>` drops every row whose reason is exactly `planned in <stem>`. The
stem is the plan filename without `.md` and without `-widen`, so the reason stays valid when a
widening plan settles. The command does two things:

1. It stages the deletion in Git's index, built from the `HEAD` copy of the backlog alone. Other
   working changes to the backlog therefore stay unstaged.
2. It removes the same rows from the working backlog.

It prints `done: dropped <path>.` for each working row, or
`done: no working backlog row for planned in <stem>.`, then
`done: staged deletion against HEAD: yes` or `no`. Loop-close commits the staged deletion only on
`yes`.

**Refuses when** both or neither of `<path>` and `--plan` are given:
`done needs exactly one of <path> or --plan <stem>.`

**Stop and recovery.** The plan form stops when `HEAD` holds no backlog file or a Git command
fails, and prints `Unable to find tools/sweep/refactor-backlog.tsv in HEAD.` or the failing Git
command. The staging runs first, so the working backlog is still unchanged. Fix the Git state and
run the same command again.

## State files

Both files live in `tools/sweep/`, are tab-separated and are written only through `pnpm sweep`.
They stay out of the source inventory, and a missing file reads as empty.

1. **`skip-cache.tsv`** holds ok verdicts as `<hash><TAB><path>`. It is gitignored because it
   churns on every edit and costs only machine time to rebuild. Rows are only appended.
2. **`refactor-backlog.tsv`** holds flag verdicts as `<lines><TAB><path><TAB><reason><TAB><hash>`,
   with the line count and hash taken at flag time. It is committed because its reasons are durable
   work. Every flag and done rewrites it whole in one order, flagged line count descending with the
   path as tie-break, so its diffs show only real backlog changes.
