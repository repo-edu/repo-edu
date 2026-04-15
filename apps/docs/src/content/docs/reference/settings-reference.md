---
title: Settings Reference
description: Complete field reference for app settings and course documents
---

Both app settings and course documents are stored as JSON files and validated on every read and write using Zod schemas. Invalid files are rejected with path-level error messages.

## App settings (`repo-edu.app-settings.v1`)

| Field | Type | Description |
|-------|------|-------------|
| `kind` | `"repo-edu.app-settings.v1"` | Schema discriminator |
| `schemaVersion` | `1` | Schema version |
| `activeCourseId` | `string \| null` | Currently selected course |
| `activeTab` | `"roster" \| "groups-assignments"` | Last active UI tab (default: `"roster"`) |
| `appearance.theme` | `"system" \| "light" \| "dark"` | Color theme |
| `appearance.windowChrome` | `"system" \| "hiddenInset"` | Window title bar style |
| `appearance.dateFormat` | `"MDY" \| "DMY"` | Date display format |
| `appearance.timeFormat` | `"12h" \| "24h"` | Time display format |
| `window.width` | `number` | Window width in pixels (default: 1180) |
| `window.height` | `number` | Window height in pixels (default: 760) |
| `lmsConnections[]` | Array | LMS provider connections |
| `lmsConnections[].name` | `string` | Connection display name |
| `lmsConnections[].provider` | `"canvas" \| "moodle"` | LMS provider |
| `lmsConnections[].baseUrl` | `string` | LMS API base URL |
| `lmsConnections[].token` | `string` | API authentication token |
| `lmsConnections[].userAgent` | `string?` | Optional custom user agent |
| `gitConnections[]` | Array | Git provider connections |
| `gitConnections[].id` | `string` | Unique connection identifier |
| `gitConnections[].provider` | `"github" \| "gitlab" \| "gitea"` | Git provider |
| `gitConnections[].baseUrl` | `string` | Provider API base URL |
| `gitConnections[].token` | `string` | Personal access token |
| `gitConnections[].userAgent` | `string?` | Optional custom user agent |
| `activeGitConnectionId` | `string \| null` | Active Git connection id. When `null` and exactly one connection is configured, that connection is used; otherwise `gitConnections[0]` is the fallback. |
| `lastOpenedAt` | `string \| null` | ISO timestamp of last app open |
| `rosterColumnVisibility` | `Record<string, boolean>` | Roster table column visibility |
| `rosterColumnSizing` | `Record<string, number>` | Roster table column widths |

## Course (`repo-edu.course.v1`)

| Field | Type | Description |
|-------|------|-------------|
| `kind` | `"repo-edu.course.v1"` | Schema discriminator |
| `schemaVersion` | `2` | Schema version |
| `id` | `string` | Unique course identifier |
| `idSequences` | `IdSequences` | Monotonic counters for local ID allocation (`nextGroupSeq`, `nextGroupSetSeq`, `nextMemberSeq`, `nextAssignmentSeq`, `nextTeamSeq`) |
| `displayName` | `string` | Human-readable course name |
| `revision` | `number` | Monotonically increasing save counter for compare-and-swap writes |
| `lmsConnectionName` | `string \| null` | References an LMS connection in app settings by name |
| `organization` | `string \| null` | Git organization or group for repository operations |
| `lmsCourseId` | `string \| null` | LMS-side course identifier for imports |
| `roster` | `Roster` | Students, staff, groups, group sets, assignments (see below) |
| `repositoryTemplate` | `RepositoryTemplate \| null` | Default template for repository creation |
| `repositoryCloneTargetDirectory` | `string \| null` | Default local directory for clone operations |
| `repositoryCloneDirectoryLayout` | `"flat" \| "by-team" \| "by-task" \| null` | Default clone directory layout |
| `updatedAt` | `string` | ISO timestamp of last save |

### Roster

| Field | Type | Description |
|-------|------|-------------|
| `connection` | `RosterConnection \| null` | How the roster was populated (see below) |
| `students` | `RosterMember[]` | Student members |
| `staff` | `RosterMember[]` | Staff members (instructors, TAs) |
| `groups` | `Group[]` | All groups across all group sets |
| `groupSets` | `GroupSet[]` | Named collections of groups |
| `assignments` | `Assignment[]` | Course assignments |

### RosterConnection

Discriminated union on `kind`:

| Kind | Fields | Description |
|------|--------|-------------|
| `"canvas"` | `courseId`, `lastUpdated` | Imported from Canvas LMS |
| `"moodle"` | `courseId`, `lastUpdated` | Imported from Moodle |
| `"import"` | `sourceFilename`, `lastUpdated` | Imported from CSV file |

### RosterMember

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique within the roster |
| `name` | `string` | Display name |
| `email` | `string` | Primary email |
| `studentNumber` | `string \| null` | Institution student number |
| `gitUsername` | `string \| null` | Git provider username |
| `gitUsernameStatus` | `"unknown" \| "valid" \| "invalid"` | Verification result against Git provider |
| `status` | `"active" \| "incomplete" \| "dropped"` | Current enrollment status |
| `lmsStatus` | `MemberStatus \| null` | Status from LMS (may differ from local) |
| `lmsUserId` | `string \| null` | LMS-side user ID for sync matching |
| `enrollmentType` | `EnrollmentType` | `"student"`, `"teacher"`, `"ta"`, `"designer"`, `"observer"`, `"other"` |
| `source` | `string` | Origin of this member record |

### RepositoryTemplate

Discriminated union on `kind`:

| Kind | Fields | Description |
|------|--------|-------------|
| `"remote"` | `owner`, `name`, `visibility` | Repository on the Git provider |
| `"local"` | `path`, `visibility` | Local directory |

Visibility: `"private"`, `"internal"`, or `"public"`.
