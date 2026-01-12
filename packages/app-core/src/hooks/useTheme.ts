import { useEffect } from "react"
import {
  DARK_BG,
  LIGHT_BG,
  THEME_CLASSES,
  THEME_STORAGE_KEY,
} from "../constants"
import { setWindowBackgroundColor, setWindowTheme } from "../services/platform"
import type { Theme } from "../types/settings"

/**
 * Apply the selected theme class to the document element.
 * Also updates the platform window theme for the title bar.
 */
export function useTheme(theme: Theme) {
  useEffect(() => {
    const root = document.documentElement

    // Remove all theme classes
    for (const cls of THEME_CLASSES) {
      root.classList.remove(cls)
    }

    // Apply the selected theme class
    root.classList.add(`theme-${theme}`)

    // Cache theme in localStorage for fast initial load
    localStorage.setItem(THEME_STORAGE_KEY, theme)

    setWindowTheme(theme).catch(console.error)

    return () => {
      for (const cls of THEME_CLASSES) {
        root.classList.remove(cls)
      }
    }
  }, [theme])

  // Update background color based on effective theme
  useEffect(() => {
    const updateBackground = () => {
      let dark: boolean
      if (theme === "dark") {
        dark = true
      } else if (theme === "light") {
        dark = false
      } else {
        // system - check actual OS preference
        dark = window.matchMedia("(prefers-color-scheme: dark)").matches
      }
      setWindowBackgroundColor(dark ? DARK_BG : LIGHT_BG).catch(console.error)
    }

    updateBackground()

    // Listen for system theme changes when using "system" theme
    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
      mediaQuery.addEventListener("change", updateBackground)
      return () => mediaQuery.removeEventListener("change", updateBackground)
    }
  }, [theme])
}
