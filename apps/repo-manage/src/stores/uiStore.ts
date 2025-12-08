import { create } from "zustand"

type TabType = "lms" | "repo"

interface UiState {
  activeTab: TabType
  collapsedSections: Set<string>
  tokenDialogOpen: boolean
  tokenDialogValue: string
  lmsTokenDialogOpen: boolean
  lmsTokenDialogValue: string
  showTokenInstructions: boolean
  tokenInstructions: string
  settingsMenuOpen: boolean
  closePromptVisible: boolean
}

interface UiStore extends UiState {
  setActiveTab: (tab: TabType) => void
  setCollapsedSections: (sections: string[]) => void
  toggleSection: (sectionId: string) => void
  isSectionCollapsed: (sectionId: string) => boolean
  getCollapsedSectionsArray: () => string[]
  openTokenDialog: (value?: string) => void
  closeTokenDialog: () => void
  setTokenDialogValue: (value: string) => void
  openLmsTokenDialog: (value?: string) => void
  closeLmsTokenDialog: () => void
  setLmsTokenDialogValue: (value: string) => void
  setShowTokenInstructions: (show: boolean) => void
  setTokenInstructions: (instructions: string) => void
  openSettingsMenu: () => void
  closeSettingsMenu: () => void
  setSettingsMenuOpen: (open: boolean) => void
  showClosePrompt: () => void
  hideClosePrompt: () => void
  reset: () => void
}

const initialState: UiState = {
  activeTab: "lms",
  collapsedSections: new Set<string>(),
  tokenDialogOpen: false,
  tokenDialogValue: "",
  lmsTokenDialogOpen: false,
  lmsTokenDialogValue: "",
  showTokenInstructions: false,
  tokenInstructions: "",
  settingsMenuOpen: false,
  closePromptVisible: false,
}

export const useUiStore = create<UiStore>((set, get) => ({
  ...initialState,

  setActiveTab: (tab) => set({ activeTab: tab }),
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
  isSectionCollapsed: (sectionId) => get().collapsedSections.has(sectionId),
  getCollapsedSectionsArray: () => Array.from(get().collapsedSections),
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
  openSettingsMenu: () => set({ settingsMenuOpen: true }),
  closeSettingsMenu: () => set({ settingsMenuOpen: false }),
  setSettingsMenuOpen: (open) => set({ settingsMenuOpen: open }),
  showClosePrompt: () => set({ closePromptVisible: true }),
  hideClosePrompt: () => set({ closePromptVisible: false }),
  reset: () => set(initialState),
}))

export type { TabType }
