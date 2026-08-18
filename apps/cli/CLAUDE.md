# CLAUDE.md

This is the TypeScript CLI app (`@repo-edu/cli`).

Run the CLI in Node development with
`node --import tsx apps/cli/src/main.ts --help`.

## Architecture

`apps/cli` is an I/O and presentation layer over shared workflows.

- `src/main.ts`: production and compiled-artifact entry. Resolves the shared
  app-data root, claims the program gate and gives command composition one
  child-process lifetime controller.
- `src/child-process-lifetime.ts`: child-process lifetime composition. macOS
  and Linux use the POSIX platform adapter. Windows loads its platform adapter
  on demand and uses the fixed launcher source owned by `packages/host-node`.
- `src/command-line-lifetime.ts`: command-line signal and shutdown owner. It
  stops and confirms the shared controller before releasing the program gate or
  exiting the host.
- `src/cli.ts`: Commander command tree (`redu`)
- `src/commands/*`: command handlers and shell output formatting
- `src/workflow-runtime.ts`: builds the in-process `WorkflowClient` from
  `@repo-edu/application` and routes Git through the host's child-process
  lifetime controller
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
must pass `scripts/validate-program-gate-artifact.mjs` and the child-process lifetime
artifact validator owned by the desktop package.

The production entry owns one child-process lifetime controller and one shutdown order.
Normal completion, repeated interrupt and termination all stop and confirm the
controller before the program gate is released or the process exits. In-process
`createProgram` callers own their surrounding lifetime.
The artifact probe runs this order in Node development and the shipped Bun
binary. The command-line program never starts the Codex SDK host process.

Settings are stored under `settings/credentials.json` and
`settings/preferences.json`. CLI commands print recovery warnings when a corrupt
or unsupported composite settings file is backed aside.

## Rules

- Keep command files thin: parse args, call workflows, render output.
- Do not duplicate workflow/domain logic in CLI.
- Do not move program-gate ownership into `createProgram`. Tests and other
  in-process callers provide isolated roots and own their surrounding lifetime.
- `createProgram` and the workflow runtime require the child-process lifetime controller
  from their caller. Neither may build one of its own, because a composition
  that did would own process trees no caller can stop and confirm.
- Keep help/golden outputs stable unless command UX changes intentionally.
- See [CLI-GUI Parity](../docs/src/content/docs/development/cli-gui-parity.md) for the decision rule on which workflows belong in CLI vs GUI.
