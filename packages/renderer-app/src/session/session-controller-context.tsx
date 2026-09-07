import {
  createContext,
  type ReactNode,
  type SyntheticEvent,
  useContext,
  useSyncExternalStore,
} from "react"
import type { SessionController } from "./session-controller.js"
import {
  canAdmitSessionChange,
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

export function SessionControllerProvider({
  controller,
  children,
}: {
  controller: SessionController
  children: ReactNode
}) {
  // Read the owner at event delivery, without waiting for a React render.
  // React capture also reaches children rendered through dialog portals.
  const admitInput = (event: SyntheticEvent) => {
    if (canAdmitSessionChange(controller.getSnapshot())) return
    event.preventDefault()
    event.stopPropagation()
  }
  return (
    <SessionControllerContext.Provider value={controller}>
      <div
        className="contents"
        onBeforeInputCapture={admitInput}
        onInputCapture={admitInput}
        onChangeCapture={admitInput}
        onClickCapture={admitInput}
        onDoubleClickCapture={admitInput}
        onContextMenuCapture={admitInput}
        onKeyDownCapture={admitInput}
        onKeyUpCapture={admitInput}
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
        onFocusCapture={admitInput}
        onBlurCapture={admitInput}
        onSubmitCapture={admitInput}
        onResetCapture={admitInput}
        onWheelCapture={admitInput}
        onScrollCapture={admitInput}
      >
        {children}
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
