---
title: Validate Commands
description: Validate assignment readiness before repository operations.
---

# Validate Command

Validate assignment readiness before repository operations.

## redu validate

```bash
redu validate --assignment <name> [--profile <n>]
```

### Options

| Option | Description |
|--------|-------------|
| `--assignment <name>` | Assignment name (required) |
| `--profile <n>` | Profile to use |

### Checks Performed

- All groups have at least one member
- All members have git usernames (if required)
- No students assigned to multiple groups (warning)

### Output Notes

- Issue lists resolve student/group IDs to roster entries when possible; otherwise raw IDs are
  shown.

### Examples

```bash
# Valid assignment
redu validate --assignment task-1
# Validating assignment 'task-1'...
# ✓ Assignment valid
#   Groups: 12 (12 non-empty)
#   Students assigned: 45

# Assignment with issues (exits with code 2)
redu validate --assignment task-2
# Validating assignment 'task-2'...
# ⚠ Assignment has issues:
#   - MissingGitUsername: alice@example.com (Alice Smith), bob@example.com (Bob Jones)
#   - EmptyGroup: team-alpha, team-beta
```

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Valid |
| 2 | Has warnings/issues |
