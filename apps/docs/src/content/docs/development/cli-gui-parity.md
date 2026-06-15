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
| `course.list` | yes | yes | yes | |
| `course.load` | yes | yes | yes | |
| `course.save` | yes | yes | yes | Internal save path for CLI repo operations |
| `course.delete` | yes | — | yes | Managed in GUI course settings flow |
| `settings.loadApp` | yes | yes | yes | Internal to CLI runtime |
| `settings.saveCredentials` | yes | — | yes | GUI connection settings persist credential records |
| `settings.savePreferences` | yes | yes | yes | Internal to `course load` context switch |
| `connection.verifyLmsDraft` | yes | yes | yes | |
| `connection.listLmsCoursesDraft` | yes | — | yes | One-time discovery during setup |
| `connection.verifyGitDraft` | yes | yes | yes | |
| `connection.verifyLlmDraft` | yes | — | yes | Settings verification for examination providers |
| `roster.importFromFile` | yes | — | yes | File picker + column mapping |
| `roster.importFromLms` | yes | — | yes | Setup-phase, done once per course |
| `roster.exportMembers` | yes | — | yes | File save dialog |
| `groupSet.fetchAvailableFromLms` | yes | — | yes | Setup-phase exploration |
| `groupSet.connectFromLms` | yes | — | yes | Interactive selection + linking |
| `groupSet.syncFromLms` | yes | — | yes | Setup-phase, done once per group set |
| `groupSet.previewImportFromFile` | yes | — | yes | Visual diff before commit |
| `groupSet.importFromFile` | yes | — | yes | Applies the previewed import |
| `groupSet.export` | yes | — | yes | File save dialog |
| `gitUsernames.import` | yes | — | yes | File picker + verification dialog |
| `validation.roster` | yes | yes | yes | Called internally by `validate` |
| `validation.assignment` | yes | yes | yes | |
| `repo.create` | yes | yes | yes | |
| `repo.clone` | yes | yes | yes | |
| `repo.update` | yes | yes | yes | |
| `repo.listNamespace` | yes | yes | yes | Namespace-scoped repository discovery |
| `repo.bulkClone` | yes | yes | yes | Namespace-scoped bulk clone |
| `userFile.inspectSelection` | yes | — | yes | File picker dependent |
| `userFile.exportPreview` | yes | — | yes | File save target dependent |
| `analysis.run` | yes | — | yes | Interactive repository analysis |
| `analysis.blame` | yes | — | yes | Interactive per-file blame analysis |
| `analysis.discoverRepos` | yes | — | yes | Folder/repository browser support |
| `analysis.listFolderFiles` | yes | — | yes | Folder/repository browser support |
| `analysis.readFolderFile` | yes | — | yes | Folder/repository browser support |
| `examination.generateQuestions` | yes | — | yes | Interactive LLM-backed examination generation |
| `examination.lookupQuestions` | yes | — | yes | Examination archive lookup |
| `examination.archive.export` | yes | — | yes | File save dialog |
| `examination.archive.import` | yes | — | yes | File picker dependent |

## CLI commands (kept)

These 11 workflow-backed commands serve scripting and automation:

| Command | Workflow(s) | Rationale |
|---|---|---|
| `course list` | `course.list` | Quick context check, pipeable |
| `course active` | `settings.loadApp` | Shell scripts need active course ID |
| `course show` | `course.load` | JSON dump for `jq` pipelines and debugging |
| `course load` | `course.load`, `settings.savePreferences` | Context switching for multi-course scripting |
| `lms verify` | `connection.verifyLmsDraft` | Connection gate before batch ops |
| `git verify` | `connection.verifyGitDraft` | Connection gate before batch ops |
| `repo create` | `repo.create` | Primary automation: `--dry-run`, `--all`, `--template-path` |
| `repo clone` | `repo.clone` | Bulk grading: `--layout`, `--target` |
| `repo update` | `repo.update` | Template PR push across repos |
| `repo discover` | `repo.listNamespace`, `repo.bulkClone` | Namespace-scoped discovery and bulk clone |
| `validate` | `validation.roster`, `validation.assignment` | Pre-flight check, scriptable gate |

The top-level `update` command is also kept, but it does not execute through the workflow runtime.

## GUI-only workflows (by reason)

**File picker / file save dependent:**
`roster.importFromFile`, `roster.exportMembers`, `groupSet.previewImportFromFile`, `groupSet.importFromFile`, `groupSet.export`, `gitUsernames.import`, `userFile.inspectSelection`, `userFile.exportPreview`, `examination.archive.export`, `examination.archive.import`

**Interactive conflict resolution:**
`groupSet.connectFromLms` — requires visual selection from fetched LMS data, then linking.

**Multi-step setup:**
LMS, Git and LLM connection settings are edited in GUI panes and persisted by the renderer credentials persister; the CLI keeps only the active-course preference write needed for `course load`.

**Interactive exploration / LLM review:**
`analysis.*` and `examination.*` workflows depend on repository browsing, blame inspection, author selection, and examination question review.

## Dropped CLI commands (with rationale)

These commands are intentionally excluded because they are setup-phase operations, better served by the GUI:

| Command | Why dropped |
|---|---|
| `course delete` | Rarely needed, never in automation |
| `roster show` | `course show \| jq .roster` provides the same data with more flexibility |
| `lms list-courses` | One-time discovery during course setup |
| `lms import-students` | Done once per course; GUI shows conflict resolution |
| `lms import-groups` | Done once per group set; GUI shows group mapping |

## Decision rule

A workflow should only be added to CLI if:

1. It can complete without interactive user input beyond flags and arguments.
2. It serves a repeatable execution or automation use case (not one-time setup).
