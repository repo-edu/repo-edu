/**
 * Roster store - single source of truth for roster data.
 * Holds students, assignments, and groups.
 * Provides CRUD operations for frontend mutations.
 * Validation runs debounced after mutations.
 */

import { create } from "zustand"
import { commands } from "../bindings/commands"
import type {
  Assignment,
  AssignmentId,
  AssignmentMetadata,
  GitIdentityMode,
  Group,
  GroupId,
  Roster,
  Student,
  StudentId,
  ValidationResult,
} from "@repo-edu/backend-interface/types"
import { errorResult, type LoadResult, okResult } from "../types/load"
import { debounceAsync } from "../utils/debounce"
import { useAppSettingsStore } from "./appSettingsStore"
import { useProfileSettingsStore } from "./profileSettingsStore"

type StoreStatus = "empty" | "loading" | "loaded" | "error"

interface RosterState {
  roster: Roster | null
  status: StoreStatus
  error: string | null

  // Validation results (computed on changes, debounced)
  rosterValidation: ValidationResult | null
  assignmentValidation: ValidationResult | null

  // UI state
  selectedAssignmentId: AssignmentId | null
}

interface RosterActions {
  // Loading
  load: (profileName: string) => Promise<LoadResult>
  clear: () => void

  // Student CRUD (frontend-only mutations)
  addStudent: (student: Student) => void
  updateStudent: (id: StudentId, updates: Partial<Student>) => void
  removeStudent: (id: StudentId) => void

  // Assignment CRUD
  addAssignment: (assignment: Assignment) => void
  updateAssignment: (
    id: AssignmentId,
    updates: Partial<AssignmentMetadata>,
  ) => void
  removeAssignment: (id: AssignmentId) => void
  selectAssignment: (id: AssignmentId | null) => void

  // Group CRUD
  addGroup: (assignmentId: AssignmentId, group: Group) => void
  updateGroup: (
    assignmentId: AssignmentId,
    groupId: GroupId,
    updates: Partial<Group>,
  ) => void
  removeGroup: (assignmentId: AssignmentId, groupId: GroupId) => void

  // Import (replaces roster with result)
  setRoster: (roster: Roster) => void

  // Validation (debounced, called after mutations)
  validateRoster: () => Promise<void>
  validateAssignment: () => Promise<void>

  // Internal helpers
  _triggerRosterValidation: () => void
  _triggerAssignmentValidation: () => void

  // Reset
  reset: () => void
}

interface RosterStore extends RosterState, RosterActions {}

const initialState: RosterState = {
  roster: null,
  status: "empty",
  error: null,
  rosterValidation: null,
  assignmentValidation: null,
  selectedAssignmentId: null,
}

// Create debounced validation functions outside the store
// to ensure they persist across renders
let debouncedRosterValidation: (() => void) | null = null
let debouncedAssignmentValidation: (() => void) | null = null

export const useRosterStore = create<RosterStore>((set, get) => {
  // Initialize debounced functions that reference the store
  const validateRosterImpl = async () => {
    const { roster } = get()
    if (!roster) {
      set({ rosterValidation: null })
      return
    }
    try {
      const result = await commands.validateRoster(roster)
      if (result.status === "error") {
        console.error("Roster validation error:", result.error.message)
        return
      }
      set({ rosterValidation: result.data })
    } catch (error) {
      console.error("Roster validation error:", error)
    }
  }

  const resolveIdentityMode = (): GitIdentityMode => {
    const gitConnectionName = useProfileSettingsStore.getState().gitConnection
    if (!gitConnectionName) return "username"
    const connection =
      useAppSettingsStore.getState().gitConnections[gitConnectionName]
    if (!connection) return "username"
    if (connection.server_type === "GitLab") {
      return connection.identity_mode ?? "username"
    }
    return "username"
  }

  const validateAssignmentImpl = async () => {
    const { roster, selectedAssignmentId } = get()
    if (!roster || !selectedAssignmentId) {
      set({ assignmentValidation: null })
      return
    }
    try {
      const result = await commands.validateAssignment(
        resolveIdentityMode(),
        roster,
        selectedAssignmentId,
      )
      if (result.status === "error") {
        console.error("Assignment validation error:", result.error.message)
        return
      }
      set({ assignmentValidation: result.data })
    } catch (error) {
      console.error("Assignment validation error:", error)
    }
  }

  debouncedRosterValidation = debounceAsync(validateRosterImpl, 200)
  debouncedAssignmentValidation = debounceAsync(validateAssignmentImpl, 200)

  return {
    ...initialState,

    load: async (profileName) => {
      set({ status: "loading", error: null })
      try {
        const result = await commands.getRoster(profileName)
        if (result.status === "error") {
          set({ status: "error", error: result.error.message })
          return errorResult(result.error.message)
        }
        const roster = result.data
        if (roster) {
          set({
            roster,
            status: "loaded",
            error: null,
            selectedAssignmentId: roster.assignments[0]?.id ?? null,
          })
          // Trigger initial validation
          debouncedRosterValidation?.()
        } else {
          set({
            roster: null,
            status: "empty",
            error: null,
          })
        }
        return okResult()
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        set({ status: "error", error: message })
        return errorResult(message)
      }
    },

    clear: () =>
      set({
        roster: null,
        status: "empty",
        rosterValidation: null,
        assignmentValidation: null,
        selectedAssignmentId: null,
      }),

    // Student CRUD
    addStudent: (student) =>
      set((state) => {
        if (!state.roster) {
          return {
            roster: {
              source: null,
              students: [student],
              assignments: [],
            },
            status: "loaded",
          }
        }
        const updated = {
          ...state.roster,
          students: [...state.roster.students, student],
        }
        debouncedRosterValidation?.()
        return { roster: updated }
      }),

    updateStudent: (id, updates) =>
      set((state) => {
        if (!state.roster) return state
        const updated = {
          ...state.roster,
          students: state.roster.students.map((s) =>
            s.id === id ? { ...s, ...updates } : s,
          ),
        }
        debouncedRosterValidation?.()
        return { roster: updated }
      }),

    removeStudent: (id) =>
      set((state) => {
        if (!state.roster) return state
        // Remove from students array
        const students = state.roster.students.filter((s) => s.id !== id)
        // Also remove from all group member_ids (cascade)
        const assignments = state.roster.assignments.map((assignment) => ({
          ...assignment,
          groups: assignment.groups.map((group) => ({
            ...group,
            member_ids: group.member_ids.filter((memberId) => memberId !== id),
          })),
        }))
        debouncedRosterValidation?.()
        return { roster: { ...state.roster, students, assignments } }
      }),

    // Assignment CRUD
    addAssignment: (assignment) =>
      set((state) => {
        if (!state.roster) {
          return {
            roster: {
              source: null,
              students: [],
              assignments: [assignment],
            },
            status: "loaded",
          }
        }
        const updated = {
          ...state.roster,
          assignments: [...state.roster.assignments, assignment],
        }
        debouncedRosterValidation?.()
        return { roster: updated }
      }),

    updateAssignment: (id, updates) =>
      set((state) => {
        if (!state.roster) return state
        const updated = {
          ...state.roster,
          assignments: state.roster.assignments.map((a) =>
            a.id === id ? { ...a, ...updates } : a,
          ),
        }
        debouncedRosterValidation?.()
        return { roster: updated }
      }),

    removeAssignment: (id) =>
      set((state) => {
        if (!state.roster) return state
        const updated = {
          ...state.roster,
          assignments: state.roster.assignments.filter((a) => a.id !== id),
        }
        // If removed assignment was selected, select first remaining (or null)
        const selectedAssignmentId =
          state.selectedAssignmentId === id
            ? (updated.assignments[0]?.id ?? null)
            : state.selectedAssignmentId
        debouncedRosterValidation?.()
        return { roster: updated, selectedAssignmentId }
      }),

    selectAssignment: (id) => {
      set({ selectedAssignmentId: id, assignmentValidation: null })
    },

    // Group CRUD
    addGroup: (assignmentId, group) =>
      set((state) => {
        if (!state.roster) return state
        const updated = {
          ...state.roster,
          assignments: state.roster.assignments.map((a) =>
            a.id === assignmentId ? { ...a, groups: [...a.groups, group] } : a,
          ),
        }
        debouncedRosterValidation?.()
        return { roster: updated }
      }),

    updateGroup: (assignmentId, groupId, updates) =>
      set((state) => {
        if (!state.roster) return state
        const updated = {
          ...state.roster,
          assignments: state.roster.assignments.map((a) =>
            a.id === assignmentId
              ? {
                  ...a,
                  groups: a.groups.map((g) =>
                    g.id === groupId ? { ...g, ...updates } : g,
                  ),
                }
              : a,
          ),
        }
        debouncedRosterValidation?.()
        return { roster: updated }
      }),

    removeGroup: (assignmentId, groupId) =>
      set((state) => {
        if (!state.roster) return state
        const updated = {
          ...state.roster,
          assignments: state.roster.assignments.map((a) =>
            a.id === assignmentId
              ? { ...a, groups: a.groups.filter((g) => g.id !== groupId) }
              : a,
          ),
        }
        debouncedRosterValidation?.()
        return { roster: updated }
      }),

    // Import
    setRoster: (roster) => {
      set({
        roster,
        status: "loaded",
        selectedAssignmentId: roster.assignments[0]?.id ?? null,
      })
      debouncedRosterValidation?.()
    },

    // Validation
    validateRoster: validateRosterImpl,
    validateAssignment: validateAssignmentImpl,

    _triggerRosterValidation: () => {
      debouncedRosterValidation?.()
    },

    _triggerAssignmentValidation: () => {
      debouncedAssignmentValidation?.()
    },

    reset: () => set(initialState),
  }
})

// Derived selectors
export const selectRoster = (state: RosterStore) => state.roster
export const selectStudents = (state: RosterStore) =>
  state.roster?.students ?? []
export const selectAssignments = (state: RosterStore) =>
  state.roster?.assignments ?? []
export const selectSelectedAssignmentId = (state: RosterStore) =>
  state.selectedAssignmentId
export const selectSelectedAssignment = (state: RosterStore) =>
  state.roster?.assignments.find((a) => a.id === state.selectedAssignmentId) ??
  null
export const selectGroups = (state: RosterStore) =>
  selectSelectedAssignment(state)?.groups ?? []
export const selectRosterStatus = (state: RosterStore) => state.status
export const selectRosterError = (state: RosterStore) => state.error
export const selectRosterValidation = (state: RosterStore) =>
  state.rosterValidation
export const selectAssignmentValidation = (state: RosterStore) =>
  state.assignmentValidation
