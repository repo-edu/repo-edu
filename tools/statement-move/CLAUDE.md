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
7 does not yet ship **Move to file** or a stable program interface. That
package loads the TypeScript 6 compiler, which pnpm patches, as
**The patched engine** below says. The command's own
check therefore proves the move against TypeScript 6 only; `pnpm check` after
the move batch proves it against TypeScript 7.

The root `package.json` declares that package under the alias `typescript`.
When moved code uses it, the engine can write an import of a path inside pnpm's
package store, such as
`.pnpm/typescript@6.0.3_patch_hash=<hash>/node_modules/typescript`, instead of
`typescript`. The folder of a patched package carries the `_patch_hash=` part
in its name. The TypeScript 6 check accepts that path, so the
command's own check and the list command's `clean` reply let it through.

1. A value import of the path fails when Node runs the code: Node rejects it
   with `ERR_INVALID_MODULE_SPECIFIER`.
2. An `import type` of the path never reaches Node. The base configuration
   sets `verbatimModuleSyntax`, so the import is erased.
3. After a move run by hand, replace the path with `typescript`.
4. A [split](../audit-round/CLAUDE.md#split) call of the audit-round runner
   edits no import. A value import of the path fails its checks or tests, and
   the call then puts the files back and reports that the checks failed.

## The patched engine

pnpm applies `patches/typescript-6.0.3.patch` to the installed
`typescript@6.0.3` at every install, because `pnpm-workspace.yaml` lists it
under `patchedDependencies`. The patch changes six functions of
**Move to file** in `lib/typescript.js`: `forEachReference`, `getUsageInfo`,
`forEachTopLevelDeclaration`, `isTopLevelDeclaration`,
`sourceFileOfTopLevelDeclaration` and `getExistingLocals`. It also adds the
helper `getWholeImport`. They repair three shapes:

1. A name that the source still uses only as a short-form property, as in
   `{ cacheRoot }`, counts as a use. The source then gets an import of the
   moved declaration. Without the repair the move adds diagnostic 18004.

2. The moved code's default import or `import * as name` import counts as
   present when its local name, looked up in the target, names the same
   value. An import of the same form from the same module names it. For a
   default import, two more bindings name it under that name: an import of
   the same default export, such as `import { default as label }`, and the
   target's own `export default function label`. A variable that the
   target's `export default label` copied does not count. That statement
   took the variable's value when it ran, and the variable can change later.
   Each name counts on its own. Without the repair the engine writes the
   import a second time and the move adds diagnostic 2300.

   A wildcard import, one typed by a wildcard declaration such as
   `declare module "*.wasm?url"`, never counts as present. One wildcard
   symbol stands for many files, so it cannot show that two imports read the
   same file.

   In every other case the engine writes the moved code's own import:
   1. When the target already uses the name, the import adds diagnostic 2300
      or 2440 and the move is refused, so the moved code never reads a
      different value. The target can use the name for the other form of
      import, an unrelated `const` or a wildcard `import * as` import. It can
      also use it for a default import of another module, even when that
      module forwards the same default export, as
      `export { default } from "./value.js"` does.
   2. When the target does not use the name, the import is valid, with one
      exception. For an `import * as` import typed by a wildcard declaration,
      the engine writes the declaration's pattern as the path. For example,
      `"./first.wasm?url"` in the source becomes `"*.wasm?url"` in the
      target. TypeScript accepts that path, so the command lets it through.
      After such a move, write the asset's own path back by hand, relative to
      the target file.

   In two cases the engine can stop with a `Debug Failure` before it returns
   any edit. When it stops, the command writes nothing:
   1. The engine stops with `Expected symbol to be a module` when it must
      write a default import and the module's default export is a
      declaration that the module does not export under its own name.
      `export default count` and `export { count as default }` make such a
      default export for a local `count`. So does the URL string of
      `declare module "*.wasm?url" { const url: string; export default url }`.
      The engine therefore stops on a target whose `label` is the variable
      that its own `export default label` copied. It also stops on a
      wildcard import of the URL string, even when the target imports the
      same file under the same name.
   2. The engine stops when it must put two default names, or two
      `import * as` names, for one module into the same import. This holds
      whether it creates that import or extends one the target has. An empty
      target can accept a value default and an `import type` default for one
      export, because the engine writes them as separate imports. A target
      may already hold a named value import from that module, such as
      `import { x } from "widget"`. The engine then puts both default names
      into that import and stops.

   Carry a move that stops the engine by hand.

3. A loop name declared with `const` or `let`, and a `catch` name, belong to
   their statement and not to the file. Without the repair the engine imports
   such a name into the target and exports it from the source. The move then
   adds diagnostics 2305 and 1030, or the engine stops with
   `Debug Failure. False expression: Changes overlap`. A `var` belongs to the
   whole file wherever a top-level statement declares it outside a function,
   a class or a namespace. It can sit in a loop's head, in a loop's body or
   in another block, such as an `if` branch. Each name that a destructuring
   pattern declares in such a `var` or in a top-level variable statement
   belongs to the file too, as in `for (var { origin } of items)` or
   `const { origin } = value`. A move must keep the readers of such a name
   connected to it:
   1. A reader that moves away imports the name from the source. The engine
      adds `export` to a variable statement, but it cannot export a `var`
      inside another statement. Without an explicit `export { name }` that
      move is refused.
   2. A statement that moves together with its `export { name }` takes the
      export along, and a reader that stays imports the `var` from the
      target. A statement that moves alone away from a reader is refused,
      because the engine writes no export for a `var` inside it.
   3. Two declarations of one `var` name one variable, so a move must not
      divide them. The source then imports the moved name beside the
      declaration it keeps, and the move adds a diagnostic and is refused.
      The same holds for any name with declarations on both sides, such as a
      `namespace` declared twice.

   Without these rules a reader cut off from such a name could read a global
   of the same name, such as the DOM's `origin`, with no new diagnostic.

The tool's own rules do not change: it applies only the import-kind fixes and
refuses every move that adds a diagnostic. The fixtures in
`src/__tests__/engine-repairs.test.ts` prove each repaired shape and fail when
the patch is missing. Other fixtures there prove results of the published
engine that the repairs must keep. Every user of TypeScript 6 in the workspace
loads the patched file. The six functions serve only **Move to file**,
**Move to a new file** and paste with imports.

The entry names the exact version, so the patch never reaches the TypeScript 7
package that the alias `@typescript/native` resolves under the same package
name. Repo Edu does not set `allowUnusedPatches`, so once the lockfile resolves
a newer TypeScript 6, `pnpm install` stops with `ERR_PNPM_UNUSED_PATCH`. A
session then moves the patch to the new version:

1. Remove the entry from `patchedDependencies`, keeping its comment, and
   delete the old patch file. Git keeps the old patch's text. Then finish the
   update that stopped, so that the lockfile holds the new version: run its
   command again, such as `pnpm deps:latest`, or run `pnpm install` on a
   branch whose lockfile already holds the new version.
2. Run `pnpm patch typescript@<new version>`. In the folder it prints, make
   the old patch's changes in `lib/typescript.js`, in the six functions and
   the helper named above. Their line numbers differ between versions.
3. Run `pnpm patch-commit <folder>`. pnpm writes the patch file, the entry and
   the lockfile, and installs.
4. Rename the patch file from `typescript@<version>.patch` to
   `typescript-<version>.patch` and change its entry to match. The commit's
   leak scan reads the `@` form as an email address.
5. Run `pnpm test tools/statement-move`. The repair fixtures prove the moved
   patch.

## Conventions

- `src/move-service.ts` is the only module that calls the TypeScript language
  service. A future engine change stays inside it.
- The service host passes `ts.sys.realpath`. pnpm links one package into
  several `node_modules` folders, and without real paths the service loads it
  twice and reports false errors between the copies.
- Diagnostics are compared by file, code and message, counted per occurrence,
  because positions shift when code moves. A diagnostic that moves with its
  statement into the target therefore counts as new.
