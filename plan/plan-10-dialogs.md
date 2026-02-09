# Phase 10: Dialogs

See [plan.md](./plan.md) for overview and [plan-0-commands.md](./plan-0-commands.md) for dialog→command mappings.

**Prerequisites:** Complete [Phase 9: Right Panel](./plan-9-panel.md)

**Status:** DONE

---

## New Dialogs

- [x] **NewLocalGroupSetDialog**
  - Name input
  - Create button
  - Creates empty local group set

- [x] **AddGroupDialog** (for adding groups to local/imported group sets)
  - Member picker (multi-select from `roster.students` only)
  - Staff are not selectable here (staff memberships come from LMS/import and remain visible in group lists)
  - Name field (auto-populated from selected students via `generateGroupName`)
  - Read-only normalized preview line below the name input (debounced call to backend `normalize_group_name` command)
  - Auto-update behavior:
    - Name updates automatically as students are selected/deselected
    - Auto-update stops once user manually edits the name field
    - User can always override with any custom name
  - Name generation rules (last word of surname only):
    - 1 student: `firstname_lastname` (e.g., `alice_smith`)
    - 2-5 students: all surnames with dashes (e.g., `smith-jones-lee`)
    - 6+ students: 5 surnames + `+N` remainder (e.g., `smith-jones-lee-patel-chen-+2`)
  - Create button enabled when name is non-empty (students optional)
  - If no students are selected, creates an empty group with the provided/generated name
  - Creates new Group entity with `origin: "local"` and `lms_group_id: null` and adds to GroupSet's `group_ids`

- [x] **ImportGroupSetDialog**
  - File picker (CSV)
  - Preview of parsed groups (group names + member counts) via `preview_import_group_set`
  - Name input (default from filename)
  - Import button
  - Creates group set with `connection.kind: "import"` and all groups with `origin: "local"` and `lms_group_id: null`

- [x] **ReimportGroupSetDialog** (for re-importing existing imported group sets)
  - File picker (CSV)
  - Preview showing changes via `preview_reimport_group_set`:
    - Groups to be added (new in file)
    - Groups to be updated (name match with membership changes after dedupe + roster matching)
    - Groups to be removed (no longer in file)
    - Students not found in roster (per group)
    - Preview payload does **not** include `group_set_id` (dialog already knows the target set)
  - Copy note: "If the CSV includes `group_id`, matching uses IDs. If not, matching falls back to group name, so renames appear as remove + add."
  - Warning: "This will overwrite the current groups"
  - Confirm / Cancel buttons

- [x] **NewAssignmentDialog** (rewritten for new model)
  - Name input
  - Group set selector (dropdown of all group sets)
  - Default selection: system group set ("Individual Students")
  - Group selection mode (all / pattern, glob syntax)
  - Create button

- [x] **ChangeGroupSetDialog**
  - Current group set display
  - Group set selector
  - Warning about exclusion clearing when changing group set
  - Confirm button

- [x] **DeleteGroupSetDialog**
  - Lists the N assignments that will be deleted
  - Notes about orphaned groups (groups only referenced by this set will be deleted)
  - Groups referenced by other sets will survive
  - User must confirm to proceed
  - Cancel preserves everything

- [x] **CopyGroupSetDialog**
  - Shows source group set name
  - Explains shallow copy behavior:
    - Creates a new local group set
    - References the same groups (no duplication)
    - LMS-origin groups remain read-only
    - New groups you add will be editable
    - For LMS/System sets, shared groups continue to update on sync (copy does not freeze membership)
  - Name input (default: "{original name} (copy)")
  - Confirm / Cancel buttons

- [x] **DeleteGroupDialog** (new, used by GroupSetPanel)
  - Shows group name and number of referencing group sets
  - If referenced by multiple sets, warns: "This will remove the group from all sets"
  - Confirm / Cancel buttons

- [ ] **ConfirmSharedGroupEditDialog** (deferred to Phase 11 - requires callback mechanism)
  - Triggered when editing a local group referenced by multiple group sets
  - Copy: "This group is shared by N group sets. Changes will apply everywhere."
  - Actions: Confirm / Cancel
  - Optional: "Don't show again for this session"

## Files Modified

- `packages/app-core/src/stores/uiStore.ts` — 8 new dialog state fields + setters
- `packages/app-core/src/components/dialogs/NewLocalGroupSetDialog.tsx` (new)
- `packages/app-core/src/components/dialogs/AddGroupDialog.tsx` (rewritten)
- `packages/app-core/src/components/dialogs/ImportGroupSetDialog.tsx` (new)
- `packages/app-core/src/components/dialogs/ReimportGroupSetDialog.tsx` (new)
- `packages/app-core/src/components/dialogs/NewAssignmentDialog.tsx` (rewritten)
- `packages/app-core/src/components/dialogs/ChangeGroupSetDialog.tsx` (new)
- `packages/app-core/src/components/dialogs/DeleteGroupSetDialog.tsx` (new)
- `packages/app-core/src/components/dialogs/CopyGroupSetDialog.tsx` (new)
- `packages/app-core/src/components/dialogs/DeleteGroupDialog.tsx` (new)
- `packages/app-core/src/components/dialogs/index.ts` (updated exports)
- `packages/app-core/src/App.tsx` (render new dialogs)
- `packages/app-core/src/components/tabs/groups-assignments/GroupsAssignmentsTab.tsx` (dialog triggers)
- `packages/app-core/src/components/tabs/groups-assignments/GroupsAssignmentsSidebar.tsx` (Import from CSV button)
- `packages/app-core/src/components/tabs/groups-assignments/GroupSetPanel.tsx` (dialog triggers for Copy/Delete/Reimport/AddGroup)
- `packages/app-core/src/components/tabs/groups-assignments/AssignmentPanel.tsx` (Change group set button)
- `packages/ui/src/components/icons.ts` (added ArrowRightLeft)
