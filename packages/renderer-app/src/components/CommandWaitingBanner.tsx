import { selectCommandIsWaiting } from "../session/selectors.js"
import { useSessionControllerSelector } from "../session/session-controller-context.js"

export function CommandWaitingBanner() {
  const isWaiting = useSessionControllerSelector(selectCommandIsWaiting)
  if (!isWaiting) return null

  return (
    <div role="status" className="border-b bg-muted px-4 py-2 text-sm">
      Waiting for current work to finish before starting the requested action.
    </div>
  )
}
