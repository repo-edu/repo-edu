# Phase 12: Membership Matrix

See [plan.md](./plan.md) for UI structure.

**Prerequisites:** Complete [Phase 11: UX Polish](./plan-11-polish.md)

---

## Data Overview Sheet Extension

Extend the existing Data Overview sheet (opened via the info icon) with a Membership Matrix section that provides a cross-tab view relating roster students to group set memberships.

**Dependency:**

- [ ] Add `@tanstack/react-table` (required for Membership Matrix implementation)

**Membership Matrix:**

```text
                    | Project Groups | Lab Teams | Final Exam |
--------------------|----------------|-----------|------------|
Alice Smith         | Team Alpha     | Lab 3     | -          |
Bob Jones           | Team Beta      | Lab 1     | Group A    |
Carol Lee           | -              | Lab 2     | -          |
David Park          | Team Alpha     | -         | Group B    |
```

- Rows: All students from `roster.students` (dropped/incomplete students will have empty cells since they are removed from group memberships)
- Columns: Group sets
- Cells: Group name within that set, or "-" if unassigned

**Exclusions:**

- Staff never appear in the matrix

**Interactions:**

- Sort by column to group unassigned students together
- Filter rows by student name
- Filter columns to show or hide specific group sets

**Implementation (TanStack Table):**

- Use `@tanstack/react-table` (headless) for sorting and column visibility
- Sorting enabled on all columns
- Filtering: global quick search only (no per-column filters)
- Read-only display (no inline cell editing)
- Data transform is a simple cross-tab of roster students x group sets
- Memoize the cross-tab transform so it doesn't rebuild on unrelated UI state changes
- Keep styling in existing UI system (no new theming provider)

## Files to Modify

- `packages/app-core/src/components/sheets/` (Data Overview sheet)
