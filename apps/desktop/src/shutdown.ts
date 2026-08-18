export type DesktopQuitEvent = {
  preventDefault(): void
}

export type DesktopShutdownOptions = {
  readonly abortWorkflows: () => void
  readonly beginWindowClose: () => boolean
  readonly closeArchive: () => void
  readonly fail: (error: unknown) => void
  readonly quit: () => void
  readonly stopAndConfirmChildProcesses: () => Promise<void>
  readonly waitForWorkflows: () => Promise<unknown>
}

export type DesktopShutdown = {
  beforeQuit(event: DesktopQuitEvent): void
}

export function createDesktopShutdown(
  options: DesktopShutdownOptions,
): DesktopShutdown {
  let phase: "idle" | "draining" | "ready" = "idle"

  const drain = async (): Promise<void> => {
    options.abortWorkflows()
    await options.waitForWorkflows()
    // Close the archive before a fatal child-process exit can stop the host.
    options.closeArchive()
    await options.stopAndConfirmChildProcesses()
  }

  return {
    beforeQuit(event) {
      if (phase === "idle" && options.beginWindowClose()) {
        event.preventDefault()
        return
      }
      if (phase === "ready") {
        return
      }

      event.preventDefault()
      if (phase === "draining") {
        return
      }
      phase = "draining"

      void drain().then(
        () => {
          phase = "ready"
          options.quit()
        },
        (error: unknown) => {
          options.fail(error)
        },
      )
    },
  }
}
