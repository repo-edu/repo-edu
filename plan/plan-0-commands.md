# Command Architecture

This document defines the three-tier command architecture and provides traceability between UI components, manifest commands, and backend implementation.

See [plan-5-commands-cli.md](./plan-5-commands-cli.md) for implementation sequencing and command surface updates.

## Tier Overview

| Tier | Description | Examples |
|------|-------------|----------|
| **Frontend-Only** | Store actions and selectors. Mutate in-memory state or compute derived values. No backend call. | `createLocalGroupSet()`, `updateAssignment()` |
| **Manifest Commands** | Defined in `manifest.json`. Cross the frontend↔backend boundary. Used for I/O, network, or complex validation. | `sync_group_set`, `import_group_set` |
| **Backend-Only** | Rust functions not exposed to frontend. Shared between CLI and Tauri handlers, or internal helpers. | `core/src/operations/*.rs` |

## Data Flow

```text
UI Component → Store Action (frontend-only mutation)
            → save_profile_and_roster (persist)

UI Component → commands.ts → Manifest Command → Tauri Handler → Core Operation
                                                → LMS/Filesystem I/O
            → merge result into store → save_profile_and_roster (persist)

App startup / profile load → `ensure_system_group_sets` → merge result → UI becomes interactive
Roster mutation → `ensure_system_group_sets` → merge result → save
```

**Persistence pattern:** Frontend mutates in-memory state via store actions, then calls `save_profile_and_roster` to persist. This keeps CRUD operations fast, local, and single-sourced.

**Sync/import pattern:** Frontend calls manifest command (e.g., `sync_group_set`), backend fetches from LMS or parses files and returns updated entities. Frontend merges returned data into the store, then calls `save_profile_and_roster` to persist. Non-students are stored separately in `roster.staff` and do not appear in student pickers or rosters; staff memberships are preserved in group sets and included in group set exports.

**Rule:** All user-initiated group set/group CRUD is frontend-only. Backend manifest commands are limited to I/O (LMS/file), validation helpers, and roster normalization via `ensure_system_group_sets`.

**Glob source of truth:** Glob validation and matching is backend-only. Frontend uses manifest commands for all pattern workflows: `preview_group_selection` for assignment resolution previews and `filter_by_pattern` for local UI filters (e.g., import dialogs).

**Hard precondition:** System group sets must exist before any roster mutation or any command that resolves group selections. Non-UI entry points (CLI, background tasks) must call `ensure_system_group_sets` (or fail fast with a clear error) before mutating or resolving. Only `ensure_system_group_sets` itself is allowed to run when system sets are missing. Roster mutations must be followed by `ensure_system_group_sets` before persistence so backend-owned normalization is applied.

**Validation ordering:** `validate_roster` assumes system group sets already exist and the roster has been normalized via `ensure_system_group_sets`. Callers must run `ensure_system_group_sets` (or fail fast) before any `validate_roster` call.

## Frontend Merge Contract (Manifest Results)

Manifest commands that return group-set data are **patches**, not full roster snapshots.
Frontend merge behavior is fixed and must be consistent across UI and CLI:

1. Replace the matching `GroupSet` by ID with `result.group_set`.
2. Upsert `result.groups_upserted` into `roster.groups` by `id`.
3. Remove any `Group` whose ID is listed in `result.deleted_group_ids`.
4. Remove any `deleted_group_ids` from **all** `group_sets[].group_ids` (this is required because groups are shared across sets, including local copies).
5. Run `cleanupOrphanedGroups()` as a safety net (should be a no-op if backend already computed orphans).

Frontend must **not** re-derive LMS group membership or mutate `group_ids` outside of these patches.

`ensure_system_group_sets` returns a similar patch. Frontend merges by:

1. Upserting the returned system group sets.
2. Upserting `groups_upserted` (system groups plus any groups updated by roster normalization).
3. Deleting any `deleted_group_ids` from the roster.
4. Removing any `deleted_group_ids` from **all** `group_sets[].group_ids`.

---

## Frontend-Only Operations

### Store Actions (profileStore)

These mutate in-memory state. Persistence happens via separate `save()` call.

| Action | Purpose | Notes |
|--------|---------|-------|
| `createLocalGroupSet(name)` | Create empty local group set | Generates UUID, adds to roster.group_sets |
| `copyGroupSet(groupSetId)` | Shallow copy group set | Creates new UUID for set, references same groups |
| `deleteGroupSet(groupSetId)` | Delete group set | Cascades to assignments, cleans up orphaned groups |
| `renameGroupSet(groupSetId, name)` | Rename editable group set | Only for local/import sets (`connection === null` or `connection.kind === "import"`) |
| `createGroup(groupSetId, name, memberIds)` | Create group in set | Generates UUID, adds to roster.groups and set.group_ids; only for local/import sets |
| `updateGroup(groupId, updates)` | Update group properties | Name, member_ids; only if origin === "local" |
| `deleteGroup(groupId)` | Delete group entity | Removes from all sets, deletes from roster.groups; only if origin === "local" |
| `addGroupToSet(groupSetId, groupId)` | Add existing group to set | Only for local/import sets |
| `removeGroupFromSet(groupSetId, groupId)` | Remove group from set | Only for local/import sets; detaches from this set only; cleans up if orphaned |
| `createAssignment(assignment)` | Create assignment | Existing pattern |
| `updateAssignment(id, updates)` | Update assignment | Including group_set_id, group_selection; must refuse group_set_id changes when `excluded_group_ids` is non-empty unless caller explicitly confirms clearing |
| `deleteAssignment(id)` | Delete assignment | Existing pattern |

### Selectors (derived state)

| Selector | Purpose | Computation |
|----------|---------|-------------|
| `selectGroupSets(state)` | All group sets | `roster.group_sets` |
| `selectGroups(state)` | All groups | `roster.groups` |
| `selectAssignments(state)` | All assignments | `roster.assignments` |
| `isGroupEditable(state, groupId)` | Check if group can be edited | True if `origin === "local"` |
| `getGroupSetForAssignment(state, assignmentId)` | Get assignment's group set | Lookup by group_set_id |

**Note:** Group editability is determined by origin (`origin === "local"`), not by which sets reference the group. Set-level editability (rename, add/remove group references) is `connection === null` or `connection.kind === "import"`.

### Utility Functions (frontend)

| Function | Purpose | Location |
|----------|---------|----------|
| `generateGroupName(members)` | Auto-generate group name (no normalization — uses backend for that) | `utils/groupNaming.ts` |

---

## Manifest Commands

Commands that cross the frontend↔backend boundary. Defined in `manifest.json`.

### New Commands to Add

| Command | Parameters | Returns | Purpose | UI Caller |
|---------|------------|---------|---------|-----------|
| `ensure_system_group_sets` | `roster: Roster` | `SystemGroupSetEnsureResult` | Create/repair system group sets and normalize group memberships (idempotent) | App load / profile load, after roster mutations |
| `normalize_group_name` | `name: string` | `string` | Normalize a group name using backend slug rules (single source of truth) | Group name input preview, `createGroup`, `updateGroup` |
| `preview_group_selection` | `roster: Roster`, `group_set_id: string`, `group_selection: GroupSelectionMode` | `GroupSelectionPreview` | Validate glob and resolve group IDs for preview | Assignment panel + dialogs |
| `filter_by_pattern` | `pattern: string`, `values: string[]` | `PatternFilterResult` | Validate glob and return matched value indexes for UI-local filtering | Import/Reimport dialogs and other local pattern filters |
| `sync_group_set` | `context: LmsOperationContext`, `roster: Roster`, `group_set_id: string` | `GroupSetSyncResult` | Fetch from LMS, update groups | GroupSetToolbar "Sync" button |
| `preview_import_group_set` | `roster: Roster`, `file_path: PathBuf` | `GroupSetImportPreview` | Parse CSV for preview (no persistence) | ImportGroupSetDialog file picker |
| `import_group_set` | `roster: Roster`, `file_path: PathBuf` | `GroupSetImportResult` | Parse CSV, create group set | ImportGroupSetDialog "Import" |
| `preview_reimport_group_set` | `roster: Roster`, `group_set_id: string`, `file_path: PathBuf` | `GroupSetImportPreview` | Re-parse CSV for preview (no persistence) | ReimportGroupSetDialog file picker |
| `reimport_group_set` | `roster: Roster`, `group_set_id: string`, `file_path: PathBuf` | `GroupSetImportResult` | Re-parse CSV, update existing set | GroupSetToolbar "Re-import" |
| `export_group_set` | `roster: Roster`, `group_set_id: string`, `file_path: PathBuf` | `()` | Export to CSV | GroupSetToolbar "Export" |

### Existing Commands to Keep (Unchanged)

| Command | Purpose |
|---------|---------|
| `verify_lms_connection` | Verify LMS credentials |
| `fetch_lms_group_set_list` | List available LMS group sets (for picker) |
| `fetch_lms_groups_for_set` | Preview LMS groups before import |
| `save_profile_and_roster` | Persist profile + roster to disk |
| `validate_roster` | Validate roster data |
| `validate_assignment` | Validate assignment groups |
| `export_roster` | Export roster to file |
| `export_assignment_members` | Export assignment with groups |
| `create_repos` / `clone_repos_from_roster` / `delete_repos` | Git operations |

**Note:** The commands above keep their names and signatures, but their internal logic must be updated to resolve groups from `group_set_id` + `group_selection` using the new group resolution helpers.

### Existing Commands to Update (Logic Only)

These commands keep their existing signatures but must switch to the new group resolution model (`group_set_id` + `group_selection`):

- `validate_assignment` — resolve groups via `resolveAssignmentGroups`
- `export_assignment_members` — export resolved groups (include empty groups as empty-email rows); group names come from stored `Group.name`
- `create_repos` / `clone_repos_from_roster` / `delete_repos` — use resolved groups for membership; repo naming must use stored `Group.name`
- `validate_roster` — enforce new roster invariants (see Phase 2)
- `import_roster_from_lms` / `import_roster_from_file` — report conflicts in `ImportRosterResult` and ensure system group sets exist after merge

### Existing Commands to DELETE (Obsolete)

| Command | Replacement |
|---------|-------------|
| `link_lms_group_set` | `sync_group_set` (new sync model) |
| `copy_lms_group_set` | Frontend `copyGroupSet()` action (shallow copy) |
| `copy_lms_group_set_to_assignment` | Removed (assignments reference group_set_id) |
| `refresh_linked_group_set` | `sync_group_set` |
| `break_group_set_link` | Removed (no break connection in new model) |
| `delete_group_set` | Frontend `deleteGroupSet()` action |
| `list_group_sets` | Frontend `selectGroupSets()` selector |
| `attach_group_set_to_assignment` | Frontend `updateAssignment()` with group_set_id |
| `clear_assignment_group_set` | Removed (group_set_id always required) |
| `import_groups_from_file` | `import_group_set` (new signature) |
| `assignment_has_groups` | Frontend selector (check group_set resolved groups) |

---

## CLI Impact

- Update CLI subcommands to remove references to deleted group-set commands and align with the new manifest command list.
- Update CLI flows to reflect that roster sync always imports all enrollment types (no options).
- Update CLI output/types to reflect new schema fields (`group_sets`, `groups`, `group_selection`).
- No new CLI CRUD; CLI remains I/O-only (sync/import/reimport/export).

## Backend-Only Operations

Rust functions shared between CLI and Tauri handlers. Not exposed in manifest.json.

### Core Operations (`apps/repo-manage/core/src/operations/`)

| Module | Functions | Purpose |
|--------|-----------|---------|
| `lms.rs` | `sync_group_set_from_lms()` | LMS API fetch + diff logic |
| `roster.rs` | `merge_lms_roster()` | Roster merge during sync |
| `group_set.rs` (new) | `parse_group_csv()`, `export_group_csv()` | CSV parsing/generation |
| `validation.rs` | `validate_group_selection()` | Glob validation, resolve groups |

### Utilities (`apps/repo-manage/core/src/`)

| Module | Functions | Purpose |
|--------|-----------|---------|
| `naming.rs` (new) | `generate_slug()`, `generate_group_name()` | Group naming utilities |
| `uuid.rs` (new) | `generate_member_id()`, `generate_group_id()`, `generate_group_set_id()` | UUID generation |

**Note:** Backend-only operations do not mutate persisted state directly. They return updated entities for the frontend to merge and persist.

---

## UI → Command Traceability

### GroupSetToolbar Actions

| UI Action | Button | Command/Action | Type | Available For |
|-----------|--------|----------------|------|---------------|
| Sync from LMS | "Sync" | `sync_group_set` | Manifest | LMS sets only |
| Re-import from file | "Re-import" | `reimport_group_set` | Manifest | Imported sets only |
| Export to CSV | "Export" | `export_group_set` | Manifest | All |
| Copy group set | "Copy" | `copyGroupSet()` | Frontend | All |
| Delete group set | "Delete" | `deleteGroupSet()` | Frontend | All (except system) |

### GroupSetPanel Actions

| UI Action | Trigger | Command/Action | Type |
|-----------|---------|----------------|------|
| Rename group set | Inline edit | `renameGroupSet()` | Frontend |
| Add group | "Add Group" button | Opens AddGroupDialog | — |
| Rename group | Inline edit | `updateGroup()` | Frontend |
| Delete group | Delete icon | `deleteGroup()` | Frontend |
| Edit members | Chip interaction | `updateGroup()` | Frontend |

### Assignment Panel Actions

| UI Action | Trigger | Command/Action | Type |
|-----------|---------|----------------|------|
| Preview group selection | Pattern/all change | `preview_group_selection` | Manifest |

### Dialogs

| Dialog | "Confirm" Action | Command/Action | Type |
|--------|------------------|----------------|------|
| NewLocalGroupSetDialog | "Create" | `createLocalGroupSet()` | Frontend |
| AddGroupDialog | "Create" | `createGroup()` | Frontend |
| ImportGroupSetDialog | "Import" | `import_group_set` | Manifest |
| ImportGroupSetDialog | "Preview" (file picked) | `preview_import_group_set` | Manifest |
| ReimportGroupSetDialog | "Confirm" | `reimport_group_set` | Manifest |
| ReimportGroupSetDialog | "Preview" (file picked) | `preview_reimport_group_set` | Manifest |
| NewAssignmentDialog | "Create" | `createAssignment()` | Frontend |
| ChangeGroupSetDialog | "Confirm" | `updateAssignment()` | Frontend |
| DeleteGroupSetDialog | "Delete" | `deleteGroupSet()` | Frontend |

---

## manifest.json Changes Summary

```diff
Commands to ADD:
+ ensure_system_group_sets
+ normalize_group_name
+ preview_group_selection
+ filter_by_pattern
+ sync_group_set
+ import_group_set
+ reimport_group_set
+ export_group_set
+ preview_import_group_set
+ preview_reimport_group_set

Commands to DELETE:
- link_lms_group_set
- copy_lms_group_set
- copy_lms_group_set_to_assignment
- refresh_linked_group_set
- break_group_set_link
- delete_group_set
- list_group_sets
- attach_group_set_to_assignment
- clear_assignment_group_set
- import_groups_from_file
- assignment_has_groups
```
