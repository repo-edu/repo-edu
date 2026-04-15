---
title: CLI Overview
description: Command-line interface for repeatable course and repository operations
---

The `redu` CLI provides command-line access to repo-edu's course management and repository operations. It is designed for repeatable, scriptable tasks — creating repositories in bulk, cloning them for grading, running validation checks, and verifying connections.

Setup-phase operations like roster editing, LMS imports, and group set management are available only in the desktop app, where the interactive UI is better suited for reviewing and resolving data.

## Usage

```bash
redu [--course <name>] <command>
```

The `--course` flag selects which course to operate on. If omitted, the active course is used.

## Command groups

| Group | Commands | Purpose |
|-------|----------|---------|
| `course` | `list`, `active`, `show`, `load` | Browse and select courses |
| `lms` | `verify` | Test LMS connection credentials |
| `git` | `verify` | Test Git provider credentials |
| `repo` | `create`, `clone`, `update`, `discover` | Create, clone, and update assignment repositories; discover and bulk-clone repositories by namespace |
| `validate` | — | Check roster and assignment readiness |

## Getting help

Every command supports `--help` for usage details:

```bash
redu --help
redu repo create --help
redu validate --help
```
