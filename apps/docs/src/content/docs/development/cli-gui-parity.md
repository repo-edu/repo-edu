---
title: CLI-GUI Parity
description: Target split of workflows between CLI and GUI
---

## Principle

The CLI covers the **repeatable execution path** — operations you would script, automate, or run in CI. The GUI covers **interactive setup and exploration** — operations that benefit from file pickers, visual conflict resolution, or multi-step wizards.

Full CLI-GUI parity is not a goal. Every CLI command carries a maintenance cost (tests, help text, golden outputs, documentation). Commands only earn their place if they serve a scripting or automation use case.

## Industry precedent

This mirrors how established tools split their surfaces:

- **GitHub**: `gh` CLI focuses on PRs, issues, CI checks — scriptable workflows. GitHub Desktop covers visual diff, merge conflict resolution, branch management.
- **Vercel**: CLI owns deploy, env vars, rollbacks, promotion — the CI/CD pipeline. Dashboard owns domain config, analytics, team settings.
- **Supabase**: CLI owns migrations, local dev, project provisioning — repeatability. Dashboard owns data exploration, schema editing.

The shared pattern: CLI = repeatable execution, GUI = interactive setup.

## Workflow delivery matrix

The matrix below defines the CLI-vs-GUI split for workflow delivery:

| Workflow | Desktop | CLI | Docs | Notes |
|---|---|---|---|---|
| `analyses.list` | yes | — | yes | Document picker UI only |
| `analyses.load` | yes | — | yes | Document picker UI only |
| `analyses.save` | yes | — | yes | Document picker UI only |
| `analyses.delete` | yes | — | yes | Document picker UI only |
| `documents.list` | yes | — | yes | Unified document picker UI only |
| `course.list` | yes | yes | yes | |
| `course.load` | yes | yes | yes | |
| `course.save` | yes | yes | yes | Internal save path for CLI repo operations |
| `course.delete` | yes | — | yes | Managed in GUI course settings flow |
| `settings.loadApp` | yes | yes | yes | Internal to CLI runtime |
| `settings.saveApp` | yes | yes | yes | Internal to `course load` context switch |
| `connection.verifyLmsDraft` | yes | yes | yes | |
| `connection.listLmsCoursesDraft` | yes | — | yes | One-time discovery during setup |
| `connection.verifyGitDraft` | yes | yes | yes | |
| `roster.importFromFile` | yes | — | yes | File picker + column mapping |
| `roster.importFromLms` | yes | — | yes | Setup-phase, done once per course |
| `roster.exportMembers` | yes | — | yes | File save dialog |
| `groupSet.fetchAvailableFromLms` | yes | — | yes | Setup-phase exploration |
| `groupSet.connectFromLms` | yes | — | yes | Interactive selection + linking |
| `groupSet.syncFromLms` | yes | — | yes | Setup-phase, done once per group set |
| `groupSet.previewImportFromFile` | yes | — | yes | Visual diff before commit |
| `groupSet.previewReimportFromFile` | yes | — | yes | Visual diff before commit |
| `groupSet.export` | yes | — | yes | File save dialog |
| `gitUsernames.import` | yes | — | yes | File picker + verification dialog |
| `validation.roster` | yes | yes | yes | Called internally by `validate` |
| `validation.assignment` | yes | yes | yes | |
| `repo.create` | yes | yes | yes | |
| `repo.clone` | yes | yes | yes | |
| `repo.update` | yes | yes | yes | |
| `userFile.inspectSelection` | yes | — | yes | File picker dependent |
| `userFile.exportPreview` | yes | — | yes | File save target dependent |

## CLI commands (kept)

These 10 commands serve scripting and automation:

| Command | Workflow(s) | Rationale |
|---|---|---|
| `course list` | `course.list` | Quick context check, pipeable |
| `course active` | `settings.loadApp` | Shell scripts need active course ID |
| `course show` | `course.load` | JSON dump for `jq` pipelines and debugging |
| `course load` | `course.load`, `settings.saveApp` | Context switching for multi-course scripting |
| `lms verify` | `connection.verifyLmsDraft` | Connection gate before batch ops |
| `git verify` | `connection.verifyGitDraft` | Connection gate before batch ops |
| `repo create` | `repo.create` | Primary automation: `--dry-run`, `--all`, `--groups`, `--template-path` |
| `repo clone` | `repo.clone` | Bulk grading: `--layout`, `--target`, `--groups` |
| `repo update` | `repo.update` | Template PR push across repos |
| `validate` | `validation.roster`, `validation.assignment` | Pre-flight check, scriptable gate |

## GUI-only workflows (by reason)

**File picker / file save dependent:**
`roster.importFromFile`, `roster.exportMembers`, `groupSet.previewImportFromFile`, `groupSet.previewReimportFromFile`, `groupSet.export`, `gitUsernames.import`, `userFile.inspectSelection`, `userFile.exportPreview`

**Interactive conflict resolution:**
`groupSet.connectFromLms` — requires visual selection from fetched LMS data, then linking.

**Multi-step wizard:**
`settings.saveApp` — multi-pane connection setup for LMS and Git providers.

**Document picker UI:**
`analyses.list`, `analyses.load`, `analyses.save`, `analyses.delete`, `documents.list` — surfaced through the unified document picker; no scripting use case yet.

## Dropped CLI commands (with rationale)

These 9 commands are intentionally excluded because they are setup-phase operations, better served by the GUI:

| Command | Why dropped |
|---|---|
| `course delete` | Rarely needed, never in automation |
| `roster show` | `course show \| jq .roster` provides the same data with more flexibility |
| `lms list-courses` | One-time discovery during course setup |
| `lms import-students` | Done once per course; GUI shows conflict resolution |
| `lms import-groups` | Done once per group set; GUI shows group mapping |
| `lms cache list` | Setup-phase group set management |
| `lms cache fetch` | Setup-phase exploration |
| `lms cache refresh` | Setup-phase, same as `import-groups` |
| `lms cache delete` | Setup-phase cleanup with referential integrity checks |

## Decision rule

A workflow should only be added to CLI if:

1. It can complete without interactive user input beyond flags and arguments.
2. It serves a repeatable execution or automation use case (not one-time setup).
