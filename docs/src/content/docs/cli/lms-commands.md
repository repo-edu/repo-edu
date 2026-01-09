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

Import students from LMS into roster. Merges with existing students:

- Adds new students
- Updates existing students (by email)
- Preserves git usernames

```bash
redu lms import-students [--profile <n>]
```

### Example

```bash
redu lms import-students
# Importing students from LMS...
# ✓ Fetched 47 students
#   Added: 5
#   Updated: 42
#   Unchanged: 0
# Roster saved.
```

## redu lms import-groups

Import groups from an LMS group-set into a specific assignment.

```bash
redu lms import-groups --assignment <n> [--group-set <id>] [--profile <n>]
```

### Options

| Option | Description |
|--------|-------------|
| `--assignment <n>` | Target assignment name (required) |
| `--group-set <id>` | LMS group-set ID (prompts interactively if omitted) |
| `--profile <n>` | Profile to use |

### Example

```bash
# Interactive group-set selection
redu lms import-groups --assignment task-1
# Fetching group-sets from LMS...
# Available group-sets:
#   1. Project Teams (id: 12345)
#   2. Lab Groups (id: 12346)
# Select group-set number [1]:
# Importing groups into 'task-1'...
# ✓ Imported 12 groups (45 students)
# Roster saved.

# Direct group-set specification
redu lms import-groups --assignment task-1 --group-set 12345
```
