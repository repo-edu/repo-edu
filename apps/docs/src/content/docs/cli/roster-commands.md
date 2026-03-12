---
title: Roster Commands
description: Inspect roster summary, members, and assignments
---

## `redu roster show`

Prints summary counts for selected course roster data.

Options:

- `--students`: include student rows
- `--assignments`: include assignment rows

## Examples

```bash
node apps/cli/dist/index.js roster show --course seed-course
node apps/cli/dist/index.js roster show --students --assignments --course seed-course
```
