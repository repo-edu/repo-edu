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
    terminal(
      new Error(
        `Electron child process ended: type=${details.type}, reason=${details.reason}, exitCode=${details.exitCode}, name=${details.name ?? ""}, serviceName=${details.serviceName ?? ""}.`,
      ),
    )
  })

  return {
    observeRenderer(contents: Pick<WebContents, "on">) {
      // Losing the one session renderer is terminal even after a clean exit.
      contents.on("render-process-gone", (_event, details) => {
        terminal(
          new Error(
            `Desktop session renderer ended: reason=${details.reason}, exitCode=${details.exitCode}.`,
          ),
        )
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
