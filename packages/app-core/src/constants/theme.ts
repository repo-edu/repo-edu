export const THEME_CLASSES = [
  "theme-light",
  "theme-dark",
  "theme-system",
] as const
export const LIGHT_BG = "#f5f5f5"
export const DARK_BG = "#141414"
export const THEME_STORAGE_KEY = "theme"

export type Theme = "system" | "light" | "dark"

export const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: "system", label: "System (Auto)" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
]
