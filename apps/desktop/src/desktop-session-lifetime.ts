import type { App, BrowserWindow } from "electron"

export type SameProgramStartSource =
  | "single-instance-lock-refused"
  | "second-instance"

export const sameProgramStartActions = {
  "single-instance-lock-refused": "exit-new-process",
  "second-instance": "focus-running-window",
} as const satisfies Record<
  SameProgramStartSource,
  "exit-new-process" | "focus-running-window"
>

/** Activation may focus this session but never create a replacement renderer. */
export function installDesktopSessionLifetime(options: {
  app: Pick<App, "on">
  getWindow():
    | Pick<BrowserWindow, "isMinimized" | "restore" | "focus">
    | undefined
  close(): void
}): void {
  const focus = () => {
    const window = options.getWindow()
    if (!window) return
    if (window.isMinimized()) window.restore()
    window.focus()
  }
  const lifecycleSources = {
    "second-instance": focus,
    activate: focus,
    "window-all-closed": options.close,
  } satisfies Record<
    "second-instance" | "activate" | "window-all-closed",
    () => void
  >
  sameProgramStartActions["second-instance"] satisfies "focus-running-window"
  options.app.on("second-instance", lifecycleSources["second-instance"])
  options.app.on("activate", lifecycleSources.activate)
  // Quit on macOS too. A later Dock launch then starts a fresh process.
  options.app.on("window-all-closed", lifecycleSources["window-all-closed"])
}
