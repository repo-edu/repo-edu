# CLAUDE.md

This is the statement move tool (`@repo-edu/statement-move`). It moves complete
top-level TypeScript statements from one file to another with the TypeScript 6
language service's **Move to file** refactor, the engine behind the VS Code
action of that name. It runs from the workspace root in two forms:

```text
pnpm move-statements <source> <start-line> <end-line> <target>
pnpm move-statements list
```

The first form moves one line range and writes the files. The `list` form
tries a whole move list in memory and writes nothing; **The list command**
below describes it. The source and target are workspace-relative TypeScript
paths. A line range is one-based and inclusive. A target may be new or
existing.

## Vocabulary

These terms belong to the statement move tool alone.

- **candidate**: the complete set of file texts a request would write: for
  each of its moves, the engine's edits for the source, the target and every
  importer in the loaded project, plus the import-kind fixes. It exists only in
  memory until the diagnostic comparison accepts it.
- **overlay**: the in-memory file texts the language service reads in place of
  the saved files while it builds and checks the candidate.

## What the command does

1. It finds the source file's nearest workspace package and loads the
   configuration that the `tsc -p` argument of its `typecheck` script names.
   That configuration holds the package's own tests, so the engine repoints
   them too. A package whose script names no configuration, such as
   `apps/docs`, stops the command with an error; there is no fallback to the
   nearest `tsconfig.json`, which excludes the tests.
2. It admits the line range only when it covers complete top-level statements:
   no statement may start or end outside it, it may hold no import and it must
   hold every declaration of an overloaded function. The command makes no
   judgement about which statements belong together.
3. It records the project's TypeScript 6 diagnostics, asks the engine for its
   edits and applies them to the overlay. The import ending follows the source
   file's first relative import that ends in `.js` or has no extension: `.js`
   gives `js` and no extension gives `minimal`. Imports with any other ending,
   such as `.json`, `.css` or a dotted name, are skipped. A file without such
   an import gives `js`.
4. It applies the language service's own fix for each wrong import kind the
   move introduced, until the service offers none. A value imported with
   `import type` (code 1361) loses `type`; a type imported as a value (code
   1484) gains `type`. No other correction is made.
5. It compares the project diagnostics again. When the candidate adds any, the
   command writes nothing, prints them and exits with status 1. Otherwise it
   writes every file of the candidate.

The command preserves the statement text the engine returns. Formatting is left
to the ordinary `pnpm fix` run. The engine reprints moved statements and drops
layout such as trailing commas and wrapped conditions. The fix run restores it,
so Biome-formatted bodies end byte-equivalent to the source apart from import
and export edits.

## The list command

`pnpm move-statements list` reads a move list as JSON from standard input and
prints one JSON reply on standard output. It writes no file in any outcome.
The list names the source, the Git blob hash of the content it was written
for and its entries in order. Each entry names one target and the ranges that
go there:

```json
{
  "source": "packages/domain/src/roster.ts",
  "hash": "3b18e512dba79e4c8300dd08aeb37f8e728b8dad",
  "entries": [
    {
      "target": "packages/domain/src/roster-names.ts",
      "ranges": [{ "start": 10, "end": 40 }, { "start": 52, "end": 60 }]
    }
  ]
}
```

1. It compares the hash with what `git hash-object` prints for the source at
   the workspace root. Git hashes the file after the line-ending
   normalisation of the repository's attributes, so a hash of the raw bytes
   can differ. A source that holds other content or no longer exists ends the
   command with `changed`, and nothing is tried.
2. Every range names lines of that content, before any move. The command
   resolves all ranges first, under the admission of step 2 above. A
   statement that two ranges select is refused.
3. It carries out the ranges in list order, an entry's ranges in their given
   order, one move each. All moves share one overlay, so a later move reads
   the text the earlier moves left. The command follows each range's
   statements through the earlier moves' edits, such as the `export` the
   engine adds to a declaration that moved code uses. A range whose statements
   an earlier move changed or separated is refused.
4. It checks each move as a single move is checked, against the diagnostics
   the moves before it left. The first refused move ends the attempt, because
   every later range is followed through it.

The reply has one of three outcomes:

1. `clean`: `files` holds every file the list would write, each with its
   workspace-relative `path`, its new `text` and `isNew`.
2. `changed`: `message` says how the source differs from the list.
3. `refused`: `entry` is the one-based number of the first entry the command
   cannot carry out, `message` says why and `diagnostics` holds the
   diagnostics its move adds, if any. A source the command cannot move
   statements from at all, such as one whose package names no typecheck
   configuration, is refused with `entry` set to `null`.

Input that is not a move list in this form prints a message on standard error
and no reply, and the command exits with status 1.

## Compiler layout

The workspace runs TypeScript 7 for `tsc`, while the `typescript` import
resolves to the official TypeScript 6 compatibility package, because TypeScript
7 does not yet ship **Move to file** or a stable program interface. The command's own
check therefore proves the move against TypeScript 6 only; `pnpm check` after
the move batch proves it against TypeScript 7.

The root `package.json` declares that package under the alias `typescript`.
When moved code uses it, the engine can write an import of a path inside pnpm's
package store, such as `.pnpm/typescript@6.0.3/node_modules/typescript`,
instead of `typescript`. The TypeScript 6 check accepts that path, so the
command's own check and the list command's `clean` reply let it through.

1. A value import of the path fails when Node runs the code: Node rejects it
   with `ERR_INVALID_MODULE_SPECIFIER`.
2. An `import type` of the path never reaches Node. The base configuration
   sets `verbatimModuleSyntax`, so the import is erased.
3. After a move run by hand, replace the path with `typescript`.
4. A [split](../audit-round/CLAUDE.md#split) call of the audit-round runner
   edits no import. A value import of the path fails its checks or tests, and
   the call then puts the files back and reports that the checks failed.

## Conventions

- `src/move-service.ts` is the only module that calls the TypeScript language
  service. A future engine change stays inside it.
- The service host passes `ts.sys.realpath`. pnpm links one package into
  several `node_modules` folders, and without real paths the service loads it
  twice and reports false errors between the copies.
- Diagnostics are compared by file, code and message, counted per occurrence,
  because positions shift when code moves. A diagnostic that moves with its
  statement into the target therefore counts as new.
