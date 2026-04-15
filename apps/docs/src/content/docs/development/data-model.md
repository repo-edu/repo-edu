---
title: Data Model
description: Persisted settings, course schema, roster entities, and boundary validation
---

The `@repo-edu/domain` package is where every data structure in the system is defined. It contains no I/O, no side effects, and no Node or Electron imports, which means it runs identically in the Electron desktop app, the CLI, and the browser-based docs demo.

Non-persistence domain types (courses, rosters, groups, assignments) live in `packages/domain/src/types.ts`. Settings-persistence types (`PersistedAppSettings`, `AppAppearance`, connection types, etc.) are derived from Zod schemas via `z.infer` in `packages/domain/src/settings.ts`, making the schema the single source of truth. Companion Zod schemas in `packages/domain/src/schemas.ts` validate course data at boundaries: the points where the application reads or writes JSON files. When a persisted file is loaded from disk, the schema checks that its shape matches what the code expects. If it doesn't, the load fails with structured, path-level error messages rather than producing subtle runtime bugs.

## Schema versioning

Each persisted document carries a `kind` discriminator and a `schemaVersion` field:

| Document | Kind | Current version |
|----------|------|-----------------|
| App settings | `repo-edu.app-settings.v1` | `1` |
| Course | `repo-edu.course.v1` | `2` |

These markers exist for future schema evolution. There is no migration layer — invalid documents are rejected at the boundary.

## Persisted settings

`PersistedAppSettings` stores application-wide state in a single file.

| Field | Type | Description |
|-------|------|-------------|
| `activeCourseId` | `string \| null` | Currently selected course |
| `activeTab` | `"roster" \| "groups-assignments"` | Last active UI tab |
| `appearance` | `AppAppearance` | Theme, window chrome, date/time format |
| `window` | `PersistedWindowState` | Window width and height (default 1180×760) |
| `lmsConnections` | `PersistedLmsConnection[]` | Canvas/Moodle connections (name, provider, baseUrl, token) |
| `gitConnections` | `PersistedGitConnection[]` | GitHub/GitLab/Gitea connections (id, provider, baseUrl, token) |
| `lastOpenedAt` | `string \| null` | ISO timestamp of last app open |
| `rosterColumnVisibility` | `Record<string, boolean>` | Per-column visibility state for roster table |
| `rosterColumnSizing` | `Record<string, number>` | Per-column width for roster table |

`AppAppearance` contains `theme` (`"system"`, `"light"`, `"dark"`), `windowChrome` (`"system"`, `"hiddenInset"`), `dateFormat` (`"MDY"`, `"DMY"`), and `timeFormat` (`"12h"`, `"24h"`).

## Persisted course

`PersistedCourse` stores all data for a single course.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique course identifier |
| `displayName` | `string` | Human-readable name |
| `revision` | `number` | Monotonically increasing save counter for compare-and-swap writes |
| `lmsConnectionName` | `string \| null` | References a connection in app settings by name |
| `organization` | `string \| null` | Git organization/group for repository operations |
| `lmsCourseId` | `string \| null` | LMS-side course identifier |
| `idSequences` | `{ nextGroupSeq; nextGroupSetSeq; nextMemberSeq; nextAssignmentSeq; nextTeamSeq }` | Monotonic local ID counters |
| `roster` | `Roster` | Students, staff, groups, group sets, assignments |
| `repositoryTemplate` | `RepositoryTemplate \| null` | Default template for repo creation |
| `repositoryCloneTargetDirectory` | `string \| null` | Local directory for clone operations |
| `repositoryCloneDirectoryLayout` | `"flat" \| "by-team" \| "by-task" \| null` | How to organize cloned repos |
| `updatedAt` | `string` | ISO timestamp of last save |

The `revision` field enables compare-and-swap: the save workflow rejects writes where the supplied revision doesn't match the stored one, preventing lost updates from concurrent editors.

## Roster

A `Roster` contains the full student/staff/group/assignment graph for a course.

### RosterMember

Each roster member (student or staff) has:

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique local ID (`m_####...`) |
| `name` | `string` | Display name |
| `email` | `string` | Primary email |
| `studentNumber` | `string \| null` | Institution-specific ID |
| `gitUsername` | `string \| null` | Git provider username |
| `gitUsernameStatus` | `"unknown" \| "valid" \| "invalid"` | Verification status against Git provider |
| `status` | `"active" \| "incomplete" \| "dropped"` | Current enrollment status |
| `lmsStatus` | `MemberStatus \| null` | Status from LMS (may differ from local status) |
| `lmsUserId` | `string \| null` | LMS-side user ID for sync |
| `enrollmentType` | `EnrollmentType` | `"student"`, `"teacher"`, `"ta"`, `"designer"`, `"observer"`, `"other"` |
| `source` | `string` | Origin of this member record |

### RosterConnection

Tracks how the roster was populated — a discriminated union on `kind`:

- `"canvas"` / `"moodle"` — imported from LMS, carries `courseId` and `lastUpdated`
- `"import"` — imported from file, carries `sourceFilename` and `lastUpdated`

### Groups and group sets

A `Group` is a named collection of member IDs with an `origin` (`"system"`, `"lms"`, `"local"`). Two system group sets are always present: `individual_students` and `staff`.

A `GroupSet` is a discriminated union on `nameMode`. A `NamedGroupSet` (`nameMode: "named"`) references `Group` objects via `groupIds`. A `UsernameGroupSet` (`nameMode: "unnamed"`) stores `UsernameTeam[]` inline in its `teams` field — each team has an `id` and `gitUsernames` array. Both modes share a `connection` (discriminated union: `"system"`, `"canvas"`, `"moodle"`, `"import"`), `repoNameTemplate`, `columnVisibility`, and `columnSizing`.

Local ID policy:

- Members: `m_0001`, `m_0002`, ...
- Groups: `g_0001`, `g_0002`, ...
- Group sets: `gs_0001`, `gs_0002`, ...

LMS IDs are stored only in LMS fields (`lmsUserId`, `lmsGroupId`, group-set connection fields), never in local `id` fields.

### Assignments

An `Assignment` links a `groupSetId` to an optional `RepositoryTemplate`. The template is a discriminated union:

- `"remote"` — `owner` + `name` on the Git provider, with `visibility`
- `"local"` — local file `path`, with `visibility`

## Boundary validation

Two functions validate persisted documents at load boundaries:

- `validatePersistedAppSettings(value)` → `ValidationResult<PersistedAppSettings>`
- `validatePersistedCourse(value)` → `ValidationResult<PersistedCourse>`

Both use Zod schemas under the hood. On failure, they return `{ ok: false, issues }` where each `ValidationIssue` has a dot-path (`"roster.students.0.email"`) and a message. Invalid files are rejected — there is no partial-load or best-effort parsing.

Settings-persistence types use `z.infer` in `settings.ts` (no drift guard needed). A compile-time drift guard in `schemas.ts` ensures the `PersistedCourse` Zod inferred type stays in sync with its hand-authored TypeScript type.

## Roster validation

Beyond schema validation, `@repo-edu/domain` performs semantic roster validation via the `validation.roster` workflow. This catches 17 kinds of issues:

| Kind | What it catches |
|------|-----------------|
| `duplicate_student_id` | Two students with the same ID |
| `missing_email` / `invalid_email` / `duplicate_email` | Email problems |
| `duplicate_assignment_name` | Non-unique assignment names |
| `duplicate_group_id_in_assignment` / `duplicate_group_name_in_assignment` | Group uniqueness within assignments |
| `duplicate_repo_name_in_assignment` | Repository name collisions |
| `orphan_group_member` | Group references a member ID that doesn't exist |
| `empty_group` | Group with no members |
| `system_group_sets_missing` | Required system group sets not present |
| `invalid_enrollment_partition` | Member in wrong collection (student in staff or vice versa) |
| `invalid_group_origin` | Group origin inconsistent with its group set connection |
| `missing_git_username` / `invalid_git_username` | Git username problems for active members |
| `unassigned_student` | Student not in any group for an assignment |
| `student_in_multiple_groups_in_assignment` | Student assigned to multiple groups |

Each `RosterValidationIssue` includes `affectedIds` (member/group IDs) and optional `context` for diagnostic messages.
