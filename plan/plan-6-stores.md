# Phase 6: Store Updates

See [plan.md](./plan.md) for overview, [plan-0-data-model.md](./plan-0-data-model.md) for entity definitions, and [plan-0-commands.md](./plan-0-commands.md) for frontend-only operations (store actions, selectors).

**Prerequisites:** Complete [Phase 2: Core Backend Model](./plan-2-core-backend.md)

---

## Existing Work

`packages/app-core/src/components/tabs/groups-assignments/GroupsAssignmentsTab.tsx` is a ~1650 line monolithic component using the old data model (`LmsGroupSetCacheEntry`, `CachedLmsGroup`, `kind: "linked" | "copied" | "unlinked"`). This file is **replaced** by the new component structure in Phases 8-10; see the deletion note in Phase 8.

## Profile Store Changes

**System group sets source of truth:** Backend is authoritative for creating system group sets and assigning their UUIDs. Frontend store normalization must **not** create system group sets in normal operation. If system sets are missing, treat as a data integrity error and show an empty-state prompt; mock backend and fixtures must seed them. Detection is solely by `connection.kind === "system"` and `connection.system_type` (never by array position).

**System groups during roster edits:** Frontend must **not** create/update/delete system groups. System group sets and system groups are backend-owned and only updated via `ensure_system_group_sets`. Roster member removals must not mutate group memberships directly; call `ensure_system_group_sets` to normalize memberships.

**System set bootstrap:** On profile load, call `ensure_system_group_sets` before enabling the Groups & Assignments UI. This guarantees system sets exist. If the command fails, keep the tab disabled and show an error state.

- [ ] Update `profileStore` to use new schema types:
  - `roster.students: RosterMember[]`, `roster.staff: RosterMember[]`
  - `roster.groups: Group[]` (top-level groups array)
  - `roster.group_sets: GroupSet[]` (with `group_ids` references)
  - `Assignment` with `group_set_id` and `group_selection`
- [ ] Add `systemSetsReady: boolean` (set after `ensure_system_group_sets` completes) to gate UI rendering
- [ ] Remove old types (`LmsGroupSetCacheEntry`, etc.)
- [ ] Ensure system group sets exist (identified by `connection.kind === "system"` + `system_type`; do not create new ones if already present)
- [ ] Normalize roster on load/store init:
  - Ensure `roster.connection` is present (`null` if disconnected)
  - Validate system group sets exist; if missing, call `ensure_system_group_sets` and merge result before continuing
  - Clean up orphaned groups and dangling `group_ids`

## Mock/Test Data Updates

- [ ] Update `packages/backend-mock` demo data to new roster/group/group_set schema and selectors
- [ ] Update any app-core tests/fixtures that reference old group-set fields or selectors

## Undo/Redo

The existing `profileStore` uses Immer `produceWithPatches` to capture forward/inverse patches on every `mutateDocument` call, with a 100-entry history stack. This infrastructure is preserved in the refactor.

### Undoable vs Non-Undoable Mutations

Only user-initiated actions should create undo entries. System maintenance must bypass the undo stack.

| Mutation type | Undo entry? | Mechanism |
|---------------|-------------|-----------|
| User CRUD (create/update/delete group, assignment, student, group set) | Yes | `mutateDocument(description, recipe)` |
| `ensureSystemGroupSets()` result merge | No | Plain `set()` — system normalization is not a user action |
| `normalizeRoster()` cleanup | No | Plain `set()` — maintenance on load |
| Settings mutations (`setCourse`, `setGitConnection`, etc.) | No | Plain `set()` — settings auto-save separately |
| `setRoster()` (bulk import) | Yes | `mutateDocument()` — user-initiated import |

**Post-mutation system normalization:** After roster member mutations (add/remove student), `ensureSystemGroupSets()` is called. This must **not** create a second undo entry. The user mutation creates one entry via `mutateDocument`; the subsequent system normalization merges its result via plain `set()`.

### Undo/Redo Scope

`UndoState` wraps only `{ document }`. The following are excluded from undo/redo:

- `assignmentSelection` / sidebar selection — navigation state, not data
- `systemSetsReady` — bootstrap flag
- `rosterValidation`, `assignmentValidation`, `assignmentValidations` — derived data, recomputed after undo/redo
- `coverageReport` — derived data
- `status`, `error`, `warnings` — transient I/O state

### Save Failure Recovery

When `save()` fails after a series of in-memory mutations:

- The in-memory `document` is untouched — all mutations are preserved
- The undo `history` and `future` are untouched — the user can still undo/redo
- `isDirty` remains `true` — the dirty state baseline still differs

**Bug to fix:** Currently `save()` sets `status = "loading"` at the start and `status = "error"` on failure. This is wrong — the document is still valid in memory and should be considered `"loaded"`. On save failure, restore `status` to `"loaded"` and surface the error transiently (via toast/output, which the caller already does). History must **not** be cleared on save failure (only on success).

### Undo/Redo Tooltip Selectors (implemented)

- `selectNextUndoDescription` — returns the description string of the top history entry, or `null`
- `selectNextRedoDescription` — returns the description string of the first future entry, or `null`

These are used by `Tooltip` components on the undo/redo buttons in `App.tsx` to show e.g. "Undo: Add student Alice (Ctrl+Z)".

## Store Actions (Immer mutations)

All CRUD operations are frontend-only. Persistence happens via separate `save()` call.

### GroupSet Actions

- [ ] `createLocalGroupSet(name: string)`
  - Generate UUID for new GroupSet
  - Add to `roster.group_sets` (after system sets if present; otherwise append)
  - `connection: null`, `group_ids: []`

- [ ] `copyGroupSet(groupSetId: string)`
  - Shallow copy: new UUID for GroupSet, same group references
  - Copy `group_ids` array (references same Group entities)
  - Add new GroupSet with `connection: null`
  - Name: `"{original name} (copy)"`
  - Allowed for system sets (copy creates a local set referencing the same system groups)

- [ ] `deleteGroupSet(groupSetId: string)`
  - Remove GroupSet from `roster.group_sets`
  - Remove references from `group_ids`
  - Call `cleanupOrphanedGroups()` to remove unreferenced groups
  - Cascade delete assignments referencing this group set
  - Block if `connection.kind === "system"`

- [ ] `renameGroupSet(groupSetId: string, name: string)`
  - Update GroupSet name
  - Only allowed if `connection === null` or `connection.kind === "import"`

### Group Actions

- [ ] `createGroup(groupSetId: string, name: string, memberIds: string[])`
  - Generate UUID for new Group with `origin: "local"` and `lms_group_id: null`
  - `name` must already be normalized by the caller (UI calls `normalize_group_name` before submitting)
  - Enforce name uniqueness within the target group set
  - If the submitted name is auto-generated and collides, apply group collision suffixes (`-2`, `-3`, ...)
  - If the submitted name is manual and collides, reject with a validation error (no implicit rename)
  - Dedupe `memberIds` before storing
  - Add to `roster.groups`
  - Add Group ID to GroupSet's `group_ids` (append)
  - Only allowed if GroupSet is local (`connection === null` or `connection.kind === "import"`)

- [ ] `updateGroup(groupId: string, updates: { name?: string, member_ids?: string[] })`
  - Update Group entity in `roster.groups`
  - Only allowed if `selectIsGroupEditable(groupId)` is true (i.e., `origin === "local"`)
  - `name` must already be normalized by the caller (UI calls `normalize_group_name` before submitting)
  - If `name` changes, enforce uniqueness in every referencing group set
  - If the submitted name is auto-generated and collides, apply group collision suffixes (`-2`, `-3`, ...)
  - If the submitted name is manual and collides in any referencing set, reject with a validation error
  - Dedupe `member_ids` when provided
  - If `name` changes, do not re-sort any `group_ids`; ordering is always preserved
  - UI must confirm before calling when `selectGroupReferenceCount(groupId) > 1`

- [ ] `deleteGroup(groupId: string)`
  - Remove Group ID from all GroupSets' `group_ids`
  - Remove Group from `roster.groups`
  - Only allowed if `selectIsGroupEditable(groupId)` is true
  - Use only for explicit "delete everywhere" actions (not for removing from a single set)

- [ ] `addGroupToSet(groupSetId: string, groupId: string)`
  - Add existing Group ID to GroupSet's `group_ids`
  - Only allowed if GroupSet is local (`connection === null` or `connection.kind === "import"`)
  - De-dupe `group_ids` after insertion (defensive)

- [ ] `removeGroupFromSet(groupSetId: string, groupId: string)`
  - Remove Group ID from GroupSet's `group_ids`
  - Call `cleanupOrphanedGroups()` if group is now unreferenced
  - Only allowed if GroupSet is local (`connection === null` or `connection.kind === "import"`)

### Assignment Actions

- [ ] `createAssignment(assignment: Omit<Assignment, "id">)`
  - Generate UUID for new Assignment
  - Add to `roster.assignments`
  - Default `group_selection: { kind: "all", excluded_group_ids: [] }`

- [ ] `updateAssignment(id: string, updates: Partial<Assignment>, options?: { confirmClearExclusions?: boolean })`
  - Update Assignment in `roster.assignments`
  - If `group_set_id` changes and `excluded_group_ids` is non-empty:
    - Refuse the update unless `options?.confirmClearExclusions === true`
    - On confirmed update, clear `excluded_group_ids`

- [ ] `deleteAssignment(id: string)`
  - Remove Assignment from `roster.assignments`

### Utility Actions

- [ ] `cleanupOrphanedGroups()`
  - Collect all `group_ids` from all GroupSets
  - Remove any Group from `roster.groups` not in that set
  - Does not remove groups solely because they are empty
  - Called internally by delete/remove operations

- [ ] `normalizeRoster()`
  - Ensures `roster.connection` exists (default `null`)
  - Validates system group sets exist; if missing, triggers `ensure_system_group_sets` and merges result
  - Removes dangling `group_ids` and cleans up orphaned groups
  - Removes assignments whose `group_set_id` no longer exists
  - Filters `excluded_group_ids` to only those still present in the assignment's group set
  - Does not remove group `member_ids` for deleted roster members (backend normalization handles this)
  - Preserve `group_ids` ordering exactly as stored (no implicit re-sorting)
  - Called on profile load or store init
  - `validate_roster` (backend) must only be called after `ensure_system_group_sets` succeeds

- [ ] `ensureSystemGroupSets()`
  - Calls manifest command `ensure_system_group_sets`
  - Merges returned system sets/groups into the roster
  - Deletes any system groups listed in `deleted_group_ids`
  - Removes any `deleted_group_ids` from all `group_sets[].group_ids`
  - Sets a `systemSetsReady` flag used to gate UI rendering

- [ ] After any roster member mutation, call `ensureSystemGroupSets()` before persistence (backend removes missing member IDs from all groups)

### Group Selection Preview (Frontend)

- [ ] Use `preview_group_selection` manifest command for assignment pattern validation + matching
  - Debounce calls while typing in the pattern field
  - Store latest preview result in local component state (or uiStore if needed)
  - Show loading state while preview is in flight
  - Assignment resolution stays backend-authoritative

### Pattern Filters (Frontend via Backend Command)

- [ ] Use `filter_by_pattern` manifest command for all local UI pattern filters (e.g., import/reimport dialogs)
  - Debounce calls while typing
  - Cancel/ignore stale responses to prevent out-of-order UI updates
  - Show loading state while filter results are in flight
  - On invalid patterns, surface backend `error` inline and render no local matches

## New Selectors

Follow existing selector pattern — pure functions exported from the store file:

```ts
// Existing pattern:
export const selectRoster = (state: ProfileStore) =>
  state.document?.roster ?? null

// Used as:
useProfileStore(selectAssignments)

// New parameterized selectors:
export const selectGroupSetById = (id: string) => (state: ProfileStore) =>
  state.document?.roster?.group_sets?.find(gs => gs.id === id) ?? null
```

New selectors to add:

**Group selectors:**

- [ ] `selectGroups` → Group[] (all top-level groups)
- [ ] `selectGroupById(id: string)` → Group | null
- [ ] `selectGroupsForGroupSet(groupSetId: string)` → Group[]
  - Looks up GroupSet's `group_ids`
  - Returns resolved Group entities from `roster.groups`
- [ ] `selectRosterStudents` → RosterMember[]
- [ ] `selectRosterStaff` → RosterMember[]
- [ ] `selectRosterMemberById(id: string)` → RosterMember | null
  - Looks in both `roster.students` and `roster.staff`
- [ ] `selectIsGroupEditable(groupId: string)` → boolean
  - Returns `group.origin === "local"`
  - Simple origin-based check, no need to examine all group sets
- [ ] `selectGroupReferenceCount(groupId: string)` → number
  - Returns the number of GroupSets that reference the group (for delete confirmations)

**Note:** Group editability is determined by origin, not by which sets reference the group. A local group set can contain both mutable groups (`origin: "local"`) and immutable groups (`origin: "lms"` or `origin: "system"`).

**GroupSet selectors:**

- [ ] `selectGroupSets` → GroupSet[]
- [ ] `selectGroupSetById(id: string)` → GroupSet | null
- [ ] `selectIsGroupSetEditable(groupSetId: string)` → boolean
  - Returns `true` if `connection === null` or `connection.kind === "import"`
  - Returns `false` if LMS-connected (canvas/moodle) or system
  - Use for set-level actions (rename set, add/remove group references)
- [ ] `selectSystemGroupSet(systemType: "individual_students" | "staff")` → GroupSet | null
  - Finds by `connection.kind === "system"` + `system_type` (canonical accessor — never rely on array position)
- [ ] `selectConnectedGroupSets` → GroupSet[] (canvas, moodle — excludes system and import)
- [ ] `selectLocalGroupSets` → GroupSet[] (connection === null or kind === "import")

**Assignment selectors:**

- [ ] `selectAssignmentsForGroupSet(groupSetId: string)` → Assignment[]

## UI Store Changes

- [ ] Add selection state for Groups & Assignments tab sidebar:

  ```ts
  type SidebarSelection =
    | { type: "groupSet"; id: string }
    | { type: "assignment"; id: string }
    | null
  ```

## Dependencies

- [ ] No frontend glob-matching dependency required (all pattern matching is backend-driven)

## Mock Backend + Fixtures

- [ ] Update `packages/backend-mock` demo data to the new roster/group set schema
- [ ] Update `MockBackend` methods to return/accept `group_set_id` + `group_selection` and top-level `roster.groups`
- [ ] Update app-core tests/fixtures that embed old group set shapes (LmsGroupSetCacheEntry, embedded groups)

## Utility Functions (frontend)

- [ ] `generateGroupName(members: RosterMember[]) → string`
  - Implements naming rules from `plan-0-data-model.md`
  - Produces a raw name from student names (first word + last word extraction, multi-student dash format)
  - Does **not** perform slug normalization — callers pass the result through the backend `normalize_group_name` command

- [ ] `cleanupOrphanedGroups(roster: Roster) → Roster`
  - Pure function for Immer integration
  - Returns roster with unreferenced groups removed

### Group Name Normalization (backend-only)

Slug normalization (NFD decomposition, diacritic stripping, apostrophe removal, etc.) is implemented only in Rust. Frontend uses the `normalize_group_name` manifest command instead of a duplicate TypeScript implementation. This eliminates the risk of Unicode handling drift between two implementations.

- [ ] UI components that show a normalized preview (AddGroupDialog, GroupSetPanel inline rename) call `normalize_group_name` with debouncing
- [ ] On commit (blur/Enter), the UI calls `normalize_group_name` once and stores the result
- [ ] `generateGroupName` produces the raw name; normalization is a separate step via the backend command

## Tests (TypeScript — implement alongside store changes)

### Selectors

- [ ] `selectIsGroupEditable` — true only if `origin === "local"`
- [ ] `selectIsGroupSetEditable` — true if `connection === null` or `kind === "import"`
- [ ] `selectGroupsForGroupSet` — resolves group_ids to Group entities
- [ ] `selectRosterStudents` / `selectRosterStaff` — return the correct roster partitions
- [ ] `selectRosterMemberById` — resolves IDs across students and staff
- [ ] `selectSystemGroupSet` — resolves system sets by `system_type`
- [ ] `selectGroupReferenceCount` — counts number of sets referencing a group

### Store Actions

- [ ] `createLocalGroupSet` — generates UUID, adds to array
- [ ] `copyGroupSet` — shallow copy with same group references
- [ ] `deleteGroupSet` — cascades to assignments, cleans up orphans
- [ ] `cleanupOrphanedGroups` — removes unreferenced groups
- [ ] `normalizeRoster` — enforces connection presence and system set invariants on load

### Command Integration

- [ ] Debounced local filters call `filter_by_pattern` and ignore stale responses
- [ ] Invalid-pattern responses from `filter_by_pattern` render inline errors and empty filtered views

### Utility Functions

- [ ] `generateGroupName` — all naming rules (raw name generation only, no slug normalization)

## Files to Modify

- `packages/app-core/src/stores/profileStore.ts`
- `packages/app-core/src/stores/uiStore.ts`
- `packages/app-core/src/utils/groupNaming.ts` (new)
- `packages/app-core/src/utils/validation.ts` (update)
