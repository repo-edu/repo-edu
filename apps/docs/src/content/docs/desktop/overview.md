---
title: Desktop App Overview
description: The primary interface for managing courses, rosters, and repository operations
---

The desktop app is the primary interface for repo-edu. It runs as an Electron application and provides interactive tools for managing courses, editing rosters, organizing groups, and running repository operations.

See [Installation](/repo-edu/getting-started/installation/) to download and install the app. The [Interactive Demo](/repo-edu/demo/) on this site runs the same interface in the browser against mock data, so you can explore the UI first without installing anything.

## Interface layout

The app has a header bar and a two-tab workspace:

- **Header bar** — course switcher (left), tab buttons (center), undo/redo and settings (right)
- **Roster tab** — table view of all course members with inline editing
- **Groups & Assignments tab** — sidebar of group sets with a detail panel for groups, assignments, and repository templates

## Course switcher

The course dropdown in the header lets you:

- Switch between courses
- Create a new course (blank or linked to an LMS course)
- Rename, duplicate, or delete courses

All operations in the app apply to the currently selected course.

## Settings

Open settings with the gear icon or **Cmd+,** (Mac) / **Ctrl+,** (Windows). The settings panel has sections for:

### LMS connections

Configure connections to Canvas or Moodle. Each connection needs a provider type, base URL, and API token. Use the **Verify** button to test credentials before saving — this makes a test API call without storing anything.

You can configure multiple LMS connections (for example, one per campus or department).

### Git connections

Configure connections to GitHub, GitLab, or Gitea. Each connection needs a provider, base URL, and personal access token with permission to create repositories in your target organization.

### Display

Theme selection (light, dark, or follow system), date and time format preferences.

## Examination privacy

The Examination view can generate oral-exam questions with a configured LLM provider. Provider prompts contain redacted code excerpts, opaque excerpt IDs, line numbers, language labels, the question count, and model-independent instructions.

Real author names, emails, roster IDs, repository paths, and file paths remain local to the app workflow. Archive bundles store pathless anchors and minimized provenance; imported bundles are user-supplied local content, not proof that repo-specific output scanning ran.

Redaction removes comments where tokenization is supported and substitutes detected emails, matched local identifiers, git usernames, and obvious secret literals before the prompt is sent. Code excerpts may still contain personal data after best-effort redaction. Institutions remain responsible for legal basis, provider agreements, international transfers, retention, and student notices.

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| **Cmd/Ctrl + Z** | Undo |
| **Cmd/Ctrl + Shift + Z** | Redo |
| **Cmd/Ctrl + ,** | Open settings |

Undo and redo apply to roster changes (member edits, group moves). The undo button tooltip shows what action will be reversed.

## Saving

The app persists course and settings changes after a short debounce delay. A save indicator shows the current course status:

- **Saving** — a change is being written
- **Saved** — all changes are persisted
- **Error** — the save failed (hover for details)

Retryable save failures retry automatically. See [Troubleshooting](/repo-edu/reference/troubleshooting/) for common causes.

## How the Interactive Demo relates

The [Interactive Demo](/repo-edu/demo/) on this documentation site runs the exact same React application as the desktop app. The difference is in how it connects to the outside world:

- **Desktop app** — runs inside Electron and talks to real LMS and Git APIs through the main process
- **Interactive Demo** — runs in the browser against mock data and simulated responses

This means you can use the demo to explore the interface, try out table editing, inspect group management, and see how workflows behave — all without installing the desktop app or configuring real connections. The demo uses the same fixture data you see in the test suite, so it always shows a realistic course setup.
