/**
 * Window state management hook - handles window size restoration
 *
 * Extracts Tauri window API usage from App.tsx, isolating:
 * - Window size restoration from settings
 */

import { getCurrentWindow, PhysicalSize } from "@tauri-apps/api/window"
import { useEffect, useRef } from "react"
import { WINDOW_MIN_SIZE } from "../constants"

export interface WindowStateConfig {
  /** Current window dimensions from settings */
  width: number
  height: number
}

export interface UseWindowStateOptions {
  /** Window configuration (null until settings are loaded) */
  config: WindowStateConfig | null
}

export interface UseWindowStateReturn {
  /** Manually trigger window state save */
  saveWindowState: () => Promise<void>
}

/**
 * Hook to manage Tauri window state (size restoration)
 */
export function useWindowState(
  options: UseWindowStateOptions,
): UseWindowStateReturn {
  const { config } = options

  // Track if window has been restored to prevent multiple restores
  const windowRestoredRef = useRef(false)

  // Restore window size from settings, then show window
  useEffect(() => {
    if (!config || windowRestoredRef.current) return
    windowRestoredRef.current = true

    const win = getCurrentWindow()
    const { width, height } = config

    const restoreAndShow = async () => {
      if (width > WINDOW_MIN_SIZE && height > WINDOW_MIN_SIZE) {
        await win.setSize(new PhysicalSize(width, height))
        await win.center()
      }
      await win.show()
    }

    restoreAndShow().catch((e) => console.error("Failed to restore window", e))
  }, [config])

  // Placeholder for manual save - actual implementation in sidebar
  const saveWindowState = async () => {
    // No-op here, saving is done via SettingsSidebar
  }

  return { saveWindowState }
}
