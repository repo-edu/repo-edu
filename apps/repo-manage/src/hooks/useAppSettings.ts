/**
 * App settings hook - owns current GUI settings and saving app-level prefs.
 *
 * Centralizes:
 * - currentGuiSettings state
 * - saving app settings (theme, window size, sidebar state, collapsed sections, logging)
 *
 * Storage-layer conversions (snake/camel) remain in adapters; this hook just persists.
 */

import { getCurrentWindow } from "@tauri-apps/api/window"
import { useCallback, useMemo, useState } from "react"
import { DEFAULT_GUI_THEME, DEFAULT_LOG_LEVELS } from "../constants"
import * as settingsService from "../services/settingsService"
import type { AppSettings, GuiSettings } from "../types/settings"

interface UiState {
  activeTab: "lms" | "repo"
  collapsedSections: string[]
  settingsMenuOpen: boolean
}

interface UseAppSettingsOptions {
  /** Supplies latest UI state (tabs, collapses, sidebar) when saving app settings */
  getUiState: () => UiState
  /** Supplies latest logging flags when not present in currentGuiSettings */
  getLogging?: () => {
    info: boolean
    debug: boolean
    warning: boolean
    error: boolean
  }
}

export interface UseAppSettingsReturn {
  currentGuiSettings: GuiSettings | null
  setCurrentGuiSettings: (settings: GuiSettings | null) => void
  windowConfig: { width: number; height: number } | null
  saveAppSettings: (overrides?: Partial<AppSettings>) => Promise<void>
}

export function useAppSettings(
  options: UseAppSettingsOptions,
): UseAppSettingsReturn {
  const { getUiState, getLogging } = options
  const [currentGuiSettings, setCurrentGuiSettings] =
    useState<GuiSettings | null>(null)

  const windowConfig = useMemo(() => {
    if (!currentGuiSettings) return null
    return {
      width: currentGuiSettings.window_width,
      height: currentGuiSettings.window_height,
    }
  }, [currentGuiSettings])

  const saveAppSettings = useCallback(
    async (overrides?: Partial<AppSettings>) => {
      if (!currentGuiSettings) return

      const win = getCurrentWindow()
      try {
        const size = await win.innerSize()
        const uiState = getUiState()

        await settingsService.saveAppSettings({
          theme: currentGuiSettings?.theme ?? DEFAULT_GUI_THEME,
          active_tab: uiState.activeTab,
          collapsed_sections: uiState.collapsedSections,
          sidebar_open: uiState.settingsMenuOpen ?? false,
          window_width: size.width,
          window_height: size.height,
          logging:
            currentGuiSettings?.logging ??
            (getLogging ? getLogging() : { ...DEFAULT_LOG_LEVELS }),
          ...overrides,
        })
      } catch (error) {
        console.error("Failed to save app settings:", error)
      }
    },
    [currentGuiSettings, getLogging, getUiState],
  )

  return {
    currentGuiSettings,
    setCurrentGuiSettings,
    windowConfig,
    saveAppSettings,
  }
}
