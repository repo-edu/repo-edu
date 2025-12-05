import { create } from "zustand"

type TabType = "lms" | "repo"

interface UiState {
  activeTab: TabType
  configLocked: boolean
  optionsLocked: boolean
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
  toggleConfigLock: () => void
  toggleOptionsLock: () => void
  setConfigLocked: (locked: boolean) => void
  setOptionsLocked: (locked: boolean) => void
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
  configLocked: true,
  optionsLocked: true,
  tokenDialogOpen: false,
  tokenDialogValue: "",
  lmsTokenDialogOpen: false,
  lmsTokenDialogValue: "",
  showTokenInstructions: false,
  tokenInstructions: "",
  settingsMenuOpen: false,
  closePromptVisible: false,
}

export const useUiStore = create<UiStore>((set) => ({
  ...initialState,

  setActiveTab: (tab) => set({ activeTab: tab }),
  toggleConfigLock: () => set((s) => ({ configLocked: !s.configLocked })),
  toggleOptionsLock: () => set((s) => ({ optionsLocked: !s.optionsLocked })),
  setConfigLocked: (locked) => set({ configLocked: locked }),
  setOptionsLocked: (locked) => set({ optionsLocked: locked }),
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
