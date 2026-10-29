import type {
  BrowserWindow,
  Event,
  IpcMainEvent,
  IpcMainInvokeEvent,
  WebContentsDidStartNavigationEventParams,
  WebContentsWillRedirectEventParams,
  WebFrameMain,
} from "electron"

type DocumentState =
  | { phase: "unloaded" | "load-requested" | "loading" | "ended" }
  | { phase: "current"; frame: WebFrameMain }

/** Owns the single load and the authority of the document it commits. */
export function installDesktopRendererDocument(options: {
  window: BrowserWindow
  rendererUrl: string
  terminal(error: unknown): void
}) {
  const { window, rendererUrl } = options
  const contents = window.webContents
  let state: DocumentState = { phase: "unloaded" }

  function terminal(error: unknown) {
    if (state.phase === "ended") return
    state = { phase: "ended" }
    options.terminal(error)
  }

  function rejectNavigation() {
    terminal(new Error("The desktop renderer document cannot navigate."))
  }

  function started(event: Event<WebContentsDidStartNavigationEventParams>) {
    if (!event.isMainFrame) return
    if (
      state.phase === "load-requested" &&
      event.url === rendererUrl &&
      !event.isSameDocument
    ) {
      state = { phase: "loading" }
      return
    }
    rejectNavigation()
  }

  function navigate(event: Event) {
    event.preventDefault()
    rejectNavigation()
  }

  function redirect(event: Event<WebContentsWillRedirectEventParams>) {
    if (!event.isMainFrame) return
    navigate(event)
  }

  function committed(
    _event: Event,
    url: string,
    _responseCode: number,
    _statusText: string,
    isMainFrame: boolean,
  ) {
    if (!isMainFrame) return
    if (state.phase !== "loading" || url !== rendererUrl) {
      rejectNavigation()
      return
    }
    state = { phase: "current", frame: contents.mainFrame }
  }

  function inPage(_event: Event, _url: string, isMainFrame: boolean) {
    if (isMainFrame) rejectNavigation()
  }

  contents.on("did-start-navigation", started)
  contents.on("will-navigate", navigate)
  contents.on("will-redirect", redirect)
  contents.on("did-frame-navigate", committed)
  contents.on("did-navigate-in-page", inPage)
  contents.setWindowOpenHandler(() => {
    terminal(new Error("The desktop renderer cannot create a window."))
    return { action: "deny" }
  })

  return {
    terminal,
    async load() {
      if (state.phase !== "unloaded") {
        rejectNavigation()
        return
      }
      state = { phase: "load-requested" }
      try {
        await window.loadURL(rendererUrl)
      } catch (error) {
        terminal(error)
      }
    },
    proveSender(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
      if (state.phase === "ended") return false
      if (
        state.phase !== "current" ||
        window.isDestroyed() ||
        contents.isDestroyed() ||
        event.sender !== contents ||
        event.senderFrame !== state.frame ||
        contents.mainFrame !== state.frame ||
        state.frame.isDestroyed() ||
        state.frame.detached ||
        state.frame.parent !== null ||
        state.frame.url !== rendererUrl ||
        contents.getURL() !== rendererUrl
      ) {
        terminal(new Error("Foreign desktop gateway sender."))
        return false
      }
      return true
    },
    dispose() {
      state = { phase: "ended" }
      contents.removeListener("did-start-navigation", started)
      contents.removeListener("will-navigate", navigate)
      contents.removeListener("will-redirect", redirect)
      contents.removeListener("did-frame-navigate", committed)
      contents.removeListener("did-navigate-in-page", inPage)
      // Keep window creation denied even if disposal precedes destruction.
    },
  }
}
