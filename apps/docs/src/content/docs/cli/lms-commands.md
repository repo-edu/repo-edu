---
title: LMS Commands
description: Verify LMS connection for the selected course
---

## `redu lms verify`

Verifies the selected course's LMS connection. Exits with code 1 if verification fails.

```bash
redu lms verify --course seed-course
```

LMS import and group set management commands are GUI-only. See [CLI-GUI Parity](/development/cli-gui-parity/) for the rationale.
