import { useEffect, useRef } from "react"
import { closeWindow, onCloseRequested } from "../services/platform"

interface Options {
  isDirty: boolean
  onShowPrompt: () => void
  onHidePrompt: () => void
  onSave: () => Promise<void>
  onBeforeClose?: () => Promise<void> | void
}

/**
 * Handles window-close interception for unsaved changes.
 */
export function useCloseGuard({
  isDirty,
  onShowPrompt,
  onHidePrompt,
  onSave,
  onBeforeClose,
}: Options) {
  const isDirtyRef = useRef(isDirty)
  const isClosingRef = useRef(false)
  const allowImmediateCloseRef = useRef(false)
  const beforeCloseRef = useRef(onBeforeClose)

  // Keep dirty flag in sync for the event handler closure.
  useEffect(() => {
    isDirtyRef.current = isDirty
  }, [isDirty])

  useEffect(() => {
    beforeCloseRef.current = onBeforeClose
  }, [onBeforeClose])

  // Register close handler once.
  useEffect(() => {
    let unlisten: (() => void) | undefined

    const setup = async () => {
      try {
        unlisten = await onCloseRequested(async (event) => {
          if (allowImmediateCloseRef.current) {
            allowImmediateCloseRef.current = false
            return
          }

          if (isClosingRef.current) {
            event.preventDefault()
            return
          }

          event.preventDefault()
          isClosingRef.current = true
          if (!isDirtyRef.current) {
            await closeNow()
            return
          }

          onShowPrompt()
        })
      } catch (error) {
        console.error("Error setting up close handler:", error)
      }
    }

    setup()
    return () => unlisten?.()
  }, [onShowPrompt])

  const closeNow = async () => {
    allowImmediateCloseRef.current = true
    isClosingRef.current = false
    try {
      const cb = beforeCloseRef.current
      if (cb) {
        await cb()
      }
    } catch (error) {
      console.error("Failed during onBeforeClose:", error)
    }
    await closeWindow()
  }

  const handlePromptSave = async () => {
    await onSave()
    onHidePrompt()
    await closeNow()
  }

  const handlePromptDiscard = async () => {
    onHidePrompt()
    await closeNow()
  }

  const handlePromptCancel = () => {
    onHidePrompt()
    isClosingRef.current = false
  }

  return { handlePromptSave, handlePromptDiscard, handlePromptCancel }
}
