# Single Document Store + Immer Migration

## Goal

Simplify frontend state management by:

1. Consolidating profile settings + roster into a single "document" store
2. Using Immer middleware for consistent mutation patterns
3. Eliminating cross-store coordination and race conditions
4. Moving result state from uiStore to domain stores
5. Adding cleanup for orphaned connection statuses

## Current Architecture Problems

| Problem | Cause |
|---------|-------|
| Race conditions on profile switch | `rosterStore` and `profileSettingsStore` load independently |
| Cross-store data access | `rosterStore.resolveIdentityMode()` reads from two other stores |
| Verbose CRUD operations | Nested spread syntax for immutable updates (~15 lines per operation) |
| Complex dirty tracking | `useDirtyState` subscribes to 4 fields across 2 stores |
| Scattered loading states | Each store has its own `status` and `error` |
| uiStore is a god store | 20+ dialog booleans and 8 result objects mixed together |
| Orphaned connection statuses | Renaming/deleting git connections leaves stale entries in connectionsStore |

## Target Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                     profileStore                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ProfileDocument                                      │   │
│  │  • settings: ProfileSettings                         │   │
│  │  • roster: Roster | null                             │   │
│  │  • resolvedIdentityMode: GitIdentityMode             │   │
│  └─────────────────────────────────────────────────────┘   │
│  • status: idle | loading | loaded | error                  │
│  • selectedAssignmentId (profile-scoped)                    │
│  • rosterValidation, assignmentValidation                   │
│  • coverageReport (moved from uiStore)                      │
│  • Immer middleware for all mutations                       │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                       uiStore                               │
│  • activeProfile, activeTab                                 │
│  • Dialog visibility booleans ONLY                          │
│  • NO result objects (moved to domain stores)               │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   connectionsStore                          │
│  • lmsStatus, gitStatuses                                   │
│  • lmsError, gitErrors                                      │
│  • courseStatus, courseError                                │
│  • removeGitStatus(name) for cleanup on deletion            │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    operationStore                           │
│  • selected: create | clone | delete                        │
│  • status: idle | running | success | error                 │
│  • error: string | null                                     │
│  • preflightResult (moved from uiStore)                     │
│  • validationResult (moved from uiStore)                    │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     outputStore                             │
│  • lines: OutputLine[] (append-only log)                    │
│  • append, appendText, clear, updateLastLine                │
│  • (kept separate - distinct append-only semantics)         │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    appSettingsStore                         │
│  • theme, lmsConnection, gitConnections                     │
│  • Triggers connectionsStore cleanup on git connection      │
│    rename/delete                                            │
└─────────────────────────────────────────────────────────────┘
```

## Store Consolidation Map

| Current Store | Becomes | Rationale |
|---------------|---------|-----------|
| `rosterStore` | `profileStore.document.roster` | Part of profile document |
| `rosterStore.selectedAssignmentId` | `profileStore.selectedAssignmentId` | Profile-scoped, enables atomic cleanup |
| `profileSettingsStore` | `profileStore.document.settings` | Part of profile document |
| `uiStore.validationResult` | `operationStore.validationResult` | Operation domain |
| `uiStore.preflightResult` | `operationStore.preflightResult` | Operation domain |
| `uiStore.coverageReport` | `profileStore.coverageReport` | Profile/roster domain |
| `uiStore` (dialog booleans) | `uiStore` (unchanged) | Pure UI visibility concerns |
| `connectionsStore` | `connectionsStore` (+ cleanup method) | Add orphan cleanup |
| `operationStore` | `operationStore` (+ results) | Add moved result state |
| `outputStore` | `outputStore` (unchanged) | Distinct append-only semantics |
| `appSettingsStore` | `appSettingsStore` (+ cleanup trigger) | Trigger connection cleanup |

**Result: 7 stores → 5 stores** <!-- rumdl-disable-line MD036 -->

## Key Design Decisions

### 1. Single Atomic Load

Profile settings and roster load together in one action. Race conditions are eliminated because there's only one load to track.

```text
load(profileName) → fetch settings + roster → resolve identity mode → set document atomically
```

### 2. Immer Middleware for profileStore Only

Use zustand's immer middleware for profileStore. Other stores use standard Zustand patterns (no Immer).

**Why global middleware for profileStore (not selective `produce()` calls):**

| Criterion | Selective Immer | Global Middleware | Winner |
|-----------|-----------------|-------------------|--------|
| Consistency | Mixed patterns | One pattern everywhere | Global |
| Bug risk | Can forget `produce()` on nested update | Impossible | Global |
| AI code generation | Must choose pattern per mutation | Always same pattern | Global |
| Performance | Negligible difference | Negligible difference | Tie |
| Decision fatigue | "Should I use Immer here?" | None | Global |

The performance argument for selective Immer is theoretical—Immer's proxy overhead is microseconds, while actual bottlenecks are network calls, React renders, and DOM updates.

**Why other stores don't need Immer:**

| Store | Immer? | Reason |
|-------|--------|--------|
| profileStore | ✅ Yes | Deep nesting (roster.students, roster.assignments, settings) |
| outputStore | ❌ No | Append-only array, simple operations |
| connectionsStore | ❌ No | Flat state (status maps, error maps) |
| operationStore | ❌ No | Flat state (status, error, results) |
| uiStore | ❌ No | Flat booleans |
| appSettingsStore | ❌ No | Simple object replacements |

**profileStore example:**

```typescript
import { immer } from 'zustand/middleware/immer'

const useProfileStore = create<ProfileStore>()(
  immer((set) => ({
    // All mutations use draft syntax consistently
    addStudent: (student) => set((state) => {
      state.document!.roster!.students.push(student)
    }),
    setStatus: (status) => set((state) => {
      state.status = status
    }),
  }))
)
```

**This decision is final.** Do not switch to selective `produce()` calls for profileStore.

### 3. Wrapper Helpers for Validation

All roster mutations go through a `mutateRoster()` helper that automatically triggers debounced validation. This is:

- **Explicit**: Pattern is visible and uniform
- **Reliable**: Impossible to forget validation trigger
- **Modifiable**: Validation logic changes in one place

```typescript
const mutateRoster = (fn: (draft: ProfileStoreState) => void) => {
  set(fn)
  scheduleRosterValidation()
}

// All roster mutations use the same pattern
addStudent: (student) => mutateRoster((state) => {
  state.document!.roster!.students.push(student)
}),
```

**Batch operations vs. CRUD mutations**: The `mutateRoster()` wrapper is for single-item CRUD operations (UI edits). Batch imports (LMS import, file import, etc.) use `setDocument()` which replaces the entire roster atomically—the backend handles merging and returns a complete roster. This triggers validation once for the whole replacement, not per-item.

| Operation Type | Method | Validation |
|----------------|--------|------------|
| Single CRUD (UI edits) | `mutateRoster()` | Debounced, per mutation |
| Batch imports | `setDocument()` | Once, after replacement |

### 4. Resolved Identity Mode in Profile Document

Store the resolved identity mode directly in the profile document to eliminate cross-store reads during validation:

```typescript
interface ProfileDocument {
  settings: ProfileSettings
  roster: Roster | null
  resolvedIdentityMode: GitIdentityMode  // Computed on load and git connection change
}
```

When loading a profile or when the git connection changes, compute and store the resolved identity mode:

```typescript
const resolveIdentityMode = (
  gitConnectionName: string | null,
  gitConnections: Record<string, GitConnection>
): GitIdentityMode => {
  if (!gitConnectionName) return "username"
  const connection = gitConnections[gitConnectionName]
  if (!connection) return "username"
  if (connection.server_type === "GitLab") {
    return connection.identity_mode ?? "username"
  }
  return "username"
}
```

Validation now reads only from profileStore—no cross-store getState() calls.

### 5. Assignment Selection in profileStore

`selectedAssignmentId` is profile-scoped state that belongs in `profileStore` alongside the roster. This enables atomic cleanup when an assignment is deleted:

```typescript
removeAssignment: (id) => set((state) => {
  state.document!.roster!.assignments =
    state.document!.roster!.assignments.filter(a => a.id !== id)
  // Atomic cleanup: if deleted assignment was selected, select first remaining
  if (state.selectedAssignmentId === id) {
    state.selectedAssignmentId = state.document!.roster!.assignments[0]?.id ?? null
  }
}),
```

**Row selection (students)**: Use local component state or table library state (e.g., TanStack Table's built-in selection). Only lift to Zustand if selection must persist across tab switches or component unmounts—which is rarely needed.

### 6. Result State in Domain Stores

Move result objects from uiStore to their domain stores:

| Result | Move To | Rationale |
|--------|---------|-----------|
| `validationResult` | `operationStore` | Used by operation tab for pre-operation validation |
| `preflightResult` | `operationStore` | Direct result of operation preflight |
| `coverageReport` | `profileStore` | Computed from roster data |
| `studentRemovalConfirmation` | Keep in uiStore | Transient confirmation dialog state |
| `gitUsernameImportResult` | Keep in uiStore | Transient import result |
| `usernameVerificationResult` | Keep in uiStore | Transient verification result |
| `lmsImportConflicts` | Keep in uiStore | Transient import conflicts |
| `pendingGroupImport` | Keep in uiStore | Transient pending state |

Dialog visibility booleans stay in uiStore—they're genuinely UI concerns.

### 7. Connection Status Cleanup

Add cleanup when git connections are renamed or deleted to prevent orphaned entries:

```typescript
// connectionsStore additions
removeGitStatus: (name: string) => set((state) => {
  const { [name]: _, ...restStatuses } = state.gitStatuses
  const { [name]: __, ...restErrors } = state.gitErrors
  return { gitStatuses: restStatuses, gitErrors: restErrors }
}),

renameGitStatus: (oldName: string, newName: string) => set((state) => {
  const status = state.gitStatuses[oldName]
  const error = state.gitErrors[oldName]
  const { [oldName]: _, ...restStatuses } = state.gitStatuses
  const { [oldName]: __, ...restErrors } = state.gitErrors
  return {
    gitStatuses: status ? { ...restStatuses, [newName]: status } : restStatuses,
    gitErrors: error !== undefined ? { ...restErrors, [newName]: error } : restErrors,
  }
}),
```

appSettingsStore calls these cleanup methods when git connections are modified.

### 8. appSettingsStore Stays Separate

App settings (theme, LMS connection, git connections) have a different lifecycle:

- Load once at startup
- Persist across profile switches
- Saved independently from profile data

Keeping them separate ensures clear boundaries and prevents accidental coupling of save operations.

### 9. outputStore Stays Separate

The output store has distinct append-only log semantics that differ from other UI state:

- `updateLastLine` conditionally replaces progress indicators vs. appending
- Append-only pattern (vs. replace pattern of other stores)
- Different access pattern in components (streaming log vs. point-in-time state)

Merging it into uiStore would create a grab-bag store. Keeping it separate maintains clear responsibility boundaries.

### 10. Single-Hash Dirty Tracking

`useDirtyState` hashes one `document` object instead of subscribing to multiple store fields.

## Implementation Phases

### Phase 1: Move Result State from uiStore

Before creating profileStore, move result state to appropriate domain stores:

- Move `validationResult` → operationStore
- Move `preflightResult` → operationStore
- Move `coverageReport` → create placeholder in rosterStore (will move to profileStore)
- Update components to read from new locations
- Remove moved fields from uiStore

This reduces uiStore to pure visibility concerns and prepares for the profileStore migration.

### Phase 2: Add Connection Status Cleanup

- Add `removeGitStatus(name)` to connectionsStore
- Add `renameGitStatus(oldName, newName)` to connectionsStore
- Update appSettingsStore git connection mutations to trigger cleanup
- Verify no orphaned statuses after connection rename/delete

### Phase 3: Create profileStore with Immer Middleware

- Install `immer` as a direct dependency
- New store using `zustand/middleware/immer` for all mutations
- `ProfileDocument` type with settings, roster, and resolvedIdentityMode
- Atomic `load()` action that fetches both and resolves identity mode
- `mutateRoster()` and `mutateSettings()` wrapper helpers
- Immer-powered CRUD mutations using draft syntax throughout
- `selectedAssignmentId` state
- Validation state and debounced validation scheduling
- `coverageReport` state (moved from Phase 1 placeholder)

### Phase 4: Update Hooks

- Simplify `useDirtyState` to hash single document
- Replace `useLoadProfile` with simpler profile switch hook
- Remove validation hooks (handled by profileStore wrapper helpers)
- Update identity mode resolution to read from profileStore.document.resolvedIdentityMode

### Phase 5: Migrate Components

- Update imports from old stores to new stores
- Replace `useRosterStore` selectors with `useProfileStore` selectors
- Replace `useProfileSettingsStore` selectors with `useProfileStore` selectors
- Update components reading moved result state (validationResult, preflightResult, coverageReport)
- Keep `useConnectionsStore` and `useOperationStore` imports (with updated result state)

### Phase 6: Delete Old Code

- Remove `rosterStore.ts`
- Remove `profileSettingsStore.ts`
- Remove `profileLoader.ts`

Note: `outputStore.ts`, `connectionsStore.ts`, `operationStore.ts`, `uiStore.ts`, and `appSettingsStore.ts` are kept (with modifications from earlier phases).

### Phase 7: Update Tests

- Update test utilities for new store structure
- Verify all existing tests pass or update as needed

## Files Summary

### Files to Create

| File | Purpose |
|------|---------|
| `stores/profileStore.ts` | Unified profile document + Immer mutations |

### Files to Modify

| File | Change |
|------|--------|
| `stores/connectionsStore.ts` | Add removeGitStatus, renameGitStatus |
| `stores/operationStore.ts` | Add validationResult, preflightResult |
| `stores/appSettingsStore.ts` | Trigger connection cleanup on git changes |
| `stores/uiStore.ts` | Remove moved result state |
| `stores/index.ts` | Export profileStore, remove old store exports |
| `hooks/useDirtyState.ts` | Simplify to single document hash |
| `hooks/useLoadProfile.ts` | Simplify or replace with useProfileSwitch |
| Components | Update store imports and selectors |

### Files to Delete

| File | Replaced By |
|------|-------------|
| `stores/rosterStore.ts` | `profileStore` |
| `stores/profileSettingsStore.ts` | `profileStore` |
| `utils/profileLoader.ts` | `profileStore.load()` |

### Files Unchanged

| File | Rationale |
|------|-----------|
| `stores/outputStore.ts` | Distinct append-only semantics |

## Benefits

| Before | After |
|--------|-------|
| 7 stores with independent loading | 5 stores with clear responsibilities |
| Cross-store `getState()` calls | All profile data in one place |
| ~15 lines per CRUD operation | ~3 lines with Immer |
| Hash 2 stores for dirty tracking | Hash 1 document |
| Module-level debounce variables | Wrapper helper triggers validation |
| Manual validation calls (easy to forget) | Automatic via `mutateRoster()` |
| `profileLoader` coordinating 6 stores | Single `load()` action |
| uiStore with 8 result objects | Results in domain stores |
| Orphaned connection statuses | Cleanup on rename/delete |
| Cross-store identity mode resolution | Resolved mode stored in document |
| Mixed mutation patterns (spread vs produce) | Consistent Immer throughout |

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Large migration diff | Phase-by-phase execution with validation |
| Immer learning curve | Immer is well-documented and intuitive |
| No cross-profile caching | Acceptable—profiles load quickly; add caching later if needed |
| Identity mode stale after app settings change | Subscribe to appSettingsStore changes or recompute on git connection edit |

## Next Steps

1. Begin Phase 1 (move result state from uiStore)
2. Continue with Phase 2 (add connection status cleanup)
3. Continue with Phase 3 (create profileStore with Immer)
