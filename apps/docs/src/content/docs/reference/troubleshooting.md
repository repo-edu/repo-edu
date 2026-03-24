---
title: Troubleshooting
description: Common setup, runtime, and workflow failures
---

## Installation and build

### `pnpm install` fails

- Verify Node version: `node -v` (requires Node 24).
- Verify pnpm version: `pnpm -v` (requires pnpm 10+).
- Delete `node_modules` and `pnpm-lock.yaml`, then run `pnpm install` again.

### Docs build fails on unresolved imports

Shared workspace packages must be built before the docs site can resolve their exports:

```bash
pnpm build
pnpm docs:build
```

### Type errors after pulling changes

Rebuild type declarations to pick up new or changed package exports:

```bash
pnpm build:types
pnpm typecheck
```

## Desktop app

### Electron window does not open

- Check the dev output for preload or renderer errors: `pnpm dev`
- Verify that `apps/desktop/src/preload.ts` is exposing `repoEduDesktopHost`. If this bridge is missing, the renderer cannot communicate with the main process.

### Save indicator shows error

The autosave encountered a problem. Common causes:

- **Revision conflict** — another session saved the same course. Reload the course to get the latest version.
- **Disk permission error** — the Electron `userData` directory is not writable.
- **Schema validation failure** — the course data doesn't match the expected schema. This usually indicates a bug — check the developer console for the validation error path.

The autosave retries automatically with increasing delays. If the error persists, check the developer console (View > Toggle Developer Tools) for details.

### Undo doesn't revert a change

Only roster mutations (member edits, group moves, assignment changes) are tracked in undo history. Course metadata changes (display name, connections, organization) and settings changes save immediately and cannot be undone.

## CLI

### `redu` reports no active course

Set an active course before running commands that require one:

```bash
redu course list
redu course load <course-id>
```

### CLI data directory location

By default, the CLI stores data in `~/.repo-edu/`. Override with:

```bash
REPO_EDU_CLI_DATA_DIR=/path/to/data redu course list
```

### Command not found after build

The CLI must be built before running:

```bash
pnpm cli:build
node apps/cli/dist/index.js --help
```

## LMS and Git connections

### Connection verification fails

- **Authentication error** — check that your API token is valid and has the required permissions.
- **Network error** — verify the base URL is correct and reachable. Canvas URLs typically end in `/api/v1`, Moodle URLs in `/webservice/rest/server.php`.
- **Provider error** — the LMS or Git provider returned an unexpected response. Check if the service is experiencing downtime.

### LMS import finds no students

- Verify the `lmsCourseId` matches an active course on your LMS.
- Check that students are enrolled (not just invited) in the LMS course.
- Some LMS configurations require specific API scopes to access enrollment data.

### Git username verification marks usernames as invalid

The verification workflow checks whether the username exists on the Git provider. Common causes of `invalid` status:

- The username is misspelled or uses the wrong case.
- The student's account is on a different Git provider instance than your configured connection.
- The Git provider API rate limit has been exceeded — retry later.

## Repository operations

### Validation fails before repository creation

Run validation separately to see the full issue list:

```bash
redu validate --assignment "Project 1" --course <course-id>
```

Common issues:

- **Missing Git usernames** — members need Git usernames before repositories can be created. Import them from CSV or have students register them.
- **Duplicate repository names** — two groups resolve to the same repository name. Rename one of the groups.
- **Empty groups** — groups with no active members are skipped. Check that members are assigned to groups.

### Repositories created but template not pushed

- Verify the template repository exists and is accessible with your Git token.
- Check that the template path is correct (for local templates, the directory must exist and contain at least one commit).

### Clone fails for some repositories

- The Git token may lack read access to the organization's repositories.
- Some repositories may have been deleted or renamed after creation.
- Network timeouts on large repositories — retry the clone for the failed groups.

## Tests

### Workflow alignment test fails

This means the docs demo runtime is missing a handler for a workflow that's marked as docs-deliverable. See [Adding a Workflow](/repo-edu/development/workflow-adding/) for how to wire new workflows into the docs runtime.

### Browser guardrail test fails

A browser-safe package imported a Node or Electron API. Check the test output for the specific file and import pattern, then move the Node-dependent code to `@repo-edu/host-node` or the appropriate app shell.
