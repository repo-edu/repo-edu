/**
 * SaveButton - Saves profile settings and roster atomically.
 * Displays dirty state and handles saving with feedback.
 */

import { Button } from "@repo-edu/ui"
import { Check, Loader2 } from "@repo-edu/ui/components/icons"
import { useCallback, useState } from "react"
import { useProfileStore } from "../stores/profileStore"
import { useToastStore } from "../stores/toastStore"
import { useUiStore } from "../stores/uiStore"

type SaveStatus = "idle" | "saving" | "success" | "error"

interface SaveButtonProps {
  isDirty: boolean
  onSaved: () => void
}

export function SaveButton({ isDirty, onSaved }: SaveButtonProps) {
  const activeProfile = useUiStore((state) => state.activeProfile)
  const [status, setStatus] = useState<SaveStatus>("idle")
  const addToast = useToastStore((state) => state.addToast)

  // Get save function from profileStore
  const save = useProfileStore((state) => state.save)

  const handleSave = useCallback(async () => {
    if (!activeProfile) return

    setStatus("saving")

    try {
      const success = await save(activeProfile)

      if (!success) {
        const error = useProfileStore.getState().error
        const message = error ?? "Save failed"
        setStatus("error")
        addToast(`Save failed: ${message}`, { tone: "error" })
        setTimeout(() => setStatus("idle"), 1500)
        return
      }

      // Notify parent that save succeeded
      onSaved()
      setStatus("success")

      // Reset to idle after showing success briefly
      setTimeout(() => setStatus("idle"), 1500)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setStatus("error")
      addToast(`Save failed: ${message}`, { tone: "error" })
      setTimeout(() => setStatus("idle"), 1500)
    }
  }, [activeProfile, addToast, save, onSaved])

  const isDisabled = !activeProfile || !isDirty || status === "saving"

  return (
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
  )
}
