# Phase 13: Roster Tab Enhancements

See [plan.md](./plan.md) for overview and [plan-0-data-model.md](./plan-0-data-model.md) for roster model and enrollment types.

**Prerequisites:** Complete [Phase 12: Membership Matrix](./plan-12-membership-matrix.md)

---

## TanStack Table Migration

Migrate the roster table from plain HTML to TanStack Table (headless) for consistency with the Membership Matrix (Phase 12) and to leverage built-in sorting/filtering logic while keeping a custom UI.

### Core Migration

- [ ] Define column definitions for existing columns:
  - Name (editable)
  - Email (editable)
  - Git Username (editable, with status icon)
  - Status (single column: read-only `StatusDisplayCell` for LMS-sourced members, editable `StatusSelectCell` dropdown for local members)
  - Delete action column
- [ ] Replace plain `<table>` with a TanStack-driven table using existing markup
- [ ] Use `useReactTable` with:
  - `getCoreRowModel`
  - `getSortedRowModel`
  - `getFilteredRowModel` (global quick filter only)
- [ ] Migrate search filter to a global quick filter (no per-column filters)
- [ ] Keep current styling system (no new theming provider)

### Editable Cell Components

- [ ] Create `EditableTextCell` component for Name, Email, Git Username
  - Click to edit, Enter/blur to save, Escape to cancel
  - Reuses existing inline editing logic
- [ ] Create `StatusSelectCell` component for Status dropdown
- [ ] Create `StatusDisplayCell` component for read-only status display
- [ ] Create `ActionCell` component for delete button

### Table Features

- [ ] Enable sorting on all columns
- [ ] Enable column visibility controls
- [ ] Add column visibility dropdown in toolbar
- [ ] Filtering: quick search only (no per-column filters)
- [ ] Ensure the Status column is included in column visibility and sorting

**Implementation note:** TanStack is headless; keep sorting UI, column menu, and edit controls in your existing UI components.

---

## Roster Sync Dialog Updates

- [ ] No include/exclude options — roster sync always imports all enrollment types
- [ ] Show preview count: "X students, Y staff"
- [ ] After sync, show summary: "Imported X students, Y staff"
- [ ] If conflicts exist (from `ImportRosterResult.conflicts`), show count and allow viewing details
- [ ] Conflicts are warnings only: apply non-conflicting matches and leave conflicted entries untouched

---

## New Selectors

- [ ] `selectRosterStudents` → RosterMember[]
- [ ] `selectRosterStaff` → RosterMember[]
- [ ] `selectRosterCounts` → { students: number, staff: number }

---

## Files to Modify

- `packages/app-core/src/stores/uiStore.ts` — add column visibility state
- `packages/app-core/src/components/tabs/roster/MemberListPane.tsx` — TanStack Table migration
- `packages/app-core/src/components/tabs/roster/cells/` — new directory for cell components:
  - `EditableTextCell.tsx`
  - `StatusDisplayCell.tsx`
  - `StatusSelectCell.tsx`
  - `ActionCell.tsx`
