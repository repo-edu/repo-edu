# Repo Commands

The `redu repo` command group provides operations for managing Git repositories on GitHub, GitLab,
Gitea, or local filesystem.

## redu repo verify

Test connectivity to the Git platform and verify organization/group access.

```bash
redu repo verify [OPTIONS]
```

### Options

| Option | Description |
|--------|-------------|
| `-p, --platform <PLATFORM>` | Platform type: `github`, `gitlab`, `gitea`, `local` |

### Examples

```bash
# Verify using profile settings
redu repo verify

# Verify GitLab connection
redu repo verify --platform gitlab

# Verify GitHub connection
redu repo verify --platform github
```

### Output

```text
Verifying platform settings...
Platform: Some(GitLab)
Organization: student-repos-2025

Starting: Verifying platform connection
✓ Verifying platform connection
  Connected as: instructor
```

## redu repo setup

Create student repositories from templates.

```bash
redu repo setup [OPTIONS]
```

### Options

| Option | Description |
|--------|-------------|
| `-p, --platform <PLATFORM>` | Platform type |
| `--template <NAME>` | Template repository name (repeatable) |
| `--teams-file <PATH>` | Student teams file (JSON/YAML) |
| `--team <SPEC>` | Inline team: `name:member1,member2` or `member1,member2` |
| `--work-dir <PATH>` | Working directory for cloning templates |
| `--private` | Create private repositories |

### Team Specification

Teams can be specified inline or via file:

**Inline teams:**

```bash
# Named teams
redu repo setup --team "team-alpha:alice,bob" --team "team-beta:charlie,diana"

# Auto-generated names (uses member usernames)
redu repo setup --team "alice,bob" --team "charlie,diana"
```

**Teams file (YAML):**

```yaml
- name: team-alpha
  members:
    - alice
    - bob
- name: team-beta
  members:
    - charlie
    - diana
```

**Teams file (JSON):**

```json
[
  { "name": "team-alpha", "members": ["alice", "bob"] },
  { "name": "team-beta", "members": ["charlie", "diana"] }
]
```

### Examples

```bash
# Set up repos using profile settings and teams file
redu repo setup --template task-1

# Set up with inline teams
redu repo setup --template task-1 --team "alice,bob" --team "charlie"

# Set up multiple templates
redu repo setup --template task-1 --template task-2 --teams-file students.yaml

# Set up on GitHub with private repos
redu repo setup --platform github --template assignment-1 --private --teams-file teams.json
```

### Output

```text
RepoBee Setup
=============
Platform: Some(GitLab)
Organization: student-repos-2025
Templates: ["task-1"]
Teams: 3

[1/3] Creating repos for team-alpha...
✓ Created team-alpha-task-1
[2/3] Creating repos for team-beta...
✓ Created team-beta-task-1
[3/3] Creating repos for team-gamma...
✓ Created team-gamma-task-1

=== Final Summary ===
✓ Successfully created: 3 repositories

🎉 Setup completed successfully!
```

## redu repo clone

Clone student repositories to local filesystem.

```bash
redu repo clone [OPTIONS]
```

### Options

| Option | Description |
|--------|-------------|
| `-p, --platform <PLATFORM>` | Platform type |
| `--assignments <LIST>` | Comma-separated assignment names |

::: warning Not Yet Implemented
The clone command is planned but not yet available.
:::

## Environment Variables

Override configuration via environment variables:

| Variable | Description |
|----------|-------------|
| `REPOBEE_BASE_URL` | Git platform base URL |
| `REPOBEE_TOKEN` | Access token |
| `REPOBEE_ORG` | Student repos organization/group |
| `REPOBEE_USER` | Platform username |
| `REPOBEE_TEMPLATE_ORG` | Template organization/group |

### Example

```bash
export REPOBEE_TOKEN="ghp_xxxxxxxxxxxx"
export REPOBEE_ORG="cs101-fall-2025"
redu repo setup --platform github --template task-1 --team "alice,bob"
```

## Configuration

Repo commands use settings from the active profile. Key settings:

| Setting | Description |
|---------|-------------|
| `git.type` | Platform type (`GitHub`, `GitLab`, `Gitea`) |
| `git.github.access_token` | GitHub personal access token |
| `git.github.student_repos_org` | GitHub organization for student repos |
| `git.github.template_org` | GitHub organization with templates |
| `git.gitlab.base_url` | GitLab instance URL |
| `git.gitlab.access_token` | GitLab personal access token |
| `git.gitlab.student_repos_group` | GitLab group for student repos |
| `git.gitlab.template_group` | GitLab group with templates |
| `repo.yaml_file` | Default teams file path |

See [Settings Reference](/reference/settings-reference) for the complete list.
