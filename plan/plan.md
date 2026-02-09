# UI Refactor Plan: Groups & Assignments Tab

## Overview

Refactor the Groups & Assignments tab to use a unified data model where group sets are either LMS-connected or local (permanent distinction), and assignments reference group sets by ID. The tab uses a master-detail layout: sidebar for navigation, right panel for viewing/editing the selected item.

**Core principle:** Group editability is determined by origin — groups with `origin !== "local"` are immutable everywhere, groups with `origin === "local"` are mutable. No "break connection" mechanism; export/import is the escape hatch for modifying LMS group data locally.

**Execution context:** This plan is intended for AI assistants. Do not add migration or backward-compatibility work unless explicitly requested.

**No users yet:** The app has no users and no existing profiles to preserve. Breaking schema changes are fine; no migration is needed.

## Reference Documents

| File | Description |
|------|-------------|
| [plan-0-data-model.md](./plan-0-data-model.md) | Core data model and entity definitions |
| [plan-0-commands.md](./plan-0-commands.md) | Command architecture and UI traceability |

## Implementation Phases

| File | Phase | Description | Status |
|------|-------|-------------|--------|
| [plan-1-schemas.md](./plan-1-schemas.md) | Phase 1 | Schema changes and type definitions | **DONE** |
| [plan-2-core-backend.md](./plan-2-core-backend.md) | Phase 2 | Core backend model (system sets, resolution, validation, utilities) | **DONE** |
| [plan-3-lms-client.md](./plan-3-lms-client.md) | Phase 3 | LMS client mapping and enrollment types | **DONE** |
| [plan-4-import-export.md](./plan-4-import-export.md) | Phase 4 | CSV group set import/export and roster XLSX export | **DONE** |
| [plan-5-commands-cli.md](./plan-5-commands-cli.md) | Phase 5 | Manifest commands, Tauri handlers, CLI alignment | **DONE** |
| [plan-6-stores.md](./plan-6-stores.md) | Phase 6 | Store updates and selectors | **DONE** |
| [plan-7-mock-tests.md](./plan-7-mock-tests.md) | Phase 7 | Mock backend, fixtures, and tests | **DONE** |
| [plan-8-sidebar.md](./plan-8-sidebar.md) | Phase 8 | Sidebar refactor | **DONE** |
| [plan-9-panel.md](./plan-9-panel.md) | Phase 9 | Right panel (groups editor + assignment panel) | **DONE** |
| [plan-10-dialogs.md](./plan-10-dialogs.md) | Phase 10 | Dialogs | **DONE** |
| [plan-11-polish.md](./plan-11-polish.md) | Phase 11 | UX polish (tooltips, empty states, keyboard nav, error handling) | **DONE** |
| [plan-12-membership-matrix.md](./plan-12-membership-matrix.md) | Phase 12 | Data Overview Membership Matrix | **DONE** |
| [plan-13-roster.md](./plan-13-roster.md) | Phase 13 | Roster tab enhancements | **DONE** |

## Documentation Updates

Update developer documentation under `docs/` based on the reference documents and design decisions.

## TODO (Post-Redesign)

- Add additional tests once the redesign is complete and confirmed to work.

### New Documentation Pages

| Source | Target | Description |
|--------|--------|-------------|
| [plan-0-data-model.md](./plan-0-data-model.md) | `docs/.../data-model.md` | Groups & Assignments data model reference |
| [plan-0-commands.md](./plan-0-commands.md) | `docs/.../command-architecture.md` | Command tiers and UI→backend traceability |

### Key Topics to Document

- Core model: `Group` is a top-level profile entity with UUID and `origin`; `GroupSet` references groups by ID; `Assignment` references `group_set_id` and `group_selection`
- Editability by origin: a group is mutable iff `origin === "local"`; no need to check which sets reference the group
- Group set types (permanent, never convert): LMS (canvas/moodle), Local (connection: null), Imported (connection: import), System (connection: system)
- System group set "Individual Students": auto-maintained, one group per roster student, syncs with roster changes, enables individual assignments
- System group set "Staff": auto-maintained, single group containing all non-students; used for export/testing and reference
- Group naming conventions: `firstname_lastname` for individuals (first word + last word), dashes for multi-member groups (`smith-jones-lee`), collision uses member ID suffix for individuals
- Group selection modes (`all` vs glob `pattern`, case-sensitive matching) plus explicit per-group exclusions (by UUID); backend is the source of truth for pattern validation/matching; UI uses preview results and shows zero-match warnings
- Connection types and semantics:
  - LMS (canvas/moodle): entirely read-only, all groups are `origin: "lms"` with `lms_group_id` set, re-sync replaces data
- Local (connection: null): fully editable, can contain mix of LMS-origin (immutable), system-origin (immutable), and local (mutable) groups
- Imported (connection: import): local in behavior, all groups are `origin: "local"` (mutable), re-import overwrites
- System: auto-maintained, read-only, cannot delete or edit; groups are `origin: "system"`; can be shallow-copied
- System set bootstrap: backend owns creation of system group sets via a single `ensure_system_group_sets` entrypoint invoked before UI use; frontend never creates system sets, existing system groups are reused to avoid UUID churn, and non-UI entry points must fail fast or call `ensure_system_group_sets` if system sets are missing. **Invariant:** exactly one system set per `system_type`; duplicates are out of scope and are not handled (including by validation).
- ID stability: `GroupSet.id` stable (UUID), `Group.id` stable (UUID), `RosterMember.id` stable (UUID), and `Group.lms_group_id` for LMS sync matching
- Sync behavior: match by `lms_group_id`, update in place, create new groups, dereference removed groups, clean up orphans; local copies never sync `group_ids` (they only see shared group updates)
- Copy behavior: shallow copy creates new Local set referencing same groups (no new Group entities); groups remain immutable if `origin !== "local"`; copied sets never sync `group_ids`
- Delete behavior: removes references and cleans up orphaned groups
- Escape hatch for editing LMS groups: export CSV → edit → import as new local set (produces mutable groups with `origin: "local"` and `lms_group_id: null`)
- Roster model: student roster is editable; LMS connection merges rather than overwrites; local additions preserved; dropped LMS students set to `status: "dropped"` and removed from all group memberships by `ensure_system_group_sets`; non-students are stored separately in `roster.staff`, hidden from the roster UI/pickers, but preserved in group memberships and shown with a staff badge
- Membership model: non-active students are removed from group memberships (no resolve-time filtering); group member counts are always `member_ids.length`; ungrouped students computed across all group sets
- Sync member matching by `lms_user_id` (students + staff), missing-member reporting, and UI prompt to sync roster first (`lms_user_id`/`student_number` are matching metadata and do not replace canonical `RosterMember.id`)
- RosterMember field mappings and new roster fields (`student_number`, `enrollment_type`, `department`, `institution`, `source`)
- Enrollment type visibility: roster sync always imports all enrollment types; Canvas `type[]` parameter used to request all types; non-students are stored in `roster.staff`, hidden from student pickers/rosters, but preserved in group memberships and shown with a staff badge
- Import/export CSV format: columns are `group_set_id`, `group_id`, `group_name`, `name`, `email`. Import requires `group_name`; `email` required only for membership rows; member matching by email only. `group_set_id` and `group_id` are optional base58-encoded UUIDs for group re-import matching (fallback to `group_name`). Export includes IDs for stable re-import.
- Edge cases: delete group set cascades assignments with confirmation; re-import overwrites groups; pattern can match none; invalid glob blocks save
- UI structure: master-detail layout, sidebar sections for system/connected/local sets (permanent, items never move between sections), and right-panel behavior per selection
- LMS architectural differences (Canvas vs Moodle): Canvas embeds groups in group sets, Moodle shares groups across groupings; both handled uniformly by reference-based model
- No migration required (no existing users/profiles)

### Design Decisions to Document

| Decision | Rationale |
|----------|-----------|
| No `create_missing_members` on group set import | Deferred from v1. Two-step workflow (import roster first, then groups) is acceptable. ~45% of users on unsupported LMS can use this workflow. Cleanly addable later without architectural changes. |
| Non-active students removed from group memberships | Simpler than resolve-time filtering. Group member counts are always `member_ids.length` everywhere — no "stored vs resolved" distinction. The LMS already preserves dropped students for grade history; this app doesn't need to duplicate that. |
| Roster file import treated as full sync | Students absent from re-imported file are set to `status: "dropped"`. Supports teachers on unsupported LMS who export full rosters. Local additions (`source: "local"`) are preserved. Preview with confirmation required before dropping students. |
| Email-only member matching for all CSV imports | Email is the one universal field across all LMS exports. Removes `member_id` and `student_number` fallback chains. One matching strategy across roster import and group set import. |
| Minimal group set CSV columns (`group_set_id`, `group_id`, `group_name`, `name`, `email`) | Removed 6 export-only columns that served no import purpose. Detailed roster fields belong in roster XLSX export, not group set CSV. |

---

## UI Structure

### Top Bar Layout

```text
┌─ Top Row ─────────────────────────────────────────────┐
│ [Student Roster] [Groups & Assignments] [Operations]  ℹ️  ⚙️  │
└───────────────────────────────────────────────────────┘
```

### Tab Structure

```text
Student Roster → Group Sets & Assignments → Operations
```

### Sidebar Sections

```text
SYSTEM (auto-managed)
▶ Individual Students (System · 74 students)      [+]
▶ Staff (System · 12 staff)                       [+]

CONNECTED GROUP SETS (LMS-synced, read-only)
▼ Project Groups (Canvas · synced Jan 20)         [+]
    Assignment: 1DH (all · 74 groups)
    Assignment: Test (pattern: "1D*" · 14 groups)
▶ Lab Teams (Moodle · synced Jan 18)              [+]

LOCAL GROUP SETS (editable)
▼ Custom Groups                                   [+]
    Assignment: Final Exam (all · 3 groups)
▶ Imported Set (Import · imported Jan 15)         [+]
+ New Local Group Set
```

**Visual cues:**

- Section headings are permanent — items never move between sections
- Connected section: LMS-synced sets (Canvas, Moodle) with sync timestamps
- Local section: locally-created sets and imported sets (fully editable)
- `[+]` adds assignment to that group set
- Connection type badge (Canvas, Moodle, Import) shown in parentheses

### Right Panel (Groups Editor)

The right panel shows content based on the selected sidebar item. This is a master-detail layout where the sidebar handles navigation and the right panel displays the selected item's content.

**When selecting a local group set:**

- Header: name
- Toolbar: Export, Copy, Delete
- Content: Groups list with per-group editability
  - Groups with `origin === "local"` are editable (add/remove/rename, edit members)
  - Groups with `origin !== "local"` show 🔒 lock icon inline, read-only
  - Add new groups (always mutable)
  - Drag-drop or multi-select for student assignment (mutable groups only)

**When selecting a connected group set (LMS: Canvas/Moodle):**

- Header: name, connection type, sync status
- Toolbar: Sync, Export, Copy, Delete
- Content: Read-only groups list
  - All groups are `origin: "lms"` and are immutable
  - Each group shows 🔒 lock icon inline with group name
  - Name is not editable

**When selecting an imported group set:**

- Header: name, import source filename, import timestamp
- Toolbar: Re-import, Export, Copy, Delete
- Content: Editable groups list (all groups are `origin: "local"`)
  - Add/remove/rename groups
  - Add/remove students from groups
  - Re-import completely overwrites

**When selecting an assignment:**

- Header: name, parent group set reference
- Toolbar: Change group set, Delete
- Content:
  - Connection mode editor (all / pattern)
  - Pattern input (shown when mode = pattern, glob syntax)
  - Excluded groups editor (collapsible list with restore)
  - Resolved groups preview based on connection mode

### Data Overview Sheet (Extended)

The existing Data Overview sheet (accessed via ℹ️ icon in top bar) is extended with a **Membership Matrix** section that provides a cross-tab view relating Roster students to Group Sets memberships.

**Membership Matrix:**

```text
                    │ Project Groups │ Lab Teams │ Final Exam │
────────────────────┼────────────────┼───────────┼────────────┤
Alice Smith         │ Team Alpha     │ Lab 3     │ —          │
Bob Jones           │ Team Beta      │ Lab 1     │ Group A    │
Carol Lee           │ —              │ Lab 2     │ —          │
David Park          │ Team Alpha     │ —         │ Group B    │
```

- Rows: All students from `roster.students` (dropped/incomplete students will have empty cells since they are removed from group memberships)
- Columns: Group sets
- Cells: Group name within that set, or "—" if unassigned

**Exclusions:**

- Staff never appear in the matrix

**Interactions:**

| Action | Result |
|--------|--------|
| Sort by column | Groups unassigned students together |
| Filter row | Search/filter by student name |
| Filter column | Show/hide specific group sets |

**Implementation:** Uses Tanstack Table for sorting and column visibility. Sorting enabled for all columns. Filtering uses quick search only (no per-column filters). Read-only display (no inline cell editing).

**Benefits:**

- See unassigned students per group set by sorting
- Visual coverage check across all sets at once
- Replaces sidebar "Ungrouped students" item with a more flexible view

---

## Import/Export Format

CSV format for group set import and export:

```csv
group_set_id,group_id,group_name,name,email
7Y4AT6QVt6A36uM5x4Pj5R,7u6fcQ4wX6FRP2vxYFQn8U,project-team-a,Alice Smith,alice@example.edu
7Y4AT6QVt6A36uM5x4Pj5R,4F99qJ4ypjF1xYJ2h4zg9K,project-team-b,Bob Jones,bob@example.edu
7Y4AT6QVt6A36uM5x4Pj5R,4F99qJ4ypjF1xYJ2h4zg9K,project-team-b,,
```

**Import rules:**

- Header row required
- One row per group membership (student appears in multiple rows if in multiple groups)
- `group_set_id` and `group_id` are optional base58-encoded UUID transport fields
- Import decodes base58 IDs to internal UUIDs; invalid values are validation errors
- Required columns: `group_name` (`email` required only for membership rows)
- Optional columns: `group_set_id`, `group_id`, `name` (ignored on import beyond validation)
- Member matching by email (case-insensitive, trimmed); no match → reported as missing; multiple roster members sharing the same email → ambiguous, reported as missing with reason
- Each (`group_name`, `email`) pair must be unique within file when `email` is present; duplicates rejected with error
- Empty-group rows: allow a single row with empty `email` per `group_name` to represent an empty group (ignored if member rows exist)
- Roster members not found are reported but not blocking

**Email matching:**

- Case-insensitive comparison (per RFC 5321 domain rules and common practice)
- Leading/trailing whitespace trimmed
- Match against `RosterMember.email` in roster (empty email rows are treated as empty-group markers)
- If multiple roster members share the same email, treat as ambiguous — omit from `member_ids` and report as missing with reason

**Group name matching:**

- Case-sensitive (exact match)
- Leading/trailing whitespace trimmed
- Rationale: preserves user intent; "Team A" and "team a" are treated as distinct
- Re-import matches by exact name; case changes create new groups

**Export includes:**

- All groups in the set with member name and email
- `group_set_id` and `group_id` exported as base58-encoded UUID transport values

---

## Edge Cases

**Deleting a group set with assignments:**

- Confirmation dialog lists the N assignments that will be deleted
- User must confirm to proceed; cancellation preserves everything

**Syncing when pattern matches nothing:**

- Show warning in UI if resolved groups is empty

**Invalid glob pattern:**

- Show inline validation error and prevent save

**Import file format mismatch:**

- Validate on import, show clear error message

**Copying an LMS group set:**

- Creates a new Local group set with the same group references (shallow copy)
- The copy's `group_ids` list is independent — adding/removing references doesn't affect source
- Referenced groups remain immutable (they have `origin !== "local"`)
- New locally-created groups can be added and are mutable
- Use export → edit CSV → import if you need fully editable copies of LMS groups

**Changing assignment's group set with exclusions:**

- If `excluded_group_ids` is non-empty, show confirmation listing count of exclusions that will be cleared
- On confirm: clear exclusions and update group set
- On cancel: no change
- Rationale: group IDs are UUIDs scoped to groups, not portable across group sets

**Re-importing with different groups:**

- Complete overwrite — assignments using patterns may resolve differently
- Show preview before confirming re-import

**Local set with mixed group origins:**

- A local set can contain LMS-origin groups (immutable), system-origin groups (immutable), and locally-created groups (mutable)
- UI shows edit controls per-group based on `origin`
- Adding new groups always creates mutable groups (`origin: "local"`, `lms_group_id: null`)

---

## Validation Commands

After each phase:

```bash
pnpm fmt
pnpm fix
pnpm check        # Linting
```
