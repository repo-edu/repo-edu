# Phase 5: Command Surface and CLI

See [plan.md](./plan.md) for overview and [plan-0-commands.md](./plan-0-commands.md) for UI to command traceability.

**Prerequisites:** Complete [Phase 4: Import/Export I/O](./plan-4-import-export.md)

## Checklist

### Manifest Commands

- [ ] Add new commands:
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
- [ ] Delete obsolete commands (see [plan-0-commands.md](./plan-0-commands.md))
- [ ] Keep existing command signatures where noted, but update internal logic to use `group_set_id` + `group_selection`

### Command Logic Updates

- [ ] `validate_assignment` resolves groups via `resolveAssignmentGroups`
- [ ] `filter_by_pattern` validates/matches using the same backend matcher as `preview_group_selection`
- [ ] `validate_roster` enforces new roster invariants (see Phase 2)
  - Must be called only after `ensure_system_group_sets`; otherwise it fails fast on missing system sets
- [ ] `import_roster_from_lms` / `import_roster_from_file` return conflict details in `ImportRosterResult` and do not fail hard on conflicts
- [ ] `export_assignment_members` exports resolved groups (include empty groups as empty-email rows)
- [ ] `create_repos` / `clone_repos_from_roster` / `delete_repos` use resolved groups, skip empty groups but surface warnings
- [ ] `ensure_system_group_sets` also normalizes group memberships after roster changes (removes member IDs no longer present in roster)

### Tauri Commands

- [ ] Implement new command handlers and wire to core operations
- [ ] Update existing handlers to the new group resolution model
- [ ] Preserve progress callback pattern for long-running operations
- [ ] Enforce system set precondition: if roster lacks required system sets, return a clear error unless the command is `ensure_system_group_sets`

### CLI Updates

- [ ] Remove references to deleted group-set commands
- [ ] Align CLI outputs with new schema fields (`group_sets`, `groups`, `group_selection`)
- [ ] Update roster sync flows to always import all enrollment types (no include/exclude options)
- [ ] Call `ensure_system_group_sets` (or fail fast) before any roster mutation or group-resolution operation
- [ ] Surface roster sync conflicts in CLI output (from `ImportRosterResult`) as warnings; sync remains successful
- [ ] Keep CLI I/O only (no CRUD)

## Files to Modify

- `apps/repo-manage/schemas/commands/manifest.json`
- `apps/repo-manage/src-tauri/src/commands/`
- `apps/repo-manage/cli/`
