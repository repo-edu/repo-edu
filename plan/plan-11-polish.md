# Phase 11: UX Polish

See [plan.md](./plan.md) for UI structure.

**Prerequisites:** Complete [Phase 10: Dialogs](./plan-10-dialogs.md)

---

## Tooltips

- [x] Undo/Redo buttons: show next action description, e.g. "Undo: Add student Alice (Ctrl+Z)" / "Redo (Ctrl+Shift+Z)" when stack is empty. Uses Radix `Tooltip` component and `selectNextUndoDescription` / `selectNextRedoDescription` selectors.
- [x] Connection type explanations on hover
- [x] Sync/import status details (exact timestamp)
- [x] Group lock icon (🔒) with context-appropriate tooltip:
  - LMS-synced groups: "This group is synced from LMS and cannot be edited"
  - LMS-origin groups in local sets: "This group originated from an LMS sync and cannot be edited"
  - System groups: "System groups are auto-managed and cannot be edited"
- [x] Staff badge tooltip: "Non-student role"
- [x] Staff system set tooltip: "All non-student roles"
- [x] Copy behavior explanation:
  - "Creates a local copy that references the same groups"
  - "LMS/System copies stay linked to shared groups and will reflect future sync updates"
- [x] Pattern syntax help: `*`, `?`, `[...]`, `[!...]`, `\\` escape; no `**`, no `[^...]`, no regex

## Empty States

- [x] No group sets: "Create a local group set, import from CSV, or sync from LMS"
- [x] No assignments in group set: "Add an assignment using the + button"
- [x] No groups in local set: "Add groups to this set"
- [x] No editable groups in local set (all non-local origins): "All groups in this set are read-only (LMS or system). Add new groups or import from CSV for editable groups."
- [x] Pattern matches nothing: "No groups match this pattern"
- [x] Empty student roster (system group set): "Add students to the roster to see individual groups"

## Keyboard Navigation

- [x] Arrow keys to navigate sidebar
- [x] Enter to select
- [x] Escape to deselect
- [x] Tab to move between sidebar and panel

## Error Handling

- [x] Save failure recovery: on `save()` failure, restore `status` to `"loaded"` (not `"error"`), preserve undo history and in-memory document, surface error via toast/output only. See [plan-6-stores.md § Save Failure Recovery](./plan-6-stores.md).
- [x] Sync failure: show error toast, retain last updated data
- [x] Import parse error: show specific error message (including duplicate group name errors)
- [x] Invalid glob pattern: show validation error inline, prevent save
- [x] Preview failure (group selection): show inline error and keep last valid preview

## Concurrent Operations

- [x] Disable all edit controls during sync/import operations
- [x] Show loading indicator on affected group set in sidebar
- [x] Disable toolbar buttons during operation

## Visual Polish

- [x] Loading states during sync/import
- [x] Loading state while group selection preview is resolving
- [ ] Transition animations for panel switching
- [ ] Consistent spacing and alignment
- [ ] Responsive layout (sidebar collapse on narrow screens?)
