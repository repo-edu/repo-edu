import type {
  Assignment,
  GitIdentityMode,
  Group,
  GroupSelectionMode,
  GroupSet,
  PersistedCourse,
  Roster,
  RosterMember,
  RosterValidationResult,
} from "@repo-edu/domain"
import {
  ensureSystemGroupSets,
  validateAssignment,
  validateRoster,
} from "@repo-edu/domain"
import type { Patch } from "immer"
import { applyPatches, enablePatches, produceWithPatches } from "immer"
import { create } from "zustand"
import { immer } from "zustand/middleware/immer"
import { getWorkflowClient } from "../contexts/workflow-client.js"
import type { ChecksStatus, DocumentStatus, IssueCard } from "../types/index.js"
import { getErrorMessage } from "../utils/error-message.js"
import { buildIssueCards } from "../utils/issues.js"
import { generateGroupId, generateGroupSetId } from "../utils/nanoid.js"

enablePatches()

const HISTORY_LIMIT = 100
const AUTOSAVE_DEBOUNCE_MS = 300
const AUTOSAVE_RETRY_DELAYS_MS = [300, 900, 2000] as const

type HistoryEntry = {
  patches: Patch[]
  inversePatches: Patch[]
  description: string
}

export type CourseState = {
  course: PersistedCourse | null
  status: DocumentStatus
  error: string | null
  warnings: string[]

  assignmentSelection: string | null
  systemSetsReady: boolean

  rosterValidation: RosterValidationResult | null
  assignmentValidations: Record<string, RosterValidationResult>
  issueCards: IssueCard[]
  checksStatus: ChecksStatus
  checksError: string | null
  checksDirty: boolean
  localVersion: number
  lastSavedRevision: number | null
  syncState: "idle" | "saving" | "error"
  syncError: string | null

  history: HistoryEntry[]
  future: HistoryEntry[]
}

type CourseActions = {
  load: (courseId: string) => Promise<void>
  save: () => Promise<boolean>
  clear: () => void

  // Roster mutations (with undo history)
  addMember: (member: RosterMember) => void
  updateMember: (id: string, updates: Partial<RosterMember>) => void
  removeMember: (id: string) => void
  deleteMemberPermanently: (id: string) => void
  setRoster: (roster: Roster, description?: string) => void

  // Assignment CRUD
  addAssignment: (assignment: Assignment) => void
  updateAssignment: (id: string, updates: Partial<Assignment>) => void
  deleteAssignment: (id: string) => void
  setAssignmentSelection: (id: string | null) => void

  // Group CRUD
  createGroup: (
    groupSetId: string,
    name: string,
    memberIds: string[],
  ) => string | null
  updateGroup: (groupId: string, updates: Partial<Group>) => void
  deleteGroup: (groupId: string) => void
  moveMemberToGroup: (
    memberId: string,
    sourceGroupId: string,
    targetGroupId: string,
  ) => void
  copyMemberToGroup: (memberId: string, targetGroupId: string) => void

  // Group set CRUD
  createLocalGroupSet: (name: string, groupIds?: string[]) => string | null
  copyGroupSet: (groupSetId: string) => string | null
  renameGroupSet: (groupSetId: string, name: string) => void
  deleteGroupSet: (groupSetId: string) => void
  removeGroupFromSet: (groupSetId: string, groupId: string) => void
  updateGroupSetSelection: (
    groupSetId: string,
    selection: GroupSelectionMode,
  ) => void
  updateGroupSetTemplate: (groupSetId: string, template: string | null) => void

  // Course metadata
  setCourseId: (courseId: string | null) => void
  setLmsConnectionName: (name: string | null) => void
  setGitConnectionId: (id: string | null) => void
  setOrganization: (organization: string | null) => void
  setRepositoryTemplate: (
    template: PersistedCourse["repositoryTemplate"],
  ) => void
  setRepositoryCloneTargetDirectory: (
    targetDirectory: PersistedCourse["repositoryCloneTargetDirectory"],
  ) => void
  setRepositoryCloneDirectoryLayout: (
    layout: PersistedCourse["repositoryCloneDirectoryLayout"],
  ) => void
  setDisplayName: (name: string) => void

  // System sets
  ensureSystemGroupSets: () => void

  // Validation
  runChecks: (identityMode: GitIdentityMode) => void

  // Undo/redo
  undo: () => HistoryEntry | null
  redo: () => HistoryEntry | null
  clearHistory: () => void
}

const initialState: CourseState = {
  course: null,
  status: "empty",
  error: null,
  warnings: [],
  assignmentSelection: null,
  systemSetsReady: false,
  rosterValidation: null,
  assignmentValidations: {},
  issueCards: [],
  checksStatus: "idle",
  checksError: null,
  checksDirty: false,
  localVersion: 0,
  lastSavedRevision: null,
  syncState: "idle",
  syncError: null,
  history: [],
  future: [],
}

export const useCourseStore = create<CourseState & CourseActions>()(
  immer((set, get) => {
    let autosaveTimer: ReturnType<typeof setTimeout> | null = null
    let saveRequested = false
    let saveWorkerRunning = false
    const idleResolvers = new Set<() => void>()

    const clearAutosaveTimer = () => {
      if (autosaveTimer !== null) {
        clearTimeout(autosaveTimer)
        autosaveTimer = null
      }
    }

    const resolveIdleWaiters = () => {
      if (saveWorkerRunning || saveRequested) {
        return
      }
      for (const resolve of idleResolvers) {
        resolve()
      }
      idleResolvers.clear()
    }

    const waitForIdle = async () => {
      if (!saveWorkerRunning && !saveRequested) {
        return
      }
      await new Promise<void>((resolve) => {
        idleResolvers.add(resolve)
      })
    }

    const isRetryableSaveError = (error: unknown): boolean => {
      const message = getErrorMessage(error).toLowerCase()
      if (message.includes("revision invariant violated")) {
        return false
      }
      if (typeof error === "object" && error !== null && "type" in error) {
        const appError = error as { type?: string; retryable?: boolean }
        if (appError.type === "validation" || appError.type === "not-found") {
          return false
        }
        if (appError.retryable === false) {
          return false
        }
      }
      return true
    }

    const toUserFacingSyncError = (
      error: unknown,
      courseDisplayName: string,
    ): string => {
      const raw = getErrorMessage(error, "Could not save course")
      const missingCourseMatch = raw.match(
        /^Course revision invariant violated for '([^']+)' \(expected \d+, stored missing course\)\.$/,
      )
      if (missingCourseMatch) {
        return `Could not save course "${courseDisplayName}" because it no longer exists. It may have been deleted while another save was still in progress. (Course ID: ${missingCourseMatch[1]})`
      }

      const staleRevisionMatch = raw.match(
        /^Course revision invariant violated for '([^']+)' \(expected (\d+), stored (\d+)\)\.$/,
      )
      if (staleRevisionMatch) {
        return `Could not save course "${courseDisplayName}" because a newer version exists (expected revision ${staleRevisionMatch[2]}, found ${staleRevisionMatch[3]}). Reload the course and try again. (Course ID: ${staleRevisionMatch[1]})`
      }

      return raw
    }

    const saveLatestSnapshot = async () => {
      const stateAtStart = get()
      const course = stateAtStart.course
      if (!course) {
        return true
      }

      const startLocalVersion = stateAtStart.localVersion
      const courseId = course.id
      let lastError: unknown = null

      for (
        let attempt = 0;
        attempt <= AUTOSAVE_RETRY_DELAYS_MS.length;
        attempt += 1
      ) {
        const savingIndicatorTimer = setTimeout(() => {
          set((draft) => {
            if (draft.course?.id !== courseId) return
            draft.syncState = "saving"
          })
        }, 500)

        try {
          const client = getWorkflowClient()
          const saved = (await client.run(
            "course.save",
            course,
          )) as PersistedCourse
          clearTimeout(savingIndicatorTimer)

          set((draft) => {
            if (!draft.course || draft.course.id !== courseId) {
              return
            }
            draft.lastSavedRevision = saved.revision
            draft.syncState = "idle"

            if (draft.localVersion === startLocalVersion) {
              draft.course = saved
              return
            }

            // Preserve newer local edits while advancing revision baseline.
            draft.course.revision = saved.revision
          })
          return true
        } catch (error) {
          clearTimeout(savingIndicatorTimer)
          lastError = error
          const canRetry =
            attempt < AUTOSAVE_RETRY_DELAYS_MS.length &&
            isRetryableSaveError(error)
          if (canRetry) {
            const delayMs = AUTOSAVE_RETRY_DELAYS_MS[attempt]
            await new Promise((resolve) => setTimeout(resolve, delayMs))
            continue
          }

          const message = toUserFacingSyncError(error, course.displayName)
          if (get().course?.id === courseId) {
            set((draft) => {
              if (draft.course?.id !== courseId) {
                return
              }
              draft.syncState = "error"
              draft.syncError = message
            })
          }
          break
        }
      }

      void lastError
      return false
    }

    const requestAutosave = () => {
      saveRequested = true
      if (saveWorkerRunning) {
        return
      }

      saveWorkerRunning = true
      void (async () => {
        while (saveRequested) {
          saveRequested = false
          await saveLatestSnapshot()
        }
        saveWorkerRunning = false
        resolveIdleWaiters()
      })()
    }

    const scheduleAutosave = () => {
      clearAutosaveTimer()
      autosaveTimer = setTimeout(() => {
        autosaveTimer = null
        requestAutosave()
      }, AUTOSAVE_DEBOUNCE_MS)
    }

    const markCourseMutated = () => {
      set((draft) => {
        if (!draft.course) return
        draft.localVersion += 1
        draft.course.updatedAt = new Date().toISOString()
        draft.checksDirty = true
      })
      scheduleAutosave()
    }

    /** Apply a roster mutation with undo/redo history tracking. */
    function mutateRoster(
      description: string,
      mutator: (roster: Roster) => void,
    ) {
      const state = get()
      if (!state.course) return

      const [nextRoster, patches, inversePatches] = produceWithPatches(
        state.course.roster,
        mutator,
      )

      if (patches.length === 0) return

      set((draft) => {
        if (!draft.course) return
        draft.course.roster = nextRoster as Roster
        draft.course.updatedAt = new Date().toISOString()
        draft.history.push({ patches, inversePatches, description })
        if (draft.history.length > HISTORY_LIMIT) {
          draft.history.splice(0, draft.history.length - HISTORY_LIMIT)
        }
        draft.future = []
        draft.checksDirty = true
      })
      markCourseMutated()
    }

    return {
      ...initialState,

      load: async (courseId) => {
        const currentCourseId = get().course?.id ?? null
        if (currentCourseId !== null && currentCourseId !== courseId) {
          await get().save()
        }
        try {
          set((draft) => {
            draft.status = "loading"
            draft.error = null
          })
          const client = getWorkflowClient()
          const loaded = await client.run("course.load", { courseId })
          const loadedCourse = loaded as PersistedCourse
          ensureSystemGroupSets(loadedCourse.roster)
          set((draft) => {
            draft.course = loadedCourse
            draft.status = "loaded"
            draft.history = []
            draft.future = []
            draft.assignmentSelection = null
            draft.checksDirty = true
            draft.systemSetsReady = true
            draft.localVersion = 0
            draft.lastSavedRevision = loadedCourse.revision
            draft.syncState = "idle"
          })
        } catch (err) {
          set((draft) => {
            draft.status = "error"
            draft.error = getErrorMessage(err)
          })
        }
      },

      save: async () => {
        clearAutosaveTimer()
        if (!get().course) {
          return true
        }
        requestAutosave()
        await waitForIdle()
        return get().syncState !== "error"
      },

      clear: () => {
        clearAutosaveTimer()
        saveRequested = false
        set(initialState)
      },

      // ------------------------------------------------------------------
      // Member mutations
      // ------------------------------------------------------------------

      addMember: (member) => {
        mutateRoster(`Add ${member.name}`, (roster) => {
          if (member.enrollmentType === "student") {
            roster.students.push(member)
          } else {
            roster.staff.push(member)
          }
        })
      },

      updateMember: (id, updates) => {
        mutateRoster("Update member", (roster) => {
          const allMembers = [...roster.students, ...roster.staff]
          const member = allMembers.find((m) => m.id === id)
          if (member) Object.assign(member, updates)
        })
      },

      removeMember: (id) => {
        mutateRoster("Remove member", (roster) => {
          const student = roster.students.find((m) => m.id === id)
          if (student) {
            student.status = "dropped"
            return
          }
          const staff = roster.staff.find((m) => m.id === id)
          if (staff) {
            staff.status = "dropped"
          }
        })
      },

      deleteMemberPermanently: (id) => {
        mutateRoster("Delete member permanently", (roster) => {
          roster.students = roster.students.filter((m) => m.id !== id)
          roster.staff = roster.staff.filter((m) => m.id !== id)
          for (const group of roster.groups) {
            group.memberIds = group.memberIds.filter((mid) => mid !== id)
          }
        })
      },

      setRoster: (roster, description) => {
        const state = get()
        if (!state.course) return
        const [nextRoster, patches, inversePatches] = produceWithPatches(
          state.course.roster,
          () => roster,
        )
        if (patches.length === 0) return

        set((draft) => {
          if (!draft.course) return
          draft.course.roster = nextRoster as Roster
          draft.course.updatedAt = new Date().toISOString()
          draft.history.push({
            patches,
            inversePatches,
            description: description ?? "Replace roster",
          })
          if (draft.history.length > HISTORY_LIMIT) {
            draft.history.splice(0, draft.history.length - HISTORY_LIMIT)
          }
          draft.future = []
          draft.checksDirty = true
        })
        markCourseMutated()
      },

      // ------------------------------------------------------------------
      // Assignment CRUD
      // ------------------------------------------------------------------

      addAssignment: (assignment) => {
        mutateRoster(`Add assignment "${assignment.name}"`, (roster) => {
          roster.assignments.push(assignment)
        })
      },

      updateAssignment: (id, updates) => {
        mutateRoster("Update assignment", (roster) => {
          const assignment = roster.assignments.find((a) => a.id === id)
          if (assignment) Object.assign(assignment, updates)
        })
      },

      deleteAssignment: (id) => {
        mutateRoster("Delete assignment", (roster) => {
          roster.assignments = roster.assignments.filter((a) => a.id !== id)
        })
        set((draft) => {
          if (draft.assignmentSelection === id) {
            draft.assignmentSelection = null
          }
        })
      },

      setAssignmentSelection: (id) => {
        set((draft) => {
          draft.assignmentSelection = id
        })
      },

      // ------------------------------------------------------------------
      // Group CRUD
      // ------------------------------------------------------------------

      createGroup: (groupSetId, name, memberIds) => {
        const id = generateGroupId()
        mutateRoster(`Create group "${name}"`, (roster) => {
          const group: Group = {
            id,
            name,
            memberIds,
            origin: "local",
            lmsGroupId: null,
          }
          roster.groups.push(group)
          const groupSet = roster.groupSets.find((gs) => gs.id === groupSetId)
          if (groupSet) {
            groupSet.groupIds.push(id)
          }
        })
        return id
      },

      updateGroup: (groupId, updates) => {
        mutateRoster("Update group", (roster) => {
          const group = roster.groups.find((g) => g.id === groupId)
          if (group && group.origin === "local") {
            Object.assign(group, updates)
          }
        })
      },

      deleteGroup: (groupId) => {
        mutateRoster("Delete group", (roster) => {
          roster.groups = roster.groups.filter((g) => g.id !== groupId)
          for (const gs of roster.groupSets) {
            gs.groupIds = gs.groupIds.filter((gid) => gid !== groupId)
          }
        })
      },

      moveMemberToGroup: (memberId, sourceGroupId, targetGroupId) => {
        mutateRoster("Move member", (roster) => {
          const source = roster.groups.find((g) => g.id === sourceGroupId)
          const target = roster.groups.find((g) => g.id === targetGroupId)
          if (source && target) {
            source.memberIds = source.memberIds.filter((id) => id !== memberId)
            if (!target.memberIds.includes(memberId)) {
              target.memberIds.push(memberId)
            }
          }
        })
      },

      copyMemberToGroup: (memberId, targetGroupId) => {
        mutateRoster("Copy member to group", (roster) => {
          const target = roster.groups.find((g) => g.id === targetGroupId)
          if (target && !target.memberIds.includes(memberId)) {
            target.memberIds.push(memberId)
          }
        })
      },

      // ------------------------------------------------------------------
      // Group set CRUD
      // ------------------------------------------------------------------

      createLocalGroupSet: (name, groupIds) => {
        const id = generateGroupSetId()
        mutateRoster(`Create group set "${name}"`, (roster) => {
          const groupSet: GroupSet = {
            id,
            name,
            groupIds: groupIds ?? [],
            connection: null,
            groupSelection: { kind: "all", excludedGroupIds: [] },
            repoNameTemplate: null,
          }
          roster.groupSets.push(groupSet)
        })
        return id
      },

      copyGroupSet: (groupSetId) => {
        const state = get()
        if (!state.course) return null
        const source = state.course.roster.groupSets.find(
          (gs) => gs.id === groupSetId,
        )
        if (!source) return null

        const newId = generateGroupSetId()
        const copiedGroupIds: string[] = []

        mutateRoster(`Copy group set "${source.name}"`, (roster) => {
          for (const origGroupId of source.groupIds) {
            const origGroup = roster.groups.find((g) => g.id === origGroupId)
            if (!origGroup) continue
            const newGroupId = generateGroupId()
            copiedGroupIds.push(newGroupId)
            roster.groups.push({
              id: newGroupId,
              name: origGroup.name,
              memberIds: [...origGroup.memberIds],
              origin: "local",
              lmsGroupId: null,
            })
          }

          roster.groupSets.push({
            id: newId,
            name: `${source.name} (copy)`,
            groupIds: copiedGroupIds,
            connection: null,
            groupSelection: { kind: "all", excludedGroupIds: [] },
            repoNameTemplate: source.repoNameTemplate,
          })
        })

        return newId
      },

      renameGroupSet: (groupSetId, name) => {
        mutateRoster(`Rename group set to "${name}"`, (roster) => {
          const gs = roster.groupSets.find((g) => g.id === groupSetId)
          if (gs && gs.connection?.kind !== "system") {
            gs.name = name
          }
        })
      },

      deleteGroupSet: (groupSetId) => {
        mutateRoster("Delete group set", (roster) => {
          const gs = roster.groupSets.find((g) => g.id === groupSetId)
          if (!gs || gs.connection?.kind === "system") return

          // Remove assignments that reference this group set.
          roster.assignments = roster.assignments.filter(
            (a) => a.groupSetId !== groupSetId,
          )

          // Remove the group set.
          roster.groupSets = roster.groupSets.filter((g) => g.id !== groupSetId)

          // Remove orphaned groups that are no longer in any group set.
          const referencedGroupIds = new Set(
            roster.groupSets.flatMap((g) => g.groupIds),
          )
          roster.groups = roster.groups.filter((g) =>
            referencedGroupIds.has(g.id),
          )
        })
      },

      removeGroupFromSet: (groupSetId, groupId) => {
        mutateRoster("Remove group from set", (roster) => {
          const gs = roster.groupSets.find((g) => g.id === groupSetId)
          if (gs) {
            gs.groupIds = gs.groupIds.filter((id) => id !== groupId)
          }
        })
      },

      updateGroupSetSelection: (groupSetId, selection) => {
        mutateRoster("Update group set selection", (roster) => {
          const gs = roster.groupSets.find((g) => g.id === groupSetId)
          if (gs) gs.groupSelection = selection
        })
      },

      updateGroupSetTemplate: (groupSetId, template) => {
        mutateRoster("Update group set template", (roster) => {
          const gs = roster.groupSets.find((g) => g.id === groupSetId)
          if (gs) gs.repoNameTemplate = template
        })
      },

      // ------------------------------------------------------------------
      // Course metadata (non-roster, no undo)
      // ------------------------------------------------------------------

      setCourseId: (courseId) => {
        set((draft) => {
          if (draft.course) draft.course.lmsCourseId = courseId
        })
        markCourseMutated()
      },

      setLmsConnectionName: (name) => {
        set((draft) => {
          if (draft.course) draft.course.lmsConnectionName = name
        })
        markCourseMutated()
      },

      setGitConnectionId: (id) => {
        set((draft) => {
          if (draft.course) draft.course.gitConnectionId = id
        })
        markCourseMutated()
      },

      setOrganization: (organization) => {
        set((draft) => {
          if (draft.course) draft.course.organization = organization
        })
        markCourseMutated()
      },

      setRepositoryTemplate: (template) => {
        set((draft) => {
          if (draft.course) draft.course.repositoryTemplate = template
        })
        markCourseMutated()
      },

      setRepositoryCloneTargetDirectory: (targetDirectory) => {
        set((draft) => {
          if (draft.course) {
            draft.course.repositoryCloneTargetDirectory = targetDirectory
          }
        })
        markCourseMutated()
      },

      setRepositoryCloneDirectoryLayout: (layout) => {
        set((draft) => {
          if (draft.course) {
            draft.course.repositoryCloneDirectoryLayout = layout
          }
        })
        markCourseMutated()
      },

      setDisplayName: (name) => {
        set((draft) => {
          if (draft.course) draft.course.displayName = name
        })
        markCourseMutated()
      },

      // ------------------------------------------------------------------
      // System group sets
      // ------------------------------------------------------------------

      ensureSystemGroupSets: () => {
        const state = get()
        if (!state.course) return
        const result = ensureSystemGroupSets(state.course.roster)

        const hasChanges =
          result.groupsUpserted.length > 0 || result.deletedGroupIds.length > 0

        if (!hasChanges) {
          set((draft) => {
            draft.systemSetsReady = true
          })
          return
        }

        set((draft) => {
          if (!draft.course) return
          const roster = draft.course.roster

          // Apply upserted groups.
          const upsertedIds = new Set(result.groupsUpserted.map((g) => g.id))
          roster.groups = roster.groups.filter((g) => !upsertedIds.has(g.id))
          roster.groups.push(...(result.groupsUpserted as Group[]))

          // Remove deleted groups.
          const deletedIds = new Set(result.deletedGroupIds)
          roster.groups = roster.groups.filter((g) => !deletedIds.has(g.id))

          // Upsert system group sets.
          const systemSetIds = new Set(result.groupSets.map((gs) => gs.id))
          roster.groupSets = roster.groupSets.filter(
            (gs) => !systemSetIds.has(gs.id),
          )
          roster.groupSets.push(...(result.groupSets as GroupSet[]))

          draft.course.updatedAt = new Date().toISOString()
          draft.systemSetsReady = true
          draft.checksDirty = true
        })
        markCourseMutated()
      },

      // ------------------------------------------------------------------
      // Validation
      // ------------------------------------------------------------------

      runChecks: (identityMode) => {
        const state = get()
        if (!state.course) return
        const roster = state.course.roster

        set((draft) => {
          draft.checksStatus = "running"
          draft.checksError = null
        })

        try {
          const rosterResult = validateRoster(roster)
          const assignmentResults: Record<string, RosterValidationResult> = {}
          for (const assignment of roster.assignments) {
            assignmentResults[assignment.id] = validateAssignment(
              roster,
              assignment.id,
              identityMode,
            )
          }

          const cards = buildIssueCards(roster, rosterResult, assignmentResults)

          set((draft) => {
            draft.rosterValidation = rosterResult
            draft.assignmentValidations = assignmentResults
            draft.issueCards = cards
            draft.checksStatus = "ready"
            draft.checksDirty = false
          })
        } catch (err) {
          set((draft) => {
            draft.checksStatus = "error"
            draft.checksError = getErrorMessage(err)
          })
        }
      },

      // ------------------------------------------------------------------
      // Undo / Redo
      // ------------------------------------------------------------------

      undo: () => {
        const state = get()
        if (state.history.length === 0 || !state.course) return null
        const entry = state.history[state.history.length - 1]
        const nextRoster = applyPatches(
          state.course.roster,
          entry.inversePatches,
        )
        set((draft) => {
          if (!draft.course) return
          draft.course.roster = nextRoster as Roster
          draft.course.updatedAt = new Date().toISOString()
          draft.history.pop()
          draft.future.push(entry)
          draft.checksDirty = true
        })
        markCourseMutated()
        return entry
      },

      redo: () => {
        const state = get()
        if (state.future.length === 0 || !state.course) return null
        const entry = state.future[state.future.length - 1]
        const nextRoster = applyPatches(state.course.roster, entry.patches)
        set((draft) => {
          if (!draft.course) return
          draft.course.roster = nextRoster as Roster
          draft.course.updatedAt = new Date().toISOString()
          draft.future.pop()
          draft.history.push(entry)
          draft.checksDirty = true
        })
        markCourseMutated()
        return entry
      },

      clearHistory: () => {
        set((draft) => {
          draft.history = []
          draft.future = []
        })
      },
    }
  }),
)

export * from "./course-store-selectors.js"
