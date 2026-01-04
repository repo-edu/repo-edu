/**
 * App settings hook - owns current GUI settings and saving app-level prefs.
 *
 * Centralizes:
 * - currentGuiSettings state
 * - saving app settings (theme, logging)
 *
 * Storage-layer conversions (snake/camel) remain in adapters; this hook just persists.
 */

import { useCallback, useState } from "react"
import { DEFAULT_GUI_THEME, DEFAULT_LOG_LEVELS } from "../constants"
import * as settingsService from "../services/settingsService"
import type { AppSettings, GuiSettings } from "../types/settings"

interface UseAppSettingsOptions {
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
  saveAppSettings: (overrides?: Partial<AppSettings>) => Promise<void>
}

export function useAppSettings(
  options: UseAppSettingsOptions,
): UseAppSettingsReturn {
  const { getLogging } = options
  const [currentGuiSettings, setCurrentGuiSettings] =
    useState<GuiSettings | null>(null)

  const saveAppSettings = useCallback(
    async (overrides?: Partial<AppSettings>) => {
      if (!currentGuiSettings) return
      const resolvedLogging =
        currentGuiSettings.logging ??
        (getLogging ? getLogging() : { ...DEFAULT_LOG_LEVELS })
      const resolvedTheme = currentGuiSettings.theme ?? DEFAULT_GUI_THEME

      try {
        const existing = (await settingsService
          .loadAppSettings()
          .catch(() => null)) ?? {
          theme: resolvedTheme,
          logging: resolvedLogging,
          lms_connection: null,
          git_connections: {},
        }
        const lmsConnection = existing.lms_connection ?? null
        const gitConnections = existing.git_connections ?? {}

        await settingsService.saveAppSettings({
          ...existing,
          theme: resolvedTheme,
          logging: resolvedLogging,
          lms_connection: lmsConnection,
          git_connections: gitConnections,
          ...overrides,
        })
      } catch (error) {
        console.error("Failed to save app settings:", error)
      }
    },
    [currentGuiSettings, getLogging],
  )

  return {
    currentGuiSettings,
    setCurrentGuiSettings,
    saveAppSettings,
  }
}
