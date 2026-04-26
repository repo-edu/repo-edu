---
title: Settings and Courses
description: Connections, course management, appearance preferences, and storage
---

repo-edu separates configuration into two layers: **app settings** for global preferences and connections, and **courses** for course-specific data like rosters, groups, and assignments.

## App settings

App settings are shared across all courses and include:

- **LMS connections** — credentials for Canvas or Moodle (provider name, base URL, API token). Multiple connections can be configured for institutions that use more than one LMS.
- **Git connections** — credentials for GitHub, GitLab, or Gitea (provider, base URL, personal access token). Each connection has a unique ID.
- **Active course** — which course is currently selected in the UI and CLI.
- **Appearance** — theme (system/light/dark), window chrome style, date format (MDY/DMY), and time format (12h/24h).
- **Table layout** — column visibility and sizing for roster and group tables, persisted across sessions.

### Adding connections

In the desktop app, open the Settings panel to add or edit LMS and Git connections. Each connection can be verified before saving — verification makes a test API call to confirm the credentials work without storing any data until you save.

From the CLI, you can verify an existing connection:

```bash
redu lms verify --course <course-id>
redu git verify --course <course-id>
```

## Courses

A course stores everything specific to one class or cohort:

- **Course identity** — unique ID, display name, and linked LMS course ID
- **Connections** — which LMS connection and Git connection this course uses (by reference to app settings)
- **Organization** — the Git organization or group where repositories are created
- **Roster** — students and staff, with enrollment type, email, student number, Git username, and status
- **Groups and group sets** — team assignments, either imported from LMS or from CSV files
- **Assignments** — named deliverables, each linked to a group set and optionally to a repository template
- **Repository template** — the template repository used when creating student repositories

### Creating and managing courses

Courses are created in the desktop app. The course document is validated on every save — invalid data (missing required fields, schema mismatches) is rejected with specific error messages pointing to the problem fields.

Each course tracks a revision number that increments on every save. If two sessions (e.g., the desktop app and CLI) try to save the same course simultaneously, the second save is rejected to prevent silent data loss. Reload the course to pick up the latest version before making further changes.

### Course commands (CLI)

```bash
redu course list                  # List all courses with active marker
redu course active                # Show the active course ID
redu course show                  # Output the active course as JSON
redu course load <course-id>      # Set the active course
```

## Storage locations

| Surface | Location | Override |
|---------|----------|---------|
| Desktop | Platform-specific application data directory | None |
| CLI | `~/.repo-edu/` | Set `REPO_EDU_CLI_DATA_DIR` environment variable |

Both surfaces store settings and courses as JSON files that are validated on every read and write. Files that fail validation are rejected — there is no partial-load or best-effort parsing.

The desktop app additionally keeps an analysis and blame result cache in the same data directory (`cache/cache.db`). It accumulates as you analyze repositories and is shared across courses; the **Storage** pane lets you set per-type size budgets, see hit-rate statistics, or clear the cache. See [Analysis Caching](/repo-edu/development/analysis-caching/) for the underlying behavior.

## Undo and redo

In the desktop app, roster edits (adding members, moving groups, editing fields) support undo and redo. Each change is recorded as a patch. Undo reverses the most recent patch; redo reapplies it. The undo history has a fixed size limit and is cleared when you load a different course.

Non-roster changes (course metadata, settings) are not tracked in undo history — they save immediately.

## Autosave

The desktop app autosaves your course after each change with a short debounce delay. The save indicator in the UI shows whether the document is saving, saved, or encountered an error. If a save fails (network issue, revision conflict), it retries automatically with increasing delays.
