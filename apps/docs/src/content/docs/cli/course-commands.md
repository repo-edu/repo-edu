---
title: Course Commands
description: Browse, select, and inspect courses
---

Course commands let you see which courses are available, select one as active, and inspect its data.

## `redu course list`

Lists all courses with their ID, display name, and last-updated timestamp. The active course is marked with `*`.

```bash
redu course list
```

```text
* seed-course   Seed Course   2026-03-04T10:00:00Z
  demo-course   Demo Course   2026-02-15T08:30:00Z
```

## `redu course active`

Prints the active course ID. Useful in scripts to check which course subsequent commands will operate on.

```bash
redu course active
```

```text
seed-course
```

## `redu course show`

Outputs the full active course document as JSON. Use this to inspect roster data, group sets, assignments, and configuration without opening the desktop app.

```bash
redu course show
redu course show --course demo-course
```

Pipe the output to `jq` for filtering:

```bash
redu course show | jq '.roster.students | length'
```

## `redu course load <course-id>`

Sets the active course. All subsequent commands that require a course (validation, repository operations, connection checks) will use this course unless overridden with `--course`.

```bash
redu course load seed-course
```
