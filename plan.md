# Roster & Assignment Tabs Improvement Plan

## Overview

This plan focuses on improving data-quality visibility and navigation while keeping the UI calm. A
single "Data Overview" surface provides visibility into data state, distinguishing between
**issues** (problems requiring action) and **insights** (neutral information for reference).

**Design principles:**

- **Calm by default** — Status indicators appear only when needed
- **Discoverable** — Features accessible before problems occur
- **Inline feedback** — Show relevant info during editing, not just after
- **Clear counts** — Distinguish between issue categories and affected items
- **Minimal interruption** — No confirmation dialogs for undoable actions; toast feedback instead
- **Single source of truth** — Data Overview is the canonical location for issue/insight details;
  other surfaces show indicators that link to it
- **Reversible by default** — All profile editing actions support multi-level undo (Ctrl+Z)

## Key Concepts

### Assignment Types

Assignments have a type that determines validation behavior. **Type is set at creation and cannot
be changed** — this simplifies the mental model and avoids complex state transitions.

| Type | Description | Unassigned students | Multi-group | Single-member group |
| ---------- | ------------------------------- | ------------------- | ----------- | ------------------- |
| Class-wide | All active students participate | Error | Insight | Insight |
| Selective | Subset of students | Normal | Insight | Normal |

**Class-wide** — All active students must be assigned to at least one group (default)
**Selective** — Any subset of students (parallel tracks, electives, optional work)

If the wrong type is chosen, delete the assignment and create a new one with the correct type.
This is inexpensive before groups are added, and rare enough afterward that the simplicity
tradeoff is worthwhile.

### Flexible Group Creation

Any assignment can have additional groups added at any time:

- Single-member groups are allowed (for resits, accommodations, individual work)
- Students can be in multiple groups (original group + resit group)
- Group names convey purpose (e.g., "Team-A" vs "Resit-Alice")

**Resit workflow:**

1. Student is in original group (satisfies Class-wide requirement)
2. Add new group for resit (possibly single-member)
3. Add student to resit group
4. Student now in multiple groups — logged as insight, not error

### Student Status

Students have a status that affects coverage calculations:

| Status | In coverage calc | Flagged if unassigned (Class-wide) |
| ---------- | ---------------- | ---------------------------------- |
| Active | Yes | Yes — error |
| Dropped | No | No — excluded |
| Incomplete | No | No — excluded |

**Active** — Normal participating student
**Dropped** — Left course, retained for records
**Incomplete** — Special handling (extended deadlines, etc.)

### Issues vs Insights (Internal Terminology)

> **Note:** In the UI, use only "Issues" and "Insights" — never expose terms like "objective
> errors" or "contextual insights" to users.

**Issues** are data integrity problems that must be fixed before export:

- Unknown students (group members referencing non-existent student IDs)
- Duplicate student IDs in roster
- Invalid email formats
- Empty groups (no members)
- Unassigned active students in Class-wide assignments

**Insights** are informational, not actionable:

- Coverage statistics ("42/48 active students assigned")
- Students in multiple groups
- Single-member groups in Class-wide assignments
- Group size distribution

---

## Layout

```text
┌─────────────────────────────────────────────────────────────────┐
│ [Logo]       Roster │ Assignment │ Operations  ↩ ↪  [ℹ] [⚙️]  │  ← header + tabs
├─────────────────────────────────────────────────────────────────┤
│ ⚠ 3 unknown · 5 unassigned · 1 empty                    [▼]   │  ← status bar (animates in/out)
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                        Tab content                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

- **Undo/Redo buttons (↩/↪)**: Always visible in header; disabled when history is empty
- **Info button [ℹ]**: Always visible in header, opens Data Overview sheet
- **Status bar**: Slides in/out with smooth animation when issues appear/clear
- **Clicking status bar**: Also opens Data Overview sheet
- **Sheet**: Shows errors requiring action + insights for reference

This dual access ensures users can discover Data Overview before encountering errors.

**Layout stability**: The status bar animates its height (slide down when appearing, slide up when
clearing) rather than causing instant layout shift. Animation duration ~200ms with ease-out easing
keeps it responsive while preventing jarring content jumps.

---

## 1. Data Overview Surface

Provide a status bar and sheet for visibility into data state. The bar only appears when issues
exist, avoiding noise when everything is fine.

**Status bar behavior:**

- Hidden when no issues (absence = all clear)
- Shows full issue list inline: "3 unknown · 5 unassigned · 1 empty" (red)
- Up to 3 issue types shown; additional types truncated as "+N more"
- Include alert icon (⚠) alongside color for accessibility
- Clicking the bar opens Data Overview sheet
- Uses `aria-live="polite"` so screen readers announce changes

**Sheet structure:**

```text
┌─ Data Overview ─────────────────────────────┐
│                                             │
│ ISSUES (3)                                  │
│ ┌─────────────────────────────────────────┐ │
│ │ ⚠ 3 unknown students                    │ │
│ │   Team-A: unknown-id-1, unknown-id-2    │ │
│ │              [View 3 unknown students]  │ │
│ ├─────────────────────────────────────────┤ │
│ │ ⚠ 5 unassigned students (Assignment 1)  │ │
│ │   Alice, Bob, Carol, +2 more            │ │
│ │              [View 5 unassigned]        │ │
│ ├─────────────────────────────────────────┤ │
│ │ ⚠ 1 empty group                         │ │
│ │   Team-C has no members                 │ │
│ │              [View 1 empty group]       │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ ROSTER INSIGHTS                       [▼]   │
│   48 active, 2 dropped, 1 incomplete        │
│   3 missing emails, 5 missing git usernames │
│                                             │
│ ASSIGNMENT INSIGHTS                   [▼]   │
│   Assignment 1 (class-wide): 43/48 active   │
│     2 students in multiple groups           │
│     1 single-member group                   │
│   Assignment 2 (selective): 12/48 active    │
│                                             │
└─────────────────────────────────────────────┘
```

**Sheet behavior:**

- Issues section: always expanded, each with single CTA
- Insights sections: collapsible, clickable items for filtering
- Clicking a CTA navigates to correct tab with filter applied and opens relevant sheet/panel
- Brief toast confirms navigation: "Showing unknown students in Assignment 1"
- Destination sheets include "Back to Data Overview" link for orientation
- Validation runs automatically on data changes (no manual refresh needed)
- Sheet closes on Escape key or clicking outside (scrim area)

**CTA destinations:**

| Issue | Navigation | Result |
| ----- | ---------- | ------ |
| Unknown students | Assignment tab | Opens group editor sheet filtered to groups with unknown students |
| Unassigned students | Assignment tab | Opens coverage report sheet listing unassigned students |
| Empty groups | Assignment tab | Opens group editor sheet filtered to empty groups |

**Count alignment:** The status bar shows each issue type with its count (e.g., "3 unknown · 5
unassigned"). Each card in the sheet shows the same count with full details.

---

## 2. Assignment Types and Creation

### Creation flow

1. User clicks **+New Assignment** button
2. Dialog opens with name field and type selector
3. Type selector defaults to **Class-wide**:

```text
┌─ New Assignment ────────────────────────────┐
│                                             │
│ Name: [________________________]            │
│                                             │
│ Type: (cannot be changed after creation)    │
│ ● Class-wide — All active students must     │
│                be assigned                  │
│ ○ Selective — Any subset of students        │
│                                             │
│                    [Cancel]  [Create]       │
└─────────────────────────────────────────────┘
```

### Display in assignment selector

Show type in parenthetical format with coverage (denominator labeled for clarity):

```text
Assignment 1 (class-wide)     43/48 active ⚠    ← warning: 5 unassigned
Assignment 2 (selective)      12/48 active
```

- Coverage shows "N/M active" inline — clarifies that denominator is active students only
- Warning icon (⚠) appears only for class-wide assignments with unassigned active students
- Tooltip on warning: "5 active students unassigned"
- Selective assignments show coverage as neutral info (no indicator needed)

---

## 3. Group Creation and Management

### Adding groups

- **+New Group** button in assignment view
- Supports any number of members (including single-member)
- Group name is freeform (user conveys purpose via naming)

### Adding students to groups

- Click **+Add Member** in group editor
- Student picker shows inline multi-group indicator:

```text
┌─ Add Member ────────────────────────────────┐
│ Search: [________________]                  │
│                                             │
│ ○ Alice Chen                                │
│ ○ Bob Smith              (also in Team-A)   │  ← inline indicator
│ ○ Carol Davis                               │
│ ○ Dan Lee      (also in Team-A and 1 other) │  ← capped at 2 groups shown
│ ○ Eve Wilson                     [Dropped]  │  ← dimmed with badge
│                                             │
└─────────────────────────────────────────────┘
```

**Student picker behavior:**

- Search matches name, email, and student ID
- Active students shown first, then dropped/incomplete (dimmed with status badge)
- Multi-group indicator shows up to 2 group names, then "and N other" for additional; hover tooltip shows full list
- Adding a student already in another group shows inline warning (yellow highlight + text) rather
  than modal confirmation — user can proceed without extra click
- This enables informed decisions about multi-group membership without interruption

### Removing students from groups

- Each member row in group editor has a remove button (✕ or trash icon)
- Removal is immediate (no confirmation) — reversible via Ctrl+Z
- For students in only one group (class-wide assignment): inline note appears briefly confirming
  "Alice is now unassigned" (informational, not blocking)
- For students in multiple groups: no special handling needed (they remain in other groups)

**Bulk removal:**

- Multi-select members via checkboxes
- Checkbox in header for "select all visible"
- Shift+click for range selection
- "Remove N members" action
- Immediate (no confirmation) — reversible via Ctrl+Z
- Toast: "Removed N members from Team-A. Ctrl+Z to undo"

### Resit/individual work workflow

**Standard flow:**

1. Open assignment (e.g., "Assignment 1")
2. Click +New Group
3. Name it descriptively (e.g., "Resit-Alice" or "Individual-Bob")
4. Add student(s) to the group
5. If student is already in another group, inline indicator shows this before adding

**Shortcut for single-student resits:**

- Overflow menu (⋮) on student row → "Create resit group"
- Also available via right-click or long-press (power-user shortcut for desktop/touch)
- Auto-creates group named "Resit-[StudentName]" with student added
- Student remains in original group (now in both)

### Multi-group visibility

When a student is in multiple groups within the same assignment:

- **Data Overview is the canonical source** for multi-group details
- Assignment selector shows badge/indicator only; clicking opens Data Overview filtered to that assignment
- Coverage sheet shows count with "See Data Overview for details" link
- Not flagged as issue (valid for resits, cross-team collaboration)
- Visible inline during group editing (see "Adding students to groups" above)

This follows the principle: one source of truth (Data Overview), multiple entry points.

---

## 4. Coverage Display

Present coverage as neutral information, with interpretation based on assignment type.

**Assignment selector:**

```text
Assignment 1 (class-wide)     43/48 active ⚠    ← warning: 5 unassigned (issue for class-wide)
Assignment 2 (selective)      12/48 active      ← no indicator (subset is expected)
```

- "active" shown inline clarifies denominator without requiring hover
- Coverage text shows chevron (›) and underlines on hover to indicate clickability

**Coverage is clickable:** Clicking "43/48 active ›" opens the coverage report sheet showing:

- List of assigned students (grouped by group)
- List of unassigned students (for class-wide, styled as issue)
- Quick actions: "Add to new group" or "Add to existing group"

**Assignment detail view:**

- "43/48 active students assigned"
- For class-wide: "5 unassigned" as issue with CTA to review
- For selective: "36 not in this assignment" as neutral info

**Coverage calculation excludes:**

- Dropped students
- Incomplete students

---

## 5. Unknown Student and Empty Group Handling

### Unknown students

Unknown students (group members referencing non-existent student IDs) are objective errors.

**Display:**

- "Unknown student (ID: xyz)" styled as error in group member list
- Included in member counts with error indicator
- Listed in Data Overview sheet under Issues

**Cleanup:**

- Bulk action: "Remove N unknown students"
- Immediate (no confirmation) — reversible via Ctrl+Z as single undo step
- Toast: "Removed 8 unknown students. Ctrl+Z to undo"

### Empty groups

Groups with no members are flagged as issues, but with grace period during active editing.

**Timing:**

- Newly created groups: not flagged while the group editor sheet is open
- Flagged as issue when: editor sheet closes (explicit timing, not focus-based)
- On export: blocks export with "N empty groups must have members or be deleted"

**Display:**

- While actively editing: Group card shows "No members" with neutral styling
- After focus leaves group: Group card shows "No members" with warning styling
- Listed in Data Overview sheet under Issues: "N empty groups"

**Cleanup options:**

- Individual: Delete button on group card (immediate)
- Bulk action from Data Overview: "Delete N empty groups"
- Immediate (no confirmation) — reversible via Ctrl+Z
- Toast: "Deleted 3 empty groups. Ctrl+Z to undo"

---

## 6. Student Status Management

### Setting status

- Dropdown in student editor: Active / Dropped / Incomplete
- Bulk action for multiple students
- Default for new/imported students: Active

### Status change feedback

Status changes are immediate with inline feedback (no confirmation dialogs):

- **Active → Dropped/Incomplete** (student in groups): Inline note: "Excluded from coverage"
- **Dropped/Incomplete → Active** (student not in any group, class-wide assignments exist): Inline
  warning: "Now unassigned" with [View] link
- All changes reversible via Ctrl+Z

### Visual treatment

- Active: normal display
- Dropped: dimmed, with "Dropped" badge
- Incomplete: dimmed, with "Incomplete" badge

### Behavior

- Dropped/incomplete excluded from coverage calculations
- Never flagged as "unassigned" regardless of assignment type
- Remain visible in roster for historical records
- Remain in groups (dimmed) for historical context
- Can still be manually added to groups if needed

---

## 7. Calm Guidance for Empty States

For first-use states, show contextual guidance within tab content.

**Priority order (show highest priority only):**

1. No students → "Import roster to get started"
2. No assignments → "Create an assignment to organize groups"
3. No groups in assignment → "Import groups or create manually"

---

## 8. Validation and Feedback

**Validation triggers:**

- On import (roster or groups)
- On assignment selection change
- On any data mutation (add/remove member, status change, etc.)
- Automatic — no manual refresh needed

**Inline validation during editing:**

Where feasible, show validation state during editing rather than only after:

- Group editor: "3 members" or "No members ⚠" (live count)
- Assignment view: "43/48 assigned" updates as members are added/removed
- Student picker: "(also in Team-A)" indicator before adding

**Feedback principles:**

- Status bar appears/updates when issues change
- Toast only for new issues from explicit user action (import, bulk edit)
- No toast for background validation
- No toast if Data Overview sheet is already open

---

## 9. Undo and Redo

All profile editing actions (roster, assignments, groups) support multi-level undo via standard
keyboard shortcuts. This eliminates editing anxiety and enables exploratory workflows.

### UI buttons

Undo/Redo buttons in the header provide discoverability and mouse access:

- **[↩] Undo**: Reverts last action; disabled when nothing to undo
- **[↪] Redo**: Re-applies undone action; disabled when nothing to redo
- Tooltips show keyboard shortcut: "Undo (Ctrl+Z)" / "Redo (Ctrl+Shift+Z)"

### Keyboard shortcuts

- **Ctrl+Z** (Cmd+Z on Mac): Undo last action
- **Ctrl+Shift+Z** (Cmd+Shift+Z on Mac): Redo

Both UI buttons and keyboard shortcuts trigger the same action.

### Scope

Undo applies to **profile data** only:

| Included (undoable) | Excluded |
| ------------------- | -------- |
| Add/remove student from group | App settings (theme, connections) |
| Create/delete group | UI navigation (tab changes) |
| Create/delete assignment | External operations (git, LMS import*) |
| Change student status | |
| Edit student details | |
| Bulk operations | |

*LMS imports create profile changes that ARE undoable. The import operation itself cannot be
"un-fetched", but the resulting roster/group additions can be undone as a single action.

### Behavior

- **Stack depth**: 100 actions maximum; oldest entries silently dropped when exceeded
- **Clear on save**: Undo history clears when profile is saved (save = commit changes)
- **Bulk as single action**: A bulk operation (e.g., "Remove 5 members") undoes as one step
- **Validation re-runs**: After undo/redo, validation runs automatically; status bar updates

### Feedback

Undo/redo shows a brief toast with a human-readable description of the action:

```text
┌────────────────────────────────────┐
│ ↩ Undid: Remove Alice from Team-A  │
└────────────────────────────────────┘
```

**Toast behavior:**

- Position: bottom-center, above any floating action buttons
- Shows mutation description (e.g., "Remove Alice from Team-A", "Add 5 members to Team-B")
- Auto-dismisses after 3 seconds (5 seconds for bulk operations affecting 10+ items)
- No toast if action has no visible effect

### Implementation notes

Uses Immer patches (already in profileStore) for automatic inverse operations:

- Each mutation produces patches and inverse patches
- Inverse patches restore previous state without manual undo logic per action type
- Compound actions (bulk operations) are wrapped to produce single history entry
- Each history entry stores a description alongside patches for toast display:

  ```ts
  interface HistoryEntry {
    patches: Patch[]
    inversePatches: Patch[]
    description: string  // e.g., "Remove Alice from Team-A"
  }
  ```

- Mutation API accepts description as first parameter: `mutate("Remove Alice from Team-A", draft => { ... })`

---

## 10. Accessibility

**Status indicators:**

- All warning icons (⚠) paired with text labels, not icon-only
- Color + icon for issue states (never color alone)
- Tooltips on all status badges and indicators

**Keyboard navigation:**

- All CTAs and interactive elements focusable
- Escape closes sheets and dialogs
- Tab order follows visual layout
- Ctrl+Z / Ctrl+Shift+Z for undo/redo (Cmd on Mac); also accessible via header buttons
- Ctrl+I / Cmd+I to open Data Overview

---

## Prioritization

| Priority | Items                                   | Rationale                                  |
| -------- | --------------------------------------- | ------------------------------------------ |
| P1       | Multi-level undo/redo + UI buttons      | Foundation for confident editing           |
| P1       | Data Overview access (header button)    | Discoverability before issues occur        |
| P1       | Data Overview (issues section)          | Central visibility for objective problems  |
| P1       | Unknown student handling                | Prevents silent data loss                  |
| P1       | Empty group handling                    | Prevents invalid assignment state          |
| P1       | Student removal from groups             | Core group management operation            |
| P2       | Assignment types (class-wide/selective) | Foundation for context-aware validation    |
| P2       | Unassigned student detection            | Core class-wide validation                 |
| P2       | Student status                          | Enables accurate coverage for mixed cohorts|
| P2       | Flexible group creation                 | Supports resits and individual work        |
| P2       | Inline multi-group indicators           | Informed decisions during editing          |
| P3       | Data Overview (insights section)        | Reference information                      |
| P3       | Empty state guidance                    | Helpful but secondary                      |
| P3       | Resit group shortcut (overflow menu)    | Convenience for common workflow            |

---

## Implementation Phases

### Phase 1a: Core Data Overview and Group Management

- Implement multi-level undo/redo with Immer patches (Ctrl+Z / Ctrl+Shift+Z)
- Add Undo/Redo buttons (↩/↪) to header (disabled when history empty)
- Add undo toast feedback with mutation description ("Undid: Remove Alice from Team-A")
- Add Data Overview sheet (issues section only)
- Add info button [ℹ] in header to open Data Overview
- Add status bar with smooth slide animation (visible only when issues exist)
- Add unknown student detection and display
- Add empty group detection with sheet-close-based grace period
- Add student removal from groups (immediate, with undo toast)
- Implement single CTA per issue with navigation to filtered view

**Note:** Phase 1a treats all assignments as class-wide (default). Selective type added in 1b.

### Phase 1b: Assignment Types and Validation

- Add assignment type field (class-wide, selective) — immutable after creation
- Update +New Assignment flow with type selector (default: class-wide)
- Show type in assignment selector (parenthetical format with "N/M active" coverage)
- Implement type-aware validation:
  - Class-wide: unassigned active students = issue
  - Selective: any coverage = valid
- Add warning icon (⚠) for incomplete class-wide assignments
- Add clickable coverage display opening coverage report sheet

### Phase 2: Student Status and Inline Feedback

- Add student status field (active, dropped, incomplete)
- Update coverage calculations to exclude dropped/incomplete
- Add visual treatment for dropped/incomplete students
- Add inline status change feedback (no confirmation dialogs)
- Add inline multi-group indicators in student picker (up to 2 names + "and N other")
- Add inline warning when adding student to multiple groups (no modal)

### Phase 3: Insights and Guidance

- Add Data Overview insights sections (collapsible)
- Track and display multi-group membership as insight
- Track and display single-member groups as insight
- Add empty state guidance banners
- Add toast notifications for new issues from user actions
- Add bulk cleanup actions (unknown students, empty groups)
- Add resit group shortcut (overflow menu + right-click + long-press)
- Add import preview for LMS imports ("Import will add 48 students, 3 have duplicate IDs")
- Add virtualized list for student picker (performance with 200+ students)
