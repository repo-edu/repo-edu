---
title: Command Architecture
description: Three-tier command system and UI-to-backend traceability
---

# Command Architecture

The application uses a three-tier command architecture that separates frontend-only mutations from
backend I/O operations.

## Tier Overview

| Tier | Description | Examples |
|------|-------------|----------|
| **Frontend-Only** | Store actions and selectors. Mutate in-memory state. No backend call. | `createLocalGroupSet()`, `updateGroupSetSelection()` |
| **Manifest Commands** | Defined in `manifest.json`. Cross the frontend-backend boundary. Used for I/O, network, or complex validation. | `sync_group_set`, `import_group_set` |
| **Backend-Only** | Rust functions not exposed to frontend. Shared between CLI and Tauri handlers, or internal helpers. | `core/src/operations/*.rs` |

## Data Flow

```text
UI Component → Store Action (frontend-only mutation)
            → save_profile_and_roster (persist)

UI Component → commands.ts → Manifest Command → Tauri Handler → Core Operation
                                                → LMS/Filesystem I/O
            → merge result into store → save_profile_and_roster (persist)

App startup / profile load → ensure_system_group_sets → merge result → UI interactive
Roster mutation → ensure_system_group_sets → merge result → save
```

### Persistence Pattern

Frontend mutates in-memory state via store actions, then calls `saveProfileAndRoster` to persist.
This keeps CRUD operations fast, local, and single-sourced.

### Sync/Import Pattern

Frontend calls a manifest command (e.g., `syncGroupSet`). Backend fetches from LMS or parses files
and returns updated entities. Frontend merges returned data into the store, then persists.

### Key Rules

- All user-initiated group set/group CRUD is **frontend-only**
- Backend manifest commands are limited to **I/O** (LMS/file), **validation helpers**, and
  **roster normalization** via `ensureSystemGroupSets`
- **Glob validation** is backend-only. Frontend uses manifest commands for all pattern workflows
- System group sets must exist before any roster mutation or group resolution

## Frontend-Only Operations

### Store Actions (profileStore)

| Action | Purpose |
|--------|---------|
| `createLocalGroupSet(name)` | Create empty local group set |
| `copyGroupSet(groupSetId)` | Shallow copy group set |
| `deleteGroupSet(groupSetId)` | Delete group set (cascades assignments, cleans orphans) |
| `renameGroupSet(groupSetId, name)` | Rename editable group set |
| `createGroup(groupSetId, name, memberIds)` | Create group in set |
| `updateGroup(groupId, updates)` | Update name/members (only if `origin === "local"`) |
| `deleteGroup(groupId)` | Delete group from all sets (only if `origin === "local"`) |
| `addGroupToSet(groupSetId, groupId)` | Add existing group to set |
| `removeGroupFromSet(groupSetId, groupId)` | Remove group from set (clean up if orphaned) |
| `updateGroupSetSelection(groupSetId, selection)` | Update group selection on a group set |
| `createAssignment(assignment)` | Create assignment |
| `updateAssignment(id, updates)` | Update assignment (name, description, group_set_id) |
| `deleteAssignment(id)` | Delete assignment |

### Selectors

| Selector | Purpose |
|----------|---------|
| `selectGroupSets(state)` | All group sets |
| `selectGroups(state)` | All groups |
| `selectAssignments(state)` | All assignments |
| `isGroupEditable(state, groupId)` | True if `origin === "local"` |
| `getGroupSetForAssignment(state, assignmentId)` | Lookup by group_set_id |

Group editability is determined by `origin`, not by which sets reference the group. Set-level
editability (rename, add/remove group references) requires `connection === null` or
`connection.kind === "import"`.

## Manifest Commands

Commands that cross the frontend-backend boundary. Defined in `manifest.json`.

### Group Set Commands

| Command | Purpose | UI Caller |
|---------|---------|-----------|
| `ensure_system_group_sets` | Create/repair system group sets (idempotent) | App load, after roster mutations |
| `sync_group_set` | Fetch from LMS, update groups | Sync button on LMS sets |
| `import_group_set` | Parse CSV, create group set | Import dialog |
| `reimport_group_set` | Re-parse CSV, update existing set | Re-import button |
| `export_group_set` | Export to CSV | Export button |
| `preview_import_group_set` | Parse CSV for preview (no persistence) | Import dialog file picker |
| `preview_reimport_group_set` | Re-parse CSV for preview (no persistence) | Re-import dialog |

### Validation Commands

| Command | Purpose | UI Caller |
|---------|---------|-----------|
| `normalize_group_name` | Normalize name using backend slug rules | Group name input preview |
| `preview_group_selection` | Validate glob and resolve group IDs | Group set panel |
| `filter_by_pattern` | Validate glob, return matched indexes | Import/filter dialogs |
| `validate_roster` | Validate roster data | Roster tab |
| `validate_assignment` | Validate assignment groups | Assignment panel |

### I/O Commands

| Command | Purpose |
|---------|---------|
| `save_profile_and_roster` | Persist profile + roster to disk |
| `export_roster` | Export roster to file |
| `export_assignment_members` | Export assignment with resolved groups |
| `create_repos` / `clone_repos_from_roster` / `delete_repos` | Git operations |

## Frontend Merge Contract

Manifest commands that return group-set data are **patches**, not full roster snapshots. Frontend
merge behavior:

1. Replace the matching `GroupSet` by ID with `result.group_set`
2. Upsert `result.groups_upserted` into `roster.groups` by `id`
3. Remove any `Group` whose ID is listed in `result.deleted_group_ids`
4. Remove `deleted_group_ids` from **all** `group_sets[].group_ids` (groups are shared across sets)
5. Run `cleanupOrphanedGroups()` as a safety net

`ensureSystemGroupSets` returns a similar patch with system group sets and any groups updated by
roster normalization.

Frontend must **not** re-derive LMS group membership or mutate `group_ids` outside of these
patches.

## Backend-Only Operations

Rust functions shared between CLI and Tauri handlers. Not exposed in `manifest.json`.

### Core Operations (`apps/repo-manage/core/src/operations/`)

| Module | Purpose |
|--------|---------|
| `lms.rs` | LMS API fetch + diff logic |
| `roster.rs` | Roster merge during sync |
| `group_set.rs` | CSV parsing/generation |
| `validation.rs` | Glob validation, resolve groups |

### Utilities (`apps/repo-manage/core/src/`)

| Module | Purpose |
|--------|---------|
| `naming.rs` | Slug generation, group naming |
| `uuid.rs` | UUID generation for members, groups, group sets |

Backend-only operations do not mutate persisted state directly. They return updated entities for
the frontend to merge and persist.

## UI-to-Command Traceability

### Group Set Toolbar

| UI Action | Command/Action | Type | Available For |
|-----------|----------------|------|---------------|
| Sync from LMS | `sync_group_set` | Manifest | LMS sets only |
| Re-import from file | `reimport_group_set` | Manifest | Imported sets only |
| Export to CSV | `export_group_set` | Manifest | All |
| Copy group set | `copyGroupSet()` | Frontend | All |
| Delete group set | `deleteGroupSet()` | Frontend | All except system |

### Group Set Panel

| UI Action | Command/Action | Type |
|-----------|----------------|------|
| Rename group set | `renameGroupSet()` | Frontend |
| Update group selection | `updateGroupSetSelection()` | Frontend |
| Preview group selection | `preview_group_selection` | Manifest |
| Add group | Opens AddGroupDialog | — |
| Rename group | `updateGroup()` | Frontend |
| Delete group | `deleteGroup()` | Frontend |
| Edit members | `updateGroup()` | Frontend |

### Dialogs

| Dialog | Confirm Action | Type |
|--------|----------------|------|
| NewLocalGroupSetDialog | `createLocalGroupSet()` | Frontend |
| AddGroupDialog | `createGroup()` | Frontend |
| ImportGroupSetDialog (preview) | `preview_import_group_set` | Manifest |
| ImportGroupSetDialog (import) | `import_group_set` | Manifest |
| ReimportGroupSetDialog (preview) | `preview_reimport_group_set` | Manifest |
| ReimportGroupSetDialog (confirm) | `reimport_group_set` | Manifest |
| NewAssignmentDialog | `createAssignment()` | Frontend |
| ChangeGroupSetDialog | `updateAssignment()` | Frontend |
| DeleteGroupSetDialog | `deleteGroupSet()` | Frontend |

## CLI Impact

The CLI is I/O-only (no CRUD). It uses the same manifest commands for sync, import, export, and
validation. Interactive configuration and group set management are GUI-only.
