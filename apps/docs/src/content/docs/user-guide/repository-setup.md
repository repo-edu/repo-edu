---
title: Repository Setup
description: Plan, validate, create, clone, and delete repositories
---

## Required profile state

Repository operations require:

- An assignment with a valid group set.
- A repository template (`owner`, `name`, `visibility`).
- A configured Git connection.

## Validate before create

```bash
node apps/cli/dist/index.js validate --assignment <assignment-name> --profile <profile-id>
```

## Create repositories

```bash
node apps/cli/dist/index.js repo create --assignment <assignment-name> --profile <profile-id>
```

Dry-run mode:

```bash
node apps/cli/dist/index.js repo create --assignment <assignment-name> --dry-run --profile <profile-id>
```

## Clone repositories

```bash
node apps/cli/dist/index.js repo clone --assignment <assignment-name> --target ./repos --layout by-team --profile <profile-id>
```

## Delete repositories

```bash
node apps/cli/dist/index.js repo delete --assignment <assignment-name> --force --profile <profile-id>
```
