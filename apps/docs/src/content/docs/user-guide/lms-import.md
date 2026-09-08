---
title: LMS Import
description: Import rosters and group sets from Canvas or Moodle
---

repo-edu can import student rosters and group sets directly from your institution's Learning
Management System. This keeps your course data in sync with enrollment changes without manual CSV
wrangling.

Supported LMS providers:

- **Canvas** (Canvas LMS REST API)
- **Moodle** (Moodle Web Services API)

LMS import is managed in the desktop GUI, where you can review and resolve data interactively. The
CLI can verify connections but cannot run imports.

## Prerequisites

Before importing, your course needs:

1. **An LMS connection** configured in app settings (provider, base URL, API token). You can add one
   in the Settings panel.
2. **A linked LMS course ID** — use the desktop GUI to browse available LMS courses and select the
   one that corresponds to your course.

## Verifying your connection

You can test that your LMS credentials work before importing. In the desktop app, the connection
panel shows verification status. From the CLI:

```bash
redu lms verify --course <course-id>
```

This makes a test API call to the LMS without storing any data. It reports whether verification
succeeded with a timestamp, or an error if the credentials are invalid or the LMS is unreachable.

## Importing the student roster

In the desktop app, open **Sync Roster from LMS** for your course:

1. Choose the LMS connection and click **Preview** to fetch students and staff.
2. Review the counts of added, updated and unchanged members. Use **View Conflict Details**
   when identity matches are unclear; those entries stay unchanged.
3. Click **Apply Sync** to accept the preview. The roster and its fetch date become part of
   the course together and are saved automatically.

The preview leaves the live roster unchanged. Applying it also updates the system group sets
(Individual Students and Staff) to reflect the accepted roster membership.

For every LMS preview, editing or reloading the course before apply makes the preview stale.
Apply then refuses the old preview. Click **Refresh Preview**, review it again and apply it.
The saved date is the time the data was fetched, not the later time you clicked Apply.

## Importing group sets

LMS platforms organise students into group sets (Canvas) or groupings (Moodle) for team-based work.
repo-edu can import these as local group sets:

### Discovering available group sets

Open **Add Connected Group Set** in the desktop app. The **LMS Group Set** list shows available
group sets that are not already connected to this course. Selecting one does not change the course.

### Connecting a group set

Select an LMS group set, then click **Preview**. Review the group names and matched member counts.
Only members found in the course roster are included.

Click **Apply** to create the connected group set with the reviewed groups and memberships.
Its fetch date is accepted in the same course change. Cancelling discards the preview.

### Syncing an existing group set

Open **Sync Group Set from LMS** for the connected group set and click **Preview** to fetch its
latest data. Review the groups and matched member counts before clicking **Apply**.

Apply replaces the group set's membership with the preview and records the new fetch date.
Fetching or cancelling a preview leaves the saved groups and their previous fetch date unchanged.

## Importing from CSV files

If your roster or group data comes from a spreadsheet rather than an LMS API, you can import
directly from CSV files.

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

Each row represents one member in one group. A group with three members appears as three rows.
Before the actual import, the desktop GUI shows a preview of what will change — groups to create,
members matched, and any emails that don't match existing roster members.

For updates to an existing group set, use import with a target group set:

- CSV import is additive/update-only (unmentioned groups are kept).
- RepoBee `.txt` students import is full-replace for the target imported set.

## After import

Imported rosters and group sets are saved to the course document automatically. You can then:

- Review and edit members in the roster table
- Validate the roster with `redu validate --assignment <name> --course <course-id>`
- Proceed to [Repository Setup](/repo-edu/user-guide/repository-setup/) for creating assignment
  repositories
