---
title: Quick Start
description: Get up and running with repo-edu in minutes
---

## Step 1: Create a Profile

1. Open repo-edu
2. Click the **gear icon** (or press `Cmd+,`) to open Settings
3. Click **New Profile**
4. Name it after your course (e.g., `cs101-fall-2025`)

## Step 2: Configure Connections

In the Settings sheet:

### LMS Connection

1. Go to the **LMS** section
2. Select your LMS type (Canvas or Moodle)
3. Enter your institution's base URL
4. Add your API access token (see [Getting an Access Token](#getting-an-access-token))
5. Enter your course ID
6. Click **Verify** to test the connection

### Git Platform Connection

1. Go to the **Git** section
2. Select your platform (GitHub, GitLab, or Gitea)
3. Enter your platform credentials
4. Set the student repos organization/group
5. Set the template organization/group
6. Click **Verify** to test the connection

## Step 3: Import Roster (Roster Tab)

1. Go to the **Roster** tab
2. Click the import dropdown and select **Import from LMS**
3. Review the sync dialog (shows student and staff counts)
4. Confirm the import

✓ Your student and staff roster is now loaded.

## Step 4: Set Up Groups & Assignments (Groups & Assignments Tab)

1. Go to the **Groups & Assignments** tab
2. System group sets (Individual Students, Staff) are created automatically
3. Optionally connect LMS group sets or create local group sets
4. Click **New Assignment**
5. Enter the assignment name (e.g., `task-1`)
6. Select a group set and configure group selection (all groups or glob pattern)

## Step 5: Create Repositories (Operation Tab)

1. Go to the **Operation** tab
2. Select the assignment to set up
3. Click **Validate** to check for issues
4. Click **Setup** to create repositories

✓ Repositories are created for each group.

## Step 6: Save Your Work

1. Click **Save** (or press `Cmd+S`) to save the profile
2. Your roster, assignments, and settings are persisted

---

## Getting an Access Token

### Canvas

1. Log in to Canvas
2. Go to **Account** → **Settings**
3. Scroll to **Approved Integrations**
4. Click **+ New Access Token**
5. Give it a name and copy the token

### Moodle

1. Log in to Moodle as an administrator
2. Go to **Site administration** → **Plugins** → **Web services** → **Manage tokens**
3. Click **Create token**
4. Select your user and service
5. Copy the generated token

### GitHub

1. Go to **Settings** → **Developer settings** → **Personal access tokens**
2. Click **Generate new token (classic)**
3. Select scopes: `repo`, `admin:org`
4. Generate and copy the token

### GitLab

1. Go to **User Settings** → **Access Tokens**
2. Enter a name and optional expiration
3. Select scopes: `api`, `read_repository`, `write_repository`
4. Create and copy the token

:::caution[Security]
Keep your access tokens secure. Never share them or commit them to version control.
:::

## Command-Line Alternative

Profile management is available via CLI:

```bash
# List available profiles
redu profile list

# Switch to a profile
redu profile load cs101-fall-2025

# View current profile settings
redu profile show
```

See [CLI Overview](../cli/overview.md) for details.

## Next Steps

- [LMS Import Guide](../user-guide/lms-import.md) — Detailed import options
- [Repository Setup Guide](../user-guide/repository-setup.md) — Repository management
- [Settings & Profiles](../user-guide/settings.md) — Profile management
- [CLI Reference](../cli/overview.md) — Command-line interface
