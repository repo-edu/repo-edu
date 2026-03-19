/**
 * SaveButton — Saves course and displays visual feedback.
 * States: idle → saving (spinner) → success (checkmark) → idle.
 */

import { Button } from "@repo-edu/ui"
import { Check, Loader2 } from "@repo-edu/ui/components/icons"
import { useCallback, useState } from "react"
import { useCourseStore } from "../stores/course-store.js"
import { useUiStore } from "../stores/ui-store.js"

type SaveStatus = "idle" | "saving" | "success" | "error"

type SaveButtonProps = {
  isDirty: boolean
  onSaved: () => void
}

export function SaveButton({ isDirty, onSaved }: SaveButtonProps) {
  const activeCourseId = useUiStore((s) => s.activeCourseId)
  const save = useCourseStore((s) => s.save)
  const [status, setStatus] = useState<SaveStatus>("idle")

  const handleSave = useCallback(async () => {
    if (!activeCourseId) return

    setStatus("saving")

    try {
      const success = await save()

      if (!success) {
        setStatus("error")
        setTimeout(() => setStatus("idle"), 1500)
        return
      }

      onSaved()
      setStatus("success")
      setTimeout(() => setStatus("idle"), 1500)
    } catch {
      setStatus("error")
      setTimeout(() => setStatus("idle"), 1500)
    }
  }, [activeCourseId, save, onSaved])

  const isDisabled = !activeCourseId || !isDirty || status === "saving"

  return (
    <Button
      onClick={() => void handleSave()}
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
