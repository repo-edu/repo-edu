# CLAUDE.md

This is the TypeScript CLI app (`@repo-edu/cli`).

Run CLI after build: `node apps/cli/dist/redu.js --help`

## Architecture

`apps/cli` is an I/O and presentation layer over shared workflows.

- `src/cli.ts`: Commander command tree (`redu`)
- `src/commands/*`: command handlers and shell output formatting
- `src/workflow-runtime.ts`: builds in-process `WorkflowClient` from `@repo-edu/application`
- `src/state-store.ts`: filesystem-backed course/settings stores

All business rules must remain in shared packages (`@repo-edu/domain`, `@repo-edu/application`).

## Command Surface

- `course list|active|show|load`
- `lms verify`
- `git verify`
- `repo create|clone|update`
- `validate`

## Data Directory

Default: `~/.repo-edu`

Override for tests or automation:

```bash
REPO_EDU_CLI_DATA_DIR=/tmp/repo-edu-cli node apps/cli/dist/redu.js course list
```

## Rules

- Keep command files thin: parse args, call workflows, render output.
- Do not duplicate workflow/domain logic in CLI.
- Keep help/golden outputs stable unless command UX changes intentionally.
- See [CLI-GUI Parity](../docs/src/content/docs/development/cli-gui-parity.md) for the decision rule on which workflows belong in CLI vs GUI.
