---
title: Repository Setup
description: Create and manage student repositories on Git hosting platforms
---

Create and manage student repositories on Git hosting platforms using the **Operation** tab.

## Supported Platforms

| Platform | Features |
|----------|----------|
| **GitHub** | Organizations, teams, template repos |
| **GitLab** | Groups, subgroups, template projects |
| **Gitea** | Organizations, template repos |
| **Local** | Filesystem-based repos (for testing) |

## Prerequisites

Before setting up repositories:

1. **Roster** — Import or create a student roster in the Roster tab
2. **Assignments** — Define assignments in the Assignment tab
3. **Git Connection** — Configure your Git platform in Settings

## Configuration

### Git Platform Settings

Configure in **Settings** (gear icon or `Cmd+,`) under the Git section:

| Setting | Description |
|---------|-------------|
| Platform | GitHub, GitLab, Gitea, or Local |
| Base URL | Platform API URL (GitLab/Gitea only) |
| Access Token | Personal access token |
| User | Your username on the platform |
| Student Repos Org/Group | Organization/group for student repositories |
| Template Org/Group | Organization/group containing template repositories |

### Platform-Specific URLs

| Platform | Base URL |
|----------|----------|
| GitHub | `https://api.github.com` (automatic) |
| GitLab.com | `https://gitlab.com` |
| Self-hosted GitLab | `https://gitlab.yourcompany.com` |
| Gitea | `https://gitea.yourcompany.com` |

## Workflow

### Step 1: Prepare Roster and Assignments

1. **Roster tab**: Import students from LMS or file, or add manually
2. **Assignment tab**: Create assignments with:
   - Assignment name (becomes part of repo name)
   - Template repository reference
   - Group configuration (use original groups, subset, or custom)

### Step 2: Configure Git Platform

1. Open Settings (gear icon)
2. Go to the **Git** section
3. Select your platform
4. Enter credentials and organization details
5. Click **Verify** to test the connection

### Step 3: Preview and Validate

In the **Operation** tab:

1. Select the assignment to set up
2. Click **Validate** to check:
   - All students have git usernames
   - Template repository exists
   - Target organization is accessible
3. Review the validation report

### Step 4: Create Repositories

1. Review the preflight summary showing:
   - Number of repositories to create
   - Target organization
   - Template being used
2. Click **Setup** to begin creation
3. Monitor progress in the output console

## Assignment Groups

Each assignment can have different group configurations:

| Type | Description |
|------|-------------|
| **Use Original** | Use groups as imported from LMS |
| **Subset** | Select specific groups to include |
| **Custom** | Define new group compositions |
| **Individual** | Create individual repos (one per student) |

Configure in the **Assignment** tab when creating or editing assignments.

## Repository Naming

Repositories are named using the pattern: `{group-name}-{assignment-name}`

| Group | Assignment | Repository Name |
|-------|------------|-----------------|
| team-alpha | task-1 | team-alpha-task-1 |
| alice-bob | assignment-1 | alice-bob-assignment-1 |

## Directory Layouts (Clone)

When cloning repositories locally, choose an organization layout:

| Layout | Structure | Best For |
|--------|-----------|----------|
| Flat | All repos in one directory | Quick access |
| By Team | `team-name/repo-name` | Grading by team |
| By Assignment | `assignment/team-repo` | Grading by assignment |

### Example Structures

**Flat:**

```text
repos/
├── team-alpha-task-1/
├── team-alpha-task-2/
├── team-beta-task-1/
└── team-beta-task-2/
```

**By Team:**

```text
repos/
├── team-alpha/
│   ├── task-1/
│   └── task-2/
└── team-beta/
    ├── task-1/
    └── task-2/
```

**By Assignment:**

```text
repos/
├── task-1/
│   ├── team-alpha-task-1/
│   └── team-beta-task-1/
└── task-2/
    ├── team-alpha-task-2/
    └── team-beta-task-2/
```

## Getting Access Tokens

### GitHub

1. Go to **Settings** → **Developer settings** → **Personal access tokens** → **Tokens (classic)**
2. Click **Generate new token (classic)**
3. Select scopes:
   - `repo` — Full repository access
   - `admin:org` — Organization management (for creating repos in orgs)
4. Click **Generate token**
5. Copy immediately

### GitLab

1. Go to **User Settings** → **Access Tokens**
2. Enter a name and optional expiration
3. Select scopes:
   - `api` — Full API access
   - `read_repository` — Read repo contents
   - `write_repository` — Write repo contents
4. Click **Create personal access token**
5. Copy immediately

### Gitea

1. Go to **Settings** → **Applications** → **Manage Access Tokens**
2. Enter a token name
3. Select **All** permissions (or customize)
4. Click **Generate Token**
5. Copy immediately

:::caution[Token Permissions]
Tokens need sufficient permissions to:

- Read template repositories
- Create repositories in the student organization
- Set repository visibility
- Manage team access (if applicable)
:::

## Template Repositories

Template repositories should contain the starter code for assignments. Tips:

- Keep templates in a separate organization/group
- Use clear naming: `task-1`, `assignment-week-3`, etc.
- Include a README with assignment instructions
- Add any necessary configuration files (`.gitignore`, etc.)
- Test the template before deploying to students

## Handling Existing Repositories

When a repository already exists:

- **Setup skips it** — No changes are made
- Shown in "Already existed" count in summary
- To recreate: manually delete on platform first

## See Also

- [Settings Reference](../reference/settings-reference.md) — Complete settings documentation
- [Troubleshooting](../reference/troubleshooting.md) — Common issues
