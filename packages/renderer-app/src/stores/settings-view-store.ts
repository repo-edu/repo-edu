import { create } from "zustand"

export type SettingsCategory =
  | "lms-connections"
  | "git-connections"
  | "llm-connections"
  | "display"
  | "analysis"
  | "performance"
  | "shortcuts"

type SettingsViewState = {
  settingsDialogOpen: boolean
  settingsCategory: SettingsCategory
}

type SettingsViewActions = {
  setSettingsDialogOpen: (open: boolean) => void
  /** The command other areas send to show the settings sheet. */
  openSettings: (category?: SettingsCategory) => void
  reset: () => void
}

const initialState: SettingsViewState = {
  settingsDialogOpen: false,
  settingsCategory: "display",
}

export const useSettingsViewStore = create<
  SettingsViewState & SettingsViewActions
>((set) => ({
  ...initialState,

  setSettingsDialogOpen: (open) =>
    set((state) =>
      state.settingsDialogOpen === open ? state : { settingsDialogOpen: open },
    ),
  openSettings: (category) =>
    set((state) => {
      const nextCategory = category ?? state.settingsCategory
      if (state.settingsDialogOpen && state.settingsCategory === nextCategory) {
        return state
      }
      return {
        settingsDialogOpen: true,
        settingsCategory: nextCategory,
      }
    }),

  reset: () => set(initialState),
}))
