# Data Model

This document defines the core data model for the Groups & Assignments refactor.

## Core Principles

1. **Group is a top-level profile entity.** Groups have UUIDs, an `origin`, and optionally carry `lms_group_id` for sync matching. GroupSets reference groups by ID.
2. **GroupSet references groups, doesn't embed them.** A GroupSet has `group_ids: string[]` pointing to Group entities.
3. **Editability is determined by origin.** A group is mutable if and only if `origin === "local"`. No need to check which sets reference the group.
4. **Permanent type distinction.** Group sets are either LMS-connected or local; they never convert between types. No "break connection" mechanism.
5. **IDs are stable** — renaming does not affect IDs.
6. **App-generated IDs** — the app generates its own unique UUIDs for group sets, groups, and roster members. LMS IDs are stored as external identifiers for matching and never replace canonical internal IDs.
7. **System group set "Individual Students"** — auto-maintained, one group per roster student, enables class-wide and individual assignments without manual setup.
8. **System group set "Staff"** — auto-maintained, single group containing all non-students for export/testing and reference.

## Entities

```text
Group (top-level profile entity)
├── id: string (UUID, stable)
├── name: string
├── member_ids: RosterMemberId[] (roster member IDs; UUID-backed)
├── origin: "system" | "lms" | "local"
└── lms_group_id: string | null (for sync matching, LMS only)

GroupSet
├── id: string (UUID, stable)
├── name: string
├── group_ids: string[] (references to Group entities by ID)
└── connection: GroupSetConnection | null (null = local)

Assignment
├── id: AssignmentId
├── name: string
├── description: string | null
├── group_set_id: string (reference by ID, always required)
└── group_selection: GroupSelectionMode (always required)

GroupSetConnection (tagged union)
├── kind: "system" | "canvas" | "moodle" | "import"
├── ... (kind-specific fields)
└── last_updated: datetime (not present for system)

Roster (contains both)
├── students: RosterMember[] (enrollment_type === "student")
├── staff: RosterMember[] (enrollment_type !== "student")
├── groups: Group[] (all groups, top-level)
├── group_sets: GroupSet[] (reference groups by ID)
└── assignments: Assignment[]
```

## Connection Types

Group sets have a permanent type based on their connection. They never convert between types.

| Type | Set-level editable | Group-level editable | Sync mechanism |
|------|-------------------|---------------------|----------------|
| `system` | No | No (origin: `system`) | Auto-sync with roster |
| `canvas` | No | No (origin: `lms`) | API call to Canvas LMS |
| `moodle` | No | No (origin: `lms`) | API call to Moodle LMS |
| `import` | Yes | Yes (origin: `local`) | File picker (re-import) |
| Local (`null`) | Yes | Per-group (yes if `origin === "local"`) | N/A |

**LMS Group Set (canvas/moodle):**

- Entirely read-only at set level: cannot rename, add/remove group references
- All groups have `origin: "lms"`, `lms_group_id` set, and are immutable everywhere
- Re-sync replaces the set's group reference list and all group data from LMS
- Can be shallow-copied to create a Local group set
- Can be exported to CSV, deleted

**Local Group Set (connection: null):**

- Fully editable at set level: rename, add/remove group references, delete
- Can contain a mix of LMS-origin groups (immutable), system-origin groups (immutable), and locally-created groups (mutable)
- A shallow copy of an LMS set produces a Local set referencing the same immutable LMS-origin groups

**Imported Group Set (connection: import):**

- Local in behavior, fully editable via direct mutations
- All groups created by import have `origin: "local"` and `lms_group_id: null` (mutable)
- Retains import metadata (source filename, last_updated) to support re-import
- Re-import completely overwrites the group set contents

**System Group Set (connection: system):**

- Auto-maintained and read-only; cannot delete or edit, but can be shallow-copied
- System groups have `origin: "system"` and are immutable everywhere
  - If a system set is shallow-copied, the copied set can reference the same system groups; those groups remain immutable because their origin is `system`

**Group sync behavior (LMS sets):**

- Match existing groups by `lms_group_id`
- Matched groups are updated in place (name, members)
- New LMS groups are created as profile-level Group entities with `origin: "lms"` and added to set's references
- Groups no longer in LMS source are removed from the LMS set's references
- If an LMS group is removed from the source, it is removed from **all** group sets referencing it (including local copies) and deleted as a Group entity
- Members matched by `lms_user_id` against `roster.students` **and** `roster.staff`; staff memberships are preserved in `member_ids`.
- Sync result reports: "N members not in roster" per affected group; missing members are omitted from `member_ids`
- UI prompts: "Sync roster first?" when mismatches detected
- Local sets referencing shared groups see updated data automatically since Group entities are shared
- Local copies never sync their `group_ids`; they only see shared Group updates from the LMS set, including removals

**Concurrent operations:**

- Disable all edit controls during sync/import operations
- Show loading indicator on affected group set

## Group Ordering

Group list order is a global invariant: the `group_ids` order stored on each GroupSet is authoritative and must be preserved. No automatic re-sorting occurs on rename or membership changes.

- LMS group sets: preserve the order returned by the LMS API; if unavailable, the backend sorts by `Group.name` (case-insensitive) with UUID as a tie-breaker and stores that order.
- Imported group sets: preserve the first appearance order from the CSV file.
- Local and system group sets: maintain insertion order; new groups are appended to `group_ids` (unless an explicit reordering UI is added later).

Frontend must never re-sort `group_ids` implicitly; it should only reflect the order stored in the GroupSet.

## ID Stability

| Entity | Stability | Rationale |
|--------|-----------|-----------|
| GroupSet.id | Stable (UUID) | Assignments reference by ID; must survive sync/rename |
| Group.id | Stable (UUID) | Top-level entity; enables sharing (Moodle), bookmarks, UI state |
| RosterMember.id | Stable (UUID) | Canonical roster-member identity across LMS/import/local flows |
| Group.name | Stable (manual or LMS) | Repo naming uses stored `Group.name`; membership filters never rename groups |

**Sync matching strategy:**

- LMS connections: Match by `Group.lms_group_id` (origin remains `lms`)
- File imports: Match by group name (case-sensitive)

Groups not matched during sync are dereferenced from the set. Orphaned groups (referenced by no set) are deleted.

## Roster Model

Unlike group sets, the student roster is **always editable** with optional LMS connection that **merges** rather than overwrites. This accommodates real-world scenarios: late enrollees not yet in LMS. Non-students are stored separately in `roster.staff`, hidden from the roster UI/pickers, but preserved in group memberships and shown with a staff badge in group lists.

**RosterMember entity (extends current schema):**

```text
RosterMember
├── id: RosterMemberId (UUID, canonical internal ID)
├── name: string
├── email: string
├── student_number: string | null (Canvas sis_user_id / Moodle idnumber)
├── git_username: string | null
├── git_username_status: GitUsernameStatus
├── status: MemberStatus (NEW, internal normalized status)
├── enrollment_display: string | null (NEW, LMS-native label for UI)
├── lms_user_id: string | null
├── enrollment_type: EnrollmentType (NEW, default: "student")
├── department: string | null (NEW, Moodle department)
├── institution: string | null (NEW, Moodle institution)
├── source: "lms" | "local" (NEW)
└── (no per-member exclusion flag)
```

**Naming rationale:** The `RosterMember` type is used for both `roster.students` and `roster.staff`. Despite both partitions sharing the same type, the name accurately reflects that all entries are roster members regardless of enrollment type. The `student_number` field keeps its name since it maps directly to Canvas `sis_user_id` / Moodle `idnumber` which are LMS user-level fields. Staff entries must have `enrollment_type !== "student"` and live only in `roster.staff`. Derivative types use the shorter `Member` prefix (e.g., `MemberStatus`, `MemberSummary`) where the roster context is implicit.

**Enrollment types:**

```text
EnrollmentType = "student" | "teacher" | "ta" | "designer" | "observer" | "other"
```

LMS field mappings:

- Canvas: `enrollment.type` → `StudentEnrollment` maps to `student`, `TeacherEnrollment` → `teacher`, `TaEnrollment` → `ta`, `DesignerEnrollment` → `designer`, `ObserverEnrollment` → `observer`
- Moodle: `role.shortname` → `student`, `teacher`, `editingteacher` (→ `teacher`), `manager` (→ `teacher`), others → `other`

**Enrollment type visibility and grouping:**

- Roster sync always imports all enrollment types (full sync).
- Entries with `enrollment_type === "student"` go to `roster.students`; all other enrollment types go to `roster.staff`.
- Student roster UI and all student pickers show `roster.students` only (no toggle).
- Staff memberships are preserved in group sets and included in group set exports.

**Roster connection (optional):**

```text
RosterConnection
├── kind: "canvas" | "moodle" | "import"
├── ... (kind-specific fields, similar to GroupSetConnection)
└── last_updated: datetime
```

**Sync behavior (merge-based):**

| Member state | Sync action |
|--------------|-------------|
| New in LMS | Added (source: lms) |
| Existing LMS member | Updated (name, email changes) |
| Local addition | Preserved (not removed) |
| No longer in LMS | Set `status: "dropped"`; `ensure_system_group_sets` removes from all group memberships |

**Merge matching and conflicts:**

- Match priority: `lms_user_id` (exact) → `email` (case-insensitive) → `student_number` (exact).
- If multiple roster members match at any step, treat as a conflict and do not merge; surface in sync summary.
- `lms_user_id` and `student_number` are external matching fields only; they never replace `RosterMember.id`.
- When a match is found, update LMS-provided fields (name, email, enrollment_type, enrollment_display, status, student_number, department, institution, source = `lms`) while preserving local-only fields (`git_username`, `git_username_status`).
- If enrollment type changes between student and non-student, move the entry between `roster.students` and `roster.staff` while preserving the same `id` and any group memberships.

**Roster removal cleanup:**

When a roster member (student or staff) is deleted, their `member_id` is removed from **all** groups' `member_ids` (system, LMS, local, imported). Groups may become empty; this does not delete non-system groups. This cleanup is performed by backend normalization (`ensure_system_group_sets`) after roster mutations.

**UI behavior:**

- Student roster tab shows all students (filterable by status)
- Visual indicator distinguishes local additions from LMS students
- Students no longer in LMS shown with "Dropped" status badge
- Non-active students (`status !== "active"`) are removed from all group memberships by `ensure_system_group_sets`; group member counts always reflect stored `member_ids.length`
- Staff are hidden from the roster UI and student pickers; group lists show staff members with a "Staff" badge; the Staff system group always mirrors `roster.staff`

**LMS status mapping and exclusion policy:**

`RosterMember.status` is an internal normalized field for app logic (filtering, coverage calculations). `RosterMember.enrollment_display` is the user-facing label shown in the UI, preserving LMS-native terminology that users recognize from their LMS.

```text
RosterMember (enrollment fields)
├── status: MemberStatus               # Internal: active | incomplete | dropped
└── enrollment_display: string | null  # UI label: "Invited", "Suspended", etc.
```

**Canvas enrollment states** (display as-is from LMS):

| Canvas `enrollment_state` | `enrollment_display` | Internal `status` |
|---------------------------|----------------------|-------------------|
| `active` | "Active" | `active` |
| `invited` | "Invited" | `incomplete` |
| `creation_pending` | "Pending" | `incomplete` |
| `inactive` | "Inactive" | `dropped` |
| `completed` | "Completed" | `dropped` |
| `deleted` | "Deleted" | `dropped` |

**Moodle enrollment states** (computed from multiple fields):

| Condition | `enrollment_display` | Internal `status` |
|-----------|----------------------|-------------------|
| `status=1` (suspended) | "Suspended" | `dropped` |
| `status=0`, `timestart` in future | "Not Yet Started" | `incomplete` |
| `status=0`, `timeend` in past | "Enrollment Ended" | `dropped` |
| `status=0`, within time bounds | "Active" | `active` |

**Local-only members:** Default to `status: active`, `enrollment_type: student`, `source: local`, with `enrollment_display: null` (UI shows no badge). Users can manually edit status.

When a student's status changes to non-active (`dropped` or `incomplete`), `ensure_system_group_sets` removes them from all group memberships. Group member counts are always `member_ids.length` — no resolve-time filtering needed. The student remains in the roster with their `enrollment_display` badge so teachers see familiar LMS terminology, but they are not in any groups. UI badges show `enrollment_display` so users see familiar LMS terminology.

## Membership and Status

Non-active students (`status !== "active"`) are removed from all group memberships by `ensure_system_group_sets`. This means group `member_ids` always contain only active students (plus staff where applicable). There is no resolve-time filtering of membership — `member_ids.length` is the group's member count everywhere.

Staff entries are preserved in group memberships where they were added (by LMS sync or import). The Staff system group always mirrors `roster.staff`.

**Key differences from group sets:**

| Aspect | Group Sets | Roster |
|--------|------------|--------|
| Quantity | Multiple per profile | One per profile |
| Connected state | Read-only | Always editable |
| Sync behavior | Overwrite | Merge |
| Local additions | Not allowed while connected | Always allowed |

## Empty Group Policy

These rules apply to all group sets and keep roster-driven system groups consistent.

- Removing a roster member removes their ID from all groups. This does **not** delete any group by itself.
- System groups (origin: `system`) are roster-derived and can be removed globally:
  - Individual Students set: when a student is removed from the roster, their per-student system group is removed.
  - Staff set: the single `Staff` group always exists, even if empty.
  - When a system group is removed, it is removed from **all** group sets referencing it (including local copies), and the Group entity is deleted.
- LMS groups (origin: `lms`) may be empty. They are removed only when the LMS no longer provides them during sync. Orphan cleanup removes them only if unreferenced.
- Imported groups (origin: `local`, connection: `import`) may be empty. Re-import may remove groups if missing from the file; otherwise they persist until explicitly deleted or unreferenced.
- Local groups (origin: `local`, connection: `null`) may be empty and persist until explicitly deleted or unreferenced.
- Orphan cleanup removes only groups not referenced by any group set; it never deletes groups solely because they are empty.

## Group Selection Modes

All assignments have a `group_selection` that determines which groups from the set are used:

```text
GroupSelectionMode (discriminated union)
├── { kind: "all", excluded_group_ids: string[] }
└── { kind: "pattern", pattern: string, excluded_group_ids: string[] }
```

1. **all** — use all groups in the set
2. **pattern** — use groups matching a validated simple glob against group name

Resolution: (matches mode) AND (not in excluded_group_ids). Since non-active students are already removed from group memberships by `ensure_system_group_sets`, no additional membership filtering is needed at resolve time.

Explicit per-group exclusions replace manual checkbox selection, keeping results dynamic while allowing teachers to omit specific groups.

**Scope:** Applies to both connected and local group sets for consistent behavior.

**Sync behavior:** Exclusions are stored by group ID; orphaned IDs (from deleted groups) are ignored at resolve time; new matching groups are auto-included.

**Changing group set:** When an assignment's `group_set_id` changes, existing `excluded_group_ids` become invalid (different group set = different group UUIDs). If exclusions exist, UI must show confirmation: "Changing group set will remove N group exclusions. Continue?" On confirm, `excluded_group_ids` is cleared. On cancel, no change.

### Pattern Semantics (Simple Glob, String Match)

Glob patterns use a **restricted, string-based** matcher (not path-based). Matching is full-string and case-sensitive; `/` has no special meaning.

Supported tokens:

- `*` matches any string (including empty)
- `?` matches any single character
- `[...]` character classes (including ranges, e.g., `[A-Z]`)
- `[!...]` negated character classes (only `!` is supported; `^` is treated as a literal)
- `\` escapes the next character (including `*`, `?`, `[`, `]`, `\`)

Not supported: `**`, `[^...]` negation, extglobs (`@(…)`, `!(…)`, etc.), brace expansion (`{a,b}`).

**Implementation:** Backend is the source of truth for all glob validation and matching. Frontend uses backend manifest commands (`preview_group_selection` and `filter_by_pattern`) for both assignment group selection and local UI filters (e.g., import dialogs).

## LMS Architectural Differences

| Aspect | Canvas | Moodle |
|--------|--------|--------|
| Group scope | Embedded in Group Set | Course-level, shared across Groupings |
| Assignment references | Group Set | Grouping (collection of Groups) |
| Same group in multiple sets | Not possible in LMS | Supported |

The reference-based model handles both LMS platforms uniformly:

- Groups can be shared across multiple GroupSets (Moodle case)
- Editability is determined by origin: a group with `origin: "lms"` is immutable everywhere

When syncing a Moodle grouping, groups are matched by `lms_group_id`. If a group already exists (from another grouping), it's referenced rather than duplicated. Shared LMS groups remain immutable in all sets that reference them (`origin: "lms"`). To get editable copies, use the export → edit CSV → import workflow.

## Copying and Deleting

**Copying a group set (shallow copy):**

- Creates a new Local group set with a new UUID
- Copies the `group_ids` reference list (same Group entity references, no duplication)
- Connection set to `null` (local set)
- Name: `"{original name} (copy)"`
- The copy's group reference list is independent — adding/removing group references does not affect the source set
- The referenced LMS-origin groups remain immutable (`origin: "lms"`)
- New locally-created groups can be added to the copy and are mutable
- Copied sets never sync their `group_ids`; they only see shared Group updates from the LMS set
- For **LMS** and **System** sources, the copied set continues to reference shared groups, so group membership/name updates still flow through when the source syncs (LMS sync or roster-driven system sync). The copy only controls which shared groups are referenced.
- When an LMS or System group is deleted at the source, it is removed from **all** group sets referencing it (including copies). Use export → edit → import if you need a frozen snapshot that won't lose groups when the source changes.

**Deleting a group set:**

- Removes the GroupSet entity
- Removes references to groups
- Orphaned groups (referenced by no other set) are deleted
- Groups still referenced by other sets survive

**Escape hatch for editing LMS groups:**

If you need fully editable versions of LMS groups:

1. Export the LMS group set to CSV
2. Edit the CSV (add/remove students, rename groups, restructure)
3. Import as a new local group set

The imported set has new Group entities with `origin: "local"` and `lms_group_id: null`, making them fully mutable. No shared references to LMS-origin groups.

## System Group Set: Individual Students

A special system-maintained group set that enables class-wide and individual assignments without manual setup.

**Behavior:**

- Auto-created when profile is created (or on first roster sync)
- Contains one group per roster student (`enrollment_type === "student"`, `origin: "system"`)
- Automatically syncs with roster changes:
  - Student added (enrollment_type === "student") → new group created (`origin: "system"`)
  - Student removed → group removed
  - Student renamed → group renamed
- Cannot be deleted, edited, or have its connection broken
- Cannot be deleted or edited; can be shallow-copied into a local group set
- Shown in sidebar with "System" badge

**Group naming:** Each group is named after its single student using normalized `firstname_lastname` format (see naming specification below).

**Use cases:**

- **Individual assignments:** Select "Individual Students" group set with `kind: "all"`
- **Class-wide assignments:** Create a local group set with a single group containing all students (or use pattern matching)
- **Default assignment target:** New assignments default to the system group set if no group set is explicitly chosen.

## System Group Set: Staff

A special system-maintained group set that provides a single staff group for export/testing and reference.

**Behavior:**

- Auto-created when profile is created (or on first roster sync)
- Contains a single group named `Staff` with all roster staff members (`enrollment_type !== "student"`, `origin: "system"`)
- Automatically syncs with roster staff changes:
  - Staff member added → member added to the Staff group
  - Staff member removed → member removed from the Staff group
  - Staff member renamed → no group rename (group name is fixed)
- Cannot be deleted, edited, or have its connection broken
- Can be shallow-copied into a local group set
- Shown in sidebar with "System" badge and tooltip: "All non-student roles"

## Group Naming Specification

### Slug Normalization Rules

All auto-generated group names are normalized to slugs using these rules in order:

1. **Unicode normalization** — Apply NFD decomposition
2. **Strip diacritics** — Remove combining marks (é → e, ñ → n, ü → u)
3. **Lowercase** — Convert to lowercase ASCII
4. **Replace special characters** — Replace non-alphanumeric characters with the separator:
   - Individuals (system groups): underscore (`_`)
   - Multi-member groups: dash (`-`)
5. **Handle apostrophes** — Remove entirely (`O'Brien` → `obrien`)
6. **Collapse separators** — Replace runs of separators with single separator
7. **Trim** — Remove leading/trailing separators
8. **Empty fallback** — If result is empty, use:
   - `member_<id_suffix>` for individual/system groups
   - `unnamed` for multi-member groups (collisions resolved with suffixes)

**Normalization examples:**

| Input | Context | Output |
|-------|---------|--------|
| `José García` | individual | `jose_garcia` |
| `Mary Ann O'Brien` | individual | `mary_obrien` |
| `Müller`, `François` | group | `muller-francois` |
| `李明` (Chinese) | individual | `member_1a2b` (no ASCII) |
| `Bob   Smith` | individual | `bob_smith` |

### Individual Names (System Group Set)

Individual group names use **first word of first name** + **last word of last name**:

| Full Name | First Word | Last Word | Result |
|-----------|------------|-----------|--------|
| `Alice Smith` | `alice` | `smith` | `alice_smith` |
| `María José García López` | `maria` | `lopez` | `maria_lopez` |
| `Mary Ann O'Brien` | `mary` | `obrien` | `mary_obrien` |

This matches common requirements for git usernames and peer review tools (e.g., TEAMMATES) that expect simple `firstname_lastname` format.

### Multi-Member Group Names

When adding groups to local group sets, names are auto-generated from selected members using **last word of surname only**:

| Members | Format | Example |
|---------|--------|---------|
| 1 member | `firstname_lastname` | `alice_smith` |
| 2-5 members | All surnames with dashes | `smith-jones-lee` |
| 6+ members | 5 surnames + remainder | `smith-jones-lee-patel-chen-+2` |

**Separator signals type:** underscore (`_`) = individual, dash (`-`) = group.

### Collision Resolution

**System group set (Individual Students):**

Scope: unique within the system group set.

Strategy: Append member ID suffix (last 4 characters):

```text
alice_smith
alice_smith_a1b2
alice_smith_c3d4
```

The member ID suffix is meaningful — it identifies *which* Alice Smith, rather than an arbitrary number.

**Auto-generated local group names:**

Scope: unique within the target group set.

Strategy: Append incrementing suffix starting at `-2`:

```text
smith-jones
smith-jones-2
smith-jones-3
```

Resolution: Check existing names in group set before finalizing. User can always override.

**LMS/Import group names:**

LMS names are preserved verbatim from LMS. Imported names are preserved verbatim on import/re-import (no normalization at ingest). Collision is prevented at the source for LMS (LMS enforces uniqueness within a group set).

If import CSV contains duplicate `group_name` values, they are treated as the same group (rows merged). This is intentional—the CSV format uses one row per membership.

Duplicate membership rows with the same (`group_name`, `email`) pair are invalid and must be rejected. A single empty-email row per `group_name` is allowed to represent an empty group.

### Name Uniqueness Scope

| Context | Uniqueness Scope |
|---------|------------------|
| System group set | Within system group set |
| Local group set | Within that group set |
| Connected group set | Enforced by LMS/source |
| Across group sets | Not enforced (same name allowed in different sets) |

### Edge Cases

| Scenario | Behavior |
|----------|----------|
| Member with only first name | Use first name only: `alice` |
| Member with only last name | Use last name only: `smith` |
| Member name is all special chars | Fallback: `member_<id_suffix>` (last 4 chars of member ID) |
| Group members all non-ASCII | Fallback: `unnamed` (suffixes added on collision) |
| Member renamed in roster | System group renamed automatically (no manual overrides) |
| Collision after roster rename | Re-resolve suffixes for affected names |
| Group with 0 members | Name required at creation; no auto-generation |

### Manual Override Behavior (Local/Import Only)

- Auto-generated names are suggestions; users can edit freely for local/imported groups
- Once manually edited, auto-update stops for that group
- **Normalization applies when the app/user defines the name** (auto-generated local names or manual rename/edit) via backend `normalize_group_name` manifest command (single Rust implementation; no frontend reimplementation)
  - UI shows a read-only normalized preview line below the input while editing (debounced backend call)
  - On commit (blur/Enter), the UI calls `normalize_group_name` once and stores the normalized value
- Imported names that are not manually edited remain verbatim as provided by the CSV (including re-import)
- Manual names must still be unique within their group set (validated on save)
- System and LMS-origin groups are auto-managed and cannot be manually renamed
