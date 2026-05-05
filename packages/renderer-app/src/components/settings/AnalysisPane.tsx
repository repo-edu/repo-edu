import { FormField, Text } from "@repo-edu/ui"
import { useState } from "react"
import { useAppSettingsStore } from "../../stores/app-settings-store.js"
import { getErrorMessage } from "../../utils/error-message.js"
import { ExtensionTagInput } from "./ExtensionTagInput.js"

export function AnalysisPane() {
  const defaultExtensions = useAppSettingsStore(
    (state) => state.settings.defaultExtensions,
  )
  const setDefaultExtensions = useAppSettingsStore(
    (state) => state.setDefaultExtensions,
  )
  const saveAppSettings = useAppSettingsStore((state) => state.save)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleChange = (next: string[]) => {
    setDefaultExtensions(next)
    setSaving(true)
    setError(null)
    saveAppSettings()
      .catch((cause) => setError(getErrorMessage(cause)))
      .finally(() => setSaving(false))
  }

  return (
    <div className="space-y-6">
      <FormField
        label="Default file extensions"
        htmlFor="analysis-default-extensions"
        description="Fallback extensions used when a course leaves Extensions unset. A grey info icon on a chip means that extension lacks comment detection or syntax colorization."
      >
        <ExtensionTagInput
          id="analysis-default-extensions"
          className="max-w-xl"
          values={defaultExtensions}
          onChange={handleChange}
          placeholder="ts, tsx, py, …"
          ariaLabel="Default file extensions"
        />
      </FormField>

      {saving && (
        <Text className="text-xs text-muted-foreground">Saving settings…</Text>
      )}
      {error && <Text className="text-xs text-destructive">{error}</Text>}
    </div>
  )
}
