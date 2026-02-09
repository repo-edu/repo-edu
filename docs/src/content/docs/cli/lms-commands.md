---
title: LMS Commands
description: LMS operations for importing students and groups
---

LMS operations for importing students and groups from your learning management system.

## redu lms verify

Verify LMS connection and course access.

```bash
redu lms verify [--profile <n>]
```

### Example

```bash
redu lms verify
# ✓ Connected to Canvas
# ✓ Course: Introduction to Programming (CS101)
```

## redu lms import-students

Import the roster (students and staff) from LMS. Merges with existing members:

- Adds new members
- Updates existing members (matched by email)
- Preserves git usernames
- Splits students and staff by enrollment type
- Members absent from LMS are set to `dropped` status

```bash
redu lms import-students [--profile <n>]
```

### Example

```bash
redu lms import-students
# Importing roster from LMS...
# ✓ Fetched 47 students, 3 staff
#   Added: 5
#   Updated: 42
#   Unchanged: 3
# Roster saved.
```

## redu lms import-groups

Import groups from an LMS group category/grouping into the roster as a connected group set.

```bash
redu lms import-groups [--group-set <id>] [--profile <n>]
```

### Options

| Option | Description |
|--------|-------------|
| `--group-set <id>` | LMS group set/grouping ID (prompts interactively if omitted) |
| `--profile <n>` | Profile to use |

### Example

```bash
# Interactive group-set selection
redu lms import-groups
# Fetching group sets from LMS...
# Available group sets:
#   1. Project Teams (id: 12345)
#   2. Lab Groups (id: 12346)
# Select group set number [1]:
# Importing group set 'Project Teams'...
# ✓ Imported 12 groups (45 members)
# Roster saved.

# Direct group-set specification
redu lms import-groups --group-set 12345
```
