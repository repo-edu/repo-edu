/**
 * Returns true when running in the Electron desktop shell on macOS,
 * where the window uses `titleBarStyle: "hiddenInset"` and the
 * traffic-light buttons overlay the content area.
 */
export const MAC_TRAFFIC_LIGHT_INSET_PX = 76

export function hasMacDesktopInset(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false
  }

  const hasDesktopBridge = Boolean(
    (window as unknown as Record<string, unknown>).repoEduDesktopHost,
  )
  const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform)

  return hasDesktopBridge && isMac
}
