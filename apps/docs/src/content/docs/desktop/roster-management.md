---
title: Roster Management
description: View, edit, import, and export course members in the desktop app
---

The Roster tab shows a table of all course members — students and staff — with inline editing, sorting, search, and import/export tools.

## Roster table

The table displays one row per member with columns for:

| Column | Editable | Description |
|--------|----------|-------------|
| **Name** | Yes (local members) | Display name. Read-only for LMS-imported members. |
| **Email** | Yes (local members) | Primary email address. Read-only for LMS-imported members. |
| **Status** | Yes | Active, Incomplete, or Dropped. Dropdown selector. |
| **Role** | No | Student, Teacher, TA, Designer, Observer, Other. Derived from enrollment type. |
| **Groups** | No | Shows group memberships as badges. Managed in the Groups tab. |
| **Git Username** | Yes | Git provider handle. Shows a verification icon (valid/invalid/unknown). |
| **Student Number** | Yes (local members) | Institution student number. |

### Sorting

Click a column header to sort by that column. Click again to reverse, and a third time to clear. You can sort by multiple columns — each subsequent click adds a secondary sort level.

### Search

The search field filters the table across all visible columns. Type a name, email, or group name to narrow the list.

### Column visibility

Use the column visibility dropdown to show or hide columns. Your choices are saved in app settings and persist across sessions.

### Column resizing

Drag the border between column headers to adjust widths. Sizes are saved automatically.

## Adding members manually

Click **Add Member** to add a row to the table. Enter a name and email, then press Enter or click away to save. The new member is added with status Active and role Student.

Manually added members can be fully edited and deleted. Members imported from an LMS have their name and email locked to the LMS values — you can still edit their status and Git username.

## Importing from LMS

Click **Import** → **From LMS** to sync the roster with your connected LMS. This requires an LMS connection and linked course ID (configured in Settings and the course setup).

The import:

1. Fetches all enrolled users from the LMS
2. Matches them to existing roster members by LMS user ID, email, or student number
3. Adds new members and updates changed ones
4. Preserves any local edits you've made (Git usernames, status overrides)

If the import finds ambiguous matches (one LMS user matching multiple roster members), these are shown as conflicts for you to resolve.

See [LMS Import](/repo-edu/user-guide/lms-import/) for the full workflow.

## Importing from CSV

Click **Import** → **From File** to upload a CSV file. The file should have columns matching the roster format (see [Output Formats](/repo-edu/reference/output-formats/) for the column spec). A preview shows what will be imported before you confirm.

## Git usernames

Git usernames are required for repository operations — they determine which users get added as collaborators on created repositories.

### Importing Git usernames from CSV

Click **Import** → **Git Usernames** to upload a CSV file mapping email addresses to Git usernames. The file needs `email` and `git_username` columns.

### Verifying Git usernames

After importing usernames, click **Verify Git Usernames** to check each one against the configured Git provider. Each username gets a status:

- **Valid** (green check) — the username exists on the Git provider
- **Invalid** (red X) — the username was not found
- **Unknown** (gray) — not yet verified

Invalid usernames should be corrected before running repository operations.

## Exporting

Click **Export** to download the roster as CSV or XLSX. The export includes all members (students and staff) with all their fields.

## Deleting members

You can delete manually added members. LMS-imported members cannot be deleted — set their status to Dropped instead, which excludes them from group assignments and repository operations.

## Undo and redo

All roster edits (adding, editing, deleting members, status changes) support undo and redo. The undo/redo buttons in the header show tooltips describing the action that will be reversed or reapplied.
