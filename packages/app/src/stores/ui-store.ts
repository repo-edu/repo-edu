import type { CourseSummary } from "@repo-edu/domain"
import { create } from "zustand"
import type { ActiveTab } from "../types/index.js"

type GroupSetOperationState =
  | {
      kind: "connect" | "import"
    }
  | {
      kind: "sync" | "reimport"
      groupSetId: string
    }

type SidebarSelection = {
  kind: "group-set"
  id: string
} | null

type SettingsCategory = "connections" | "display" | "shortcuts"

export type LmsImportConflict = {
  matchKey: string
  value: string
  matchedIds: string[]
}

type UiState = {
  // Navigation
  activeTab: ActiveTab
  activeCourseId: string | null

  // Dialog visibility
  settingsDialogOpen: boolean
  settingsCategory: SettingsCategory
  newCourseDialogOpen: boolean
  importFileDialogOpen: boolean
  rosterSyncDialogOpen: boolean
  importGitUsernamesDialogOpen: boolean
  usernameVerificationDialogOpen: boolean
  newAssignmentDialogOpen: boolean
  fileImportExportOpen: boolean
  issuesSheetOpen: boolean
  validationDialogOpen: boolean
  preflightDialogOpen: boolean

  // Group set dialogs
  connectLmsGroupSetDialogOpen: boolean
  newLocalGroupSetDialogOpen: boolean
  importGroupSetDialogOpen: boolean
  reimportGroupSetTargetId: string | null
  copyGroupSetSourceId: string | null
  deleteGroupSetTargetId: string | null
  deleteGroupTargetId: string | null
  addGroupDialogGroupSetId: string | null

  // Assignment dialog context
  preSelectedGroupSetId: string | null

  // LMS import conflicts
  lmsImportConflicts: LmsImportConflict[] | null

  // Sidebar
  sidebarSelection: SidebarSelection
  groupSetPanelTab: "groups" | "assignments"
  groupSetOperation: GroupSetOperationState | null

  // Sidebar action triggers
  renameGroupSetTriggerId: string | null
  exportGroupSetTriggerId: string | null
  syncGroupSetTriggerId: string | null

  // Course list cache
  courseList: CourseSummary[]
  courseListLoading: boolean

  // Close prompt
  closePromptVisible: boolean
}

type UiActions = {
  setActiveTab: (tab: ActiveTab) => void
  setActiveCourseId: (id: string | null) => void

  setSettingsDialogOpen: (open: boolean) => void
  openSettings: (category?: SettingsCategory) => void
  setNewCourseDialogOpen: (open: boolean) => void
  setImportFileDialogOpen: (open: boolean) => void
  setRosterSyncDialogOpen: (open: boolean) => void
  setImportGitUsernamesDialogOpen: (open: boolean) => void
  setUsernameVerificationDialogOpen: (open: boolean) => void
  setNewAssignmentDialogOpen: (open: boolean) => void
  setFileImportExportOpen: (open: boolean) => void
  setIssuesSheetOpen: (open: boolean) => void
  setValidationDialogOpen: (open: boolean) => void
  setPreflightDialogOpen: (open: boolean) => void

  setConnectLmsGroupSetDialogOpen: (open: boolean) => void
  setNewLocalGroupSetDialogOpen: (open: boolean) => void
  setImportGroupSetDialogOpen: (open: boolean) => void
  setReimportGroupSetTargetId: (id: string | null) => void
  setCopyGroupSetSourceId: (id: string | null) => void
  setDeleteGroupSetTargetId: (id: string | null) => void
  setDeleteGroupTargetId: (id: string | null) => void
  setAddGroupDialogGroupSetId: (id: string | null) => void

  setPreSelectedGroupSetId: (id: string | null) => void
  setLmsImportConflicts: (conflicts: LmsImportConflict[] | null) => void

  setSidebarSelection: (selection: SidebarSelection) => void
  setGroupSetPanelTab: (tab: "groups" | "assignments") => void
  setGroupSetOperation: (op: GroupSetOperationState | null) => void

  setRenameGroupSetTriggerId: (id: string | null) => void
  setExportGroupSetTriggerId: (id: string | null) => void
  setSyncGroupSetTriggerId: (id: string | null) => void

  setCourseList: (list: CourseSummary[]) => void
  setCourseListLoading: (loading: boolean) => void

  showClosePrompt: () => void
  hideClosePrompt: () => void

  reset: () => void
}

const initialState: UiState = {
  activeTab: "roster",
  activeCourseId: null,

  settingsDialogOpen: false,
  settingsCategory: "connections",
  newCourseDialogOpen: false,
  importFileDialogOpen: false,
  rosterSyncDialogOpen: false,
  importGitUsernamesDialogOpen: false,
  usernameVerificationDialogOpen: false,
  newAssignmentDialogOpen: false,
  fileImportExportOpen: false,
  issuesSheetOpen: false,
  validationDialogOpen: false,
  preflightDialogOpen: false,

  connectLmsGroupSetDialogOpen: false,
  newLocalGroupSetDialogOpen: false,
  importGroupSetDialogOpen: false,
  reimportGroupSetTargetId: null,
  copyGroupSetSourceId: null,
  deleteGroupSetTargetId: null,
  deleteGroupTargetId: null,
  addGroupDialogGroupSetId: null,

  preSelectedGroupSetId: null,
  lmsImportConflicts: null,

  sidebarSelection: null,
  groupSetPanelTab: "groups",
  groupSetOperation: null,

  renameGroupSetTriggerId: null,
  exportGroupSetTriggerId: null,
  syncGroupSetTriggerId: null,

  courseList: [],
  courseListLoading: false,

  closePromptVisible: false,
}

function setIfChanged<K extends keyof UiState>(
  state: UiState,
  key: K,
  value: UiState[K],
) {
  return Object.is(state[key], value)
    ? state
    : ({ [key]: value } as Pick<UiState, K>)
}

function operationGroupSetId(
  operation: GroupSetOperationState | null,
): string | null {
  if (!operation || !("groupSetId" in operation)) {
    return null
  }
  return operation.groupSetId
}

export const useUiStore = create<UiState & UiActions>((set) => ({
  ...initialState,

  setActiveTab: (tab) => set((state) => setIfChanged(state, "activeTab", tab)),
  setActiveCourseId: (id) =>
    set((state) => setIfChanged(state, "activeCourseId", id)),

  setSettingsDialogOpen: (open) =>
    set((state) => setIfChanged(state, "settingsDialogOpen", open)),
  openSettings: (category) =>
    set((state) => {
      const nextCategory = category ?? "connections"
      if (state.settingsDialogOpen && state.settingsCategory === nextCategory) {
        return state
      }
      return {
        settingsDialogOpen: true,
        settingsCategory: nextCategory,
      }
    }),
  setNewCourseDialogOpen: (open) =>
    set((state) => setIfChanged(state, "newCourseDialogOpen", open)),
  setImportFileDialogOpen: (open) =>
    set((state) => setIfChanged(state, "importFileDialogOpen", open)),
  setRosterSyncDialogOpen: (open) =>
    set((state) => setIfChanged(state, "rosterSyncDialogOpen", open)),
  setImportGitUsernamesDialogOpen: (open) =>
    set((state) => setIfChanged(state, "importGitUsernamesDialogOpen", open)),
  setUsernameVerificationDialogOpen: (open) =>
    set((state) => setIfChanged(state, "usernameVerificationDialogOpen", open)),
  setNewAssignmentDialogOpen: (open) =>
    set((state) => setIfChanged(state, "newAssignmentDialogOpen", open)),
  setFileImportExportOpen: (open) =>
    set((state) => setIfChanged(state, "fileImportExportOpen", open)),
  setIssuesSheetOpen: (open) =>
    set((state) => setIfChanged(state, "issuesSheetOpen", open)),
  setValidationDialogOpen: (open) =>
    set((state) => setIfChanged(state, "validationDialogOpen", open)),
  setPreflightDialogOpen: (open) =>
    set((state) => setIfChanged(state, "preflightDialogOpen", open)),

  setConnectLmsGroupSetDialogOpen: (open) =>
    set((state) => setIfChanged(state, "connectLmsGroupSetDialogOpen", open)),
  setNewLocalGroupSetDialogOpen: (open) =>
    set((state) => setIfChanged(state, "newLocalGroupSetDialogOpen", open)),
  setImportGroupSetDialogOpen: (open) =>
    set((state) => setIfChanged(state, "importGroupSetDialogOpen", open)),
  setReimportGroupSetTargetId: (id) =>
    set((state) => setIfChanged(state, "reimportGroupSetTargetId", id)),
  setCopyGroupSetSourceId: (id) =>
    set((state) => setIfChanged(state, "copyGroupSetSourceId", id)),
  setDeleteGroupSetTargetId: (id) =>
    set((state) => setIfChanged(state, "deleteGroupSetTargetId", id)),
  setDeleteGroupTargetId: (id) =>
    set((state) => setIfChanged(state, "deleteGroupTargetId", id)),
  setAddGroupDialogGroupSetId: (id) =>
    set((state) => setIfChanged(state, "addGroupDialogGroupSetId", id)),

  setPreSelectedGroupSetId: (id) =>
    set((state) => setIfChanged(state, "preSelectedGroupSetId", id)),
  setLmsImportConflicts: (conflicts) =>
    set((state) => setIfChanged(state, "lmsImportConflicts", conflicts)),

  setSidebarSelection: (selection) =>
    set((state) => {
      const current = state.sidebarSelection
      if (
        current === selection ||
        (current?.kind === selection?.kind && current?.id === selection?.id)
      ) {
        return state
      }
      return { sidebarSelection: selection }
    }),
  setGroupSetPanelTab: (tab) =>
    set((state) => setIfChanged(state, "groupSetPanelTab", tab)),
  setGroupSetOperation: (op) =>
    set((state) => {
      const current = state.groupSetOperation
      if (
        current === op ||
        (current?.kind === op?.kind &&
          operationGroupSetId(current) === operationGroupSetId(op))
      ) {
        return state
      }
      return { groupSetOperation: op }
    }),

  setRenameGroupSetTriggerId: (id) =>
    set((state) => setIfChanged(state, "renameGroupSetTriggerId", id)),
  setExportGroupSetTriggerId: (id) =>
    set((state) => setIfChanged(state, "exportGroupSetTriggerId", id)),
  setSyncGroupSetTriggerId: (id) =>
    set((state) => setIfChanged(state, "syncGroupSetTriggerId", id)),

  setCourseList: (list) =>
    set((state) => setIfChanged(state, "courseList", list)),
  setCourseListLoading: (loading) =>
    set((state) => setIfChanged(state, "courseListLoading", loading)),

  showClosePrompt: () =>
    set((state) => setIfChanged(state, "closePromptVisible", true)),
  hideClosePrompt: () =>
    set((state) => setIfChanged(state, "closePromptVisible", false)),

  reset: () => set(initialState),
}))

export const selectActiveTab = (state: UiState) => state.activeTab
export const selectActiveCourseId = (state: UiState) => state.activeCourseId
export const selectClosePromptVisible = (state: UiState) =>
  state.closePromptVisible
