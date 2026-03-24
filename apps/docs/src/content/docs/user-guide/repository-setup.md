---
title: Repository Setup
description: Validate, create, clone, and update assignment repositories
---

Repository operations are the main deliverable of repo-edu: creating per-team Git repositories for assignments, cloning them for grading, and pushing template updates. All repository operations work through the configured Git connection (GitHub, GitLab, or Gitea).

## Prerequisites

Before running repository operations, your course needs:

1. **A Git connection** — configured in app settings with a personal access token that has permission to create repositories in the target organization.
2. **An organization** — the Git organization or group where repositories will be created.
3. **An assignment** — linked to a group set that determines which teams get repositories.
4. **A repository template** (optional) — either a remote repository on the Git provider (`owner/name`) or a local directory path. New repositories are initialized with the template's content.

## Validation

Always validate before creating repositories. Validation checks both the roster and the assignment configuration:

```bash
redu validate --assignment "Project 1" --course <course-id>
```

This runs two checks in sequence:

- **Roster validation** — duplicate emails, missing Git usernames, orphaned group members, empty groups, students assigned to multiple groups, and other integrity issues.
- **Assignment validation** — the assignment exists, its group set exists, repository names are unique, and the template is accessible.

The command exits with code 0 if validation passes, or code 1 with a list of issues if it fails. Each issue includes the kind of problem, affected member or group IDs, and a human-readable message.

In the desktop app, validation results appear as issue cards that you can click to see affected members.

## Creating repositories

### From the CLI

```bash
redu repo create --assignment "Project 1" --course <course-id>
```

This creates one repository per active group in the assignment's group set. For each group, the workflow:

1. Generates the repository name from the group name and assignment.
2. Checks if a repository with that name already exists (skips if so).
3. Creates the repository in the organization with the configured visibility (private, internal, or public).
4. Pushes template content if a template is configured.
5. Adds team members as collaborators.

### Dry-run mode

Preview what would be created without making any changes:

```bash
redu repo create --assignment "Project 1" --dry-run --course <course-id>
```

Dry-run reports the planned repository count, names, and any groups that would be skipped (empty groups, groups where all members lack Git usernames, repositories that already exist).

### Filtering by group

Create repositories for specific groups only:

```bash
redu repo create --assignment "Project 1" --groups "Team Alpha,Team Beta" --course <course-id>
```

### Using a template override

Override the configured template with a local directory:

```bash
redu repo create --assignment "Project 1" --template-path ./my-template --course <course-id>
```

### From the desktop app

The desktop app provides the same operations with a visual staging view. You can see which repositories will be created, review skipped groups, and monitor progress as repositories are created in batches.

## Cloning repositories

Clone all repositories for an assignment to a local directory for grading or review:

```bash
redu repo clone --assignment "Project 1" --target ./repos --course <course-id>
```

### Directory layouts

The `--layout` option controls how cloned repositories are organized:

| Layout | Structure | Use case |
|--------|-----------|----------|
| `flat` | All repos in a single directory | Simple grading |
| `by-team` | `repos/Team Alpha/repo-name/` | Organized by team |
| `by-task` | `repos/Project 1/repo-name/` | Organized by assignment |

```bash
redu repo clone --assignment "Project 1" --target ./repos --layout by-team --course <course-id>
```

If `--target` is omitted, the clone uses the course's configured `repositoryCloneTargetDirectory`, or defaults to the current directory.

### Cloning all assignments

Omit the `--assignment` flag to clone repositories for all assignments:

```bash
redu repo clone --all --target ./repos --layout by-task --course <course-id>
```

## Updating repositories

Push template changes to existing repositories by creating pull requests:

```bash
redu repo update --assignment "Project 1" --course <course-id>
```

This creates a pull request in each repository with the latest template content. The PR title and body describe what changed. Repositories that already have a pending update PR are skipped.

You can override the template source:

```bash
redu repo update --assignment "Project 1" --template-path ./updated-template --course <course-id>
```

## Skipped groups

Repository operations skip groups that cannot produce a valid repository:

| Reason | Description |
|--------|-------------|
| `empty_group` | Group has no members |
| `all_members_skipped` | All members lack Git usernames or are inactive |
| `repo_exists` | Repository already exists (create only) |
| `repo_not_found` | Repository doesn't exist (clone/update only) |

Skipped groups are reported in the output so you can investigate and fix the underlying issue.
