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

1. Uses the repository name recorded on the assignment if one exists; otherwise derives it from the naming template, the current roster, and the assignment.
2. Calls the Git provider's create endpoint. Fresh repositories are counted as **created**; existing ones come back as **adopted**.
3. For fresh repositories only, pushes template content and configures visibility (private, internal, or public).
4. Adds team members as collaborators.
5. Records the accepted name on the assignment so future Update/Clone runs use the recorded name instead of re-deriving it.

Re-running Create after repositories exist is idempotent by construction: every recorded name is sent back to the provider, which returns `alreadyExisted`. If a server repo was deleted out-of-band, Create notices the miss and creates it fresh, refreshing the record in the process — no manual intervention is needed.

### Adopting externally-created repositories

If repositories for the assignment already exist on the server (for example, you created them by hand), set the group set's naming template to match the existing names and run Create or Clone. Every repository whose derived name matches an existing server repo is adopted into the assignment's records as a side effect. Mismatches show up as failures and can be resolved by adjusting the template and re-running.

If you are moving a course over from RepoBee, [Coming from RepoBee](/repo-edu/user-guide/from-repobee/) walks through the concrete steps — importing `students.txt`, matching the naming template, and letting Clone or Create record the existing repositories.

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
| `empty_group` | Create only: the group has no active members, so no name can be derived. |
| `all_members_skipped` | All members lack Git usernames or are inactive. |
| `no_record_no_members` | Clone/Update only: the group has no recorded repository name *and* no active members to derive one from. |
| `repo_exists` | Repository already exists (create only). |
| `repo_not_found` | Repository doesn't exist (clone/update only). |

Clone and Update no longer skip groups just because their members were all marked inactive — as long as a repository name has been recorded for the group, the operation runs against that name regardless of current roster state. This is what makes Update and Clone stable across roster edits and `{members}`-parameterized templates.

Skipped groups are reported in the output so you can investigate and fix the underlying issue.

## Discovering repositories by namespace

For cases where you want a local copy of every repository in a Git organization (or a pattern-matched subset) without setting up an assignment — for example, a migration from another tool — use the namespace-scoped bulk clone:

```bash
redu repo discover --namespace my-org --filter "project-*" --target ./repos
```

This lists every repository in the namespace matching the optional glob, prompts for confirmation, then clones them flat into the target folder. It does not touch course state, does not match repositories to groups or assignments, and does not write any records.

In the desktop app, the same flow is available as the **Clone All Repos** button in the Groups & Assignments operations bar.
