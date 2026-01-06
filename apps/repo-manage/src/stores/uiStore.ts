/**
 * UI store - manages dialog/sheet visibility and UI state.
 * This store holds transient UI state that is not persisted.
 */

import { create } from "zustand"
import type {
  CoverageReport,
  GroupId,
  GroupImportConfig,
  ImportGitUsernamesResult,
  LmsIdConflict,
  RepoPreflightResult,
  StudentRemovalCheck,
  UsernameVerificationResult,
  ValidationResult,
} from "../bindings/types"

/**
 * Active tab in the main layout.
 * Frontend-only, not persisted.
 */
type ActiveTab = "roster" | "assignment" | "operation"

interface UiState {
  // Navigation
  activeTab: ActiveTab

  // App-level dialogs/sheets
  settingsDialogOpen: boolean
  settingsDialogCategory: "connections" | "display" | "shortcuts"
  profileMenuOpen: boolean
  activeProfile: string | null

  // Roster tab dialogs
  studentEditorOpen: boolean
  clearRosterDialogOpen: boolean
  coverageReportOpen: boolean
  importFileDialogOpen: boolean
  importGitUsernamesDialogOpen: boolean
  usernameVerificationDialogOpen: boolean

  // Assignment tab dialogs
  newAssignmentDialogOpen: boolean
  editAssignmentDialogOpen: boolean
  deleteAssignmentDialogOpen: boolean
  groupEditorOpen: boolean
  addGroupDialogOpen: boolean
  editGroupDialogOpen: boolean
  importGroupsDialogOpen: boolean
  replaceGroupsConfirmationOpen: boolean
  editingGroupId: GroupId | null

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
  studentRemovalConfirmation: StudentRemovalCheck | null
  gitUsernameImportResult: ImportGitUsernamesResult | null
  usernameVerificationResult: UsernameVerificationResult | null
  lmsImportConflicts: LmsIdConflict[] | null
  pendingGroupImport: GroupImportConfig | null
  coverageReport: CoverageReport | null
  validationResult: ValidationResult | null
  preflightResult: RepoPreflightResult | null
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
  setProfileMenuOpen: (open: boolean) => void
  setActiveProfile: (profile: string | null) => void

  // Roster tab dialogs
  setStudentEditorOpen: (open: boolean) => void
  setClearRosterDialogOpen: (open: boolean) => void
  setCoverageReportOpen: (open: boolean) => void
  setImportFileDialogOpen: (open: boolean) => void
  setImportGitUsernamesDialogOpen: (open: boolean) => void
  setUsernameVerificationDialogOpen: (open: boolean) => void

  // Assignment tab dialogs
  setNewAssignmentDialogOpen: (open: boolean) => void
  setEditAssignmentDialogOpen: (open: boolean) => void
  setDeleteAssignmentDialogOpen: (open: boolean) => void
  setGroupEditorOpen: (open: boolean) => void
  setAddGroupDialogOpen: (open: boolean) => void
  setEditGroupDialogOpen: (open: boolean) => void
  setImportGroupsDialogOpen: (open: boolean) => void
  setReplaceGroupsConfirmationOpen: (open: boolean) => void
  setEditingGroupId: (id: GroupId | null) => void

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
  setStudentRemovalConfirmation: (check: StudentRemovalCheck | null) => void
  setGitUsernameImportResult: (result: ImportGitUsernamesResult | null) => void
  setUsernameVerificationResult: (
    result: UsernameVerificationResult | null,
  ) => void
  setLmsImportConflicts: (conflicts: LmsIdConflict[] | null) => void
  setPendingGroupImport: (config: GroupImportConfig | null) => void
  setCoverageReport: (report: CoverageReport | null) => void
  setValidationResult: (result: ValidationResult | null) => void
  setPreflightResult: (result: RepoPreflightResult | null) => void

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
  profileMenuOpen: false,
  activeProfile: null,

  // Roster tab dialogs
  studentEditorOpen: false,
  clearRosterDialogOpen: false,
  coverageReportOpen: false,
  importFileDialogOpen: false,
  importGitUsernamesDialogOpen: false,
  usernameVerificationDialogOpen: false,

  // Assignment tab dialogs
  newAssignmentDialogOpen: false,
  editAssignmentDialogOpen: false,
  deleteAssignmentDialogOpen: false,
  groupEditorOpen: false,
  addGroupDialogOpen: false,
  editGroupDialogOpen: false,
  importGroupsDialogOpen: false,
  replaceGroupsConfirmationOpen: false,
  editingGroupId: null,

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
  studentRemovalConfirmation: null,
  gitUsernameImportResult: null,
  usernameVerificationResult: null,
  lmsImportConflicts: null,
  pendingGroupImport: null,
  coverageReport: null,
  validationResult: null,
  preflightResult: null,
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
  setProfileMenuOpen: (open) => set({ profileMenuOpen: open }),
  setActiveProfile: (profile) => set({ activeProfile: profile }),

  // Roster tab dialogs
  setStudentEditorOpen: (open) => set({ studentEditorOpen: open }),
  setClearRosterDialogOpen: (open) => set({ clearRosterDialogOpen: open }),
  setCoverageReportOpen: (open) => set({ coverageReportOpen: open }),
  setImportFileDialogOpen: (open) => set({ importFileDialogOpen: open }),
  setImportGitUsernamesDialogOpen: (open) =>
    set({ importGitUsernamesDialogOpen: open }),
  setUsernameVerificationDialogOpen: (open) =>
    set({ usernameVerificationDialogOpen: open }),

  // Assignment tab dialogs
  setNewAssignmentDialogOpen: (open) => set({ newAssignmentDialogOpen: open }),
  setEditAssignmentDialogOpen: (open) =>
    set({ editAssignmentDialogOpen: open }),
  setDeleteAssignmentDialogOpen: (open) =>
    set({ deleteAssignmentDialogOpen: open }),
  setGroupEditorOpen: (open) => set({ groupEditorOpen: open }),
  setAddGroupDialogOpen: (open) => set({ addGroupDialogOpen: open }),
  setEditGroupDialogOpen: (open) => set({ editGroupDialogOpen: open }),
  setImportGroupsDialogOpen: (open) => set({ importGroupsDialogOpen: open }),
  setReplaceGroupsConfirmationOpen: (open) =>
    set({ replaceGroupsConfirmationOpen: open }),
  setEditingGroupId: (id) => set({ editingGroupId: id }),

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
  setStudentRemovalConfirmation: (check) =>
    set({ studentRemovalConfirmation: check }),
  setGitUsernameImportResult: (result) =>
    set({ gitUsernameImportResult: result }),
  setUsernameVerificationResult: (result) =>
    set({ usernameVerificationResult: result }),
  setLmsImportConflicts: (conflicts) => set({ lmsImportConflicts: conflicts }),
  setPendingGroupImport: (config) => set({ pendingGroupImport: config }),
  setCoverageReport: (report) => set({ coverageReport: report }),
  setValidationResult: (result) => set({ validationResult: result }),
  setPreflightResult: (result) => set({ preflightResult: result }),

  // Reset
  reset: () => set(initialState),
}))

export type { ActiveTab }

// Selector helpers
export const selectActiveTab = (state: UiStore) => state.activeTab
export const selectActiveProfile = (state: UiStore) => state.activeProfile
export const selectClosePromptVisible = (state: UiStore) =>
  state.closePromptVisible
