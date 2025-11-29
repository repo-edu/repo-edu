import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Theme } from "../types/settings";

const THEME_CLASSES = ["theme-light", "theme-dark", "theme-system"] as const;

const LIGHT_BG = "#f5f5f5";
const DARK_BG = "#141414";

/**
 * Apply the selected theme class to the document element.
 * Also updates the Tauri window theme for the title bar.
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

    // Update Tauri window theme
    const win = getCurrentWindow();

    if (theme === "system") {
      // Let Tauri follow the OS theme by passing null
      win.setTheme(null).catch(console.error);
    } else {
      // Explicitly set light or dark
      win.setTheme(theme).catch(console.error);
    }

    return () => {
      THEME_CLASSES.forEach((cls) => root.classList.remove(cls));
    };
  }, [theme]);

  // Update background color based on effective theme
  useEffect(() => {
    const win = getCurrentWindow();

    const updateBackground = () => {
      let dark: boolean;
      if (theme === "dark") {
        dark = true;
      } else if (theme === "light") {
        dark = false;
      } else {
        // system - check actual OS preference
        dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      }
      win.setBackgroundColor(dark ? DARK_BG : LIGHT_BG).catch(console.error);
    };

    updateBackground();

    // Listen for system theme changes when using "system" theme
    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      mediaQuery.addEventListener("change", updateBackground);
      return () => mediaQuery.removeEventListener("change", updateBackground);
    }
  }, [theme]);
}
