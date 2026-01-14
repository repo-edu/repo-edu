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

  // Coverage report
  coverageReport: CoverageReport | null
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

  // Roster replacement (for imports)
  setRoster: (roster: Roster) => void

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
  coverageReport: null,
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

    // Wrapper for roster mutations - triggers validation after mutation
    const mutateRoster = (fn: (state: ProfileState) => void) => {
      set(fn)
      scheduleRosterValidation()
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

        const { lmsConnection } = useAppSettingsStore.getState()
        const { setCourseStatus, resetCourseStatus } =
          useConnectionsStore.getState()
        const { appendText } = useOutputStore.getState()

        resetCourseStatus()

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

          // Handle errors
          if (
            settingsResult.status === "error" ||
            rosterResult.status === "error"
          ) {
            const errors: string[] = []
            if (settingsResult.status === "error") {
              errors.push(`settings: ${settingsResult.error.message}`)
            }
            if (rosterResult.status === "error") {
              errors.push(`roster: ${rosterResult.error.message}`)
            }
            const error = errors.join("; ") || "Failed to load profile"

            // Try loading defaults on settings failure
            if (settingsResult.status === "error") {
              try {
                const defaults = await commands.getDefaultSettings()
                const resolvedMode = resolveIdentityMode(
                  defaults.git_connection ?? null,
                )
                set((state) => {
                  state.document = {
                    settings: defaults,
                    roster:
                      rosterResult.status === "ok" ? rosterResult.data : null,
                    resolvedIdentityMode: resolvedMode,
                  }
                  state.status = "loaded"
                  state.selectedAssignmentId =
                    rosterResult.status === "ok"
                      ? (rosterResult.data?.assignments[0]?.id ?? null)
                      : null
                })
              } catch {
                set((state) => {
                  state.status = "error"
                  state.error = error
                })
              }
            }

            appendText(
              `Failed to load profile '${profileName}': ${error}`,
              "error",
            )
            return { ok: false, warnings: [], error, profileName, stale: false }
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
          })

          // Log warnings
          if (warnings.length > 0) {
            for (const warning of warnings) {
              appendText(`${warning}`, "warning")
            }
          }

          // Trigger initial validation
          scheduleRosterValidation()

          // Verify course if LMS connected
          if (lmsConnection && settings.course.id.trim()) {
            setCourseStatus("verifying")
            try {
              const result = await commands.verifyProfileCourse(profileName)
              if (currentLoadId !== loadSequence) {
                return {
                  ok: true,
                  warnings,
                  error: null,
                  profileName,
                  stale: true,
                }
              }
              if (result.status === "error") {
                setCourseStatus("failed", result.error.message)
              } else {
                const { success, message, updated_name } = result.data
                if (!success) {
                  setCourseStatus("failed", message)
                } else {
                  if (updated_name && updated_name !== settings.course.name) {
                    set((state) => {
                      if (state.document) {
                        state.document.settings.course.name = updated_name
                      }
                    })
                    appendText(`Course name updated: ${updated_name}`, "info")
                  }
                  setCourseStatus("verified")
                }
              }
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err)
              setCourseStatus("failed", msg)
            }
          }

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
          state.coverageReport = null
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
      addStudent: (student) =>
        mutateRoster((state) => {
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
            state.status = "loaded"
          } else if (!state.document.roster) {
            state.document.roster = {
              source: null,
              students: [student],
              assignments: [],
            }
          } else {
            state.document.roster.students.push(student)
          }
        }),

      updateStudent: (id, updates) =>
        mutateRoster((state) => {
          const student = state.document?.roster?.students.find(
            (s) => s.id === id,
          )
          if (student) {
            Object.assign(student, updates)
          }
        }),

      removeStudent: (id) =>
        mutateRoster((state) => {
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
        }),

      // Assignment CRUD
      addAssignment: (assignment) =>
        mutateRoster((state) => {
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
        }),

      updateAssignment: (id, updates) =>
        mutateRoster((state) => {
          const assignment = state.document?.roster?.assignments.find(
            (a) => a.id === id,
          )
          if (assignment) {
            Object.assign(assignment, updates)
          }
        }),

      removeAssignment: (id) =>
        mutateRoster((state) => {
          if (!state.document?.roster) return
          state.document.roster.assignments =
            state.document.roster.assignments.filter((a) => a.id !== id)
          // Cleanup selection
          if (state.selectedAssignmentId === id) {
            state.selectedAssignmentId =
              state.document.roster.assignments[0]?.id ?? null
          }
        }),

      selectAssignment: (id) =>
        set((state) => {
          state.selectedAssignmentId = id
          state.assignmentValidation = null
        }),

      // Group CRUD
      addGroup: (assignmentId, group) =>
        mutateRoster((state) => {
          const assignment = state.document?.roster?.assignments.find(
            (a) => a.id === assignmentId,
          )
          if (assignment) {
            assignment.groups.push(group)
          }
        }),

      updateGroup: (assignmentId, groupId, updates) =>
        mutateRoster((state) => {
          const assignment = state.document?.roster?.assignments.find(
            (a) => a.id === assignmentId,
          )
          const group = assignment?.groups.find((g) => g.id === groupId)
          if (group) {
            Object.assign(group, updates)
          }
        }),

      removeGroup: (assignmentId, groupId) =>
        mutateRoster((state) => {
          const assignment = state.document?.roster?.assignments.find(
            (a) => a.id === assignmentId,
          )
          if (assignment) {
            assignment.groups = assignment.groups.filter(
              (g) => g.id !== groupId,
            )
          }
        }),

      // Roster replacement (for imports)
      setRoster: (roster) => {
        set((state) => {
          if (state.document) {
            state.document.roster = roster
            state.selectedAssignmentId = roster.assignments[0]?.id ?? null
          }
        })
        scheduleRosterValidation()
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
        if (!document?.roster || !selectedAssignmentId) {
          set((state) => {
            state.assignmentValidation = null
          })
          return
        }
        try {
          const result = await commands.validateAssignment(
            document.resolvedIdentityMode,
            document.roster,
            selectedAssignmentId,
          )
          if (result.status === "ok") {
            set((state) => {
              state.assignmentValidation = result.data
            })
          }
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
export const selectResolvedIdentityMode = (state: ProfileStore) =>
  state.document?.resolvedIdentityMode ?? "username"
export const selectCoverageReport = (state: ProfileStore) =>
  state.coverageReport
