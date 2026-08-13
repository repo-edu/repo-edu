# CLAUDE.md

This is the TypeScript CLI app (`@repo-edu/cli`).

Run CLI after the TypeScript build: `node apps/cli/dist/main.js --help`

## Architecture

`apps/cli` is an I/O and presentation layer over shared workflows.

- `src/main.ts`: production and compiled-artifact entry. Resolves the shared
  app-data root, claims the program gate before command construction and
  releases it after the command settles.
- `src/cli.ts`: Commander command tree (`redu`)
- `src/commands/*`: command handlers and shell output formatting
- `src/workflow-runtime.ts`: builds the in-process `WorkflowClient` from
  `@repo-edu/application` and routes Git through one child-lifetime adapter
- `src/state-store.ts`: filesystem-backed course store plus settings credentials/preferences section stores

All business rules must remain in shared packages (`@repo-edu/domain`, `@repo-edu/application`).

## Command Surface

- `course list|active|show|load`
- `lms verify`
- `git verify`
- `repo create|clone|update|discover`
- `update` (self-update)
- `validate`

## Data Directory

Default: the shared platform app-data root resolved by `@repo-edu/host-node`.
In-process tests pass temporary roots through `createProgram` or workflow store
constructors.

The production entry claims the shared desktop/CLI program gate before it
creates the Commander program. A busy gate exits with the shared conflict
message. Unexpected gate failures are terminal. Compiled release artifacts
must pass `scripts/validate-program-gate-artifact.mjs`.

Settings are stored under `settings/credentials.json` and
`settings/preferences.json`. CLI commands print recovery warnings when a corrupt
or unsupported composite settings file is backed aside.

## Rules

- Keep command files thin: parse args, call workflows, render output.
- Do not duplicate workflow/domain logic in CLI.
- Do not move program-gate ownership into `createProgram`. Tests and other
  in-process callers provide isolated roots and own their surrounding lifetime.
- Keep help/golden outputs stable unless command UX changes intentionally.
- See [CLI-GUI Parity](../docs/src/content/docs/development/cli-gui-parity.md) for the decision rule on which workflows belong in CLI vs GUI.
