import type { ThemePreference } from "@repo-edu/domain"
import { useEffect } from "react"
import { DARK_BG, LIGHT_BG, THEME_CLASSES } from "../constants/theme.js"

function applyThemeClass(resolved: "light" | "dark") {
  const root = document.documentElement
  for (const cls of THEME_CLASSES) {
    root.classList.remove(cls)
  }
  root.classList.add(resolved === "dark" ? "theme-dark" : "theme-light")
  document.body.style.backgroundColor = resolved === "dark" ? DARK_BG : LIGHT_BG
}

function resolveTheme(preference: ThemePreference): "light" | "dark" {
  if (preference === "light" || preference === "dark") return preference
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light"
}

function syncNativeTheme(theme: ThemePreference): void {
  // Desktop-only: sync Electron's nativeTheme so the macOS title bar
  // matches the app theme. The bridge is only present in the desktop shell.
  const host = (window as unknown as Record<string, unknown>)
    .repoEduDesktopHost as
    | { setNativeTheme?: (theme: string) => Promise<void> }
    | undefined
  void host?.setNativeTheme?.(theme)
}

export function useTheme(theme: ThemePreference): void {
  useEffect(() => {
    applyThemeClass(resolveTheme(theme))
    syncNativeTheme(theme)

    if (theme !== "system") return

    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const handler = () => applyThemeClass(resolveTheme("system"))
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [theme])
}
