---
title: Repository Commands
description: Create, clone, and update assignment repositories
---

## `redu repo create --assignment <name> [--dry-run]`

Creates repositories for a selected assignment. Dry-run prints planned repository names.

## `redu repo clone --assignment <name> [--target <dir>] [--layout <layout>]`

Clones repositories with optional target directory and layout (`flat`, `by-team`, `by-task`).

## `redu repo update --assignment <name> [--target <dir>] [--layout <layout>]`

Updates repositories for the selected assignment and reports per-repository outcomes.

## Examples

```bash
node apps/cli/dist/index.js repo create --assignment "Project 1" --dry-run --course seed-course
node apps/cli/dist/index.js repo clone --assignment "Project 1" --target ./repos --layout by-team --course seed-course
node apps/cli/dist/index.js repo update --assignment "Project 1" --target ./repos --layout by-team --course seed-course
```
