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
  ExportSettings,
  GitIdentityMode,
  Group,
  GroupSelectionMode,
  GroupSet,
  OperationConfigs,
  ProfileSettings,
  Roster,
  RosterMember,
  RosterMemberId,
  SystemGroupSetEnsureResult,
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
import {
  generateAssignmentId,
  generateGroupId,
  generateGroupSetId,
} from "../utils/nanoid"
import { useAppSettingsStore } from "./appSettingsStore"
import { useConnectionsStore } from "./connectionsStore"
import { useOutputStore } from "./outputStore"

type DocumentStatus = "empty" | "loading" | "loaded" | "error"

/**
 * Selection state for the assignment tab sidebar.
 * This state is NOT part of undo/redo to avoid surprising behavior.
 */
export type AssignmentSelection = { mode: "assignment"; id: AssignmentId }

/**
 * Compute the default assignment selection based on roster state.
 * Priority: first assignment > null
 */
function computeDefaultSelection(
  roster: Roster | null,
): AssignmentSelection | null {
  if (!roster) return null
  if (roster.assignments.length > 0) {
    return { mode: "assignment", id: roster.assignments[0].id }
  }
  return null
}

// Stable fallback objects to avoid infinite re-render loops in selectors
const EMPTY_COURSE: CourseInfo = { id: "", name: "" }
const EMPTY_MEMBERS: RosterMember[] = []
const EMPTY_ASSIGNMENTS: Assignment[] = []
const EMPTY_GROUPS: Group[] = []
const EMPTY_GROUP_SETS: GroupSet[] = []
const EMPTY_ROSTER_COUNTS = { students: 0, staff: 0 } as const
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

  // Profile-scoped selection (NOT part of undo/redo)
  assignmentSelection: AssignmentSelection | null

  // System group sets readiness
  systemSetsReady: boolean

  // Validation results (computed on changes, debounced)
  rosterValidation: ValidationResult | null
  assignmentValidation: ValidationResult | null
  assignmentValidations: Record<AssignmentId, ValidationResult>

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
  setCourseVerifiedAt: (timestamp: string | null) => void
  setGitConnection: (name: string | null) => void
  updateOperations: (operations: Partial<OperationConfigs>) => void
  setOperations: (operations: OperationConfigs) => void
  updateExports: (exports: Partial<ExportSettings>) => void
  setExports: (exports: ExportSettings) => void

  // Member CRUD
  addMember: (member: RosterMember) => void
  updateMember: (id: RosterMemberId, updates: Partial<RosterMember>) => void
  removeMember: (id: RosterMemberId) => void

  // Backward-compat aliases
  /** @deprecated Use addMember */
  addStudent: (member: RosterMember) => void
  /** @deprecated Use updateMember */
  updateStudent: (id: RosterMemberId, updates: Partial<RosterMember>) => void
  /** @deprecated Use removeMember */
  removeStudent: (id: RosterMemberId) => void

  // Assignment CRUD
  addAssignment: (
    assignment: Assignment,
    options?: { select?: boolean },
  ) => void
  createAssignment: (
    assignment: Omit<Assignment, "id">,
    options?: { select?: boolean },
  ) => AssignmentId
  updateAssignment: (
    id: AssignmentId,
    updates: Partial<AssignmentMetadata>,
  ) => void
  deleteAssignment: (id: AssignmentId) => void

  // Selection (not part of undo/redo)
  setAssignmentSelection: (selection: AssignmentSelection | null) => void
  /** @deprecated Use setAssignmentSelection instead */
  selectAssignment: (id: AssignmentId | null) => void

  // Group CRUD (top-level)
  createGroup: (
    groupSetId: string,
    name: string,
    memberIds: RosterMemberId[],
  ) => string | null
  updateGroup: (groupId: string, updates: Partial<Group>) => void
  deleteGroup: (groupId: string) => void
  addGroupToSet: (groupSetId: string, groupId: string) => void
  removeGroupFromSet: (groupSetId: string, groupId: string) => void

  // Member move/copy between groups
  moveMemberToGroup: (
    memberId: RosterMemberId,
    sourceGroupId: string,
    targetGroupId: string,
  ) => void
  copyMemberToGroup: (memberId: RosterMemberId, targetGroupId: string) => void
  createGroupSetWithMember: (
    memberId: RosterMemberId,
    sourceGroupId: string | null,
    mode: "move" | "copy",
  ) => string | null
  createGroupInSetWithMember: (
    memberId: RosterMemberId,
    groupSetId: string,
    sourceGroupId: string | null,
    mode: "move" | "copy",
  ) => string | null

  // Group set CRUD
  createLocalGroupSet: (name: string, groupIds?: string[]) => string | null
  copyGroupSet: (groupSetId: string) => string | null
  renameGroupSet: (groupSetId: string, name: string) => void
  deleteGroupSet: (groupSetId: string) => void
  updateGroupSetSelection: (
    groupSetId: string,
    groupSelection: GroupSelectionMode,
  ) => void

  // Roster replacement (for imports)
  setRoster: (roster: Roster, description?: string) => void

  // Normalization and system groups
  normalizeRoster: () => void
  ensureSystemGroupSets: () => Promise<void>

  // Internal helpers
  cleanupOrphanedGroups: () => void

  // Validation (debounced, called after mutations)
  validateRoster: () => Promise<void>
  validateAssignment: () => Promise<void>
  _triggerRosterValidation: () => void
  _triggerAssignmentValidation: () => void

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
  // Note: assignmentSelection is NOT part of undo/redo
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

function emptyRoster(): Roster {
  return {
    connection: null,
    students: [],
    staff: [],
    groups: [],
    group_sets: [],
    assignments: [],
  }
}

const initialState: ProfileState = {
  document: null,
  status: "empty",
  error: null,
  warnings: [],
  assignmentSelection: null,
  systemSetsReady: false,
  rosterValidation: null,
  assignmentValidation: null,
  assignmentValidations: {},
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

        const { setActiveProfileForCourse, setCourseStatus } =
          useConnectionsStore.getState()
        const { appendText } = useOutputStore.getState()

        setActiveProfileForCourse(profileName)

        try {
          const [settingsResult, rosterResult] = await Promise.all([
            commands.loadProfile(profileName),
            commands.getRoster(profileName),
          ])

          if (currentLoadId !== loadSequence) {
            return {
              ok: false,
              warnings: [],
              error: null,
              profileName,
              stale: true,
            }
          }

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
                state.assignmentSelection = null
                state.systemSetsReady = false
                state.rosterValidation = null
                state.assignmentValidation = null
                state.assignmentValidations = {}
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
              state.assignmentSelection = null
              state.systemSetsReady = false
              state.rosterValidation = null
              state.assignmentValidation = null
              state.assignmentValidations = {}
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
            state.assignmentSelection = computeDefaultSelection(roster)
            state.systemSetsReady = false
            state.assignmentValidation = null
            state.assignmentValidations = {}
            state.history = []
            state.future = []
          })

          if (settings.course_verified_at) {
            setCourseStatus(profileName, "verified")
          }

          if (warnings.length > 0) {
            for (const warning of warnings) {
              appendText(`${warning}`, "warning")
            }
          }

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
          const result = await commands.saveProfileAndRoster(
            profileName,
            document.settings,
            document.roster,
          )
          if (result.status === "error") {
            set((state) => {
              state.status = "loaded"
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
            state.status = "loaded"
            state.error = message
          })
          return false
        }
      },

      setDocument: (document) =>
        set((state) => {
          state.document = document
          state.status = "loaded"
          state.assignmentSelection = computeDefaultSelection(document.roster)
          state.systemSetsReady = false
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
          state.assignmentSelection = null
          state.systemSetsReady = false
          state.rosterValidation = null
          state.assignmentValidation = null
          state.assignmentValidations = {}
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

      setCourseVerifiedAt: (timestamp) =>
        set((state) => {
          if (state.document) {
            state.document.settings.course_verified_at = timestamp
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

      // Member CRUD
      addMember: (member) => {
        const description = `Add member ${member.name}`
        const shouldSetLoaded = !get().document
        const addToStudents = member.enrollment_type === "student"
        mutateRoster(description, (state) => {
          if (!state.document) {
            state.document = {
              settings: {
                course: { id: "", name: "" },
                git_connection: null,
                operations: { ...defaultOperations },
                exports: { ...defaultExports },
              },
              roster: {
                ...emptyRoster(),
                students: addToStudents ? [member] : [],
                staff: addToStudents ? [] : [member],
              },
              resolvedIdentityMode: "username",
            }
          } else if (!state.document.roster) {
            state.document.roster = {
              ...emptyRoster(),
              students: addToStudents ? [member] : [],
              staff: addToStudents ? [] : [member],
            }
          } else {
            if (addToStudents) {
              state.document.roster.students.push(member)
            } else {
              state.document.roster.staff.push(member)
            }
          }
        })
        if (shouldSetLoaded) {
          set((state) => {
            state.status = "loaded"
          })
        }
      },

      updateMember: (id, updates) => {
        const memberName =
          get().document?.roster?.students.find((m) => m.id === id)?.name ??
          get().document?.roster?.staff.find((m) => m.id === id)?.name ??
          "member"
        mutateRoster(`Edit member ${memberName}`, (state) => {
          const roster = state.document?.roster
          if (!roster) return

          const studentIndex = roster.students.findIndex((m) => m.id === id)
          const staffIndex = roster.staff.findIndex((m) => m.id === id)
          const isInStudents = studentIndex >= 0
          const isInStaff = staffIndex >= 0
          if (!isInStudents && !isInStaff) return

          const current = isInStudents
            ? roster.students[studentIndex]
            : roster.staff[staffIndex]
          const updatedMember = { ...current, ...updates }
          const shouldBeStudent = updatedMember.enrollment_type === "student"

          if (isInStudents && !shouldBeStudent) {
            roster.students.splice(studentIndex, 1)
            roster.staff.push(updatedMember)
            return
          }
          if (isInStaff && shouldBeStudent) {
            roster.staff.splice(staffIndex, 1)
            roster.students.push(updatedMember)
            return
          }
          if (isInStudents) {
            roster.students[studentIndex] = updatedMember
          } else {
            roster.staff[staffIndex] = updatedMember
          }
        })
      },

      removeMember: (id) => {
        const memberName =
          get().document?.roster?.students.find((m) => m.id === id)?.name ??
          get().document?.roster?.staff.find((m) => m.id === id)?.name ??
          "member"
        mutateRoster(`Remove member ${memberName}`, (state) => {
          if (!state.document?.roster) return
          state.document.roster.students =
            state.document.roster.students.filter((m) => m.id !== id)
          state.document.roster.staff = state.document.roster.staff.filter(
            (m) => m.id !== id,
          )
          // Cascade: remove from all top-level group member_ids
          for (const group of state.document.roster.groups) {
            group.member_ids = group.member_ids.filter((m) => m !== id)
          }
        })
      },

      // Backward-compat aliases
      addStudent: (member) => get().addMember(member),
      updateStudent: (id, updates) => get().updateMember(id, updates),
      removeStudent: (id) => get().removeMember(id),

      // Assignment CRUD
      addAssignment: (assignment, options) => {
        mutateRoster(`Add assignment ${assignment.name}`, (state) => {
          if (!state.document) return
          if (!state.document.roster) {
            state.document.roster = {
              ...emptyRoster(),
              assignments: [assignment],
            }
          } else {
            state.document.roster.assignments.push(assignment)
          }
        })
        if (options?.select) {
          set((s) => {
            s.assignmentSelection = { mode: "assignment", id: assignment.id }
          })
        }
      },

      createAssignment: (assignmentData, options) => {
        const id = generateAssignmentId()
        const assignment: Assignment = { ...assignmentData, id }
        get().addAssignment(assignment, options)
        return id
      },

      updateAssignment: (id, updates) => {
        const assignmentName =
          get().document?.roster?.assignments.find((a) => a.id === id)?.name ??
          "assignment"
        mutateRoster(`Edit assignment ${assignmentName}`, (state) => {
          const assignment = state.document?.roster?.assignments.find(
            (a) => a.id === id,
          )
          if (!assignment) return
          Object.assign(assignment, updates)
        })
      },

      deleteAssignment: (id) => {
        const assignmentName =
          get().document?.roster?.assignments.find((a) => a.id === id)?.name ??
          "assignment"
        const currentSelection = get().assignmentSelection
        mutateRoster(`Delete assignment ${assignmentName}`, (state) => {
          if (!state.document?.roster) return
          state.document.roster.assignments =
            state.document.roster.assignments.filter((a) => a.id !== id)
        })
        if (
          currentSelection?.mode === "assignment" &&
          currentSelection.id === id
        ) {
          const roster = get().document?.roster ?? null
          set((s) => {
            s.assignmentSelection = computeDefaultSelection(roster)
          })
        }
      },

      setAssignmentSelection: (selection) => {
        set((state) => {
          state.assignmentSelection = selection
          if (selection?.mode === "assignment") {
            state.assignmentValidation =
              state.assignmentValidations[selection.id] ?? null
          } else {
            state.assignmentValidation = null
          }
        })
        scheduleAssignmentValidation()
      },

      /** @deprecated Use setAssignmentSelection instead */
      selectAssignment: (id) => {
        set((state) => {
          state.assignmentSelection = id ? { mode: "assignment", id } : null
          state.assignmentValidation = id
            ? (state.assignmentValidations[id] ?? null)
            : null
        })
        scheduleAssignmentValidation()
      },

      // Group CRUD (top-level)
      createGroup: (groupSetId, name, memberIds) => {
        const groupId = generateGroupId()
        mutateRoster(`Create group ${name}`, (state) => {
          const roster = state.document?.roster
          if (!roster) return
          const groupSet = roster.group_sets.find((gs) => gs.id === groupSetId)
          if (!groupSet) return

          const group: Group = {
            id: groupId,
            name,
            member_ids: [...memberIds],
            origin: "local",
            lms_group_id: null,
          }
          roster.groups.push(group)
          groupSet.group_ids.push(groupId)
        })
        return groupId
      },

      updateGroup: (groupId, updates) => {
        mutateRoster("Edit group", (state) => {
          const group = state.document?.roster?.groups.find(
            (g) => g.id === groupId,
          )
          if (!group) return
          // Only allow editing local groups
          if (group.origin !== "local") return
          Object.assign(group, updates)
        })
      },

      deleteGroup: (groupId) => {
        mutateRoster("Delete group", (state) => {
          const roster = state.document?.roster
          if (!roster) return
          // Remove the group entity
          roster.groups = roster.groups.filter((g) => g.id !== groupId)
          // Remove from all group sets
          for (const gs of roster.group_sets) {
            gs.group_ids = gs.group_ids.filter((id) => id !== groupId)
          }
        })
      },

      addGroupToSet: (groupSetId, groupId) => {
        mutateRoster("Add group to set", (state) => {
          const gs = state.document?.roster?.group_sets.find(
            (s) => s.id === groupSetId,
          )
          if (!gs) return
          if (!gs.group_ids.includes(groupId)) {
            gs.group_ids.push(groupId)
          }
        })
      },

      removeGroupFromSet: (groupSetId, groupId) => {
        mutateRoster("Remove group from set", (state) => {
          const gs = state.document?.roster?.group_sets.find(
            (s) => s.id === groupSetId,
          )
          if (!gs) return
          gs.group_ids = gs.group_ids.filter((id) => id !== groupId)
        })
      },

      // Member move/copy between groups
      moveMemberToGroup: (memberId, sourceGroupId, targetGroupId) => {
        mutateRoster("Move member to group", (state) => {
          const roster = state.document?.roster
          if (!roster) return
          const source = roster.groups.find((g) => g.id === sourceGroupId)
          const target = roster.groups.find((g) => g.id === targetGroupId)
          if (!source || !target) return
          if (source.origin !== "local" || target.origin !== "local") return
          source.member_ids = source.member_ids.filter((id) => id !== memberId)
          if (!target.member_ids.includes(memberId)) {
            target.member_ids.push(memberId)
          }
        })
      },

      copyMemberToGroup: (memberId, targetGroupId) => {
        mutateRoster("Copy member to group", (state) => {
          const roster = state.document?.roster
          if (!roster) return
          const target = roster.groups.find((g) => g.id === targetGroupId)
          if (!target) return
          if (target.origin !== "local") return
          if (!target.member_ids.includes(memberId)) {
            target.member_ids.push(memberId)
          }
        })
      },

      createGroupSetWithMember: (memberId, sourceGroupId, mode) => {
        const roster = get().document?.roster
        if (!roster) return null
        const member =
          roster.students.find((m) => m.id === memberId) ??
          roster.staff.find((m) => m.id === memberId)
        if (!member) return null

        // Generate unique name with collision avoidance
        const baseName = "New Group Set"
        const existingNames = new Set(roster.group_sets.map((gs) => gs.name))
        let name = baseName
        let counter = 2
        while (existingNames.has(name)) {
          name = `${baseName} (${counter})`
          counter++
        }

        const setId = generateGroupSetId()
        const groupId = generateGroupId()
        const groupName = member.name
        const description =
          mode === "move"
            ? `Move member to new group set "${name}"`
            : `Copy member to new group set "${name}"`

        mutateRoster(description, (state) => {
          const r = state.document?.roster
          if (!r) return

          const group: Group = {
            id: groupId,
            name: groupName,
            member_ids: [memberId],
            origin: "local",
            lms_group_id: null,
          }
          r.groups.push(group)

          const gs: GroupSet = {
            id: setId,
            name,
            group_ids: [groupId],
            connection: null,
            group_selection: { kind: "all", excluded_group_ids: [] },
          }
          r.group_sets.push(gs)

          if (mode === "move" && sourceGroupId) {
            const source = r.groups.find((g) => g.id === sourceGroupId)
            if (source && source.origin === "local") {
              source.member_ids = source.member_ids.filter(
                (id) => id !== memberId,
              )
            }
          }
        })

        return setId
      },

      createGroupInSetWithMember: (
        memberId,
        groupSetId,
        sourceGroupId,
        mode,
      ) => {
        const roster = get().document?.roster
        if (!roster) return null
        const member =
          roster.students.find((m) => m.id === memberId) ??
          roster.staff.find((m) => m.id === memberId)
        if (!member) return null

        const groupId = generateGroupId()
        const groupName = member.name
        const description =
          mode === "move"
            ? `Move member to new group "${groupName}"`
            : `Copy member to new group "${groupName}"`

        mutateRoster(description, (state) => {
          const r = state.document?.roster
          if (!r) return
          const gs = r.group_sets.find((s) => s.id === groupSetId)
          if (!gs) return

          const group: Group = {
            id: groupId,
            name: groupName,
            member_ids: [memberId],
            origin: "local",
            lms_group_id: null,
          }
          r.groups.push(group)
          gs.group_ids.push(groupId)

          if (mode === "move" && sourceGroupId) {
            const source = r.groups.find((g) => g.id === sourceGroupId)
            if (source && source.origin === "local") {
              source.member_ids = source.member_ids.filter(
                (id) => id !== memberId,
              )
            }
          }
        })

        return groupId
      },

      // Group set CRUD
      createLocalGroupSet: (name, groupIds) => {
        if (!name.trim()) return null
        const setId = generateGroupSetId()
        mutateRoster(`Create group set ${name}`, (state) => {
          const roster = state.document?.roster
          if (!roster) return
          const gs: GroupSet = {
            id: setId,
            name: name.trim(),
            group_ids: groupIds ?? [],
            connection: null,
            group_selection: { kind: "all", excluded_group_ids: [] },
          }
          roster.group_sets.push(gs)
        })
        return setId
      },

      copyGroupSet: (groupSetId) => {
        const source = get().document?.roster?.group_sets.find(
          (gs) => gs.id === groupSetId,
        )
        if (!source) return null
        const newId = generateGroupSetId()
        mutateRoster(`Copy group set ${source.name}`, (state) => {
          const roster = state.document?.roster
          if (!roster) return
          const copy: GroupSet = {
            id: newId,
            name: `${source.name} (copy)`,
            group_ids: [...source.group_ids],
            connection: null,
            group_selection: structuredClone(source.group_selection),
          }
          roster.group_sets.push(copy)
        })
        return newId
      },

      renameGroupSet: (groupSetId, name) => {
        const trimmed = name.trim()
        if (!trimmed) return
        mutateRoster(`Rename group set ${trimmed}`, (state) => {
          const gs = state.document?.roster?.group_sets.find(
            (s) => s.id === groupSetId,
          )
          if (!gs) return
          // Only allow renaming non-system group sets
          if (gs.connection?.kind === "system") {
            return
          }
          gs.name = trimmed
        })
      },

      deleteGroupSet: (groupSetId) => {
        mutateRoster("Delete group set", (state) => {
          const roster = state.document?.roster
          if (!roster) return
          const gs = roster.group_sets.find((s) => s.id === groupSetId)
          if (!gs) return
          // Only allow deleting non-system group sets
          if (gs.connection?.kind === "system") {
            return
          }
          // Remove group set
          roster.group_sets = roster.group_sets.filter(
            (s) => s.id !== groupSetId,
          )
          // Collect group IDs that are only in this set
          const remainingGroupIds = new Set(
            roster.group_sets.flatMap((s) => s.group_ids),
          )
          const orphanedGroupIds = gs.group_ids.filter(
            (gid) => !remainingGroupIds.has(gid),
          )
          // Remove orphaned groups
          if (orphanedGroupIds.length > 0) {
            const orphanSet = new Set(orphanedGroupIds)
            roster.groups = roster.groups.filter((g) => !orphanSet.has(g.id))
          }
        })
      },

      updateGroupSetSelection: (groupSetId, groupSelection) => {
        mutateRoster("Update group set selection", (state) => {
          const gs = state.document?.roster?.group_sets.find(
            (s) => s.id === groupSetId,
          )
          if (!gs) return
          gs.group_selection = groupSelection
        })
      },

      // Roster replacement (for imports)
      setRoster: (roster, description = "Update roster") => {
        mutateDocument(description, (state) => {
          if (state.document) {
            state.document.roster = roster
          }
        })
        const currentSelection = get().assignmentSelection
        set((state) => {
          // Re-ensure system group sets for replaced rosters (sync/import paths).
          state.systemSetsReady = false
          if (currentSelection?.mode === "assignment") {
            const stillExists = roster.assignments.some(
              (a) => a.id === currentSelection.id,
            )
            if (!stillExists) {
              state.assignmentSelection = computeDefaultSelection(roster)
            }
          } else {
            state.assignmentSelection = computeDefaultSelection(roster)
          }
          state.assignmentValidation = null
          state.assignmentValidations = {}
        })
      },

      normalizeRoster: () => {
        // On load, ensure roster has all required fields
        mutateDocument("Normalize roster", (state) => {
          const roster = state.document?.roster
          if (!roster) return
          if (!roster.staff) roster.staff = []
          if (!roster.groups) roster.groups = []
          if (!roster.group_sets) roster.group_sets = []
        })
      },

      ensureSystemGroupSets: async () => {
        const { document } = get()
        if (!document?.roster) return

        try {
          const result = await commands.ensureSystemGroupSets(document.roster)
          if (result.status !== "ok") return

          const patch = result.data as SystemGroupSetEnsureResult

          // Apply the system group set ensure result directly (no undo entry)
          set((state) => {
            const roster = state.document?.roster
            if (!roster) return

            // Upsert groups
            const existingGroupIds = new Set(roster.groups.map((g) => g.id))
            for (const group of patch.groups_upserted) {
              if (existingGroupIds.has(group.id)) {
                const idx = roster.groups.findIndex((g) => g.id === group.id)
                if (idx >= 0) roster.groups[idx] = group
              } else {
                roster.groups.push(group)
              }
            }

            // Delete groups
            if (patch.deleted_group_ids.length > 0) {
              const deleteSet = new Set(patch.deleted_group_ids)
              roster.groups = roster.groups.filter((g) => !deleteSet.has(g.id))
            }

            // Upsert group sets
            const existingSetIds = new Set(roster.group_sets.map((gs) => gs.id))
            for (const gs of patch.group_sets) {
              if (existingSetIds.has(gs.id)) {
                const idx = roster.group_sets.findIndex((s) => s.id === gs.id)
                if (idx >= 0) roster.group_sets[idx] = gs
              } else {
                roster.group_sets.push(gs)
              }
            }

            // Deduplicate system sets by system_type.
            // Prefer IDs returned by the latest ensure_system_group_sets patch.
            const preferredSystemSetIdByType = new Map<
              "individual_students" | "staff",
              string
            >()
            for (const gs of patch.group_sets) {
              const connection = gs.connection
              if (connection?.kind === "system") {
                preferredSystemSetIdByType.set(connection.system_type, gs.id)
              }
            }

            for (const gs of roster.group_sets) {
              const connection = gs.connection
              if (
                connection?.kind === "system" &&
                !preferredSystemSetIdByType.has(connection.system_type)
              ) {
                preferredSystemSetIdByType.set(connection.system_type, gs.id)
              }
            }

            if (preferredSystemSetIdByType.size > 0) {
              const seenSystemTypes = new Set<"individual_students" | "staff">()
              roster.group_sets = roster.group_sets.filter((gs) => {
                const connection = gs.connection
                if (connection?.kind !== "system") return true

                const preferredId = preferredSystemSetIdByType.get(
                  connection.system_type,
                )
                if (preferredId && gs.id !== preferredId) return false
                if (seenSystemTypes.has(connection.system_type)) return false
                seenSystemTypes.add(connection.system_type)
                return true
              })

              const referencedGroupIds = new Set(
                roster.group_sets.flatMap((groupSet) => groupSet.group_ids),
              )
              roster.groups = roster.groups.filter((group) =>
                referencedGroupIds.has(group.id),
              )
            }

            state.systemSetsReady = true
          })
        } catch (err) {
          console.error("Failed to ensure system group sets:", err)
        }
      },

      cleanupOrphanedGroups: () => {
        mutateDocument("Cleanup orphaned groups", (state) => {
          const roster = state.document?.roster
          if (!roster) return
          const referencedGroupIds = new Set(
            roster.group_sets.flatMap((gs) => gs.group_ids),
          )
          roster.groups = roster.groups.filter((g) =>
            referencedGroupIds.has(g.id),
          )
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
        const { document, assignmentSelection } = get()
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
          const selectedAssignmentId =
            assignmentSelection?.mode === "assignment"
              ? assignmentSelection.id
              : null
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

      updateResolvedIdentityMode: () =>
        set((state) => {
          if (state.document) {
            state.document.resolvedIdentityMode = resolveIdentityMode(
              state.document.settings.git_connection ?? null,
            )
          }
        }),

      undo: () => {
        const { history, future, document } = get()
        if (history.length === 0) return null
        const entry = history[history.length - 1]
        const current: UndoState = { document }
        const nextState = applyPatches(current, entry.inversePatches)

        set((state) => {
          state.document = nextState.document
          state.history = history.slice(0, -1)
          state.future = [entry, ...future]
        })

        scheduleRosterValidation()
        scheduleAssignmentValidation()
        return entry
      },

      redo: () => {
        const { history, future, document } = get()
        if (future.length === 0) return null
        const entry = future[0]
        const current: UndoState = { document }
        const nextState = applyPatches(current, entry.patches)

        set((state) => {
          state.document = nextState.document
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

// Member selectors
export const selectStudents = (state: ProfileStore) =>
  state.document?.roster?.students ?? EMPTY_MEMBERS
export const selectRosterStudents = (state: ProfileStore) =>
  state.document?.roster?.students ?? EMPTY_MEMBERS
export const selectRosterStaff = (state: ProfileStore) =>
  state.document?.roster?.staff ?? EMPTY_MEMBERS
let lastRosterForCounts: Roster | null = null
let lastRosterCounts: { students: number; staff: number } = EMPTY_ROSTER_COUNTS
export const selectRosterCounts = (state: ProfileStore) => {
  const roster = state.document?.roster ?? null
  if (!roster) {
    lastRosterForCounts = null
    lastRosterCounts = EMPTY_ROSTER_COUNTS
    return lastRosterCounts
  }
  if (roster === lastRosterForCounts) return lastRosterCounts
  lastRosterForCounts = roster
  lastRosterCounts = {
    students: roster.students.length,
    staff: roster.staff.length,
  }
  return lastRosterCounts
}
export const selectRosterMemberById =
  (id: RosterMemberId) => (state: ProfileStore) => {
    const roster = state.document?.roster
    if (!roster) return null
    return (
      roster.students.find((m) => m.id === id) ??
      roster.staff.find((m) => m.id === id) ??
      null
    )
  }

// Group selectors
export const selectGroups = (state: ProfileStore) =>
  state.document?.roster?.groups ?? EMPTY_GROUPS
export const selectGroupById = (id: string) => (state: ProfileStore) =>
  state.document?.roster?.groups.find((g) => g.id === id) ?? null
export const selectGroupsForGroupSet = (gsId: string) => {
  let lastRoster: Roster | null = null
  let lastGroups: Group[] = EMPTY_GROUPS

  return (state: ProfileStore) => {
    const roster = state.document?.roster
    if (!roster) return EMPTY_GROUPS
    if (roster === lastRoster) return lastGroups

    const gs = roster.group_sets.find((s) => s.id === gsId)
    if (!gs) return EMPTY_GROUPS
    const groupMap = new Map(roster.groups.map((g) => [g.id, g]))
    lastGroups = gs.group_ids
      .map((gid) => groupMap.get(gid))
      .filter((g): g is Group => !!g)
    lastRoster = roster
    return lastGroups
  }
}
export const selectIsGroupEditable =
  (groupId: string) => (state: ProfileStore) => {
    const group = state.document?.roster?.groups.find((g) => g.id === groupId)
    return group?.origin === "local"
  }
export const selectGroupReferenceCount =
  (groupId: string) => (state: ProfileStore) => {
    const roster = state.document?.roster
    if (!roster) return 0
    return roster.group_sets.filter((gs) => gs.group_ids.includes(groupId))
      .length
  }

// Group set selectors
export const selectGroupSets = (state: ProfileStore) =>
  state.document?.roster?.group_sets ?? EMPTY_GROUP_SETS
export const selectGroupSetById = (id: string) => (state: ProfileStore) =>
  state.document?.roster?.group_sets.find((gs) => gs.id === id) ?? null
export const selectIsGroupSetEditable =
  (gsId: string) => (state: ProfileStore) => {
    const gs = state.document?.roster?.group_sets.find((s) => s.id === gsId)
    if (!gs) return false
    const connection = gs.connection
    if (!connection) return true // local sets are editable
    return connection.kind !== "system"
  }
export const selectSystemGroupSet =
  (systemType: "individual_students" | "staff") => (state: ProfileStore) => {
    const roster = state.document?.roster
    if (!roster) return null
    return (
      roster.group_sets.find((gs) => {
        const connection = gs.connection
        return (
          connection?.kind === "system" && connection.system_type === systemType
        )
      }) ?? null
    )
  }
let lastRosterForConnected: Roster | null = null
let lastConnectedGroupSets: GroupSet[] = EMPTY_GROUP_SETS
export const selectConnectedGroupSets = (state: ProfileStore) => {
  const roster = state.document?.roster
  if (!roster) return EMPTY_GROUP_SETS
  if (roster === lastRosterForConnected) return lastConnectedGroupSets
  lastRosterForConnected = roster
  lastConnectedGroupSets = roster.group_sets.filter((gs) => {
    const connection = gs.connection
    return connection?.kind === "canvas" || connection?.kind === "moodle"
  })
  return lastConnectedGroupSets
}
let lastRosterForLocal: Roster | null = null
let lastLocalGroupSets: GroupSet[] = EMPTY_GROUP_SETS
export const selectLocalGroupSets = (state: ProfileStore) => {
  const roster = state.document?.roster
  if (!roster) return EMPTY_GROUP_SETS
  if (roster === lastRosterForLocal) return lastLocalGroupSets
  lastRosterForLocal = roster
  lastLocalGroupSets = roster.group_sets.filter((gs) => {
    const connection = gs.connection
    return connection === null || connection.kind === "import"
  })
  return lastLocalGroupSets
}
export const selectAssignmentsForGroupSet = (gsId: string) => {
  let lastRoster: Roster | null = null
  let lastAssignments: Assignment[] = EMPTY_ASSIGNMENTS
  return (state: ProfileStore) => {
    const roster = state.document?.roster
    if (!roster) return EMPTY_ASSIGNMENTS
    if (roster === lastRoster) return lastAssignments
    lastRoster = roster
    lastAssignments = roster.assignments.filter((a) => a.group_set_id === gsId)
    return lastAssignments
  }
}
export const selectSystemSetsReady = (state: ProfileStore) =>
  state.systemSetsReady

// Assignment selectors
export const selectAssignments = (state: ProfileStore) =>
  state.document?.roster?.assignments ?? EMPTY_ASSIGNMENTS
export const selectAssignmentSelection = (state: ProfileStore) =>
  state.assignmentSelection

// Settings selectors
export const selectCourse = (state: ProfileStore) =>
  state.document?.settings.course ?? EMPTY_COURSE
export const selectGitConnectionRef = (state: ProfileStore) =>
  state.document?.settings.git_connection ?? null
export const selectOperations = (state: ProfileStore) =>
  state.document?.settings.operations ?? null
export const selectExports = (state: ProfileStore) =>
  state.document?.settings.exports ?? null

// Status selectors
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
export const selectCanUndo = (state: ProfileStore) => state.history.length > 0
export const selectCanRedo = (state: ProfileStore) => state.future.length > 0
export const selectNextUndoDescription = (state: ProfileStore) =>
  state.history.length > 0
    ? state.history[state.history.length - 1].description
    : null
export const selectNextRedoDescription = (state: ProfileStore) =>
  state.future.length > 0 ? state.future[0].description : null

// Move/copy target selector
export interface EditableGroupTarget {
  groupSetId: string
  groupSetName: string
  groups: Array<{ id: string; name: string }>
}
const EMPTY_EDITABLE_TARGETS: EditableGroupTarget[] = []
let lastRosterForEditable: Roster | null = null
let lastEditableTargets: EditableGroupTarget[] = EMPTY_EDITABLE_TARGETS
export const selectEditableGroupsByGroupSet = (state: ProfileStore) => {
  const roster = state.document?.roster
  if (!roster) return EMPTY_EDITABLE_TARGETS
  if (roster === lastRosterForEditable) return lastEditableTargets
  lastRosterForEditable = roster

  const editableGroupIds = new Set(
    roster.groups.filter((g) => g.origin === "local").map((g) => g.id),
  )
  const groupMap = new Map(roster.groups.map((g) => [g.id, g]))

  lastEditableTargets = roster.group_sets
    .filter((gs) => gs.connection?.kind !== "system")
    .map((gs) => {
      const editableGroups = gs.group_ids.flatMap((gid) => {
        if (!editableGroupIds.has(gid)) return []
        const g = groupMap.get(gid)
        if (!g) return []
        return [{ id: g.id, name: g.name }]
      })
      return {
        groupSetId: gs.id,
        groupSetName: gs.name,
        groups: editableGroups,
      }
    })
    .filter((entry) => entry.groups.length > 0)

  return lastEditableTargets
}
