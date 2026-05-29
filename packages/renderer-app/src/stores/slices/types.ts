import type { CourseSaveStamp } from "@repo-edu/application-contract"
import type {
  AnalysisInputs,
  Assignment,
  GitIdentityMode,
  Group,
  IdSequences,
  PersistedCourse,
  Roster,
  RosterMember,
  RosterValidationResult,
} from "@repo-edu/domain/types"
import type { Patch } from "immer"
import type { ChecksStatus, IssueCard } from "../../types/index.js"

export const HISTORY_LIMIT = 100

export type HistoryEntry = {
  patches: Patch[]
  inversePatches: Patch[]
  description: string
}

export type CourseState = {
  course: PersistedCourse | null
  warnings: string[]

  assignmentSelection: string | null
  systemSetsReady: boolean

  rosterValidation: RosterValidationResult | null
  assignmentValidations: Record<string, RosterValidationResult>
  issueCards: IssueCard[]
  checksStatus: ChecksStatus
  checksError: string | null
  checksDirty: boolean

  history: HistoryEntry[]
  future: HistoryEntry[]
}

export type CourseActions = {
  hydrate: (course: PersistedCourse) => void
  clear: () => void
  applySaveStamp: (courseId: string, stamp: CourseSaveStamp) => void

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
  updateGroupSetTemplate: (groupSetId: string, template: string | null) => void
  updateGroupSetColumnVisibility: (
    groupSetId: string,
    visibility: Record<string, boolean>,
  ) => void
  updateGroupSetColumnSizing: (
    groupSetId: string,
    sizing: Record<string, number>,
  ) => void

  // Course metadata
  setCourseId: (courseId: string | null) => void
  setLmsConnectionId: (id: string | null) => void
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
  setSearchFolder: (folder: string | null) => void
  setAnalysisInputs: (patch: Partial<AnalysisInputs>) => void

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
}

export const initialState: CourseState = {
  course: null,
  warnings: [],
  assignmentSelection: null,
  systemSetsReady: false,
  rosterValidation: null,
  assignmentValidations: {},
  issueCards: [],
  checksStatus: "idle",
  checksError: null,
  checksDirty: false,
  history: [],
  future: [],
}
