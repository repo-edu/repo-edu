import { type SyntaxThemeId, syntaxThemeIds } from "@repo-edu/domain/settings"
import type {
  DateFormatPreference,
  ThemePreference,
  TimeFormatPreference,
} from "@repo-edu/domain/types"
import {
  FormField,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Text,
} from "@repo-edu/ui"
import { useState } from "react"
import { useAppSettingsStore } from "../../stores/app-settings-store.js"
import { SYNTAX_THEMES } from "../../utils/blame-highlighter.js"
import { getErrorMessage } from "../../utils/error-message.js"

const THEMES: Array<{ value: ThemePreference; label: string }> = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
]

const DATE_FORMATS: Array<{
  value: DateFormatPreference
  label: string
  example: string
}> = [
  { value: "MDY", label: "MM/DD/YYYY", example: "01/31/2025" },
  { value: "DMY", label: "DD/MM/YYYY", example: "31/01/2025" },
]

const TIME_FORMATS: Array<{
  value: TimeFormatPreference
  label: string
  example: string
}> = [
  { value: "12h", label: "12-hour", example: "2:30 PM" },
  { value: "24h", label: "24-hour", example: "14:30" },
]

export function DisplayPane() {
  const theme = useAppSettingsStore((state) => state.settings.appearance.theme)
  const dateFormat = useAppSettingsStore(
    (state) => state.settings.appearance.dateFormat,
  )
  const timeFormat = useAppSettingsStore(
    (state) => state.settings.appearance.timeFormat,
  )
  const syntaxTheme = useAppSettingsStore(
    (state) => state.settings.appearance.syntaxTheme,
  )
  const setTheme = useAppSettingsStore((state) => state.setTheme)
  const setDateFormat = useAppSettingsStore((state) => state.setDateFormat)
  const setTimeFormat = useAppSettingsStore((state) => state.setTimeFormat)
  const setSyntaxTheme = useAppSettingsStore((state) => state.setSyntaxTheme)
  const saveAppSettings = useAppSettingsStore((state) => state.save)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const persist = async () => {
    setSaving(true)
    setError(null)
    try {
      await saveAppSettings()
    } catch (cause) {
      const message = getErrorMessage(cause)
      setError(message)
    } finally {
      setSaving(false)
    }
  }

  const handleThemeChange = (value: ThemePreference) => {
    setTheme(value)
    void persist()
  }

  const handleDateFormatChange = (value: DateFormatPreference) => {
    setDateFormat(value)
    void persist()
  }

  const handleTimeFormatChange = (value: TimeFormatPreference) => {
    setTimeFormat(value)
    void persist()
  }

  const handleSyntaxThemeChange = (value: SyntaxThemeId) => {
    setSyntaxTheme(value)
    void persist()
  }

  return (
    <div className="space-y-6">
      <FormField
        label="Theme"
        htmlFor="display-theme"
        description="Choose how the application appears."
      >
        <Select value={theme} onValueChange={handleThemeChange}>
          <SelectTrigger id="display-theme" className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {THEMES.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <FormField
        label="Syntax theme"
        htmlFor="display-syntax-theme"
        description="Colour scheme used for the Blame code column."
      >
        <Select value={syntaxTheme} onValueChange={handleSyntaxThemeChange}>
          <SelectTrigger id="display-syntax-theme" className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {syntaxThemeIds.map((id) => (
              <SelectItem key={id} value={id}>
                {SYNTAX_THEMES[id].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <FormField
        label="Date Format"
        htmlFor="display-date-format"
        description="Format used for displaying dates throughout the application."
      >
        <Select value={dateFormat} onValueChange={handleDateFormatChange}>
          <SelectTrigger id="display-date-format" className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DATE_FORMATS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
                <span className="ml-2 text-xs text-muted-foreground">
                  ({option.example})
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <FormField
        label="Time Format"
        htmlFor="display-time-format"
        description="Format used for displaying times throughout the application."
      >
        <Select value={timeFormat} onValueChange={handleTimeFormatChange}>
          <SelectTrigger id="display-time-format" className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIME_FORMATS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
                <span className="ml-2 text-xs text-muted-foreground">
                  ({option.example})
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      {saving && (
        <Text className="text-xs text-muted-foreground">Saving settings…</Text>
      )}
      {error && <Text className="text-xs text-destructive">{error}</Text>}
    </div>
  )
}
