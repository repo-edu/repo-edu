---
title: Data Model
description: Persisted settings/course schema and core roster entities
---

## Persisted settings (`repo-edu.app-settings.v1`)

Key fields:

- `activeCourseId`
- `appearance`
- `lmsConnections[]`
- `gitConnections[]`
- `lastOpenedAt`

## Persisted course (`repo-edu.course.v1`)

Key fields:

- `id`, `displayName`
- `revision` (monotonic save revision for CAS writes)
- `lmsConnectionName`, `gitConnectionId`, `organization`, `lmsCourseId`
- `roster` (students, staff, groups, groupSets, assignments)
- `repositoryTemplate`

## Validation

`@repo-edu/domain` validates settings and course documents at boundaries.
Invalid persisted files are rejected with explicit path-level issues.
