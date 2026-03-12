---
title: LMS Import
description: Import roster and group sets from LMS connections
---

## Overview

LMS import flows are implemented in shared workflows and used from desktop and CLI.

Supported providers:

- Canvas
- Moodle

## Student roster import

CLI:

```bash
node apps/cli/dist/index.js lms import-students --course <course-id>
```

Workflow used: `roster.importFromLms`

## Group set discovery and sync

CLI:

```bash
node apps/cli/dist/index.js lms cache fetch --course <course-id>
node apps/cli/dist/index.js lms import-groups --group-set <group-set-id> --course <course-id>
```

Workflows used:

- `groupSet.fetchAvailableFromLms`
- `groupSet.syncFromLms`

## Notes

- The selected course must include a valid LMS connection and `lmsCourseId`.
- Import writes back to persisted course data through `course.save`.
