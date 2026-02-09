---
title: LMS Import
description: Import student rosters and group sets from your Learning Management System
---

Import student rosters, staff, and group sets from your Learning Management System.

## Supported LMS Platforms

- **Canvas** — Full support for courses, students, staff, and group categories
- **Moodle** — Full support for courses, students, staff, and groupings

## Configuration

Before importing, configure your LMS connection in **Settings** (click the gear icon):

### LMS Settings

| Setting | Description |
|---------|-------------|
| LMS Type | Canvas or Moodle |
| Base URL | Your institution's LMS URL |
| Access Token | API token for authentication |
| Course ID | The course to fetch data from |

:::tip[Finding Course ID]
The course ID is typically in the URL when viewing your course:

- Canvas: `https://canvas.example.com/courses/12345` → ID is `12345`
- Moodle: `https://moodle.example.com/course/view.php?id=67890` → ID is `67890`
:::

## Roster Import Workflow

### Step 1: Configure Connection

1. Open Settings (gear icon or `Cmd+,`)
2. Go to the **Connections** section
3. Select your LMS type (Canvas or Moodle)
4. Enter your institution's base URL
5. Paste your API access token
6. Enter the course ID

### Step 2: Verify Connection

Click **Verify** to test your configuration. A successful verification shows:

- Course name and code
- Confirmation of API access
- Number of enrolled students and staff

:::caution[Common Issues]

- **Unauthorized**: Token expired or lacks permissions
- **Course not found**: Wrong course ID or no access
- **Connection failed**: Check base URL format
:::

### Step 3: Import Roster

From the **Roster** tab:

1. Click the import dropdown in the utility bar
2. Select **Import from LMS**
3. Review the sync dialog showing student and staff counts
4. Confirm the import

The import always fetches all enrollment types (students, teachers, TAs, designers, observers).
Students are placed in the `students` list and non-student roles in the `staff` list.

### Step 4: Review and Edit

After import, the Roster tab displays:

- **Member table** — All imported students with name, email, status, and git username
- **Enrollment info** — Enrollment type and LMS-native status labels
- **Validation warnings** — Members missing git usernames, duplicate emails, etc.

You can:

- Edit member details (name, email, git username) inline
- Add or remove members manually
- Import git usernames from a file
- Verify git usernames against the Git platform

### Roster Sync Behavior

When syncing an existing roster from LMS:

- **Merge, not replace** — New members are added, existing members updated by email match
- **Status tracking** — Members no longer in the LMS are set to `dropped` status
- **Staff split** — Non-student enrollments are automatically placed in the staff list
- **Group cleanup** — Dropped members are removed from all group memberships

## Group Set Import

Group sets from the LMS are imported separately from the roster, via the **Groups & Assignments**
tab.

### Syncing LMS Group Sets

1. In the **Groups & Assignments** tab sidebar, click **Connect LMS Group Set**
2. Select a group category/grouping from the LMS
3. The group set and its groups are created with LMS connection metadata
4. Groups from the LMS have `origin: lms` and are read-only

### Re-syncing

Click the sync button on a connected group set to pull the latest group data from the LMS. Changes
are merged (new groups added, removed groups deleted, membership updated).

### Local Editing of LMS Groups

LMS-synced groups are read-only to prevent accidental edits that would be lost on next sync. To
create an editable copy:

1. Export the group set to CSV
2. Import the CSV as a new local group set
3. The imported groups have `origin: local` and are fully editable

## Export Options

Export your roster for use with the CLI or external tools:

| Format | Use Case |
|--------|----------|
| YAML | Repository setup operations, CLI |
| CSV | Spreadsheet analysis, external tools |
| XLSX | Sharing with colleagues (includes enrollment type, department, etc.) |

Export from the Roster tab toolbar.

## Getting an Access Token

### Canvas

1. Log in to Canvas
2. Go to **Account** → **Settings**
3. Scroll to **Approved Integrations**
4. Click **+ New Access Token**
5. Enter a purpose (e.g., "repo-edu")
6. Click **Generate Token**
7. Copy the token immediately (it won't be shown again)

### Moodle

1. Contact your Moodle administrator
2. Request a web service token with these capabilities:
   - `core_course_get_courses`
   - `core_enrol_get_enrolled_users`
   - `core_group_get_course_groups`
   - `core_group_get_group_members`

:::caution[Token Security]

- Store tokens securely
- Never commit tokens to version control
- Regenerate if compromised
- Use tokens with minimal required permissions
:::

## See Also

- [Settings Reference](../reference/settings-reference.md) — Complete settings documentation
- [Output Formats](../reference/output-formats.md) — Detailed format specifications
