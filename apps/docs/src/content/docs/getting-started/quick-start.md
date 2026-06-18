---
title: Quick Start
description: First steps after installing repo-edu
---

After [installing](/repo-edu/getting-started/installation/), here is how to get going. To look around first without installing, the [Interactive Demo](/repo-edu/demo/) runs the full interface in your browser against mock data.

## Desktop app

1. Launch RepoEdu.
2. Create a course, or link an existing LMS course, from the course switcher in the header.
3. Open Settings (the gear icon, or **Cmd/Ctrl + ,**) and add an LMS or Git connection. Use **Verify** to test the credentials before saving.
4. Import a roster or set up repositories for the course.

The [Desktop App Overview](/repo-edu/desktop/overview/) is a full tour of the interface. For the main tasks, see [LMS Import](/repo-edu/user-guide/lms-import/), [Repository Setup](/repo-edu/user-guide/repository-setup/), and [Settings & Courses](/repo-edu/user-guide/settings/).

## CLI (`redu`)

```bash
redu --help
redu course list
```

`redu --help` lists every command and global option. `redu course list` shows your courses, which is empty on a fresh install. See the [CLI Overview](/repo-edu/cli/overview/) for the full command reference.

## Developers

Building from source, the workspace scripts, and the test suites are covered in the [Building](/repo-edu/development/building/) guide.
