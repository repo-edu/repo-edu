import type {
  Assignment,
  GitIdentityMode,
  Group,
  GroupSelectionMode,
  IdSequences,
  PersistedCourse,
  Roster,
  RosterMember,
  RosterValidationResult,
} from "@repo-edu/domain/types"
import type { Patch } from "immer"
import type {
  ChecksStatus,
  DocumentStatus,
  IssueCard,
} from "../../types/index.js"

export const HISTORY_LIMIT = 100
export const AUTOSAVE_DEBOUNCE_MS = 300
export const AUTOSAVE_RETRY_DELAYS_MS = [300, 900, 2000] as const

export type HistoryEntry = {
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

export type CourseActions = {
  load: (courseId: string) => Promise<void>
  save: () => Promise<boolean>
  clear: () => void

  // Roster mutations (with undo history)
  addMember: (member: RosterMember) => void
  updateMember: (id: string, updates: Partial<RosterMember>) => void
  removeMember: (id: string) => void
  deleteMemberPermanently: (id: string) => void
  setRoster: (roster: Roster, description?: string) => void
  setIdSequences: (idSequences: IdSequences) => void

  // Assignment CRUD
  addAssignment: (assignment: Omit<Assignment, "id">) => void
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

export type StoreSet = (
  fn: (draft: CourseState & CourseActions) => void,
) => void
export type StoreGet = () => CourseState & CourseActions

export type StoreInternals = {
  mutateRoster: (description: string, recipe: (roster: Roster) => void) => void
  markCourseMutated: () => void
  scheduleAutosave: () => void
  clearAutosaveTimer: () => void
  cancelPendingSave: () => void
  requestAutosave: () => void
  waitForIdle: () => Promise<void>
}

export const initialState: CourseState = {
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
