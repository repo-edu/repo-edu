---
title: Settings and Courses
description: Connections, course management, appearance preferences, and storage
---

repo-edu separates configuration into two layers: **app settings** for global preferences and connections, and **courses** for course-specific data like rosters, groups, and assignments.

## App settings

App settings are shared across all courses and include:

- **LMS connections** — credentials for Canvas or Moodle (provider name, base URL, API token). Multiple connections can be configured for institutions that use more than one LMS.
- **Git connections** — credentials for GitHub, GitLab, or Gitea (provider, base URL, personal access token). Each connection has a unique ID.
- **LLM connections** — Claude or Codex connections used by the Examination view. Claude API-key connections also store a required maximum output-token cap.
- **Active surface** — whether the UI is on home, a course, a folder-analysis surface, or a submission-analysis surface. The CLI uses the active course when one is selected.
- **Appearance** — theme (system/light/dark), window chrome style, date format (MDY/DMY), time format (12h/24h), and source-code highlighting theme.
- **Table layout** — column visibility and sizing for roster and group tables, persisted across sessions.
- **Analysis preferences** — default extensions, Analysis sidebar state, split-pane sizes, and analysis concurrency.

### Adding connections

In the desktop app, open the Settings panel to add or edit LMS, Git, and LLM connections. Each connection can be verified before saving — verification makes a test call to confirm the credentials work without storing any data until you save.

From the CLI, you can verify an existing connection:

```bash
redu lms verify --course <course-id>
redu git verify
```

## Courses

A course stores everything specific to one class or cohort:

- **Course identity** — unique ID, display name, and linked LMS course ID
- **Connections** — which LMS connection the course uses; repository operations use the active Git connection from app settings
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
| Desktop | Platform app-data root | None |
| CLI | Same platform app-data root | None |

The platform app-data root is `~/Library/Application Support/repo-edu` on macOS, `${XDG_CONFIG_HOME:-~/.config}/repo-edu` on Linux, and `%APPDATA%\repo-edu` on Windows.

Both surfaces store settings and courses as JSON files that are validated on every read and write. Settings are split into `settings/credentials.json` and `settings/preferences.json`; a corrupt section is backed aside independently so the other section can still load.

The desktop app also keeps the examination archive in the same data directory at `examinations/archive.db`. The archive stores generated examination records; analysis and blame results are recomputed and are not persisted in a cache. See [Analysis Execution](/repo-edu/development/analysis-caching/) for the current analysis behavior.

## Undo and redo

In the desktop app, roster edits (adding members, moving groups, editing fields) support undo and redo. Each change is recorded as a patch. Undo reverses the most recent patch; redo reapplies it. The undo history has a fixed size limit and is cleared when you load a different course.

Non-roster changes (course metadata, settings) are not tracked in undo history — they save immediately.

## Saving

The desktop app persists course and settings changes after a short debounce delay. The save indicator shows whether a course write is saving, saved, or blocked by an error. Retryable save failures retry automatically; course revision conflicts stay visible until you reload.
