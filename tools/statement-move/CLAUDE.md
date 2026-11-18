# CLAUDE.md

This is the statement move tool (`@repo-edu/statement-move`). It moves complete
top-level TypeScript statements from one file to another with the TypeScript 6
language service's **Move to file** refactor, the engine behind the VS Code
action of that name. It runs from the workspace root:

```text
pnpm move-statements <source> <start-line> <end-line> <target>
```

The source and target are workspace-relative TypeScript paths. The line range
is one-based and inclusive. The target may be new or existing.

## Vocabulary

These terms belong to the statement move tool alone.

- **candidate**: the complete set of file texts one move would write: the
  engine's edits for the source, the target and every importer in the loaded
  project, plus the import-kind fixes. It exists only in memory until the
  diagnostic comparison accepts it.
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
   file's first relative import: `.js` gives `js`, no extension gives `minimal`
   and a file without a relative import gives `js`.
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

## Compiler layout

The workspace runs TypeScript 7 for `tsc`, while the `typescript` import
resolves to the official TypeScript 6 compatibility package, because TypeScript
7 does not yet ship **Move to file** or a stable program interface. The command's own
check therefore proves the move against TypeScript 6 only; `pnpm check` after
the move batch proves it against TypeScript 7.

## Conventions

- `src/move-service.ts` is the only module that calls the TypeScript language
  service. A future engine change stays inside it.
- The service host passes `ts.sys.realpath`. pnpm links one package into
  several `node_modules` folders, and without real paths the service loads it
  twice and reports false errors between the copies.
- Diagnostics are compared by file, code and message, counted per occurrence,
  because positions shift when code moves. A diagnostic that moves with its
  statement into the target therefore counts as new.
