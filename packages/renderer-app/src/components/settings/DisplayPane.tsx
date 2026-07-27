import type {
  DateFormatPreference,
  SyntaxThemeId,
  ThemePreference,
  TimeFormatPreference,
} from "@repo-edu/domain/settings"
import { syntaxThemeIds } from "@repo-edu/domain/settings"
import {
  FormField,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo-edu/ui"
import { selectPreferences } from "../../session/selectors.js"
import {
  useSessionController,
  useSessionControllerSelector,
} from "../../session/session-controller-context.js"
import { SYNTAX_THEMES } from "../../utils/blame-highlighter.js"

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
  const controller = useSessionController()
  const { theme, dateFormat, timeFormat, syntaxTheme } =
    useSessionControllerSelector(selectPreferences).appearance

  const handleThemeChange = (value: ThemePreference) => {
    controller.setTheme(value)
  }

  const handleDateFormatChange = (value: DateFormatPreference) => {
    controller.setDateFormat(value)
  }

  const handleTimeFormatChange = (value: TimeFormatPreference) => {
    controller.setTimeFormat(value)
  }

  const handleSyntaxThemeChange = (value: SyntaxThemeId) => {
    controller.setSyntaxTheme(value)
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
    </div>
  )
}
