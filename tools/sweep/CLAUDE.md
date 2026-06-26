# CLAUDE.md

This is the sweep tool (`@repo-edu/sweep`). It drives file-growth triage over
repo-edu source: it surfaces the biggest source file not yet judged at its
current content, then records a verdict so that file stays quiet until it
changes. It runs via `pnpm sweep` from the workspace root, which is
`tsx tools/sweep/src/main.ts`. The `/sweep` and `/refactor` skills are the
intended callers; the CLI is their backend.

## Commands

`src/main.ts` is a Commander program with five subcommands:

- `next` (default): print the biggest source file with no verdict at its
  current content, as `path<TAB>lines`, or `clean:` when every file is judged.
- `ok <path>`: record an ok verdict ("not worth splitting") for the file at its
  current content.
- `flag <path> --reason <why>`: record a flag verdict ("worth refactoring") with
  a required reason.
- `queue`: print the refactor backlog biggest first, as
  `path<TAB>lines<TAB>reason`.
- `done <path>`: drop every backlog entry for a path.

## State files

`src/sweep-store.ts` owns two tab-separated files, both written beside the tool
at `tools/sweep/` and both gitignored. They are tool-owned scratch state, never
committed, so they stay out of both repos and out of the source inventory.

- `skip-cache.tsv` holds ok verdicts, one row per `hash<TAB>path`.
- `refactor-todo.tsv` holds flag verdicts, one row per `hash<TAB>path<TAB>reason`.

Both files are absent until the first verdict of their kind is recorded; a
missing file reads as an empty list. Appends are line-oriented, so a verdict is
one new row.

## Verdict keying

Every entry is keyed on the pair `(content hash, path)`, where the hash is the
git blob hash of the working-tree bytes (`src/git-hash.ts`, one
`git hash-object --stdin-paths` process). The hash is the file's content
identity: it changes the moment the bytes change.

`findNextCandidate` treats both stores as "judged": a file is skipped when its
current `(hash, path)` appears in either file. So editing a judged file changes
its hash and re-surfaces it for a fresh judgment. An ok verdict does not hide a
file forever; it silences that exact content.

The backlog collapses to the latest verdict per path (`readQueue`), since it
tracks a file's outstanding refactor, not each judgment event.

## Source inventory

Sweep does not define its own file list. It imports `readSourceInventory`,
`ROOT`, `normalizeRepoPath` and `countRepoFileLines` from the
architecture-check tool, so sweep and the architecture check agree exactly on
what counts as a tracked source file and how lines are counted. Ranking is by
line count descending, ties broken by path.

## Conventions

- Treat the two `.tsv` files as machine-owned. The skills append to them through
  the CLI; do not hand-edit them.
- The `.tsv` extension is deliberate, so editor TSV tooling renders the columns.
- A flag with an empty reason is rejected; `ok` takes no reason.
- The tool shares architecture-check's inventory by direct source import. A
  change to what that tool counts as a source file changes what sweep surfaces.
