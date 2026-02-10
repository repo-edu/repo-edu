---
title: Data Model
description: Groups & Assignments data model reference
---

# Data Model

This document defines the core data model for Groups & Assignments. For field-level reference, see
[Settings Reference](../reference/settings-reference.md#roster-data-rostersjson).

## Core Principles

1. **Group is a top-level profile entity.** Groups have UUIDs, an `origin`, and optionally carry
   `lms_group_id` for sync matching. GroupSets reference groups by ID.
2. **GroupSet references groups, doesn't embed them.** A GroupSet has `group_ids: string[]` pointing
   to Group entities. Groups can be shared across multiple GroupSets.
3. **Editability is determined by origin.** A group is mutable if and only if
   `origin === "local"`. No need to check which sets reference the group.
4. **Permanent type distinction.** Group sets are either LMS-connected, imported, local, or system.
   They never convert between types. No "break connection" mechanism.
5. **IDs are stable** — renaming does not affect IDs.
6. **App-generated IDs** — the app generates its own UUIDs for group sets, groups, and roster
   members. LMS IDs are stored as external identifiers for matching only.

## Entity Relationships

```text
Roster
├── students: RosterMember[]       (enrollment_type = "student")
├── staff: RosterMember[]          (enrollment_type != "student")
├── groups: Group[]                (top-level entities with origin)
├── group_sets: GroupSet[]         (reference groups by ID)
└── assignments: Assignment[]      (reference group sets)

GroupSet ──references──▶ Group[] (via group_ids)
Assignment ──references──▶ GroupSet (via group_set_id)
Group ──references──▶ RosterMember[] (via member_ids)
```

## Connection Types

Group sets have a permanent type based on their connection. They never convert between types.

| Type | Set Editable | Groups Editable | Sync Mechanism |
|------|-------------|-----------------|----------------|
| `system` | No | No (`origin: system`) | Auto-sync with roster |
| `canvas` | No | No (`origin: lms`) | API call to Canvas LMS |
| `moodle` | No | No (`origin: lms`) | API call to Moodle LMS |
| `import` | Yes | Yes (`origin: local`) | File picker (re-import) |
| Local (`null`) | Yes | Per-group | N/A |

### LMS Group Set (canvas/moodle)

- Entirely read-only at set level: cannot rename, add/remove group references
- All groups have `origin: "lms"`, `lms_group_id` set, and are immutable everywhere
- Re-sync replaces the set's group reference list and all group data from LMS
- Can be shallow-copied to create a Local group set
- Can be exported to CSV, deleted

### Local Group Set (connection: null)

- Fully editable at set level: rename, add/remove group references, delete
- Can contain a mix of LMS-origin groups (immutable), system-origin groups (immutable), and
  locally-created groups (mutable)
- A shallow copy of an LMS set produces a Local set referencing the same immutable LMS-origin groups

### Imported Group Set (connection: import)

- Local in behavior, fully editable via direct mutations
- All groups created by import have `origin: "local"` and `lms_group_id: null` (mutable)
- Retains import metadata (source filename, last_updated) to support re-import
- Re-import completely overwrites the group set contents

### System Group Set (connection: system)

- Auto-maintained and read-only; cannot delete or edit, but can be shallow-copied
- System groups have `origin: "system"` and are immutable everywhere

## System Group Sets

### Individual Students

Auto-maintained group set with one group per active student:

- Auto-created on profile load or first roster sync
- Groups named using `firstname_lastname` format (see [Group Naming](#group-naming))
- Syncs with roster changes: student added/removed/renamed triggers group changes
- Cannot be deleted, edited, or have its connection broken
- Can be shallow-copied into a local group set

### Staff

Auto-maintained group set with a single group containing all non-student roster members:

- Contains one group named "Staff" with all `roster.staff` members
- Syncs with staff roster changes
- Group name is fixed (not renamed when staff members change)
- Cannot be deleted or edited; can be shallow-copied

### Bootstrap

System group sets are created/repaired idempotently via `ensureSystemGroupSets()`. The frontend
calls this on profile load and after roster mutations. Existing system groups are reused to avoid
UUID churn. Non-UI entry points (CLI, background tasks) must call `ensureSystemGroupSets` before
mutating or resolving.

## Group Selection Modes

Group sets define which of their groups to include via a `group_selection` field:

```text
GroupSelectionMode (discriminated union)
├── { kind: "all", excluded_group_ids: string[] }
└── { kind: "pattern", pattern: string, excluded_group_ids: string[] }
```

Resolution: (matches mode) AND (not in `excluded_group_ids`).

### Pattern Semantics (Simple Glob)

Glob patterns use a restricted, string-based matcher (not path-based). Matching is full-string and
case-sensitive; `/` has no special meaning.

| Token | Meaning |
|-------|---------|
| `*` | Matches any string (including empty) |
| `?` | Matches any single character |
| `[...]` | Character classes (including ranges, e.g., `[A-Z]`) |
| `[!...]` | Negated character classes |
| `\` | Escapes the next character |

Not supported: `**`, `[^...]` negation, extglobs, brace expansion.

Backend is the source of truth for all glob validation and matching. Frontend uses
`previewGroupSelection()` and `filterByPattern()` manifest commands.

### Changing Assignment Group Set

When an assignment's `group_set_id` changes, it simply references a different group set. Group
selection (including exclusions) is configured on the group set itself, not on the assignment.

## Roster Model

The student roster is always editable. LMS connection merges rather than overwrites. Local additions
are preserved. Non-students are stored separately in `roster.staff`.

### Enrollment Types

```text
EnrollmentType = "student" | "teacher" | "ta" | "designer" | "observer" | "other"
```

LMS field mappings:

- **Canvas:** `enrollment.type` maps `StudentEnrollment` → `student`, `TeacherEnrollment` →
  `teacher`, `TaEnrollment` → `ta`, `DesignerEnrollment` → `designer`, `ObserverEnrollment` →
  `observer`
- **Moodle:** `role.shortname` maps `student` → `student`, `teacher`/`editingteacher`/`manager` →
  `teacher`, others → `other`

### Status Model

`RosterMember.status` is an internal normalized field. `RosterMember.enrollment_display` is the
LMS-native label shown in the UI.

**Canvas enrollment states:**

| Canvas `enrollment_state` | `enrollment_display` | Internal `status` |
|---------------------------|----------------------|-------------------|
| `active` | "Active" | `active` |
| `invited` | "Invited" | `incomplete` |
| `creation_pending` | "Pending" | `incomplete` |
| `inactive` | "Inactive" | `dropped` |
| `completed` | "Completed" | `dropped` |
| `deleted` | "Deleted" | `dropped` |

**Moodle enrollment states:**

| Condition | `enrollment_display` | Internal `status` |
|-----------|----------------------|-------------------|
| `status=1` (suspended) | "Suspended" | `dropped` |
| `status=0`, `timestart` in future | "Not Yet Started" | `incomplete` |
| `status=0`, `timeend` in past | "Enrollment Ended" | `dropped` |
| `status=0`, within time bounds | "Active" | `active` |

### Sync Behavior (Merge-Based)

| Member State | Sync Action |
|--------------|-------------|
| New in LMS | Added (`source: lms`) |
| Existing LMS member | Updated (name, email changes) |
| Local addition | Preserved (not removed) |
| No longer in LMS | Set `status: "dropped"`, removed from all group memberships |

Match priority: `lms_user_id` (exact) → `email` (case-insensitive) → `student_number` (exact).

## Membership and Status

Non-active students (`status !== "active"`) are removed from all group memberships by
`ensureSystemGroupSets`. Group `member_ids` always contain only active members. There is no
resolve-time filtering — `member_ids.length` is the group's member count everywhere.

Staff entries are preserved in group memberships where they were added (by LMS sync or import). The
Staff system group always mirrors `roster.staff`.

## Group Sync Behavior (LMS Sets)

- Match existing groups by `lms_group_id`
- Matched groups: updated in place (name, members)
- New LMS groups: created with `origin: "lms"` and added to set's references
- Removed LMS groups: dereferenced from **all** group sets (including local copies) and deleted
- Members matched by `lms_user_id` against `roster.students` and `roster.staff`
- Missing members: omitted from `member_ids`, reported per group
- Local sets referencing shared groups see updates automatically (shared Group entities)

## Copying and Deleting

### Shallow Copy

- Creates a new Local group set with a new UUID
- Copies the `group_ids` reference list (same Group entity references, no duplication)
- Connection set to `null` (local set)
- The copy's group reference list is independent of the source
- Referenced LMS/system groups remain immutable
- Shared groups receive updates when the source syncs (membership, name)
- When a source group is deleted, it's removed from all sets including copies

### Delete

- Removes the GroupSet entity
- Removes references to groups
- Orphaned groups (referenced by no other set) are deleted
- Groups still referenced by other sets survive
- Deleting a group set cascades to its assignments (with confirmation)

### Escape Hatch for Editing LMS Groups

To create fully editable versions of LMS groups:

1. Export the LMS group set to CSV
2. Edit the CSV externally
3. Import as a new local group set

The imported set has new Group entities with `origin: "local"` and `lms_group_id: null`.

## Group Naming

### Slug Normalization

All auto-generated group names are normalized using these rules:

1. **Unicode normalization** — NFD decomposition
2. **Strip diacritics** — Remove combining marks (e.g., `e` instead of `e`)
3. **Lowercase** — Convert to lowercase ASCII
4. **Replace special characters** — Non-alphanumeric replaced with separator (underscore for
   individuals, dash for multi-member groups)
5. **Handle apostrophes** — Remove entirely (`O'Brien` → `obrien`)
6. **Collapse separators** — Replace runs with single separator
7. **Trim** — Remove leading/trailing separators
8. **Empty fallback** — `member_<id_suffix>` for individuals, `unnamed` for groups

Normalization is backend-only via `normalizeGroupName()` manifest command.

### Individual Names (System Group Set)

Use **first word of first name** + **last word of last name** with underscore separator:

| Full Name | Result |
|-----------|--------|
| `Alice Smith` | `alice_smith` |
| `Maria Jose Garcia Lopez` | `maria_lopez` |
| `Mary Ann O'Brien` | `mary_obrien` |

### Multi-Member Group Names

Auto-generated from selected members using **last word of surname** with dash separator:

| Members | Format | Example |
|---------|--------|---------|
| 1 member | `firstname_lastname` | `alice_smith` |
| 2-5 members | All surnames | `smith-jones-lee` |
| 6+ members | 5 surnames + remainder | `smith-jones-lee-patel-chen-+2` |

### Collision Resolution

**System group set:** Append member ID suffix (last 4 characters): `alice_smith_a1b2`

**Local group names:** Append incrementing suffix: `smith-jones`, `smith-jones-2`, `smith-jones-3`

**LMS/Import names:** Preserved verbatim from source. Uniqueness enforced by LMS or CSV format
(duplicate `group_name` rows merge into the same group).

### Uniqueness Scope

| Context | Scope |
|---------|-------|
| System group set | Within system group set |
| Local group set | Within that group set |
| Connected group set | Enforced by LMS/source |
| Across group sets | Not enforced |

## Group Ordering

The `group_ids` order stored on each GroupSet is authoritative:

- **LMS sets:** Preserve order returned by LMS API (fallback: sort by name)
- **Imported sets:** Preserve first-appearance order from CSV
- **Local/system sets:** Maintain insertion order; new groups appended

Frontend must never re-sort `group_ids` implicitly.

## LMS Architectural Differences

| Aspect | Canvas | Moodle |
|--------|--------|--------|
| Group scope | Embedded in Group Set | Course-level, shared across Groupings |
| Assignment references | Group Set | Grouping (collection of Groups) |
| Same group in multiple sets | Not possible in LMS | Supported |

The reference-based model handles both platforms uniformly. When syncing a Moodle grouping, groups
matched by `lms_group_id` are referenced rather than duplicated if they already exist.

## Empty Group Policy

- Removing a roster member removes their ID from all groups (does not delete the group)
- System groups are removed when their corresponding roster member is removed
- LMS groups may be empty; removed only when LMS no longer provides them during sync
- Local/imported groups may be empty; persist until explicitly deleted or unreferenced
- Orphan cleanup removes only groups not referenced by any group set

## ID Stability

| Entity | Stability | Rationale |
|--------|-----------|-----------|
| `GroupSet.id` | Stable (UUID) | Assignments reference by ID |
| `Group.id` | Stable (UUID) | Enables sharing, bookmarks, UI state |
| `RosterMember.id` | Stable (UUID) | Canonical identity across LMS/import/local |
| `Group.lms_group_id` | Stable (LMS) | For sync matching |
| `Group.name` | Stable | Used in repo naming |

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Delete group set with assignments | Confirmation lists affected assignments; cascades on confirm |
| Pattern matches no groups | Warning shown in UI |
| Invalid glob pattern | Inline validation error, prevents save |
| Import file format mismatch | Validation on import with clear error message |
| Copy LMS group set | Shallow copy; referenced groups remain immutable |
| Change assignment group set | Assignment references new group set (selection is on the set) |
| Re-import with different groups | Complete overwrite with preview before confirming |
| Local set with mixed origins | Per-group edit controls based on `origin` |
