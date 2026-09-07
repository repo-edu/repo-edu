import type { NodeWindowStateStore } from "@repo-edu/host-node"

/** Geometry never joins durable application work or delays shutdown. */
export function saveDesktopWindowState(
  store: NodeWindowStateStore,
  size: readonly number[],
): void {
  const [width, height] = size
  void store.save({ width, height }).catch(() => {})
}
