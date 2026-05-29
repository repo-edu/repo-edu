import {
  createContext,
  type ReactNode,
  useContext,
  useSyncExternalStore,
} from "react"
import type { SessionController } from "./session-controller.js"
import type { SessionControllerSnapshot } from "./session-reducer.js"

let currentController: SessionController | null = null

export function setSessionController(controller: SessionController): void {
  currentController = controller
}

export function clearSessionController(controller?: SessionController): void {
  if (controller === undefined || currentController === controller) {
    currentController = null
  }
}

export function getSessionController(): SessionController {
  if (currentController === null) {
    throw new Error("SessionController has not been initialised.")
  }
  return currentController
}

const SessionControllerContext = createContext<SessionController | null>(null)

export function SessionControllerProvider({
  controller,
  children,
}: {
  controller: SessionController
  children: ReactNode
}) {
  return (
    <SessionControllerContext.Provider value={controller}>
      {children}
    </SessionControllerContext.Provider>
  )
}

export function useSessionController(): SessionController {
  const controller = useContext(SessionControllerContext)
  if (controller === null) {
    throw new Error(
      "useSessionController must be used within a SessionControllerProvider.",
    )
  }
  return controller
}

export function useSessionControllerSelector<T>(
  selector: (snapshot: SessionControllerSnapshot) => T,
): T {
  const controller = useSessionController()
  return useSyncExternalStore(
    controller.subscribe,
    () => selector(controller.getSnapshot()),
    () => selector(controller.getSnapshot()),
  )
}
