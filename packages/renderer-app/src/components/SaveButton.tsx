import { Button } from "@repo-edu/ui"
import { Check, Loader2 } from "@repo-edu/ui/components/icons"
import { useCallback } from "react"
import { usePersisterRegistry } from "../persistence/persister-registry.js"
import {
  selectCourseSyncStatus,
  useCourseStore,
} from "../stores/course-store.js"
import { selectActiveCourseId, useUiStore } from "../stores/ui-store.js"

type SaveButtonProps = {
  isDirty: boolean
  onSaved: () => void
}

export function SaveButton({ isDirty, onSaved }: SaveButtonProps) {
  const activeCourseId = useUiStore(selectActiveCourseId)
  const syncStatus = useCourseStore(selectCourseSyncStatus)
  const persisterRegistry = usePersisterRegistry()

  const handleSave = useCallback(async () => {
    if (!activeCourseId) return

    try {
      await persisterRegistry.course.flush()
      onSaved()
    } catch {
      // The course sync-status banner owns the visible failure state.
    }
  }, [activeCourseId, onSaved, persisterRegistry])

  const isSaving = syncStatus.state === "saving"
  const isDisabled = !activeCourseId || !isDirty || isSaving

  return (
    <Button
      onClick={() => void handleSave()}
      disabled={isDisabled}
      variant={isDirty ? "default" : "outline"}
      size="sm"
      className="min-w-20"
    >
      {isSaving ? (
        <>
          <Loader2 className="size-4 mr-1 animate-spin" />
          Saving
        </>
      ) : !isDirty ? (
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
