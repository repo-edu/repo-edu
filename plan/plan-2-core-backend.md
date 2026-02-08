# Phase 2: Core Backend Model

See [plan.md](./plan.md) for overview, [plan-0-data-model.md](./plan-0-data-model.md) for entity definitions, and [plan-0-commands.md](./plan-0-commands.md) for command architecture.

**Prerequisites:** Complete [Phase 1: Schema & Types](./plan-1-schemas.md)

## Checklist

**System set authority:** Backend creates and owns system group sets and system groups (UUIDs, connection metadata) via a single `ensure_system_group_sets` entrypoint. Frontend must not fabricate system sets or system groups in normal operation; mock backend and fixtures must seed them explicitly. `ensure_system_group_sets` is idempotent, reuses existing system groups when present (match by `member_ids` for Individual Students, and by fixed name `Staff` for the Staff set) to avoid UUID churn, and normalizes group memberships against the roster. Backend operations must treat missing system sets as a hard error unless they are executing `ensure_system_group_sets`.

### System Set Bootstrap (single entrypoint)

- [ ] `ensure_system_group_sets(roster: &mut Roster) -> SystemGroupSetEnsureResult`
  - Idempotent: safe to call on every profile load and after roster sync/import
  - Single public entrypoint; internally delegates to two private phases (see below)
  - Returns combined results from both phases in one `SystemGroupSetEnsureResult`
  - Called by:
    - Profile creation
    - Roster sync/import flows
    - New manifest command `ensure_system_group_sets` (app load / profile load)
    - Any roster mutation before persistence (backend-owned normalization)

#### Internal Phase 1: `ensure_system_sets_internal` (private)

Creates and repairs system group sets. Only touches system-owned entities.

- [ ] Ensures both system group sets exist with correct `connection` metadata
- [ ] Reuses existing system sets/groups where possible; never reassigns IDs if a valid match exists
- [ ] Assumes exactly one system set per `system_type` (students + staff)
- [ ] For Individual Students groups: match by single-member `member_ids`; keep one group per student and update names
  - Apply deterministic collision handling from the data model: if normalized `firstname_lastname` collides, append student ID suffix (`_a1b2`)
  - Enforce uniqueness of group names within the Individual Students system set after roster changes/renames
- [ ] For Staff group: match by `origin: "system"` and name `Staff`; keep one and merge member IDs
- [ ] Does not mutate non-system group sets
- [ ] Returns system group sets and system groups (created, updated, or deleted)

#### Internal Phase 2: `cleanup_stale_memberships` (private)

Removes stale member IDs from all groups. Runs after Phase 1 so system groups are already up to date.

- [ ] Removes member IDs from all groups when:
  - The member no longer exists in the roster (deleted), OR
  - The member has `status !== "active"` (dropped or incomplete)
  - Applies to all group types (system, LMS, local, imported)
  - Groups can become empty; do not auto-delete groups based solely on emptiness
- [ ] Returns all non-system groups that were modified (system group changes are already captured by Phase 1)

#### Combined Result

- [ ] `groups_upserted` contains all updated groups from both phases (system groups from Phase 1 + non-system groups from Phase 2)
- [ ] `deleted_group_ids` contains system groups removed in Phase 1 (Phase 2 never deletes groups)
- [ ] `group_sets` contains system group sets from Phase 1

### ID Generation Utilities

- [ ] UUID generator for RosterMember IDs (canonical roster-member identity)
- [ ] UUID generator for GroupSet IDs
- [ ] UUID generator for Group IDs (groups are now top-level entities)

### System Group Set: Individual Students

- [ ] Auto-create "Individual Students" group set when profile is created
  - Create on profile creation with empty `group_ids` array
  - `connection: { kind: "system", system_type: "individual_students" }`
  - First roster sync (or any roster mutation) populates groups
  - Creates one Group per roster student (`enrollment_type === "student"`) (top-level entities in `roster.groups`, `origin: "system"`)
  - GroupSet references these groups via `group_ids`
  - Group names: `firstname_lastname` format (e.g., `alice_smith`)
- [ ] Sync system group set automatically when roster changes:
  - Student added (`enrollment_type === "student"`) -> create new Group (top-level, `origin: "system"`), add ID to system set's `group_ids`
  - Student removed -> remove Group from `group_ids` and delete the Group entity
    - Remove the Group ID from all group sets referencing it (including local copies)
  - Student renamed -> update Group name directly
- [ ] Reconciliation rule: if a system group already exists for a student (single-member `member_ids` match), reuse that Group ID and update name; only create a new Group if no match exists
- [ ] System group set cannot be deleted, edited, or have connection broken
- [ ] System group set can be shallow-copied into a local group set
- [ ] System group set is identified by `connection.kind === "system"` and `system_type` (never by array position)
- [ ] Backend is source of truth for creating system sets and UUIDs; operations are idempotent when a matching system set already exists

### System Group Set: Staff

- [ ] Auto-create "Staff" group set when profile is created
  - Create on profile creation with empty `group_ids` array
  - `connection: { kind: "system", system_type: "staff" }`
  - First roster sync (or any roster mutation) populates the Staff group
  - Creates a single Group named `Staff` (`origin: "system"`) containing all staff member IDs
  - GroupSet references this group via `group_ids` (single entry)
- [ ] Sync system staff group set automatically when roster changes:
  - Staff member added -> add member to Staff group
  - Staff member removed -> remove member from Staff group
  - Staff member renamed -> no group rename (group name is fixed)
  - Staff group persists even if empty
- [ ] Reconciliation rule: if a system Staff group already exists (origin `system`, name `Staff`), reuse that Group ID; only create a new Group if missing
- [ ] System group set cannot be deleted, edited, or have connection broken
- [ ] System group set can be shallow-copied into a local group set
- [ ] Backend is source of truth for creating system sets and UUIDs; operations are idempotent when a matching system set already exists

### Roster Membership Cleanup

- [ ] Performed inside `ensure_system_group_sets` via internal Phase 2 (`cleanup_stale_memberships`)
- [ ] Phase 1 handles system-specific removals (deleting per-student system groups, updating Staff group membership)
- [ ] Phase 2 handles global cleanup: remove stale `member_id` from all non-system groups' `member_ids`
  - Removes members that no longer exist in the roster OR have `status !== "active"`
  - Applies to LMS, local, and imported group types (system groups already handled by Phase 1)
  - Groups can become empty; do not auto-delete groups based solely on emptiness
  - System group set removal of per-student groups (Phase 1) is global across all referencing sets

### Roster Sync Merge Rules

- [ ] Match priority for LMS users: `lms_user_id` (exact) → `email` (case-insensitive) → `student_number` (exact).
- [ ] If multiple roster members match at any step, treat as a conflict and do not merge; surface in sync summary.
- [ ] Apply non-conflicting matches; leave conflicted entries untouched and surface warnings. Sync should not fail hard due to conflicts.
- [ ] `lms_user_id` and `student_number` are external identifiers for matching only; they never replace canonical `RosterMember.id` (UUID).
- [ ] On match, update LMS-provided fields (name, email, enrollment_type, enrollment_display, status, student_number, department, institution, source = `lms`) while preserving local-only fields (`git_username`, `git_username_status`).
- [ ] If enrollment type changes between student and non-student, move the entry between `roster.students` and `roster.staff` while preserving the same `id` and any group memberships.
- [ ] Include conflicts in `ImportRosterResult` (see schema updates) with enough detail for UI/CLI display.

### Group Resolution

- [ ] `resolveAssignmentGroups(roster, assignment)` helper
  - Looks up GroupSet by `assignment.group_set_id`
  - Looks up Groups by GroupSet's `group_ids`
  - Returns all groups if `group_selection.kind === "all"`
  - Returns filtered groups if `group_selection.kind === "pattern"` (glob match on name)
  - Applies `excluded_group_ids` (UUIDs) after matching
  - No membership filtering needed — non-active students are already removed from `member_ids` by `ensure_system_group_sets`
  - Group names are **never** recomputed from membership; repo naming must always use `Group.name` as stored
  - Keeps groups even if they have zero members
  - Validation should warn on empty groups; repo creation should skip empty groups and surface the warning (CSV export still includes empty groups via empty-email rows)

- [ ] `preview_group_selection(roster, group_set_id, group_selection) -> GroupSelectionPreview`
  - Validates glob syntax (same rules as `validate_group_selection`)
  - On invalid pattern: `valid=false`, `error` set, `group_ids` empty
  - On valid pattern:
    - `total_groups` = total groups in the set (no filtering)
    - `matched_groups` = count matched by selection before exclusions (for `kind: "all"`, equals `total_groups`)
    - `group_ids` = groups after exclusions, ordered as in the group set
    - `group_member_counts` = `member_ids.length` per group, aligned to `group_ids`
    - `empty_group_ids` = subset of `group_ids` with zero members
  - Does not mutate roster (preview-only)

- [ ] `filter_by_pattern(pattern, values) -> PatternFilterResult`
  - Uses the same simple glob validation + matching rules as `preview_group_selection`
  - On invalid pattern: `valid=false`, `error` set, `matched_indexes` empty
  - On valid pattern: returns `matched_indexes` in original `values` order
  - Pure helper for debounced frontend local filtering (import/reimport dialogs and similar list filters)

### Validation Helpers

- [ ] `validate_roster` updates:
  - Fails if system group sets are missing; callers must run `ensure_system_group_sets` first
  - `connection` present (nullable but explicit)
  - All `group_ids` referenced by any GroupSet exist in `roster.groups`
  - Group names are unique within each GroupSet (case-sensitive, after trimming)
  - No duplicate `Group.id` values in `roster.groups`
  - No duplicate `RosterMember.id` values across `roster.students` + `roster.staff`
  - `roster.students` entries have `enrollment_type === "student"`
  - `roster.staff` entries have `enrollment_type !== "student"`
  - System group sets reference only `origin: "system"` groups
  - LMS group sets reference only `origin: "lms"` groups
  - Imported group sets reference only `origin: "local"` groups with `lms_group_id: null`
  - Local group sets may reference mixed origins (system/lms/local)
  - Individual Students system set contains only `roster.students`; Staff system set contains only `roster.staff`
  - Every `member_id` in every Group must exist in the roster (students or staff). Treat missing IDs as a validation error (data corruption).
- [ ] `validate_assignment` resolves groups via `resolveAssignmentGroups` and validates against the resolved set
- [ ] `validate_group_selection` validates glob syntax consistently with backend command helpers (`preview_group_selection`, `filter_by_pattern`)

### Orphan Cleanup Utility

- [ ] `cleanup_orphaned_groups(roster: &mut Roster)`
  - Called after any mutation that removes a group ID from a group set
  - Collects all `group_ids` referenced by any group set
  - Removes groups from `roster.groups` that are not in the referenced set

### Group Naming Utilities

- [ ] `generate_group_name(members: &[RosterMember]) -> String`
  - 1 member: `firstname_lastname` (first word of first name + last word of last name)
  - 2-5 members: all surnames with dashes (e.g., `smith-jones-lee`)
  - 6+ members: 5 surnames + remainder (e.g., `smith-jones-lee-patel-chen-+2`)
- [ ] `resolve_collision(base_name, existing_names, member_id) -> String`
  - For individuals: append student ID suffix (e.g., `alice_smith_a1b2`)
  - For groups: append incrementing suffix (e.g., `smith-jones-2`)
- [ ] Used by:
  - System group set (individual student groups)
  - Add group dialog (auto-populate name from selected members)

### Slug Normalization (Rust)

- [ ] Unicode to ASCII normalization (e.g., `Jose Garcia`)
- [ ] Apostrophe removal (`O'Brien` -> `obrien`)
- [ ] Whitespace collapsing
- [ ] Non-ASCII fallback (`member_<id>`)
- [ ] Empty result fallback

### Pattern Matching (Rust)

- [ ] Implement a small internal **simple glob** matcher (string match, not path match)
  - Supported tokens: `*`, `?`, `[...]`, `[!...]`, `\\` escape
  - Treat `^` as a literal everywhere (do **not** allow `[^...]`)
  - Reject `**`, extglobs, brace expansion
  - Full-string, case-sensitive match
  - Use this matcher for `preview_group_selection`, `filter_by_pattern`, and any backend pattern filters

## Files to Modify

- `apps/repo-manage/core/src/` (new modules for naming, uuid, group resolution)
- `apps/repo-manage/core/src/operations/` (validation helpers, cleanup utilities)
