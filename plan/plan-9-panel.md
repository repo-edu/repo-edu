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

- [ ] Header with name (editable inline)
- [ ] Toolbar: Export, Copy, Delete
  - [ ] Groups list with per-group editability based on `origin`:
    - [ ] Groups with `origin === "local"`: fully editable (rename, delete, edit members)
    - [ ] When editing a group name, show a read-only normalized preview line below the input (debounced call to backend `normalize_group_name` command)
    - [ ] Groups with `origin === "lms"`: show 🔒 lock icon, read-only
    - [ ] Groups with `origin === "system"`: show 🔒 lock icon, read-only
  - [ ] Lock icon positioned inline with group name
  - [ ] Tooltip on lock icon: context-appropriate (LMS-origin vs system-origin)
  - [ ] Shared-group banner when selected group is referenced by multiple sets: "Shared by N group sets. Changes apply everywhere."
  - [ ] On rename or membership edits for shared groups (reference count > 1), require confirmation (see dialog spec)
  - [ ] Member chips show a "Staff" badge for `roster.staff` entries (staff memberships are visible even when not selectable in pickers)
  - [ ] Add group button (creates new Group with `origin: "local"` and `lms_group_id: null`)
  - [ ] Remove-from-set action (detaches group from this set only)
  - [ ] Delete-group action (removes group from all sets) requires confirmation if referenced by multiple sets
- [ ] Drag-drop students between mutable groups (stretch goal)

**Imported group set (connection.kind: "import"):**

- [ ] Header with name (editable inline), import source filename, import timestamp
- [ ] Toolbar: Re-import, Export, Copy, Delete
- [ ] Groups list (all editable — all groups are `origin: "local"`)
  - [ ] When editing a group name, show a read-only normalized preview line below the input (debounced call to backend `normalize_group_name` command)
- [ ] Add group button
  - [ ] Remove-from-set action (detaches group from this set only)
  - [ ] Delete-group action (removes group from all sets) requires confirmation if referenced by multiple sets

**Connected group set (Canvas/Moodle):**

- [ ] Header with name, connection type (Canvas/Moodle badge), sync timestamp
- [ ] Toolbar: Sync, Export, Copy, Delete
- [ ] Groups list (all read-only — all groups are `origin: "lms"`):
  - [ ] Each group shows 🔒 lock icon inline with group name
  - [ ] Tooltip on lock icon: "This group is synced from LMS and cannot be edited"
- [ ] Header-level visual indicator (muted styling or banner) indicating set is LMS-synced
- [ ] Tooltip on header: "Sync from LMS to update groups. Copy to create a local set."

**System group set (Individual Students):**

- [ ] Header with name and "System" badge
- [ ] Toolbar: Export, Copy (no edit or delete)
- [ ] Groups list (read-only, one group per student, `origin: "system"`):
  - [ ] Each group shows 🔒 lock icon inline with group name
  - [ ] Tooltip on lock icon: "System groups are auto-managed and cannot be edited"
- [ ] Note explaining auto-sync with roster

**System group set (Staff):**

- [ ] Header with name and "System" badge
- [ ] Toolbar: Export, Copy (no edit or delete)
- [ ] Groups list (read-only, single group named `Staff`, `origin: "system"`):
  - [ ] Shows all staff members
  - [ ] 🔒 lock icon inline with group name
  - [ ] Tooltip on lock icon: "System groups are auto-managed and cannot be edited"
- [ ] Note explaining: "All non-student roles"

**Editability rule:** A group is mutable if `origin === "local"`. Set-level actions (rename, add/remove group references) require `connection === null` or `kind === "import"`.

## Assignment Panel Features

- [ ] Header with assignment name
- [ ] Parent group set link (clickable to navigate)
- [ ] Group selection mode:
  - [ ] Radio: "All groups" / "Pattern filter"
  - [ ] Pattern input field (shown when pattern selected, glob syntax)
  - [ ] Inline invalid-glob validation feedback (from backend preview)
  - [ ] Excluded groups editor (collapsible "Excluded (N)" list, struck-through entries, restore action)
- [ ] Resolved groups preview:
  - [ ] List of groups that match current mode (resolved via `preview_group_selection`)
  - [ ] Count display uses `matched_groups` + `total_groups` (e.g., "14 of 74 groups")
  - [ ] Empty-group count uses `empty_group_ids` or `group_member_counts` from the preview (e.g., "14 matched, 3 empty after filtering")
  - [ ] Warning if zero matches
- [ ] Toolbar: Change Group Set, Delete

## Files to Modify

- `packages/app-core/src/components/tabs/groups-assignments/`
  - `GroupsAssignmentsPanel.tsx` (new)
  - `GroupSetPanel.tsx` (new)
  - `AssignmentPanel.tsx` (new)
  - Supporting components...
