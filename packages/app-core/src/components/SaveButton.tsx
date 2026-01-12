/**
 * SaveButton - Saves profile settings and roster atomically.
 * Displays dirty state and handles saving with feedback.
 */

import { Button } from "@repo-edu/ui"
import { Check, Loader2 } from "@repo-edu/ui/components/icons"
import { useCallback, useState } from "react"
import { commands } from "../bindings/commands"
import type { ProfileSettings } from "@repo-edu/backend-interface/types"
import { useProfileSettingsStore } from "../stores/profileSettingsStore"
import { useRosterStore } from "../stores/rosterStore"
import { useUiStore } from "../stores/uiStore"

type SaveStatus = "idle" | "saving" | "success" | "error"

interface SaveButtonProps {
  isDirty: boolean
  onSaved: () => void
}

export function SaveButton({ isDirty, onSaved }: SaveButtonProps) {
  const activeProfile = useUiStore((state) => state.activeProfile)
  const [status, setStatus] = useState<SaveStatus>("idle")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Get current state from stores
  const course = useProfileSettingsStore((state) => state.course)
  const gitConnection = useProfileSettingsStore((state) => state.gitConnection)
  const operations = useProfileSettingsStore((state) => state.operations)
  const exports = useProfileSettingsStore((state) => state.exports)
  const roster = useRosterStore((state) => state.roster)

  const handleSave = useCallback(async () => {
    if (!activeProfile) return

    setStatus("saving")
    setErrorMessage(null)

    try {
      const profileSettings: ProfileSettings = {
        course,
        git_connection: gitConnection,
        operations,
        exports,
      }

      const result = await commands.saveProfileAndRoster(
        activeProfile,
        profileSettings,
        roster,
      )

      if (result.status === "error") {
        setStatus("error")
        setErrorMessage(result.error.message)
        return
      }

      // Notify parent that save succeeded
      onSaved()
      setStatus("success")

      // Reset to idle after showing success briefly
      setTimeout(() => setStatus("idle"), 1500)
    } catch (error) {
      setStatus("error")
      setErrorMessage(error instanceof Error ? error.message : String(error))
    }
  }, [
    activeProfile,
    course,
    gitConnection,
    operations,
    exports,
    roster,
    onSaved,
  ])

  const isDisabled = !activeProfile || !isDirty || status === "saving"

  return (
    <div className="flex items-center gap-2">
      <Button
        onClick={handleSave}
        disabled={isDisabled}
        variant={isDirty ? "default" : "outline"}
        size="sm"
        className="min-w-20"
      >
        {status === "saving" ? (
          <>
            <Loader2 className="size-4 mr-1 animate-spin" />
            Saving
          </>
        ) : status === "success" ? (
          <>
            <Check className="size-4 mr-1" />
            Saved
          </>
        ) : (
          "Save"
        )}
      </Button>
      {status === "error" && errorMessage && (
        <span className="text-xs text-destructive max-w-48 truncate">
          {errorMessage}
        </span>
      )}
    </div>
  )
}
