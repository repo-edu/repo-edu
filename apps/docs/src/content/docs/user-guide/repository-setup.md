---
title: Repository Setup
description: Plan, validate, create, and clone repositories
---

## Required course state

Repository operations require:

- An assignment with a valid group set.
- A repository template (`owner`, `name`, `visibility`).
- A configured Git connection.

## Validate before create

```bash
node apps/cli/dist/index.js validate --assignment <assignment-name> --course <course-id>
```

## Create repositories

```bash
node apps/cli/dist/index.js repo create --assignment <assignment-name> --course <course-id>
```

Dry-run mode:

```bash
node apps/cli/dist/index.js repo create --assignment <assignment-name> --dry-run --course <course-id>
```

## Clone repositories

```bash
node apps/cli/dist/index.js repo clone --assignment <assignment-name> --target ./repos --layout by-team --course <course-id>
```
