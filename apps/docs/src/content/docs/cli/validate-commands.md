---
title: Validate Command
description: Run roster and assignment readiness checks
---

## `redu validate --assignment <name>`

Runs:

- `validation.roster`
- `validation.assignment`

If no issues are found, validation passes with exit code `0`.
If issues are found, they are printed and exit code is `1`.

## Example

```bash
node apps/cli/dist/index.js validate --assignment "Project 1" --course seed-course
```
