---
title: Validate Command
description: Check roster and assignment readiness before repository operations
---

## `redu validate`

Runs readiness checks on the roster and a specific assignment. Always run validation before `repo create` to catch problems early.

```bash
redu validate --assignment "Project 1" --course seed-course
```

### What it checks

**Roster checks:**

- Duplicate email addresses across students and staff
- Missing required fields (name, email)
- Students without Git usernames (needed for repository creation)
- Orphaned group members (references to students no longer in the roster)
- Empty groups with no active members

**Assignment checks:**

- Assignment exists and is linked to a valid group set
- Repository names are unique across all groups
- Repository template is accessible (if configured)
- Git connection and organization are configured

### Output

If all checks pass:

```text
Validation passed for assignment 'Project 1' in course 'seed-course'.
```

Exit code: `0`

If issues are found, each one is printed with the kind of problem and affected members or groups:

```text
Validation issues for assignment 'Project 1':
  - missing_git_username: 3 students have no Git username (alice@example.com, bob@example.com, carol@example.com)
  - empty_group: Group 'Team Delta' has no active members
```

Exit code: `1`

### Using in scripts

The exit code makes `validate` useful in CI or shell scripts:

```bash
redu validate --assignment "Project 1" && redu repo create --assignment "Project 1"
```

This creates repositories only if validation passes.
