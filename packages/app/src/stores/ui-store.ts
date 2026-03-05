import { create } from "zustand";
import type { ProfileSummary } from "@repo-edu/domain";
import type { ActiveTab } from "../types/index.js";

type GroupSetOperationState = {
  kind: "sync" | "import" | "reimport";
  groupSetId: string;
};

type SidebarSelection = {
  kind: "group-set";
  id: string;
} | null;

type SettingsCategory = "connections" | "display" | "shortcuts";

export type LmsImportConflict = {
  matchKey: string;
  value: string;
  matchedIds: string[];
};

type UiState = {
  // Navigation
  activeTab: ActiveTab;
  activeProfileId: string | null;

  // Dialog visibility
  settingsDialogOpen: boolean;
  settingsCategory: SettingsCategory;
  newProfileDialogOpen: boolean;
  importFileDialogOpen: boolean;
  rosterSyncDialogOpen: boolean;
  importGitUsernamesDialogOpen: boolean;
  usernameVerificationDialogOpen: boolean;
  newAssignmentDialogOpen: boolean;
  fileImportExportOpen: boolean;
  issuesSheetOpen: boolean;
  validationDialogOpen: boolean;
  preflightDialogOpen: boolean;

  // Group set dialogs
  connectLmsGroupSetDialogOpen: boolean;
  newLocalGroupSetDialogOpen: boolean;
  importGroupSetDialogOpen: boolean;
  reimportGroupSetTargetId: string | null;
  copyGroupSetSourceId: string | null;
  deleteGroupSetTargetId: string | null;
  deleteGroupTargetId: string | null;
  addGroupDialogGroupSetId: string | null;

  // Assignment dialog context
  preSelectedGroupSetId: string | null;

  // LMS import conflicts
  lmsImportConflicts: LmsImportConflict[] | null;

  // Sidebar
  sidebarSelection: SidebarSelection;
  groupSetPanelTab: "groups" | "assignments";
  groupSetOperation: GroupSetOperationState | null;

  // Sidebar action triggers
  renameGroupSetTriggerId: string | null;
  exportGroupSetTriggerId: string | null;
  syncGroupSetTriggerId: string | null;

  // Profile list cache
  profileList: ProfileSummary[];
  profileListLoading: boolean;

  // Close prompt
  closePromptVisible: boolean;
};

type UiActions = {
  setActiveTab: (tab: ActiveTab) => void;
  setActiveProfileId: (id: string | null) => void;

  setSettingsDialogOpen: (open: boolean) => void;
  openSettings: (category?: SettingsCategory) => void;
  setNewProfileDialogOpen: (open: boolean) => void;
  setImportFileDialogOpen: (open: boolean) => void;
  setRosterSyncDialogOpen: (open: boolean) => void;
  setImportGitUsernamesDialogOpen: (open: boolean) => void;
  setUsernameVerificationDialogOpen: (open: boolean) => void;
  setNewAssignmentDialogOpen: (open: boolean) => void;
  setFileImportExportOpen: (open: boolean) => void;
  setIssuesSheetOpen: (open: boolean) => void;
  setValidationDialogOpen: (open: boolean) => void;
  setPreflightDialogOpen: (open: boolean) => void;

  setConnectLmsGroupSetDialogOpen: (open: boolean) => void;
  setNewLocalGroupSetDialogOpen: (open: boolean) => void;
  setImportGroupSetDialogOpen: (open: boolean) => void;
  setReimportGroupSetTargetId: (id: string | null) => void;
  setCopyGroupSetSourceId: (id: string | null) => void;
  setDeleteGroupSetTargetId: (id: string | null) => void;
  setDeleteGroupTargetId: (id: string | null) => void;
  setAddGroupDialogGroupSetId: (id: string | null) => void;

  setPreSelectedGroupSetId: (id: string | null) => void;
  setLmsImportConflicts: (conflicts: LmsImportConflict[] | null) => void;

  setSidebarSelection: (selection: SidebarSelection) => void;
  setGroupSetPanelTab: (tab: "groups" | "assignments") => void;
  setGroupSetOperation: (op: GroupSetOperationState | null) => void;

  setRenameGroupSetTriggerId: (id: string | null) => void;
  setExportGroupSetTriggerId: (id: string | null) => void;
  setSyncGroupSetTriggerId: (id: string | null) => void;

  setProfileList: (list: ProfileSummary[]) => void;
  setProfileListLoading: (loading: boolean) => void;

  showClosePrompt: () => void;
  hideClosePrompt: () => void;

  reset: () => void;
};

const initialState: UiState = {
  activeTab: "roster",
  activeProfileId: null,

  settingsDialogOpen: false,
  settingsCategory: "connections",
  newProfileDialogOpen: false,
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

  profileList: [],
  profileListLoading: false,

  closePromptVisible: false,
};

export const useUiStore = create<UiState & UiActions>((set) => ({
  ...initialState,

  setActiveTab: (tab) => set({ activeTab: tab }),
  setActiveProfileId: (id) => set({ activeProfileId: id }),

  setSettingsDialogOpen: (open) => set({ settingsDialogOpen: open }),
  openSettings: (category) =>
    set({
      settingsDialogOpen: true,
      settingsCategory: category ?? "connections",
    }),
  setNewProfileDialogOpen: (open) => set({ newProfileDialogOpen: open }),
  setImportFileDialogOpen: (open) => set({ importFileDialogOpen: open }),
  setRosterSyncDialogOpen: (open) => set({ rosterSyncDialogOpen: open }),
  setImportGitUsernamesDialogOpen: (open) =>
    set({ importGitUsernamesDialogOpen: open }),
  setUsernameVerificationDialogOpen: (open) =>
    set({ usernameVerificationDialogOpen: open }),
  setNewAssignmentDialogOpen: (open) =>
    set({ newAssignmentDialogOpen: open }),
  setFileImportExportOpen: (open) => set({ fileImportExportOpen: open }),
  setIssuesSheetOpen: (open) => set({ issuesSheetOpen: open }),
  setValidationDialogOpen: (open) => set({ validationDialogOpen: open }),
  setPreflightDialogOpen: (open) => set({ preflightDialogOpen: open }),

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

  setPreSelectedGroupSetId: (id) => set({ preSelectedGroupSetId: id }),
  setLmsImportConflicts: (conflicts) =>
    set({ lmsImportConflicts: conflicts }),

  setSidebarSelection: (selection) => set({ sidebarSelection: selection }),
  setGroupSetPanelTab: (tab) => set({ groupSetPanelTab: tab }),
  setGroupSetOperation: (op) => set({ groupSetOperation: op }),

  setRenameGroupSetTriggerId: (id) => set({ renameGroupSetTriggerId: id }),
  setExportGroupSetTriggerId: (id) => set({ exportGroupSetTriggerId: id }),
  setSyncGroupSetTriggerId: (id) => set({ syncGroupSetTriggerId: id }),

  setProfileList: (list) => set({ profileList: list }),
  setProfileListLoading: (loading) => set({ profileListLoading: loading }),

  showClosePrompt: () => set({ closePromptVisible: true }),
  hideClosePrompt: () => set({ closePromptVisible: false }),

  reset: () => set(initialState),
}));

export const selectActiveTab = (state: UiState) => state.activeTab;
export const selectActiveProfileId = (state: UiState) => state.activeProfileId;
export const selectClosePromptVisible = (state: UiState) =>
  state.closePromptVisible;
