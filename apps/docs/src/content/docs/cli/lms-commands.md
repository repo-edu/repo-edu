---
title: LMS Commands
description: Verify and synchronize LMS data into courses
---

## `redu lms verify`

Verifies the selected course's LMS connection.

## `redu lms import-students`

Imports students from LMS using `course.lmsCourseId`.

## `redu lms import-groups --group-set <id>`

Synchronizes one LMS group set into the selected course.

## `redu lms cache list`

Lists cached LMS-linked group sets from the selected course.

## `redu lms cache fetch [--group-set <id>]`

Fetches available group sets from LMS.

## `redu lms cache refresh <group-set-id>`

Refreshes one cached group set.

## `redu lms cache delete <group-set-id>`

Deletes a cached LMS group set (fails if referenced by assignments).

## Examples

```bash
node apps/cli/dist/index.js lms verify --course seed-course
node apps/cli/dist/index.js lms cache fetch --course seed-course
node apps/cli/dist/index.js lms import-groups --group-set lms-group-set-1 --course seed-course
```
