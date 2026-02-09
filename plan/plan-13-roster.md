# Phase 13: Roster Tab Enhancements

See [plan.md](./plan.md) for overview and [plan-0-data-model.md](./plan-0-data-model.md) for roster model and enrollment types.

**Prerequisites:** Complete [Phase 12: Membership Matrix](./plan-12-membership-matrix.md)

---

## TanStack Table Migration

Migrate the roster table from plain HTML to TanStack Table (headless) for consistency with the Membership Matrix (Phase 12) and to leverage built-in sorting/filtering logic while keeping a custom UI.

### Core Migration

- [x] Define column definitions for existing columns:
  - [x] Name (editable)
  - [x] Email (editable)
  - [x] Git Username (editable, with status icon)
  - [x] Status (single column: read-only `StatusDisplayCell` for LMS-sourced members, editable `StatusSelectCell` dropdown for local members)
  - [x] Delete action column
- [x] Replace plain `<table>` with a TanStack-driven table using existing markup
- [x] Use `useReactTable` with:
  - [x] `getCoreRowModel`
  - [x] `getSortedRowModel`
  - [x] `getFilteredRowModel` (global quick filter only)
- [x] Migrate search filter to a global quick filter (no per-column filters)
- [x] Keep current styling system (no new theming provider)

### Editable Cell Components

- [x] Create `EditableTextCell` component for Name, Email, Git Username
  - [x] Click to edit, Enter/blur to save, Escape to cancel
  - [x] Reuses existing inline editing logic
- [x] Create `StatusSelectCell` component for Status dropdown
- [x] Create `StatusDisplayCell` component for read-only status display
- [x] Create `ActionCell` component for delete button

### Table Features

- [x] Enable sorting on all columns
- [x] Enable column visibility controls
- [x] Add column visibility dropdown in toolbar
- [x] Filtering: quick search only (no per-column filters)
- [x] Ensure the Status column is included in column visibility and sorting

**Implementation note:** TanStack is headless; keep sorting UI, column menu, and edit controls in your existing UI components.

---

## Roster Sync Dialog Updates

- [x] No include/exclude options — roster sync always imports all enrollment types
- [x] Show preview count: "X students, Y staff"
- [x] After sync, show summary: "Imported X students, Y staff"
- [x] If conflicts exist (from `ImportRosterResult.conflicts`), show count and allow viewing details
- [x] Conflicts are warnings only: apply non-conflicting matches and leave conflicted entries untouched

---

## New Selectors

- [x] `selectRosterStudents` → RosterMember[]
- [x] `selectRosterStaff` → RosterMember[]
- [x] `selectRosterCounts` → { students: number, staff: number }

---

## Files to Modify

- `packages/app-core/src/stores/uiStore.ts` — add column visibility state
- `packages/app-core/src/components/tabs/roster/MemberListPane.tsx` — TanStack Table migration
- `packages/app-core/src/components/tabs/roster/cells/` — new directory for cell components:
  - `EditableTextCell.tsx`
  - `StatusDisplayCell.tsx`
  - `StatusSelectCell.tsx`
  - `ActionCell.tsx`
