---
title: Course Commands
description: Manage active and persisted courses
---

## `redu course list`

Lists all persisted courses and marks the selected course with `*`.

## `redu course active`

Prints the active course id.

## `redu course show`

Prints selected course JSON.

## `redu course load <course-id>`

Sets the active course in app settings.

## Examples

```bash
node apps/cli/dist/index.js course list
node apps/cli/dist/index.js course load seed-course
node apps/cli/dist/index.js course show --course seed-course
```
