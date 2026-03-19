import { useCallback, useEffect, useRef } from "react"

type CloseGuardOptions = {
  isDirty: boolean
  onHidePrompt: () => void
  onSave: () => Promise<void>
  onBeforeClose?: () => Promise<void> | void
}

/**
 * Handles the unsaved-changes confirmation flow when the user attempts to
 * close the window via the browser `beforeunload` event.
 *
 * In Electron, the shell should wire window close requests to the same
 * `handlePromptSave`/`handlePromptDiscard` flow.
 */
export function useCloseGuard({
  isDirty,
  onHidePrompt,
  onSave,
  onBeforeClose,
}: CloseGuardOptions) {
  const dirtyRef = useRef(isDirty)
  dirtyRef.current = isDirty

  // Browser `beforeunload` guard.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault()
      }
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [])

  const handlePromptSave = useCallback(async () => {
    await onSave()
    onHidePrompt()
    if (onBeforeClose) await onBeforeClose()
  }, [onSave, onHidePrompt, onBeforeClose])

  const handlePromptDiscard = useCallback(async () => {
    onHidePrompt()
    if (onBeforeClose) await onBeforeClose()
  }, [onHidePrompt, onBeforeClose])

  const handlePromptCancel = useCallback(() => {
    onHidePrompt()
  }, [onHidePrompt])

  return { handlePromptSave, handlePromptDiscard, handlePromptCancel }
}
