import type { ExaminationArchiveStoragePort } from "@repo-edu/host-runtime-contract"
import type { App, WebContents } from "electron"

/** Process sources classify loss, then report an ordinary host failure.
 * No adapter owns shutdown or receives the child-process lifetime controller. */
export function installDesktopTerminalSources(options: {
  app: Pick<App, "on">
  process: Pick<NodeJS.Process, "on">
  terminal(error: unknown): void
}) {
  const { terminal } = options
  options.process.on("unhandledRejection", terminal)
  options.app.on("child-process-gone", (_event, details) => {
    // Type never changes admission, including types introduced by later Electron releases.
    if (details.reason === "clean-exit") return
    terminal(new Error("An Electron child process ended unexpectedly."))
  })

  return {
    observeRenderer(contents: Pick<WebContents, "on">) {
      // Losing the one session renderer is terminal even after a clean exit.
      contents.on("render-process-gone", () => {
        terminal(new Error("The desktop session renderer ended."))
      })
    },
  }
}

/** Report at the durable boundary before a workflow can normalise the failure. */
export function observeDesktopExaminationStorage(
  storage: ExaminationArchiveStoragePort,
  terminal: (error: unknown) => void,
): ExaminationArchiveStoragePort {
  function access<T>(body: () => T): T {
    try {
      return body()
    } catch (error) {
      terminal(error)
      throw error
    }
  }
  return {
    get: (key) => access(() => storage.get(key)),
    put: (entry) => access(() => storage.put(entry)),
    remove: (key) => access(() => storage.remove(key)),
    exportAll: () => access(() => storage.exportAll()),
    importAll: (entries) => access(() => storage.importAll(entries)),
  }
}
