# Phase 12: Membership Matrix

See [plan.md](./plan.md) for UI structure.

**Prerequisites:** Complete [Phase 11: UX Polish](./plan-11-polish.md)

---

## Data Overview Sheet Extension

Extend the existing Data Overview sheet (opened via the info icon) with a Membership Matrix section that provides a cross-tab view relating roster students to group set memberships.

**Dependency:**

- [x] Add `@tanstack/react-table` (required for Membership Matrix implementation)

**Membership Matrix:**

```text
                    | Project Groups | Lab Teams | Final Exam |
--------------------|----------------|-----------|------------|
Alice Smith         | Team Alpha     | Lab 3     | -          |
Bob Jones           | Team Beta      | Lab 1     | Group A    |
Carol Lee           | -              | Lab 2     | -          |
David Park          | Team Alpha     | -         | Group B    |
```

- [x] Rows: All students from `roster.students` (dropped/incomplete students will have empty cells since they are removed from group memberships)
- [x] Columns: Group sets
- [x] Cells: Group name within that set, or "-" if unassigned

**Exclusions:**

- [x] Staff never appear in the matrix

**Interactions:**

- [x] Sort by column to group unassigned students together
- [x] Filter rows by student name
- [x] Filter columns to show or hide specific group sets

**Implementation (TanStack Table):**

- [x] Use `@tanstack/react-table` (headless) for sorting and column visibility
- [x] Sorting enabled on all columns
- [x] Filtering: global quick search only (no per-column filters)
- [x] Read-only display (no inline cell editing)
- [x] Data transform is a simple cross-tab of roster students x group sets
- [x] Memoize the cross-tab transform so it doesn't rebuild on unrelated UI state changes
- [x] Keep styling in existing UI system (no new theming provider)

## Files to Modify

- `packages/app-core/src/components/sheets/` (Data Overview sheet)
