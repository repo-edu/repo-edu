import type { App, BrowserWindow } from "electron"

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
  options.app.on("second-instance", focus)
  options.app.on("activate", focus)
  // Quit on macOS too. A later Dock launch then starts a fresh process.
  options.app.on("window-all-closed", options.close)
}
