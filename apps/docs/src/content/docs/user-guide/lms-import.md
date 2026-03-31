---
title: LMS Import
description: Import rosters and group sets from Canvas or Moodle
---

repo-edu can import student rosters and group sets directly from your institution's Learning Management System. This keeps your course data in sync with enrollment changes without manual CSV wrangling.

Supported LMS providers:

- **Canvas** (Canvas LMS REST API)
- **Moodle** (Moodle Web Services API)

LMS import is managed in the desktop GUI, where you can review and resolve data interactively. The CLI can verify connections but cannot run imports.

## Prerequisites

Before importing, your course needs:

1. **An LMS connection** configured in app settings (provider, base URL, API token). You can add one in the Settings panel.
2. **A linked LMS course ID** — use the desktop GUI to browse available LMS courses and select the one that corresponds to your course.

## Verifying your connection

You can test that your LMS credentials work before importing. In the desktop app, the connection panel shows verification status. From the CLI:

```bash
redu lms verify --course <course-id>
```

This makes a test API call to the LMS without storing any data. It reports whether verification succeeded with a timestamp, or an error if the credentials are invalid or the LMS is unreachable.

## Importing the student roster

In the desktop app, open your course and navigate to the LMS import panel. The import workflow:

1. Fetches all enrolled users from the LMS course (students, TAs, instructors).
2. Matches them against existing roster members by LMS user ID, then email/student number.
3. Merges new and updated members into the roster, preserving any local edits you've made.
4. Reports a summary: members added, updated, unchanged, and any that were skipped because they lack an email address.

If the LMS returns users that match multiple existing members (e.g., a shared email), these are reported as **import conflicts** that you can resolve in the GUI.

After import, the system group sets (Individual Students and Staff) are automatically updated to reflect the new roster membership.

## Importing group sets

LMS platforms organize students into group sets (Canvas) or groupings (Moodle) for team-based work. repo-edu can import these as local group sets:

### Discovering available group sets

Use **Fetch from LMS** in the desktop GUI to see which group sets exist in the LMS course. This returns each group set's name, group count, and member count so you can decide which ones to import.

### Connecting a group set

Select a group set to connect it. This creates a local group set linked to the LMS source, imports all groups and member assignments, and matches members to your roster by LMS user identity. Members in the LMS group who aren't in your roster are reported as missing.

### Syncing an existing group set

After the initial connection, use **Sync from LMS** to refresh membership. This fetches the latest data from the LMS and updates your local groups — adding new members, removing dropped ones, and reflecting any group reassignments made in the LMS.

## Importing from CSV files

If your roster or group data comes from a spreadsheet rather than an LMS API, you can import directly from CSV files.

### Roster CSV import

Use the desktop GUI to import a CSV file with columns:

| Column | Required | Description |
|--------|----------|-------------|
| `name` | Yes | Student display name |
| `email` | No | Email address (used for matching) |
| `student_number` | No | Institution student number |
| `git_username` | No | Git provider username |
| `status` | No | `active`, `incomplete`, or `dropped` |
| `role` | No | Enrollment type |

### Group set CSV import

Import a group set from a CSV file with columns:

| Column | Required | Description |
|--------|----------|-------------|
| `group_name` | Yes | Name of the group/team |
| `name` | No | Member name (for display in preview) |
| `email` | No | Member email (matched against roster) |

Each row represents one member in one group. A group with three members appears as three rows. Before the actual import, the desktop GUI shows a preview of what will change — groups to create, members matched, and any emails that don't match existing roster members.

For updates to an existing group set, use import with a target group set:

- CSV import is additive/update-only (unmentioned groups are kept).
- RepoBee `.txt` students import is full-replace for the target imported set and supports naming strategies (`members` or `numbered`).

## After import

Imported rosters and group sets are saved to the course document automatically. You can then:

- Review and edit members in the roster table
- Validate the roster with `redu validate --assignment <name>`
- Proceed to [Repository Setup](/repo-edu/user-guide/repository-setup/) for creating assignment repositories
