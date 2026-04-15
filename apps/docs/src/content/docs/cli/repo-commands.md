---
title: Repository Commands
description: Create, clone, update, and discover assignment repositories
---

Repository commands are the primary operational commands in the CLI. They create Git repositories for student teams, clone them locally for grading, push template updates, and discover repositories by name pattern in a namespace.

The first three commands (`create`, `clone`, `update`) are assignment-scoped and require a course with a configured Git connection and organization. The `discover` command is namespace-scoped and only requires a Git connection. See [Repository Setup](/repo-edu/user-guide/repository-setup/) for the full workflow including prerequisites and validation.

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
3 planned, 2 to create, 1 adopted
```

### Summary output

On a successful run, `repo create` prints three mutually exclusive counters and a line indicating how many recorded names were staged in the course JSON:

```text
Repository create complete: planned=3 created=2 adopted=1 failed=0 completedAt=2026-04-15T10:00:00Z
Recorded repository names for 3 groups.
```

- `created` — repositories that were freshly created in this run (template content is pushed only to these).
- `adopted` — repositories that the provider reported as already existing. Their names are recorded on the assignment, which bypasses name re-derivation on future Clone/Update runs.
- `failed` — repositories the provider rejected outright (not collisions).

Re-running `repo create` after repos exist is idempotent: each recorded name is sent back to the provider, which returns `alreadyExisted`. If the server repo was deleted out-of-band, the record is automatically refreshed from the fresh-create response.

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
| `--target <dir>` | Local directory for cloned repos (defaults to current directory). Relative paths are resolved against the current working directory. |
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

`repo update` also iterates the recorded repository names on the assignment. A group with no recorded name and no active members is skipped with reason `no_record_no_members`; other missing repos are reported as failures.

## `redu repo discover`

Lists repositories in a Git namespace by name pattern and clones them to a target folder. Unlike `repo create`/`clone`/`update`, this command is namespace-scoped — it does not read or write course state and does not match repositories to assignments or groups.

```bash
redu repo discover --namespace my-org --target ./repos
```

Options:

| Flag | Description |
|------|-------------|
| `--namespace <name>` | Git organization, group, or user to list from (required) |
| `--filter <pattern>` | Pattern to filter repo names (e.g. `1*`). Syntax: `*` = any characters, `?` = one character; omit to list all. The filter matches the leaf repo name only, never the subgroup prefix — so a leaf like `group-30-2iv60` inside a team subgroup is not matched by `1*`. Repos inside a subgroup print their subgroup path after the leaf as `- leaf<TAB>(subgroup-path)`. |
| `--include-archived` | Include archived repositories in the listing |
| `--target <dir>` | Target directory for clones (required). Relative paths are resolved against the current working directory. |
| `--yes` | Skip the interactive confirmation prompt |

The command runs in two phases:

1. **List** — fetches the matching repositories and prints their leaf names. When a repository lives inside a subgroup, the subgroup path is printed after a tab as `(subgroup-path)` so nested repos are distinguishable from top-level ones.
2. **Clone** — prompts for confirmation (unless `--yes`), then clones every matched repository into the target folder. Each local folder uses only the repository's leaf name, so `parent-group/team-101/lab-1` clones into `<target>/lab-1`. If two listed repositories share the same leaf name the command aborts with a validation error before writing anything.

Non-TTY contexts require `--yes`; otherwise the command fails cleanly before cloning.

```text
Found 14 repositories in 'my-org'.
- project-alpha
- project-beta
…
Clone 14 repositories to './repos'? [y/N] y
Cloned 14 / failed 0 completedAt=2026-04-15T10:05:00Z
```

Missing namespaces, filter misses, or already-cloned directories are reported explicitly; existing Git repositories at target paths are skipped, while non-Git directory clashes abort the operation.
