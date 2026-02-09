# Phase 9: Right Panel (Groups Editor)

See [plan.md](./plan.md) for UI structure, [plan-0-data-model.md](./plan-0-data-model.md) for entity definitions, and [plan-0-commands.md](./plan-0-commands.md) for UI→command traceability.

**Prerequisites:** Complete [Phase 8: Sidebar Refactor](./plan-8-sidebar.md)

---

## Component Structure

```text
GroupsAssignmentsPanel/
├── index.tsx (switches based on selection)
├── GroupSetPanel/
│   ├── index.tsx
│   ├── GroupSetHeader.tsx (name, connection badge, sync status)
│   ├── GroupSetToolbar.tsx (context-sensitive actions)
│   ├── GroupsList.tsx (editable or read-only based on connection)
│   ├── GroupItem.tsx (shows lock icon if group.origin !== "local")
│   ├── GroupLockIcon.tsx (lock icon with tooltip explaining why group is read-only)
│   └── MemberChip.tsx
└── AssignmentPanel/
    ├── index.tsx
    ├── AssignmentHeader.tsx
    ├── GroupSelectionEditor.tsx (all / pattern selector + exclusions)
    └── ResolvedGroupsPreview.tsx
```

## Group Set Panel Features

**Local group set (connection: null):**

- [x] Header with name (editable inline)
- [x] Toolbar: Export, Copy, Delete
  - [x] Groups list with per-group editability based on `origin`:
    - [x] Groups with `origin === "local"`: fully editable (rename, delete, edit members)
    - [ ] When editing a group name, show a read-only normalized preview line below the input (debounced call to backend `normalize_group_name` command)
    - [x] Groups with `origin === "lms"`: show 🔒 lock icon, read-only
    - [x] Groups with `origin === "system"`: show 🔒 lock icon, read-only
  - [x] Lock icon positioned inline with group name
  - [x] Tooltip on lock icon: context-appropriate (LMS-origin vs system-origin)
  - [x] Shared-group banner when selected group is referenced by multiple sets: "Shared by N group sets. Changes apply everywhere."
  - [ ] On rename or membership edits for shared groups (reference count > 1), require confirmation (see dialog spec)
  - [x] Member chips show a "Staff" badge for `roster.staff` entries (staff memberships are visible even when not selectable in pickers)
  - [x] Add group button (creates new Group with `origin: "local"` and `lms_group_id: null`)
  - [x] Remove-from-set action (detaches group from this set only)
  - [x] Delete-group action (removes group from all sets) requires confirmation if referenced by multiple sets
- [ ] Drag-drop students between mutable groups (stretch goal)

**Imported group set (connection.kind: "import"):**

- [x] Header with name (editable inline), import source filename, import timestamp
- [x] Toolbar: Re-import, Export, Copy, Delete
- [x] Groups list (all editable — all groups are `origin: "local"`)
  - [ ] When editing a group name, show a read-only normalized preview line below the input (debounced call to backend `normalize_group_name` command)
- [x] Add group button
  - [x] Remove-from-set action (detaches group from this set only)
  - [x] Delete-group action (removes group from all sets) requires confirmation if referenced by multiple sets

**Connected group set (Canvas/Moodle):**

- [x] Header with name, connection type (Canvas/Moodle badge), sync timestamp
- [x] Toolbar: Sync, Export, Copy, Delete
- [x] Groups list (all read-only — all groups are `origin: "lms"`):
  - [x] Each group shows 🔒 lock icon inline with group name
  - [x] Tooltip on lock icon: "This group is synced from LMS and cannot be edited"
- [x] Header-level visual indicator (muted styling or banner) indicating set is LMS-synced
- [x] Tooltip on header: "Sync from LMS to update groups. Copy to create a local set."

**System group set (Individual Students):**

- [x] Header with name and "System" badge
- [x] Toolbar: Export, Copy (no edit or delete)
- [x] Groups list (read-only, one group per student, `origin: "system"`):
  - [x] Each group shows 🔒 lock icon inline with group name
  - [x] Tooltip on lock icon: "System groups are auto-managed and cannot be edited"
- [x] Note explaining auto-sync with roster

**System group set (Staff):**

- [x] Header with name and "System" badge
- [x] Toolbar: Export, Copy (no edit or delete)
- [x] Groups list (read-only, single group named `Staff`, `origin: "system"`):
  - [x] Shows all staff members
  - [x] 🔒 lock icon inline with group name
  - [x] Tooltip on lock icon: "System groups are auto-managed and cannot be edited"
- [x] Note explaining: "All non-student roles"

**Editability rule:** A group is mutable if `origin === "local"`. Set-level actions (rename, add/remove group references) require `connection === null` or `kind === "import"`.

## Assignment Panel Features

- [x] Header with assignment name
- [x] Parent group set link (clickable to navigate)
- [x] Group selection mode:
  - [x] Radio: "All groups" / "Pattern filter"
  - [x] Pattern input field (shown when pattern selected, glob syntax)
  - [x] Inline invalid-glob validation feedback (from backend preview)
  - [x] Excluded groups editor (collapsible "Excluded (N)" list, struck-through entries, restore action)
- [x] Resolved groups preview:
  - [x] List of groups that match current mode (resolved via `preview_group_selection`)
  - [x] Count display uses `matched_groups` + `total_groups` (e.g., "14 of 74 groups")
  - [x] Empty-group count uses `empty_group_ids` or `group_member_counts` from the preview (e.g., "14 matched, 3 empty after filtering")
  - [x] Warning if zero matches
- [x] Toolbar: Delete

## Files to Modify

- `packages/app-core/src/components/tabs/groups-assignments/`
  - `GroupsAssignmentsPanel.tsx` (new) ✅
  - `GroupSetPanel.tsx` (new) ✅
  - `GroupItem.tsx` (new) ✅
  - `GroupLockIcon.tsx` (new) ✅
  - `MemberChip.tsx` (new) ✅
  - `AssignmentPanel.tsx` (new) ✅
  - `GroupsAssignmentsTab.tsx` (modified) ✅
