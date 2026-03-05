---
title: Repository Commands
description: Create, clone, and delete assignment repositories
---

## `redu repo create --assignment <name> [--dry-run]`

Creates repositories for a selected assignment. Dry-run prints planned repository names.

## `redu repo clone --assignment <name> [--target <dir>] [--layout <layout>]`

Clones repositories with optional target directory and layout (`flat`, `by-team`, `by-task`).

## `redu repo delete --assignment <name> [--force]`

Deletes repositories for assignment groups. Use `--force` to confirm delete.

## Examples

```bash
node apps/cli/dist/index.js repo create --assignment "Project 1" --dry-run --profile seed-profile
node apps/cli/dist/index.js repo clone --assignment "Project 1" --target ./repos --layout by-team --profile seed-profile
node apps/cli/dist/index.js repo delete --assignment "Project 1" --force --profile seed-profile
```
