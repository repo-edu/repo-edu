# Phase 8: Sidebar Refactor

See [plan.md](./plan.md) for UI structure and [plan-0-data-model.md](./plan-0-data-model.md) for entity definitions.

**Prerequisites:** Complete [Phase 6: Store Updates](./plan-6-stores.md)

---

## Monolithic File Replacement

Delete `GroupsAssignmentsTab.tsx` (~1650 lines). Its responsibilities are split across the new component structure below and in Phases 9-10. The old file uses the replaced data model (`LmsGroupSetCacheEntry`, `CachedLmsGroup`, `kind` enum) and cannot be incrementally migrated.

- [ ] Delete `packages/app-core/src/components/tabs/groups-assignments/GroupsAssignmentsTab.tsx`
- [ ] Create a new `GroupsAssignmentsTab.tsx` that composes `GroupsAssignmentsSidebar` + `GroupsAssignmentsPanel` in a master-detail layout
- [ ] Update `packages/app-core/src/components/tabs/groups-assignments/index.ts` to export the new component

## Component Structure

```text
GroupsAssignmentsSidebar/
├── index.tsx
├── ConnectedGroupSetsSection.tsx
├── LocalGroupSetsSection.tsx
├── GroupSetItem.tsx (expandable, shows nested assignments)
└── AssignmentItem.tsx
```

## Features

- [ ] Three sections (System section at top): "System", "Connected Group Sets", "Local Group Sets"
  - System section shows "Individual Students" and "Staff" with "System" badge
  - Staff item tooltip: "All non-student roles"
  - System group sets cannot be edited or deleted; they can be copied
  - Sections are permanent — items never move between sections
  - Connected: canvas, moodle (LMS-synced)
  - Local: connection === null, or kind === "import" (user-editable)
- [ ] Group sets expandable to show nested assignments
- [ ] Connection type badge (Canvas, Moodle, Import) for connected/imported sets
- [ ] Sync/import timestamp display (e.g., "synced Jan 20", "imported Jan 15")
- [ ] `[+]` button on each group set to add assignment
- [ ] "+ New Local Group Set" button in Local section
- [ ] Selection highlighting
- [ ] Click to select → updates right panel

## Files to Modify

- `packages/app-core/src/components/tabs/groups-assignments/`
  - `GroupsAssignmentsTab.tsx` (delete old, create new master-detail shell)
  - `index.ts` (update export)
  - `GroupsAssignmentsSidebar.tsx` (new)
  - `GroupSetItem.tsx` (new)
  - `AssignmentItem.tsx` (new)
