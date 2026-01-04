/**
 * UI store - manages dialog/sheet visibility and UI state.
 * This store holds transient UI state that is not persisted.
 */

import { create } from "zustand"
import type {
  CoverageReport,
  GroupImportConfig,
  ImportGitUsernamesResult,
  LmsIdConflict,
  StudentRemovalCheck,
  UsernameVerificationResult,
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
  connectionsSheetOpen: boolean
  appSettingsMenuOpen: boolean
  profileMenuOpen: boolean
  activeProfile: string | null

  // Roster tab dialogs
  studentEditorOpen: boolean
  clearRosterDialogOpen: boolean
  coverageReportOpen: boolean
  importGitUsernamesDialogOpen: boolean
  usernameVerificationDialogOpen: boolean

  // Assignment tab dialogs
  groupEditorOpen: boolean
  importGroupsDialogOpen: boolean
  replaceGroupsConfirmationOpen: boolean

  // Profile dialogs
  courseSelectionDialogOpen: boolean
  exportSettingsOpen: boolean

  // Close prompt (unsaved changes)
  closePromptVisible: boolean

  // Confirmation/result state (null = dialog closed)
  studentRemovalConfirmation: StudentRemovalCheck | null
  gitUsernameImportResult: ImportGitUsernamesResult | null
  usernameVerificationResult: UsernameVerificationResult | null
  lmsImportConflicts: LmsIdConflict[] | null
  pendingGroupImport: GroupImportConfig | null
  coverageReport: CoverageReport | null

  // Legacy fields (will be removed in Phase 6)
  /** @deprecated Use appSettingsMenuOpen instead */
  settingsMenuOpen: boolean
  /** @deprecated No longer used */
  collapsedSections: Set<string>
  /** @deprecated Token dialogs moved to ConnectionsSheet */
  tokenDialogOpen: boolean
  /** @deprecated Token dialogs moved to ConnectionsSheet */
  tokenDialogValue: string
  /** @deprecated Token dialogs moved to ConnectionsSheet */
  lmsTokenDialogOpen: boolean
  /** @deprecated Token dialogs moved to ConnectionsSheet */
  lmsTokenDialogValue: string
  /** @deprecated No longer used */
  showTokenInstructions: boolean
  /** @deprecated No longer used */
  tokenInstructions: string
}

interface UiActions {
  // Navigation
  setActiveTab: (tab: ActiveTab) => void

  // App-level dialogs/sheets
  setConnectionsSheetOpen: (open: boolean) => void
  setAppSettingsMenuOpen: (open: boolean) => void
  setProfileMenuOpen: (open: boolean) => void
  setActiveProfile: (profile: string | null) => void

  // Roster tab dialogs
  setStudentEditorOpen: (open: boolean) => void
  setClearRosterDialogOpen: (open: boolean) => void
  setCoverageReportOpen: (open: boolean) => void
  setImportGitUsernamesDialogOpen: (open: boolean) => void
  setUsernameVerificationDialogOpen: (open: boolean) => void

  // Assignment tab dialogs
  setGroupEditorOpen: (open: boolean) => void
  setImportGroupsDialogOpen: (open: boolean) => void
  setReplaceGroupsConfirmationOpen: (open: boolean) => void

  // Profile dialogs
  setCourseSelectionDialogOpen: (open: boolean) => void
  setExportSettingsOpen: (open: boolean) => void

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

  // Reset
  reset: () => void

  // Legacy compatibility methods (will be removed in Phase 6)
  /** @deprecated Use setAppSettingsMenuOpen instead */
  setSettingsMenuOpen: (open: boolean) => void
  /** @deprecated Use setAppSettingsMenuOpen instead */
  openSettingsMenu: () => void
  /** @deprecated Use setAppSettingsMenuOpen instead */
  closeSettingsMenu: () => void
  /** @deprecated No longer used in new design */
  setCollapsedSections: (sections: string[]) => void
  /** @deprecated No longer used in new design */
  toggleSection: (sectionId: string) => void
  /** @deprecated No longer used in new design */
  isSectionCollapsed: (sectionId: string) => boolean
  /** @deprecated No longer used in new design */
  getCollapsedSectionsArray: () => string[]
  /** @deprecated Token dialogs moved to ConnectionsSheet */
  openTokenDialog: (value?: string) => void
  /** @deprecated Token dialogs moved to ConnectionsSheet */
  closeTokenDialog: () => void
  /** @deprecated Token dialogs moved to ConnectionsSheet */
  setTokenDialogValue: (value: string) => void
  /** @deprecated Token dialogs moved to ConnectionsSheet */
  openLmsTokenDialog: (value?: string) => void
  /** @deprecated Token dialogs moved to ConnectionsSheet */
  closeLmsTokenDialog: () => void
  /** @deprecated Token dialogs moved to ConnectionsSheet */
  setLmsTokenDialogValue: (value: string) => void
  /** @deprecated No longer used */
  setShowTokenInstructions: (show: boolean) => void
  /** @deprecated No longer used */
  setTokenInstructions: (instructions: string) => void
}

interface UiStore extends UiState, UiActions {}

const initialState: UiState = {
  // Navigation
  activeTab: "roster",

  // App-level dialogs/sheets
  connectionsSheetOpen: false,
  appSettingsMenuOpen: false,
  profileMenuOpen: false,
  activeProfile: null,

  // Roster tab dialogs
  studentEditorOpen: false,
  clearRosterDialogOpen: false,
  coverageReportOpen: false,
  importGitUsernamesDialogOpen: false,
  usernameVerificationDialogOpen: false,

  // Assignment tab dialogs
  groupEditorOpen: false,
  importGroupsDialogOpen: false,
  replaceGroupsConfirmationOpen: false,

  // Profile dialogs
  courseSelectionDialogOpen: false,
  exportSettingsOpen: false,

  // Close prompt
  closePromptVisible: false,

  // Confirmation/result state
  studentRemovalConfirmation: null,
  gitUsernameImportResult: null,
  usernameVerificationResult: null,
  lmsImportConflicts: null,
  pendingGroupImport: null,
  coverageReport: null,

  // Legacy fields
  settingsMenuOpen: false,
  collapsedSections: new Set<string>(),
  tokenDialogOpen: false,
  tokenDialogValue: "",
  lmsTokenDialogOpen: false,
  lmsTokenDialogValue: "",
  showTokenInstructions: false,
  tokenInstructions: "",
}

export const useUiStore = create<UiStore>((set, get) => ({
  ...initialState,

  // Navigation
  setActiveTab: (tab) => set({ activeTab: tab }),

  // App-level dialogs/sheets
  setConnectionsSheetOpen: (open) => set({ connectionsSheetOpen: open }),
  setAppSettingsMenuOpen: (open) => set({ appSettingsMenuOpen: open }),
  setProfileMenuOpen: (open) => set({ profileMenuOpen: open }),
  setActiveProfile: (profile) => set({ activeProfile: profile }),

  // Roster tab dialogs
  setStudentEditorOpen: (open) => set({ studentEditorOpen: open }),
  setClearRosterDialogOpen: (open) => set({ clearRosterDialogOpen: open }),
  setCoverageReportOpen: (open) => set({ coverageReportOpen: open }),
  setImportGitUsernamesDialogOpen: (open) =>
    set({ importGitUsernamesDialogOpen: open }),
  setUsernameVerificationDialogOpen: (open) =>
    set({ usernameVerificationDialogOpen: open }),

  // Assignment tab dialogs
  setGroupEditorOpen: (open) => set({ groupEditorOpen: open }),
  setImportGroupsDialogOpen: (open) => set({ importGroupsDialogOpen: open }),
  setReplaceGroupsConfirmationOpen: (open) =>
    set({ replaceGroupsConfirmationOpen: open }),

  // Profile dialogs
  setCourseSelectionDialogOpen: (open) =>
    set({ courseSelectionDialogOpen: open }),
  setExportSettingsOpen: (open) => set({ exportSettingsOpen: open }),

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

  // Reset
  reset: () => set(initialState),

  // Legacy compatibility methods
  setSettingsMenuOpen: (open) =>
    set({ settingsMenuOpen: open, appSettingsMenuOpen: open }),
  openSettingsMenu: () =>
    set({ settingsMenuOpen: true, appSettingsMenuOpen: true }),
  closeSettingsMenu: () =>
    set({ settingsMenuOpen: false, appSettingsMenuOpen: false }),
  setCollapsedSections: (sections) =>
    set({ collapsedSections: new Set(sections) }),
  toggleSection: (sectionId) =>
    set((state) => {
      const newSet = new Set(state.collapsedSections)
      if (newSet.has(sectionId)) {
        newSet.delete(sectionId)
      } else {
        newSet.add(sectionId)
      }
      return { collapsedSections: newSet }
    }),
  isSectionCollapsed: (sectionId): boolean => {
    return get().collapsedSections.has(sectionId)
  },
  getCollapsedSectionsArray: (): string[] => {
    return Array.from(get().collapsedSections)
  },
  openTokenDialog: (value = "") =>
    set({ tokenDialogOpen: true, tokenDialogValue: value }),
  closeTokenDialog: () => set({ tokenDialogOpen: false }),
  setTokenDialogValue: (value) => set({ tokenDialogValue: value }),
  openLmsTokenDialog: (value = "") =>
    set({ lmsTokenDialogOpen: true, lmsTokenDialogValue: value }),
  closeLmsTokenDialog: () => set({ lmsTokenDialogOpen: false }),
  setLmsTokenDialogValue: (value) => set({ lmsTokenDialogValue: value }),
  setShowTokenInstructions: (show) => set({ showTokenInstructions: show }),
  setTokenInstructions: (instructions) =>
    set({ tokenInstructions: instructions }),
}))

export type { ActiveTab }

// Selector helpers
export const selectActiveTab = (state: UiStore) => state.activeTab
export const selectActiveProfile = (state: UiStore) => state.activeProfile
export const selectClosePromptVisible = (state: UiStore) =>
  state.closePromptVisible
