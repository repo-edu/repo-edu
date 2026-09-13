import { selectUserActionIsWaiting } from "../session/selectors.js"
import { useSessionControllerSelector } from "../session/session-controller-context.js"

export function SessionWaitingBanner() {
  const isWaiting = useSessionControllerSelector(selectUserActionIsWaiting)
  if (!isWaiting) return null

  return (
    <div role="status" className="border-b bg-muted px-4 py-2 text-sm">
      Waiting for current work to finish before starting the requested action.
    </div>
  )
}
