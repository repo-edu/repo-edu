# Phase 5: Command Surface and CLI — COMPLETED

See [plan.md](./plan.md) for overview and [plan-0-commands.md](./plan-0-commands.md) for UI to command traceability.

**Prerequisites:** Complete [Phase 4: Import/Export I/O](./plan-4-import-export.md) (**done**)

> **Status: DONE.** Manifest updated (74 commands total): 11 obsolete commands deleted, 11 new commands added, all registered in `src-tauri/src/lib.rs`. Tauri handlers wired to core operations. Key details:
>
> - Tauri command names must match manifest.json keys exactly
> - Import aliases used to avoid name conflicts (e.g., `core_filter_by_pattern`, `core_ensure_system_group_sets`)
> - `sync_lms_group_set` renamed to `sync_group_set` to match manifest
> - `check_student_removal` parameter updated from `StudentId` to `RosterMemberId`

## Checklist

### Manifest Commands

- [x] Add new commands:
  - `ensure_system_group_sets`
  - `normalize_group_name`
  - `preview_group_selection`
  - `filter_by_pattern`
  - `sync_group_set`
  - `preview_import_group_set`
  - `import_group_set`
  - `preview_reimport_group_set`
  - `reimport_group_set`
  - `export_group_set`
- [x] Delete obsolete commands (see [plan-0-commands.md](./plan-0-commands.md))
- [x] Keep existing command signatures where noted, but update internal logic to use `group_set_id` + `group_selection`

### Command Logic Updates

- [x] `validate_assignment` resolves groups via `resolveAssignmentGroups`
- [x] `filter_by_pattern` validates/matches using the same backend matcher as `preview_group_selection`
- [x] `validate_roster` enforces new roster invariants (see Phase 2)
  - Must be called only after `ensure_system_group_sets`; otherwise it fails fast on missing system sets
- [x] `import_roster_from_lms` / `import_roster_from_file` return conflict details in `ImportRosterResult` and do not fail hard on conflicts
- [x] `export_assignment_members` exports resolved groups (include empty groups as empty-email rows)
- [x] `create_repos` / `clone_repos_from_roster` / `delete_repos` use resolved groups, skip empty groups but surface warnings
- [x] `ensure_system_group_sets` also normalizes group memberships after roster changes (removes member IDs no longer present in roster)

### Tauri Commands

- [x] Implement new command handlers and wire to core operations
- [x] Update existing handlers to the new group resolution model
- [x] Preserve progress callback pattern for long-running operations
- [x] Enforce system set precondition: if roster lacks required system sets, return a clear error unless the command is `ensure_system_group_sets`

### CLI Updates

- [x] Remove references to deleted group-set commands
- [x] Align CLI outputs with new schema fields (`group_sets`, `groups`, `group_selection`)
- [x] Update roster sync flows to always import all enrollment types (no include/exclude options)
- [x] Call `ensure_system_group_sets` (or fail fast) before any roster mutation or group-resolution operation
- [x] Surface roster sync conflicts in CLI output (from `ImportRosterResult`) as warnings; sync remains successful
- [x] Keep CLI I/O only (no CRUD)

## Files to Modify

- `apps/repo-manage/schemas/commands/manifest.json`
- `apps/repo-manage/src-tauri/src/commands/`
- `apps/repo-manage/cli/`
