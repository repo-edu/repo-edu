---
title: Data Model
description: Persisted settings/profile schema and core roster entities
---

## Persisted settings (`repo-edu.app-settings.v1`)

Key fields:

- `activeProfileId`
- `appearance`
- `lmsConnections[]`
- `gitConnections[]`
- `lastOpenedAt`

## Persisted profile (`repo-edu.profile.v2`)

Key fields:

- `id`, `displayName`
- `lmsConnectionName`, `gitConnectionName`, `courseId`
- `roster` (students, staff, groups, groupSets, assignments)
- `repositoryTemplate`

## Validation

`@repo-edu/domain` validates settings and profile documents at boundaries.
Invalid persisted files are rejected with explicit path-level issues.
