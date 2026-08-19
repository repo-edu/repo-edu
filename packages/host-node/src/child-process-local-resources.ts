import type { ChildProcess } from "node:child_process"

export function releaseChildProcessLocalResources(child: ChildProcess): void {
  for (const stream of child.stdio) {
    stream?.destroy()
  }
  child.unref()
}
