/**
 * Window state management hook - handles window size restoration and saving
 *
 * Extracts Tauri window API usage from App.tsx, isolating:
 * - Window size restoration from settings
 * - Debounced save on resize
 */

import { getCurrentWindow, PhysicalSize } from "@tauri-apps/api/window"
import { useCallback, useEffect, useRef } from "react"
import { RESIZE_DEBOUNCE_MS, WINDOW_MIN_SIZE } from "../constants"

export interface WindowStateConfig {
  /** Current window dimensions from settings */
  width: number
  height: number
}

export interface UseWindowStateOptions {
  /** Window configuration (null until settings are loaded) */
  config: WindowStateConfig | null
  /** Callback to save window state */
  onSave: () => Promise<void>
}

export interface UseWindowStateReturn {
  /** Manually trigger window state save */
  saveWindowState: () => Promise<void>
}

/**
 * Hook to manage Tauri window state (size restoration and save on resize)
 */
export function useWindowState(
  options: UseWindowStateOptions,
): UseWindowStateReturn {
  const { config, onSave } = options

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

  // Memoize the save callback
  const saveWindowState = useCallback(async () => {
    if (!config) return
    await onSave()
  }, [config, onSave])

  // Save window size on resize (debounced)
  useEffect(() => {
    const win = getCurrentWindow()

    let debounce: number | undefined
    const scheduleSave = () => {
      if (debounce) {
        clearTimeout(debounce)
      }
      debounce = window.setTimeout(() => {
        saveWindowState()
      }, RESIZE_DEBOUNCE_MS)
    }

    const unlistenResize = win.onResized(scheduleSave)

    return () => {
      unlistenResize.then((fn) => fn())
      if (debounce) clearTimeout(debounce)
    }
  }, [saveWindowState])

  return { saveWindowState }
}
