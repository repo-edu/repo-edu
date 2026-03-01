/**
 * UI store - manages dialog/sheet visibility and UI state.
 * This store holds transient UI state that is not persisted.
 */

import type {
  ImportConflict,
  ImportGitUsernamesResult,
  UsernameVerificationResult,
} from "@repo-edu/backend-interface/types"
import { create } from "zustand"

/**
 * Sidebar selection state for the Groups & Assignments tab.
 */
export type SidebarSelection = { kind: "group-set"; id: string } | null

/**
 * Active tab in the group set detail panel (right side).
 */
export type GroupSetPanelTab = "groups" | "assignments"

/**
 * Profile list item - cached in store to avoid repeated fetches.
 */
export interface ProfileListItem {
  name: string
  courseName: string
}

/**
 * Active tab in the main layout.
 * Frontend-only, not persisted.
 */
type ActiveTab = "roster" | "groups-assignments" | "operation"

type GroupSetOperationKind = "sync" | "import" | "reimport"

export interface GroupSetOperationState {
  kind: GroupSetOperationKind
  groupSetId: string | null
}

interface UiState {
  // Navigation
  activeTab: ActiveTab

  // App-level dialogs/sheets
  settingsDialogOpen: boolean
  settingsDialogCategory: "connections" | "display" | "shortcuts"
  activeProfile: string | null

  // Profile list cache (to avoid fetching on every tab switch)
  profileList: ProfileListItem[]
  profileListLoading: boolean

  // Roster tab dialogs
  importFileDialogOpen: boolean
  rosterSyncDialogOpen: boolean
  importGitUsernamesDialogOpen: boolean
  usernameVerificationDialogOpen: boolean

  // Assignment tab dialogs
  newAssignmentDialogOpen: boolean
  fileImportExportOpen: boolean
  addGroupDialogOpen: boolean
  editGroupDialogOpen: boolean
  importGroupsDialogOpen: boolean
  importGroupsFromFileDialogOpen: boolean
  editingGroupId: string | null
  issuesPanelOpen: boolean
  preSelectedGroupSetId: string | null

  // Phase 10 dialogs (Groups & Assignments)
  connectLmsGroupSetDialogOpen: boolean
  newLocalGroupSetDialogOpen: boolean
  importGroupSetDialogOpen: boolean
  reimportGroupSetTargetId: string | null // non-null = dialog open with this group set
  copyGroupSetSourceId: string | null // non-null = dialog open with this source
  deleteGroupSetTargetId: string | null // non-null = dialog open for this group set
  deleteGroupTargetId: string | null // non-null = dialog open for this group
  addGroupDialogGroupSetId: string | null // context for AddGroupDialog

  // Groups & Assignments sidebar selection
  sidebarSelection: SidebarSelection
  groupSetPanelTab: GroupSetPanelTab
  groupSetOperation: GroupSetOperationState | null

  // Sidebar action triggers (consumed by GroupSetPanel, then cleared)
  renameGroupSetTriggerId: string | null
  exportGroupSetTriggerId: string | null
  syncGroupSetTriggerId: string | null

  // Profile dialogs
  newProfileDialogOpen: boolean
  courseSelectionDialogOpen: boolean
  exportSettingsOpen: boolean

  // Operation tab dialogs
  validationDialogOpen: boolean
  preflightDialogOpen: boolean
  deleteConfirmationOpen: boolean

  // Close prompt (unsaved changes)
  closePromptVisible: boolean

  // Confirmation/result state (null = dialog closed)
  gitUsernameImportResult: ImportGitUsernamesResult | null
  usernameVerificationResult: UsernameVerificationResult | null
  lmsImportConflicts: ImportConflict[] | null
}

interface UiActions {
  // Navigation
  setActiveTab: (tab: ActiveTab) => void

  // App-level dialogs/sheets
  setSettingsDialogOpen: (open: boolean) => void
  setSettingsDialogCategory: (
    category: "connections" | "display" | "shortcuts",
  ) => void
  openSettings: (category?: "connections" | "display" | "shortcuts") => void
  setActiveProfile: (profile: string | null) => void

  // Profile list cache
  setProfileList: (profiles: ProfileListItem[]) => void
  setProfileListLoading: (loading: boolean) => void

  // Roster tab dialogs
  setImportFileDialogOpen: (open: boolean) => void
  setRosterSyncDialogOpen: (open: boolean) => void
  setImportGitUsernamesDialogOpen: (open: boolean) => void
  setUsernameVerificationDialogOpen: (open: boolean) => void

  // Assignment tab dialogs
  setNewAssignmentDialogOpen: (open: boolean) => void
  setFileImportExportOpen: (open: boolean) => void
  setAddGroupDialogOpen: (open: boolean) => void
  setEditGroupDialogOpen: (open: boolean) => void
  setImportGroupsDialogOpen: (open: boolean) => void
  setImportGroupsFromFileDialogOpen: (open: boolean) => void
  setEditingGroupId: (id: string | null) => void
  setIssuesPanelOpen: (open: boolean) => void
  setPreSelectedGroupSetId: (id: string | null) => void
  setSidebarSelection: (selection: SidebarSelection) => void
  setGroupSetPanelTab: (tab: GroupSetPanelTab) => void
  setGroupSetOperation: (operation: GroupSetOperationState | null) => void

  // Sidebar action triggers
  setRenameGroupSetTriggerId: (id: string | null) => void
  setExportGroupSetTriggerId: (id: string | null) => void
  setSyncGroupSetTriggerId: (id: string | null) => void

  // Phase 10 dialog setters
  setConnectLmsGroupSetDialogOpen: (open: boolean) => void
  setNewLocalGroupSetDialogOpen: (open: boolean) => void
  setImportGroupSetDialogOpen: (open: boolean) => void
  setReimportGroupSetTargetId: (id: string | null) => void
  setCopyGroupSetSourceId: (id: string | null) => void
  setDeleteGroupSetTargetId: (id: string | null) => void
  setDeleteGroupTargetId: (id: string | null) => void
  setAddGroupDialogGroupSetId: (id: string | null) => void

  // Profile dialogs
  setNewProfileDialogOpen: (open: boolean) => void
  setCourseSelectionDialogOpen: (open: boolean) => void
  setExportSettingsOpen: (open: boolean) => void

  // Operation tab dialogs
  setValidationDialogOpen: (open: boolean) => void
  setPreflightDialogOpen: (open: boolean) => void
  setDeleteConfirmationOpen: (open: boolean) => void

  // Close prompt
  showClosePrompt: () => void
  hideClosePrompt: () => void

  // Confirmation/result state
  setGitUsernameImportResult: (result: ImportGitUsernamesResult | null) => void
  setUsernameVerificationResult: (
    result: UsernameVerificationResult | null,
  ) => void
  setLmsImportConflicts: (conflicts: ImportConflict[] | null) => void

  // Reset
  reset: () => void
}

interface UiStore extends UiState, UiActions {}

const initialState: UiState = {
  // Navigation
  activeTab: "roster",

  // App-level dialogs/sheets
  settingsDialogOpen: false,
  settingsDialogCategory: "connections",
  activeProfile: null,

  // Profile list cache
  profileList: [],
  profileListLoading: false,

  // Roster tab dialogs
  importFileDialogOpen: false,
  rosterSyncDialogOpen: false,
  importGitUsernamesDialogOpen: false,
  usernameVerificationDialogOpen: false,

  // Assignment tab dialogs
  newAssignmentDialogOpen: false,
  fileImportExportOpen: false,
  addGroupDialogOpen: false,
  editGroupDialogOpen: false,
  importGroupsDialogOpen: false,
  importGroupsFromFileDialogOpen: false,
  editingGroupId: null,
  issuesPanelOpen: false,
  preSelectedGroupSetId: null,

  // Phase 10 dialogs
  connectLmsGroupSetDialogOpen: false,
  newLocalGroupSetDialogOpen: false,
  importGroupSetDialogOpen: false,
  reimportGroupSetTargetId: null,
  copyGroupSetSourceId: null,
  deleteGroupSetTargetId: null,
  deleteGroupTargetId: null,
  addGroupDialogGroupSetId: null,

  // Groups & Assignments sidebar selection
  sidebarSelection: null,
  groupSetPanelTab: "groups",
  groupSetOperation: null,

  // Sidebar action triggers
  renameGroupSetTriggerId: null,
  exportGroupSetTriggerId: null,
  syncGroupSetTriggerId: null,

  // Profile dialogs
  newProfileDialogOpen: false,
  courseSelectionDialogOpen: false,
  exportSettingsOpen: false,

  // Operation tab dialogs
  validationDialogOpen: false,
  preflightDialogOpen: false,
  deleteConfirmationOpen: false,

  // Close prompt
  closePromptVisible: false,

  // Confirmation/result state
  gitUsernameImportResult: null,
  usernameVerificationResult: null,
  lmsImportConflicts: null,
}

export const useUiStore = create<UiStore>((set) => ({
  ...initialState,

  // Navigation
  setActiveTab: (tab) => set({ activeTab: tab }),

  // App-level dialogs/sheets
  setSettingsDialogOpen: (open) => set({ settingsDialogOpen: open }),
  setSettingsDialogCategory: (category) =>
    set({ settingsDialogCategory: category }),
  openSettings: (category = "connections") =>
    set({ settingsDialogOpen: true, settingsDialogCategory: category }),
  setActiveProfile: (profile) => set({ activeProfile: profile }),

  // Profile list cache
  setProfileList: (profiles) => set({ profileList: profiles }),
  setProfileListLoading: (loading) => set({ profileListLoading: loading }),

  // Roster tab dialogs
  setImportFileDialogOpen: (open) => set({ importFileDialogOpen: open }),
  setRosterSyncDialogOpen: (open) => set({ rosterSyncDialogOpen: open }),
  setImportGitUsernamesDialogOpen: (open) =>
    set({ importGitUsernamesDialogOpen: open }),
  setUsernameVerificationDialogOpen: (open) =>
    set({ usernameVerificationDialogOpen: open }),

  // Assignment tab dialogs
  setNewAssignmentDialogOpen: (open) => set({ newAssignmentDialogOpen: open }),
  setFileImportExportOpen: (open) => set({ fileImportExportOpen: open }),
  setAddGroupDialogOpen: (open) => set({ addGroupDialogOpen: open }),
  setEditGroupDialogOpen: (open) => set({ editGroupDialogOpen: open }),
  setImportGroupsDialogOpen: (open) => set({ importGroupsDialogOpen: open }),
  setImportGroupsFromFileDialogOpen: (open) =>
    set({ importGroupsFromFileDialogOpen: open }),
  setEditingGroupId: (id) => set({ editingGroupId: id }),
  setIssuesPanelOpen: (open) => set({ issuesPanelOpen: open }),
  setPreSelectedGroupSetId: (id) => set({ preSelectedGroupSetId: id }),
  setSidebarSelection: (selection) => set({ sidebarSelection: selection }),
  setGroupSetPanelTab: (tab) => set({ groupSetPanelTab: tab }),
  setGroupSetOperation: (operation) => set({ groupSetOperation: operation }),

  // Sidebar action triggers
  setRenameGroupSetTriggerId: (id) => set({ renameGroupSetTriggerId: id }),
  setExportGroupSetTriggerId: (id) => set({ exportGroupSetTriggerId: id }),
  setSyncGroupSetTriggerId: (id) => set({ syncGroupSetTriggerId: id }),

  // Phase 10 dialog setters
  setConnectLmsGroupSetDialogOpen: (open) =>
    set({ connectLmsGroupSetDialogOpen: open }),
  setNewLocalGroupSetDialogOpen: (open) =>
    set({ newLocalGroupSetDialogOpen: open }),
  setImportGroupSetDialogOpen: (open) =>
    set({ importGroupSetDialogOpen: open }),
  setReimportGroupSetTargetId: (id) => set({ reimportGroupSetTargetId: id }),
  setCopyGroupSetSourceId: (id) => set({ copyGroupSetSourceId: id }),
  setDeleteGroupSetTargetId: (id) => set({ deleteGroupSetTargetId: id }),
  setDeleteGroupTargetId: (id) => set({ deleteGroupTargetId: id }),
  setAddGroupDialogGroupSetId: (id) => set({ addGroupDialogGroupSetId: id }),

  // Profile dialogs
  setNewProfileDialogOpen: (open) => set({ newProfileDialogOpen: open }),
  setCourseSelectionDialogOpen: (open) =>
    set({ courseSelectionDialogOpen: open }),
  setExportSettingsOpen: (open) => set({ exportSettingsOpen: open }),

  // Operation tab dialogs
  setValidationDialogOpen: (open) => set({ validationDialogOpen: open }),
  setPreflightDialogOpen: (open) => set({ preflightDialogOpen: open }),
  setDeleteConfirmationOpen: (open) => set({ deleteConfirmationOpen: open }),

  // Close prompt
  showClosePrompt: () => set({ closePromptVisible: true }),
  hideClosePrompt: () => set({ closePromptVisible: false }),

  // Confirmation/result state
  setGitUsernameImportResult: (result) =>
    set({ gitUsernameImportResult: result }),
  setUsernameVerificationResult: (result) =>
    set({ usernameVerificationResult: result }),
  setLmsImportConflicts: (conflicts) => set({ lmsImportConflicts: conflicts }),

  // Reset
  reset: () => set(initialState),
}))

export type { ActiveTab }

// Selector helpers
export const selectActiveTab = (state: UiStore) => state.activeTab
export const selectActiveProfile = (state: UiStore) => state.activeProfile
export const selectClosePromptVisible = (state: UiStore) =>
  state.closePromptVisible
