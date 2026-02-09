# Phase 8: Sidebar Refactor

See [plan.md](./plan.md) for UI structure and [plan-0-data-model.md](./plan-0-data-model.md) for entity definitions.

**Prerequisites:** Complete [Phase 6: Store Updates](./plan-6-stores.md)

**Status:** DONE

---

## Monolithic File Replacement

Delete `GroupsAssignmentsTab.tsx` (~1650 lines). Its responsibilities are split across the new component structure below and in Phases 9-10. The old file uses the replaced data model (`LmsGroupSetCacheEntry`, `CachedLmsGroup`, `kind` enum) and cannot be incrementally migrated.

- [x] Delete `packages/app-core/src/components/tabs/groups-assignments/GroupsAssignmentsTab.tsx`
- [x] Create a new `GroupsAssignmentsTab.tsx` that composes `GroupsAssignmentsSidebar` + placeholder panel in a master-detail layout
- [x] Update `packages/app-core/src/components/tabs/groups-assignments/index.ts` to export the new component

## Component Structure

```text
groups-assignments/
├── GroupsAssignmentsTab.tsx (master-detail shell)
├── GroupsAssignmentsSidebar.tsx (three-section sidebar)
├── GroupSetItem.tsx (expandable, shows nested assignments)
├── AssignmentItem.tsx (nested under group set)
└── index.ts (barrel export)
```

## Features

- [x] Three sections (System section at top): "System", "Connected Group Sets", "Local Group Sets"
  - System section shows "Individual Students" and "Staff" with "System" badge
  - System group sets cannot be edited or deleted; they can be copied
  - Sections are permanent — items never move between sections
  - Connected: canvas, moodle (LMS-synced)
  - Local: connection === null, or kind === "import" (user-editable)
- [x] Group sets expandable to show nested assignments
- [x] Connection type badge (Canvas, Moodle, Import) for connected/imported sets
- [x] Sync/import timestamp display (e.g., "synced Jan 20", "imported Jan 15")
- [x] `[+]` button on each group set to add assignment
- [x] "+ New Local Group Set" button in Local section
- [x] Selection highlighting
- [x] Click to select → updates uiStore.sidebarSelection
- [x] System group sets auto-ensured on mount via ensureSystemGroupSets

## Files to Modify

- `packages/app-core/src/components/tabs/groups-assignments/`
  - `GroupsAssignmentsTab.tsx` (delete old, create new master-detail shell)
  - `index.ts` (unchanged — already exports correctly)
  - `GroupsAssignmentsSidebar.tsx` (new)
  - `GroupSetItem.tsx` (new)
  - `AssignmentItem.tsx` (new)
