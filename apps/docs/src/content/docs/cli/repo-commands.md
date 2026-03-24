---
title: Repository Commands
description: Create, clone, and update assignment repositories
---

Repository commands are the primary operational commands in the CLI. They create Git repositories for student teams, clone them locally for grading, and push template updates.

All repository commands require a course with a configured Git connection and organization. See [Repository Setup](/repo-edu/user-guide/repository-setup/) for the full workflow including prerequisites and validation.

## `redu repo create`

Creates one repository per active group in the assignment's group set.

```bash
redu repo create --assignment "Project 1" --course seed-course
```

Options:

| Flag | Description |
|------|-------------|
| `--assignment <name>` | Assignment name (required, or use `--all`) |
| `--all` | Create repositories for all assignments |
| `--groups <names>` | Comma-separated list of group names to include |
| `--dry-run` | Show what would be created without making changes |
| `--template-path <dir>` | Override the configured template with a local directory |
| `--course <id>` | Course to operate on (defaults to active course) |

### Dry-run example

```bash
redu repo create --assignment "Project 1" --dry-run --course seed-course
```

```text
Planned repository operation for assignment 'Project 1' (a1)
  - team-alpha-project-1 (create)
  - team-beta-project-1 (create)
  - team-gamma-project-1 (skip: repo exists)
3 planned, 2 to create, 1 existing
```

## `redu repo clone`

Clones repositories to a local directory for grading or review.

```bash
redu repo clone --assignment "Project 1" --target ./repos --course seed-course
```

Options:

| Flag | Description |
|------|-------------|
| `--assignment <name>` | Assignment name (required, or use `--all`) |
| `--all` | Clone repositories for all assignments |
| `--target <dir>` | Local directory for cloned repos (defaults to current directory) |
| `--layout <layout>` | Directory organization: `flat`, `by-team`, or `by-task` |
| `--groups <names>` | Comma-separated list of group names to include |
| `--course <id>` | Course to operate on |

### Layout examples

```bash
# Flat: all repos in one directory
redu repo clone --assignment "Project 1" --target ./repos --layout flat

# By team: repos/Team Alpha/project-1/
redu repo clone --assignment "Project 1" --target ./repos --layout by-team

# By task: repos/Project 1/team-alpha/
redu repo clone --all --target ./repos --layout by-task
```

## `redu repo update`

Pushes template changes to existing repositories by creating a pull request in each one.

```bash
redu repo update --assignment "Project 1" --course seed-course
```

Options:

| Flag | Description |
|------|-------------|
| `--assignment <name>` | Assignment name (required) |
| `--template-path <dir>` | Override the configured template with a local directory |
| `--course <id>` | Course to operate on |

Repositories that already have a pending update PR are skipped.
