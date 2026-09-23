import {
  createContext,
  type ReactNode,
  type SyntheticEvent,
  useContext,
  useEffect,
  useSyncExternalStore,
} from "react"
import { createPortal } from "react-dom"
import { selectOperationIsAdmitted } from "./selectors.js"
import type { SessionController } from "./session-controller.js"
import {
  canAdmitSessionInput,
  type SessionControllerSnapshot,
} from "./session-reducer.js"

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

export function runSessionOperationBestEffort(
  operation: Promise<unknown>,
  description: string,
): void {
  void operation.catch((error: unknown) => {
    console.error(`Session ${description} failed`, error)
  })
}

const SessionControllerContext = createContext<SessionController | null>(null)

// The marker names the admitted operation this control cancels.
export const sessionCancellationControl = "data-session-cancellation-control"

function admitSessionInput(
  controller: SessionController,
  event: SyntheticEvent | Event,
): void {
  // Read the owner at event delivery, without waiting for a React render.
  const snapshot = controller.getSnapshot()
  if (canAdmitSessionInput(snapshot)) return
  if (snapshot.lifecycle.kind === "live" && event.target instanceof Element) {
    const control = event.target.closest(`[${sessionCancellationControl}]`)
    const operation = control?.getAttribute(sessionCancellationControl)
    if (selectOperationIsAdmitted(snapshot, operation ?? null)) return
  }
  event.preventDefault()
  event.stopPropagation()
}

export function SessionControllerProvider({
  controller,
  children,
}: {
  controller: SessionController
  children: ReactNode
}) {
  const inputIsFrozen = useSyncExternalStore(
    controller.subscribe,
    () => !canAdmitSessionInput(controller.getSnapshot()),
    () => !canAdmitSessionInput(controller.getSnapshot()),
  )
  useEffect(() => {
    // Window capture runs before Radix's document-level Escape dismissal.
    const admitKeyboardInput = (event: KeyboardEvent) =>
      admitSessionInput(controller, event)
    window.addEventListener("keydown", admitKeyboardInput, true)
    window.addEventListener("keyup", admitKeyboardInput, true)
    return () => {
      window.removeEventListener("keydown", admitKeyboardInput, true)
      window.removeEventListener("keyup", admitKeyboardInput, true)
    }
  }, [controller])
  // React capture reaches other input in children and dialog portals.
  const admitInput = (event: SyntheticEvent) => {
    admitSessionInput(controller, event)
  }
  return (
    <SessionControllerContext.Provider value={controller}>
      <div
        className="contents"
        aria-busy={inputIsFrozen}
        onBeforeInputCapture={admitInput}
        onInputCapture={admitInput}
        onChangeCapture={admitInput}
        onClickCapture={admitInput}
        onDoubleClickCapture={admitInput}
        onContextMenuCapture={admitInput}
        onPointerDownCapture={admitInput}
        onPointerMoveCapture={admitInput}
        onPointerUpCapture={admitInput}
        onMouseDownCapture={admitInput}
        onMouseMoveCapture={admitInput}
        onMouseUpCapture={admitInput}
        onTouchStartCapture={admitInput}
        onTouchMoveCapture={admitInput}
        onTouchEndCapture={admitInput}
        onDragStartCapture={admitInput}
        onDragOverCapture={admitInput}
        onDropCapture={admitInput}
        onPasteCapture={admitInput}
        onCutCapture={admitInput}
        onCompositionStartCapture={admitInput}
        onCompositionUpdateCapture={admitInput}
        onCompositionEndCapture={admitInput}
        onSubmitCapture={admitInput}
        onResetCapture={admitInput}
      >
        {children}
        {inputIsFrozen &&
          createPortal(
            <div
              aria-hidden="true"
              data-session-input-frozen=""
              className="pointer-events-none fixed inset-0 z-[100] bg-background/40"
            />,
            document.body,
          )}
      </div>
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
