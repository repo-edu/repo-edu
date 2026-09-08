---
title: Course Commands
description: Browse and inspect courses
---

Course commands list available courses and inspect the course selected for one invocation.

## `redu course list`

Lists courses with their ID, display name and last-updated timestamp. The desktop's persisted
course selection is marked with `*`. This command does not change that selection.

```bash
redu course list
```

```text
* seed-course   Seed Course   2026-03-04T10:00:00Z
  demo-course   Demo Course   2026-02-15T08:30:00Z
```

## `redu course active`

Prints the desktop's persisted course selection. This does not select a course for subsequent
commands. Both `course active` and `course list` ignore `--course`.

```bash
redu course active
```

```text
seed-course
```

## `redu course show`

Outputs the course selected by the required `--course <id>` option as JSON. Use this to inspect
roster data, group sets, assignments and configuration while the desktop app is closed.

```bash
redu course show --course demo-course
```

Pipe the output to `jq` for filtering:

```bash
redu course show --course demo-course | jq '.roster.students | length'
```
