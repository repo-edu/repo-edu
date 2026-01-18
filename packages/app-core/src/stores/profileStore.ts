/**
 * Profile store - unified profile document with Immer mutations.
 * Combines profile settings and roster into a single atomic document.
 * All mutations use Immer for consistent draft-based updates.
 */

import type {
  Assignment,
  AssignmentId,
  AssignmentMetadata,
  CourseInfo,
  CoverageReport,
  ExportSettings,
  GitIdentityMode,
  Group,
  GroupId,
  OperationConfigs,
  ProfileSettings,
  Roster,
  Student,
  StudentId,
  ValidationResult,
} from "@repo-edu/backend-interface/types"
import {
  applyPatches,
  enablePatches,
  type Patch,
  produceWithPatches,
} from "immer"
import { create } from "zustand"
import { immer } from "zustand/middleware/immer"
import { commands } from "../bindings/commands"
import { useAppSettingsStore } from "./appSettingsStore"
import { useConnectionsStore } from "./connectionsStore"
import { useOutputStore } from "./outputStore"

type DocumentStatus = "empty" | "loading" | "loaded" | "error"

// Stable fallback objects to avoid infinite re-render loops in selectors
const EMPTY_COURSE: CourseInfo = { id: "", name: "" }
const EMPTY_STUDENTS: Student[] = []
const EMPTY_ASSIGNMENTS: Assignment[] = []
const EMPTY_GROUPS: Group[] = []
const HISTORY_LIMIT = 100

enablePatches()

interface ProfileDocument {
  settings: ProfileSettings
  roster: Roster | null
  resolvedIdentityMode: GitIdentityMode
}

interface ProfileState {
  document: ProfileDocument | null
  status: DocumentStatus
  error: string | null
  warnings: string[]

  // Profile-scoped selection
  selectedAssignmentId: AssignmentId | null

  // Validation results (computed on changes, debounced)
  rosterValidation: ValidationResult | null
  assignmentValidation: ValidationResult | null
  assignmentValidations: Record<AssignmentId, ValidationResult>

  // Coverage report
  coverageReport: CoverageReport | null

  // Undo/Redo
  history: HistoryEntry[]
  future: HistoryEntry[]
}

interface ProfileActions {
  // Document loading
  load: (profileName: string) => Promise<ProfileLoadResult>
  save: (profileName: string) => Promise<boolean>
  setDocument: (document: ProfileDocument) => void
  clear: () => void

  // Settings mutations
  setCourse: (course: CourseInfo) => void
  setGitConnection: (name: string | null) => void
  updateOperations: (operations: Partial<OperationConfigs>) => void
  setOperations: (operations: OperationConfigs) => void
  updateExports: (exports: Partial<ExportSettings>) => void
  setExports: (exports: ExportSettings) => void

  // Student CRUD
  addStudent: (student: Student) => void
  updateStudent: (id: StudentId, updates: Partial<Student>) => void
  removeStudent: (id: StudentId) => void

  // Assignment CRUD
  addAssignment: (
    assignment: Assignment,
    options?: { select?: boolean },
  ) => void
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

  // Roster replacement (for imports)
  setRoster: (roster: Roster, description?: string) => void

  // Validation (debounced, called after mutations)
  validateRoster: () => Promise<void>
  validateAssignment: () => Promise<void>
  _triggerRosterValidation: () => void
  _triggerAssignmentValidation: () => void

  // Coverage report
  setCoverageReport: (report: CoverageReport | null) => void

  // Resolved identity mode (recompute on git connection change)
  updateResolvedIdentityMode: () => void

  // Reset
  reset: () => void

  // Undo/Redo
  undo: () => HistoryEntry | null
  redo: () => HistoryEntry | null
  clearHistory: () => void
}

interface ProfileStore extends ProfileState, ProfileActions {}

// Result type for load operation
export interface ProfileLoadResult {
  ok: boolean
  warnings: string[]
  error: string | null
  profileName: string
  stale: boolean
}

interface HistoryEntry {
  patches: Patch[]
  inversePatches: Patch[]
  description: string
}

interface UndoState {
  document: ProfileDocument | null
  selectedAssignmentId: AssignmentId | null
}

// Default values
const defaultOperations: OperationConfigs = {
  target_org: "",
  repo_name_template: "{assignment}-{group}",
  create: { template_org: "" },
  clone: { target_dir: "", directory_layout: "flat" },
  delete: {},
}

const defaultExports: ExportSettings = {
  output_folder: "",
  output_csv: false,
  output_xlsx: false,
  output_yaml: true,
  csv_file: "student-info.csv",
  xlsx_file: "student-info.xlsx",
  yaml_file: "students.yaml",
  member_option: "(email, gitid)",
  include_group: true,
  include_member: true,
  include_initials: false,
  full_groups: true,
}

const initialState: ProfileState = {
  document: null,
  status: "empty",
  error: null,
  warnings: [],
  selectedAssignmentId: null,
  rosterValidation: null,
  assignmentValidation: null,
  assignmentValidations: {},
  coverageReport: null,
  history: [],
  future: [],
}

// Debounce state (module-level to persist across renders)
let rosterValidationTimeout: ReturnType<typeof setTimeout> | null = null
let assignmentValidationTimeout: ReturnType<typeof setTimeout> | null = null
let loadSequence = 0

// Helper to resolve identity mode from current app settings
function resolveIdentityMode(
  gitConnectionName: string | null,
): GitIdentityMode {
  if (!gitConnectionName) return "username"
  const connection =
    useAppSettingsStore.getState().gitConnections[gitConnectionName]
  if (!connection) return "username"
  if (connection.server_type === "GitLab") {
    return connection.identity_mode ?? "username"
  }
  return "username"
}

export const useProfileStore = create<ProfileStore>()(
  immer((set, get) => {
    // Debounced validation helpers
    const scheduleRosterValidation = () => {
      if (rosterValidationTimeout) clearTimeout(rosterValidationTimeout)
      rosterValidationTimeout = setTimeout(() => {
        get().validateRoster()
      }, 200)
    }

    const scheduleAssignmentValidation = () => {
      if (assignmentValidationTimeout) clearTimeout(assignmentValidationTimeout)
      assignmentValidationTimeout = setTimeout(() => {
        get().validateAssignment()
      }, 200)
    }

    const applyUndoState = (nextState: UndoState, entry?: HistoryEntry) => {
      set((state) => {
        state.document = nextState.document
        state.selectedAssignmentId = nextState.selectedAssignmentId
        if (entry) {
          state.history.push(entry)
          if (state.history.length > HISTORY_LIMIT) {
            state.history.shift()
          }
          state.future = []
        }
      })
    }

    const mutateDocument = (
      description: string,
      recipe: (state: UndoState) => void,
    ) => {
      const current: UndoState = {
        document: get().document,
        selectedAssignmentId: get().selectedAssignmentId,
      }
      const [nextState, patches, inversePatches] = produceWithPatches(
        current,
        recipe,
      )
      if (patches.length === 0) return

      applyUndoState(nextState, { patches, inversePatches, description })
      scheduleRosterValidation()
      scheduleAssignmentValidation()
    }

    // Wrapper for roster mutations - triggers validation after mutation
    const mutateRoster = (
      description: string,
      fn: (state: UndoState) => void,
    ) => {
      mutateDocument(description, fn)
    }

    return {
      ...initialState,

      load: async (profileName) => {
        set((state) => {
          state.status = "loading"
          state.error = null
          state.warnings = []
        })

        loadSequence += 1
        const currentLoadId = loadSequence

        const { setActiveProfileForCourse } = useConnectionsStore.getState()
        const { appendText } = useOutputStore.getState()

        setActiveProfileForCourse(profileName)

        try {
          // Load settings and roster in parallel
          const [settingsResult, rosterResult] = await Promise.all([
            commands.loadProfile(profileName),
            commands.getRoster(profileName),
          ])

          // Check for stale load
          if (currentLoadId !== loadSequence) {
            return {
              ok: false,
              warnings: [],
              error: null,
              profileName,
              stale: true,
            }
          }

          // Handle settings load errors
          if (settingsResult.status === "error") {
            const error = `settings: ${settingsResult.error.message}`
            try {
              const defaults = await commands.getDefaultSettings()
              const resolvedMode = resolveIdentityMode(
                defaults.git_connection ?? null,
              )
              set((state) => {
                state.document = {
                  settings: defaults,
                  roster: null,
                  resolvedIdentityMode: resolvedMode,
                }
                state.status = "loaded"
                state.error = null
                state.warnings = []
                state.selectedAssignmentId = null
                state.rosterValidation = null
                state.assignmentValidation = null
                state.assignmentValidations = {}
                state.coverageReport = null
                state.history = []
                state.future = []
              })
            } catch {
              set((state) => {
                state.status = "error"
                state.error = error
              })
            }

            appendText(
              `Failed to load profile '${profileName}': ${error}. Loaded default settings.`,
              "warning",
            )
            return {
              ok: false,
              warnings: [],
              error,
              profileName,
              stale: false,
            }
          }

          // Handle roster load errors (settings already loaded)
          if (rosterResult.status === "error") {
            const { settings, warnings } = settingsResult.data
            const rosterError = `roster: ${rosterResult.error.message}`
            const resolvedMode = resolveIdentityMode(
              settings.git_connection ?? null,
            )

            set((state) => {
              state.document = {
                settings,
                roster: null,
                resolvedIdentityMode: resolvedMode,
              }
              state.status = "loaded"
              state.error = null
              state.warnings = warnings
              state.selectedAssignmentId = null
              state.rosterValidation = null
              state.assignmentValidation = null
              state.assignmentValidations = {}
              state.coverageReport = null
              state.history = []
              state.future = []
            })

            if (warnings.length > 0) {
              for (const warning of warnings) {
                appendText(`${warning}`, "warning")
              }
            }

            appendText(
              `Failed to load roster for profile '${profileName}': ${rosterError}. Loaded profile settings without roster.`,
              "warning",
            )

            return {
              ok: false,
              warnings,
              error: rosterError,
              profileName,
              stale: false,
            }
          }

          // Success - set document atomically
          const { settings, warnings } = settingsResult.data
          const roster = rosterResult.data
          const resolvedMode = resolveIdentityMode(
            settings.git_connection ?? null,
          )

          set((state) => {
            state.document = {
              settings,
              roster,
              resolvedIdentityMode: resolvedMode,
            }
            state.status = "loaded"
            state.error = null
            state.warnings = warnings
            state.selectedAssignmentId = roster?.assignments[0]?.id ?? null
            state.assignmentValidation = null
            state.assignmentValidations = {}
            state.history = []
            state.future = []
          })

          // Log warnings
          if (warnings.length > 0) {
            for (const warning of warnings) {
              appendText(`${warning}`, "warning")
            }
          }

          // Trigger initial validation
          scheduleRosterValidation()

          return {
            ok: true,
            warnings,
            error: null,
            profileName,
            stale: false,
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          set((state) => {
            state.status = "error"
            state.error = message
          })
          return {
            ok: false,
            warnings: [],
            error: message,
            profileName,
            stale: false,
          }
        }
      },

      save: async (profileName) => {
        const { document } = get()
        if (!document) return false

        set((state) => {
          state.status = "loading"
          state.error = null
        })

        try {
          // Save settings and roster together atomically
          const result = await commands.saveProfileAndRoster(
            profileName,
            document.settings,
            document.roster,
          )
          if (result.status === "error") {
            set((state) => {
              state.status = "error"
              state.error = result.error.message
            })
            return false
          }

          set((state) => {
            state.status = "loaded"
            state.error = null
            state.history = []
            state.future = []
          })
          return true
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          set((state) => {
            state.status = "error"
            state.error = message
          })
          return false
        }
      },

      setDocument: (document) =>
        set((state) => {
          state.document = document
          state.status = "loaded"
          state.selectedAssignmentId =
            document.roster?.assignments[0]?.id ?? null
          state.assignmentValidation = null
          state.assignmentValidations = {}
          state.history = []
          state.future = []
        }),

      clear: () =>
        set((state) => {
          state.document = null
          state.status = "empty"
          state.error = null
          state.warnings = []
          state.selectedAssignmentId = null
          state.rosterValidation = null
          state.assignmentValidation = null
          state.assignmentValidations = {}
          state.coverageReport = null
          state.history = []
          state.future = []
        }),

      // Settings mutations
      setCourse: (course) =>
        set((state) => {
          if (state.document) {
            state.document.settings.course = course
          }
        }),

      setGitConnection: (name) =>
        set((state) => {
          if (state.document) {
            state.document.settings.git_connection = name
            state.document.resolvedIdentityMode = resolveIdentityMode(name)
          }
        }),

      updateOperations: (operations) =>
        set((state) => {
          if (state.document) {
            Object.assign(state.document.settings.operations, operations)
          }
        }),

      setOperations: (operations) =>
        set((state) => {
          if (state.document) {
            state.document.settings.operations = operations
          }
        }),

      updateExports: (exports) =>
        set((state) => {
          if (state.document) {
            Object.assign(state.document.settings.exports, exports)
          }
        }),

      setExports: (exports) =>
        set((state) => {
          if (state.document) {
            state.document.settings.exports = exports
          }
        }),

      // Student CRUD
      addStudent: (student) => {
        const description = `Add student ${student.name}`
        const shouldSetLoaded = !get().document
        mutateRoster(description, (state) => {
          if (!state.document) {
            state.document = {
              settings: {
                course: { id: "", name: "" },
                git_connection: null,
                operations: { ...defaultOperations },
                exports: { ...defaultExports },
              },
              roster: { source: null, students: [student], assignments: [] },
              resolvedIdentityMode: "username",
            }
          } else if (!state.document.roster) {
            state.document.roster = {
              source: null,
              students: [student],
              assignments: [],
            }
          } else {
            state.document.roster.students.push(student)
          }
        })
        if (shouldSetLoaded) {
          set((state) => {
            state.status = "loaded"
          })
        }
      },

      updateStudent: (id, updates) => {
        const studentName =
          get().document?.roster?.students.find((student) => student.id === id)
            ?.name ?? "student"
        mutateRoster(`Edit student ${studentName}`, (state) => {
          const student = state.document?.roster?.students.find(
            (s) => s.id === id,
          )
          if (student) {
            Object.assign(student, updates)
          }
        })
      },

      removeStudent: (id) => {
        const studentName =
          get().document?.roster?.students.find((student) => student.id === id)
            ?.name ?? "student"
        mutateRoster(`Remove student ${studentName}`, (state) => {
          if (!state.document?.roster) return
          // Remove from students array
          state.document.roster.students =
            state.document.roster.students.filter((s) => s.id !== id)
          // Cascade: remove from all group member_ids
          for (const assignment of state.document.roster.assignments) {
            for (const group of assignment.groups) {
              group.member_ids = group.member_ids.filter((m) => m !== id)
            }
          }
        })
      },

      // Assignment CRUD
      addAssignment: (assignment, options) =>
        mutateRoster(`Add assignment ${assignment.name}`, (state) => {
          if (!state.document) return
          if (!state.document.roster) {
            state.document.roster = {
              source: null,
              students: [],
              assignments: [assignment],
            }
          } else {
            state.document.roster.assignments.push(assignment)
          }
          if (options?.select) {
            state.selectedAssignmentId = assignment.id
          }
        }),

      updateAssignment: (id, updates) => {
        const assignmentName =
          get().document?.roster?.assignments.find(
            (assignment) => assignment.id === id,
          )?.name ?? "assignment"
        mutateRoster(`Edit assignment ${assignmentName}`, (state) => {
          const assignment = state.document?.roster?.assignments.find(
            (a) => a.id === id,
          )
          if (assignment) {
            const { assignment_type: _, ...rest } = updates
            Object.assign(assignment, rest)
          }
        })
      },

      removeAssignment: (id) => {
        const assignmentName =
          get().document?.roster?.assignments.find(
            (assignment) => assignment.id === id,
          )?.name ?? "assignment"
        mutateRoster(`Delete assignment ${assignmentName}`, (state) => {
          if (!state.document?.roster) return
          state.document.roster.assignments =
            state.document.roster.assignments.filter((a) => a.id !== id)
          // Cleanup selection
          if (state.selectedAssignmentId === id) {
            state.selectedAssignmentId =
              state.document.roster.assignments[0]?.id ?? null
          }
        })
      },

      selectAssignment: (id) => {
        set((state) => {
          state.selectedAssignmentId = id
          state.assignmentValidation = id
            ? state.assignmentValidations[id]
            : null
        })
        scheduleAssignmentValidation()
      },

      // Group CRUD
      addGroup: (assignmentId, group) => {
        mutateRoster(`Add group ${group.name}`, (state) => {
          const assignment = state.document?.roster?.assignments.find(
            (a) => a.id === assignmentId,
          )
          if (assignment) {
            assignment.groups.push(group)
          }
        })
      },

      updateGroup: (assignmentId, groupId, updates) => {
        const groupName =
          get()
            .document?.roster?.assignments.find(
              (assignment) => assignment.id === assignmentId,
            )
            ?.groups.find((group) => group.id === groupId)?.name ?? "group"
        mutateRoster(`Edit group ${groupName}`, (state) => {
          const assignment = state.document?.roster?.assignments.find(
            (a) => a.id === assignmentId,
          )
          const group = assignment?.groups.find((g) => g.id === groupId)
          if (group) {
            Object.assign(group, updates)
          }
        })
      },

      removeGroup: (assignmentId, groupId) => {
        const groupName =
          get()
            .document?.roster?.assignments.find(
              (assignment) => assignment.id === assignmentId,
            )
            ?.groups.find((group) => group.id === groupId)?.name ?? "group"
        mutateRoster(`Delete group ${groupName}`, (state) => {
          const assignment = state.document?.roster?.assignments.find(
            (a) => a.id === assignmentId,
          )
          if (assignment) {
            assignment.groups = assignment.groups.filter(
              (g) => g.id !== groupId,
            )
          }
        })
      },

      // Roster replacement (for imports)
      setRoster: (roster, description = "Update roster") => {
        mutateDocument(description, (state) => {
          if (state.document) {
            state.document.roster = roster
            state.selectedAssignmentId = roster.assignments[0]?.id ?? null
          }
        })
        set((state) => {
          state.assignmentValidation = null
          state.assignmentValidations = {}
        })
      },

      // Validation
      validateRoster: async () => {
        const { document } = get()
        if (!document?.roster) {
          set((state) => {
            state.rosterValidation = null
          })
          return
        }
        try {
          const result = await commands.validateRoster(document.roster)
          if (result.status === "ok") {
            set((state) => {
              state.rosterValidation = result.data
            })
          }
        } catch (err) {
          console.error("Roster validation error:", err)
        }
      },

      validateAssignment: async () => {
        const { document, selectedAssignmentId } = get()
        const roster = document?.roster
        if (!roster) {
          set((state) => {
            state.assignmentValidation = null
            state.assignmentValidations = {}
          })
          return
        }
        try {
          const validations = await Promise.all(
            roster.assignments.map(async (assignment) => {
              const result = await commands.validateAssignment(
                document.resolvedIdentityMode,
                roster,
                assignment.id,
              )
              if (result.status === "ok") {
                return [assignment.id, result.data] as const
              }
              return null
            }),
          )
          const map: Record<AssignmentId, ValidationResult> = {}
          for (const entry of validations) {
            if (entry) {
              map[entry[0]] = entry[1]
            }
          }
          set((state) => {
            state.assignmentValidations = map
            state.assignmentValidation = selectedAssignmentId
              ? (map[selectedAssignmentId] ?? null)
              : null
          })
        } catch (err) {
          console.error("Assignment validation error:", err)
        }
      },

      _triggerRosterValidation: () => {
        scheduleRosterValidation()
      },

      _triggerAssignmentValidation: () => {
        scheduleAssignmentValidation()
      },

      setCoverageReport: (report) =>
        set((state) => {
          state.coverageReport = report
        }),

      updateResolvedIdentityMode: () =>
        set((state) => {
          if (state.document) {
            state.document.resolvedIdentityMode = resolveIdentityMode(
              state.document.settings.git_connection ?? null,
            )
          }
        }),

      undo: () => {
        const { history, future, document, selectedAssignmentId } = get()
        if (history.length === 0) return null
        const entry = history[history.length - 1]
        const current: UndoState = { document, selectedAssignmentId }
        const nextState = applyPatches(current, entry.inversePatches)

        set((state) => {
          state.document = nextState.document
          state.selectedAssignmentId = nextState.selectedAssignmentId
          state.history = history.slice(0, -1)
          state.future = [entry, ...future]
        })

        scheduleRosterValidation()
        scheduleAssignmentValidation()
        return entry
      },

      redo: () => {
        const { history, future, document, selectedAssignmentId } = get()
        if (future.length === 0) return null
        const entry = future[0]
        const current: UndoState = { document, selectedAssignmentId }
        const nextState = applyPatches(current, entry.patches)

        set((state) => {
          state.document = nextState.document
          state.selectedAssignmentId = nextState.selectedAssignmentId
          state.history = [...history, entry].slice(-HISTORY_LIMIT)
          state.future = future.slice(1)
        })

        scheduleRosterValidation()
        scheduleAssignmentValidation()
        return entry
      },

      clearHistory: () =>
        set((state) => {
          state.history = []
          state.future = []
        }),

      reset: () => set(initialState),
    }
  }),
)

// Selectors
export const selectDocument = (state: ProfileStore) => state.document
export const selectSettings = (state: ProfileStore) =>
  state.document?.settings ?? null
export const selectRoster = (state: ProfileStore) =>
  state.document?.roster ?? null
export const selectStudents = (state: ProfileStore) =>
  state.document?.roster?.students ?? EMPTY_STUDENTS
export const selectAssignments = (state: ProfileStore) =>
  state.document?.roster?.assignments ?? EMPTY_ASSIGNMENTS
export const selectSelectedAssignmentId = (state: ProfileStore) =>
  state.selectedAssignmentId
export const selectSelectedAssignment = (state: ProfileStore) =>
  state.document?.roster?.assignments.find(
    (a) => a.id === state.selectedAssignmentId,
  ) ?? null
export const selectGroups = (state: ProfileStore) =>
  selectSelectedAssignment(state)?.groups ?? EMPTY_GROUPS
export const selectCourse = (state: ProfileStore) =>
  state.document?.settings.course ?? EMPTY_COURSE
export const selectGitConnectionRef = (state: ProfileStore) =>
  state.document?.settings.git_connection ?? null
export const selectOperations = (state: ProfileStore) =>
  state.document?.settings.operations ?? null
export const selectExports = (state: ProfileStore) =>
  state.document?.settings.exports ?? null
export const selectProfileStatus = (state: ProfileStore) => state.status
export const selectProfileError = (state: ProfileStore) => state.error
export const selectProfileWarnings = (state: ProfileStore) => state.warnings
export const selectRosterValidation = (state: ProfileStore) =>
  state.rosterValidation
export const selectAssignmentValidation = (state: ProfileStore) =>
  state.assignmentValidation
export const selectAssignmentValidations = (state: ProfileStore) =>
  state.assignmentValidations
export const selectResolvedIdentityMode = (state: ProfileStore) =>
  state.document?.resolvedIdentityMode ?? "username"
export const selectCoverageReport = (state: ProfileStore) =>
  state.coverageReport
export const selectCanUndo = (state: ProfileStore) => state.history.length > 0
export const selectCanRedo = (state: ProfileStore) => state.future.length > 0
