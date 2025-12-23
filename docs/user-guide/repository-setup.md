# Repository Setup

The Repository Setup tab allows you to create and manage student repositories on Git hosting
platforms.

## Supported Platforms

| Platform | Features |
|----------|----------|
| **GitHub** | Organizations, teams, template repos |
| **GitLab** | Groups, subgroups, template projects |
| **Gitea** | Organizations, template repos |
| **Local** | Filesystem-based repos (for testing) |

## Configuration

### Git Platform Settings

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

### Step 1: Configure Platform

1. Select your Git platform
2. For GitLab/Gitea: enter the base URL
3. Enter your personal access token
4. Enter your username
5. Set the student repos organization/group
6. Set the template organization/group

### Step 2: Verify Connection

Click **Verify** to test your configuration. Successful verification confirms:

- Valid authentication
- Access to student repos organization
- Access to template organization

### Step 3: Configure Repository Setup

| Setting | Description |
|---------|-------------|
| YAML File | Path to student teams file (from LMS Import) |
| Assignments | Template repository names (comma-separated) |
| Target Folder | Local directory for cloning (optional) |
| Directory Layout | How to organize cloned repos |

### Step 4: Create Repositories

Click **Setup** to create repositories. For each team and template combination:

1. Clone template repository locally
2. Create new repository in student organization
3. Push template content to new repository
4. Set repository visibility (public/private)

## Repository Naming

Repositories are named using the pattern: `{team-name}-{template-name}`

| Team | Template | Repository Name |
|------|----------|-----------------|
| team-alpha | task-1 | team-alpha-task-1 |
| alice-bob | assignment-1 | alice-bob-assignment-1 |

## Directory Layouts

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

::: warning Token Permissions
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

- [Settings Reference](/reference/settings-reference) — Complete settings documentation
- [CLI Repo Commands](/cli/repo-commands) — Command-line usage
- [Troubleshooting](/reference/troubleshooting) — Common issues
