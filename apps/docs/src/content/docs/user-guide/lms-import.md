---
title: LMS Import
description: Import roster and group sets from LMS connections
---

## Overview

LMS import flows are setup-phase operations and are managed in the desktop GUI.

Supported providers:

- Canvas
- Moodle

## Connection verification (optional CLI pre-check)

You can verify the selected course LMS connection from CLI:

```bash
node apps/cli/dist/index.js lms verify --course <course-id>
```

## Student roster import (desktop)

In the desktop app:

- Open the course.
- Go to LMS import.
- Run student import for the selected LMS course.

Workflow used: `roster.importFromLms`

## Group set discovery and sync (desktop)

In the desktop app:

- Fetch available LMS group sets.
- Connect/sync the selected group set.

Workflows used:

- `groupSet.fetchAvailableFromLms`
- `groupSet.syncFromLms`

## Notes

- The selected course must include a valid LMS connection and `lmsCourseId`.
- Import writes back to persisted course data through `course.save`.
