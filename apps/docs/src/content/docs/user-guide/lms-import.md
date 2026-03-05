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
node apps/cli/dist/index.js lms import-students --profile <profile-id>
```

Workflow used: `roster.importFromLms`

## Group set discovery and sync

CLI:

```bash
node apps/cli/dist/index.js lms cache fetch --profile <profile-id>
node apps/cli/dist/index.js lms import-groups --group-set <group-set-id> --profile <profile-id>
```

Workflows used:

- `groupSet.fetchAvailableFromLms`
- `groupSet.syncFromLms`

## Notes

- The selected profile must include a valid LMS connection and `courseId`.
- Import writes back to persisted profile data through `profile.save`.
