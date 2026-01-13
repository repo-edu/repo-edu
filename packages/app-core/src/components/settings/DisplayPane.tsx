/**
 * DisplayPane - Display settings for theme, date format, and time format.
 * Used within the SettingsDialog.
 */

import type {
  DateFormat,
  Theme,
  TimeFormat,
} from "@repo-edu/backend-interface/types"
import {
  FormField,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo-edu/ui"
import { useAppSettingsStore } from "../../stores/appSettingsStore"

const THEMES: { value: Theme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
]

const DATE_FORMATS: { value: DateFormat; label: string; example: string }[] = [
  { value: "MDY", label: "MM/DD/YYYY", example: "01/31/2025" },
  { value: "DMY", label: "DD/MM/YYYY", example: "31/01/2025" },
]

const TIME_FORMATS: { value: TimeFormat; label: string; example: string }[] = [
  { value: "12h", label: "12-hour", example: "2:30 PM" },
  { value: "24h", label: "24-hour", example: "14:30" },
]

export function DisplayPane() {
  const theme = useAppSettingsStore((state) => state.theme)
  const dateFormat = useAppSettingsStore((state) => state.dateFormat)
  const timeFormat = useAppSettingsStore((state) => state.timeFormat)
  const setTheme = useAppSettingsStore((state) => state.setTheme)
  const setDateFormat = useAppSettingsStore((state) => state.setDateFormat)
  const setTimeFormat = useAppSettingsStore((state) => state.setTimeFormat)
  const saveAppSettings = useAppSettingsStore((state) => state.save)

  const handleThemeChange = async (value: Theme) => {
    setTheme(value)
    await saveAppSettings()
  }

  const handleDateFormatChange = async (value: DateFormat) => {
    setDateFormat(value)
    await saveAppSettings()
  }

  const handleTimeFormatChange = async (value: TimeFormat) => {
    setTimeFormat(value)
    await saveAppSettings()
  }

  return (
    <div className="space-y-6">
      {/* Theme */}
      <FormField
        label="Theme"
        htmlFor="theme"
        description="Choose how the application appears."
      >
        <Select value={theme} onValueChange={handleThemeChange}>
          <SelectTrigger id="theme" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {THEMES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      {/* Date Format */}
      <FormField
        label="Date Format"
        htmlFor="date-format"
        description="Format used for displaying dates throughout the application."
      >
        <Select value={dateFormat} onValueChange={handleDateFormatChange}>
          <SelectTrigger id="date-format" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DATE_FORMATS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
                <span className="ml-2 text-xs text-muted-foreground">
                  ({f.example})
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      {/* Time Format */}
      <FormField
        label="Time Format"
        htmlFor="time-format"
        description="Format used for displaying times throughout the application."
      >
        <Select value={timeFormat} onValueChange={handleTimeFormatChange}>
          <SelectTrigger id="time-format" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIME_FORMATS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
                <span className="ml-2 text-xs text-muted-foreground">
                  ({f.example})
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
    </div>
  )
}
