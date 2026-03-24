---
title: LMS Commands
description: Verify LMS connections from the command line
---

## `redu lms verify`

Tests whether the active course's LMS connection is working. The command makes a test API call to the configured LMS (Canvas or Moodle) and reports the result.

```bash
redu lms verify --course seed-course
```

```text
LMS connection 'Canvas Demo' verified=true checkedAt=2026-03-05T12:00:00Z
```

If verification fails (invalid token, unreachable server, wrong URL), the command exits with code 1 and prints the error.

### When to use

Run `lms verify` before importing rosters to confirm your credentials are still valid. API tokens can expire or be revoked, and this catches the problem before you start an import.

### LMS import and group set management

Importing rosters and managing group sets from the LMS requires the interactive desktop GUI, where you can review import previews, resolve conflicts, and select which group sets to connect. See [LMS Import](/repo-edu/user-guide/lms-import/) for details.
