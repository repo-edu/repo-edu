/**
 * Returns true when running in the Electron desktop shell on macOS,
 * where the window uses `titleBarStyle: "hiddenInset"` and the
 * traffic-light buttons overlay the content area.
 */
export const MAC_TRAFFIC_LIGHT_INSET_PX = 76

// Shape narrowed by callers. The desktop preload exposes many surfaces; each
// caller declares the methods it touches and casts through this helper.
export function getDesktopHostBridge<T = Record<string, unknown>>():
  | T
  | undefined {
  if (typeof window === "undefined") return undefined
  return (window as unknown as Record<string, unknown>).repoEduDesktopHost as
    | T
    | undefined
}

export function hasMacDesktopInset(): boolean {
  if (typeof navigator === "undefined") return false
  const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform)
  return isMac && getDesktopHostBridge() !== undefined
}
