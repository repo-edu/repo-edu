# Quick Start

Get up and running with repo-edu in minutes.

## Step 1: Create a Profile

1. Open repo-edu
2. Click the **gear icon** to open settings
3. Click **New** to create a profile
4. Name it after your course (e.g., `cs101-fall-2025`)

## Step 2: Configure LMS Connection

1. Go to the **LMS Import** tab
2. Select your LMS type (Canvas or Moodle)
3. Enter your institution's base URL
4. Add your API access token (see [Getting an Access Token](#getting-an-access-token))
5. Enter your course ID
6. Click **Verify** to test the connection

✓ You should see your course name confirming the connection.

## Step 3: Export Student Roster

1. Set the output folder
2. Enable desired formats (YAML, CSV, XLSX)
3. Click **Generate**

✓ Files are created in your output folder.

## Step 4: Configure Git Platform

1. Go to the **Repository Setup** tab
2. Select your platform (GitHub, GitLab, or Gitea)
3. Enter your platform credentials
4. Set the student repos organization/group
5. Set the template organization/group
6. Click **Verify** to test the connection

## Step 5: Create Student Repositories

1. Set the YAML file path (from Step 3)
2. Enter template names (comma-separated)
3. Click **Setup**

✓ Repositories are created for each team.

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

::: warning Security
Keep your access tokens secure. Never share them or commit them to version control.
:::

## Command-Line Alternative

All steps can also be done via CLI:

```bash
# Verify LMS
redu lms verify

# Generate student files
redu lms generate --yaml

# Verify Git platform
redu repo verify

# Create repositories
redu repo setup --template task-1
```

See [CLI Overview](../cli/overview.md) for details.

## Next Steps

- [LMS Import Guide](../user-guide/lms-import.md) — Detailed import options
- [Repository Setup Guide](../user-guide/repository-setup.md) — Repository management
- [Settings & Profiles](../user-guide/settings.md) — Profile management
- [CLI Reference](../cli/overview.md) — Command-line interface
