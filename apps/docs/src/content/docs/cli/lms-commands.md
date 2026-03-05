---
title: LMS Commands
description: Verify and synchronize LMS data into profiles
---

## `redu lms verify`

Verifies the selected profile's LMS connection.

## `redu lms import-students`

Imports students from LMS using `profile.courseId`.

## `redu lms import-groups --group-set <id>`

Synchronizes one LMS group set into the selected profile.

## `redu lms cache list`

Lists cached LMS-linked group sets from the selected profile.

## `redu lms cache fetch [--group-set <id>]`

Fetches available group sets from LMS.

## `redu lms cache refresh <group-set-id>`

Refreshes one cached group set.

## `redu lms cache delete <group-set-id>`

Deletes a cached LMS group set (fails if referenced by assignments).

## Examples

```bash
node apps/cli/dist/index.js lms verify --profile seed-profile
node apps/cli/dist/index.js lms cache fetch --profile seed-profile
node apps/cli/dist/index.js lms import-groups --group-set lms-group-set-1 --profile seed-profile
```
