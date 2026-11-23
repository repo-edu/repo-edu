---
title: pnpm audit-round split
description: Split one source file by a move list that audit rounds judged, or learn why no split happens
---

`pnpm audit-round split <path>` splits one source file into smaller files, or says why it does not.
A design session decides how the file divides and writes that down as a move list. Audit rounds
judge the list. Code then carries it out, proves it with the checks and the package's tests and
commits it.

| Fact | Detail |
| --- | --- |
| Runs in | A terminal at the Repo Edu or plan checkout root |
| Owners | `tools/audit-round/CLAUDE.md` owns the command; `.agents/skills/design/references/workflow.md` owns the design session; the move-list audit and fix workflows under `.agents/skills/` own the rounds; `.agents/references/round-grammar.md` owns the move list and the result line |

## Usage

```text
pnpm audit-round split <path>              split one file, or say why no split happens
pnpm audit-round split <path> -v | --verbose  also show assistant tool calls
pnpm audit-round split -h | --help         show the command's help
```

The path is relative to the Repo Edu root and names a file inside one workspace package under
`apps/`, `packages/` or `tools/`, because that package's tests prove the split.

## Behaviour

A call handles one file in three parts.

1. **The design session.** One fresh session on the `splitAudit` designer in
   `tools/audit-round/settings.json` reads the file whole. It answers that the file is fine, that it
   needs a plan, or with a move list. It changes no code. The list names each target file, the one
   responsibility it holds and the line ranges of whole top-level statements that go there.
2. **The move-list rounds.** The call tries the list in memory, commits it in the plan repo and
   runs move-list rounds on it. These are audit rounds like a plan's: audit, vet, rebuttal, ruler or
   your ruling, and a fix that changes the list or withdraws it. The rounds stop under the same
   fixed rules as any automatic series, once every listed `splitAudit` auditor has a current read
   of the list.
3. **The split.** The call tries the list once more, writes the files, runs `pnpm check` and the
   package's tests and commits the split. When a check fails, it puts every file back.

A file keeps one move list, at `../plan/splits/<path>` with the extension replaced by `.mv.md`. A
call that finds a list for the file's current content designs nothing and goes on where the list
stands: more rounds, the split or the withdrawal the list records. So a split that was skipped or
whose checks failed runs again on a later call without another design or another round.

A lock lets two calls take turns while they write files. The rounds, the checks and the tests hold
no lock, so another call can run meanwhile. When another call wrote a list for the same content
first, this call ends as skipped and leaves the rounds to that call.

## Output

The call ends with one result line, printed last:

```text
SPLIT RESULT: {"result":"made","hash":"<blob hash>","message":"<why>"}
```

The hash is Git's blob hash of the file the design session read. The message says why the call
ended as it did.

| Result | What happened |
| --- | --- |
| `made` | The split is committed; the message names the commit |
| `fine` | The design session or the withdrawn list judged that the file should stay whole |
| `needs-plan` | The design session or the withdrawn list judged that the split needs a plan, the statement move tool refused a move or the rounds reached their maximum |
| `skipped` | The file changed, a file the split would write had uncommitted changes or another call wrote the list first |
| `checks-failed` | `pnpm check` or the package's tests failed; the files are back as they were and the message holds the output |

Beside the split commit a call leaves:

1. **The move list** and its commits in the plan repo: the design commit `<label>/design` and each
   round's record.
2. **The split commit** `<label>/split <tag> refactor(<area>): split ...` in Repo Edu, with one
   bullet per new file naming its responsibility.
3. **The split log** `<label>-split.log` beside the rounds' files. Each call on the file adds to
   it.

The label is `split-` followed by the source path's segments joined by `+`, as
`split-packages+domain+src+roster.ts`. While the series is
live work, its files stay in `../plan-evidence/active/`. Otherwise they move into
`../plan-evidence/splits/<label>/` when the call ends, and a later call on the same file moves
them back first.

## Refuses when

The runner prints `audit-round: <reason>`, starts no session and exits with status 2.

1. **The path is absolute or leaves the Repo Edu root.** `Name the source file by its path relative
   to the Repo Edu root.`
2. **The path is outside a workspace package.** `<path> is outside the workspace packages under
   apps/, packages/ and tools/.`
3. **No such file exists**, or the path names a folder.

## Stop and recovery

1. **The design session fails.** The call prints the reason, the `Session:` line and a `Rerun:`
   line, and exits with status 1. Correct the problem it names and run the same command.
2. **A round stops.** A failed phase or a ruling you leave unanswered stops the call as it stops
   any round. The printed `Rerun:` command is the same `split` call, and it continues the stopped
   round. See [Recover a run](/repo-edu/tooling/recover-run/).
3. **The checks fail.** The files are already back as they were. Fix what the output names, then
   run the same command.
