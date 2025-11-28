import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Theme } from "../types/settings";

const THEME_CLASSES = ["theme-light", "theme-dark", "theme-system"] as const;

const LIGHT_BG = "#f5f5f5";
const DARK_BG = "#141414";

/**
 * Determine if dark mode is active based on theme setting and system preference.
 */
function isDarkMode(theme: Theme): boolean {
  if (theme === "dark") return true;
  if (theme === "light") return false;
  // "system" - check OS preference
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Apply the selected theme class to the document element.
 * Also updates the Tauri window background color for the title bar.
 */
export function useTheme(theme: Theme) {
  useEffect(() => {
    const root = document.documentElement;

    // Remove all theme classes
    THEME_CLASSES.forEach((cls) => root.classList.remove(cls));

    // Apply the selected theme class
    root.classList.add(`theme-${theme}`);

    // Cache theme in localStorage for fast initial load
    localStorage.setItem("theme", theme);

    // Update Tauri window theme and background color
    const dark = isDarkMode(theme);
    const window = getCurrentWindow();
    window.setTheme(dark ? "dark" : "light").catch(console.error);
    window.setBackgroundColor(dark ? DARK_BG : LIGHT_BG).catch(console.error);

    return () => {
      THEME_CLASSES.forEach((cls) => root.classList.remove(cls));
    };
  }, [theme]);

  // Listen for system theme changes when using "system" theme
  useEffect(() => {
    if (theme !== "system") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      const dark = mediaQuery.matches;
      const win = getCurrentWindow();
      win.setTheme(dark ? "dark" : "light").catch(console.error);
      win.setBackgroundColor(dark ? DARK_BG : LIGHT_BG).catch(console.error);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [theme]);
}
