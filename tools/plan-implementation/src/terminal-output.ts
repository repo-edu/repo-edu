import cliTruncate from "cli-truncate"
import { createLogUpdate } from "log-update"

export type TerminalDisplay = {
  overview(line: string): void
  progress(render: () => string): void
  detail(render: () => string): void
  close(): void
}

export type TerminalPromptControl = {
  prompt<T>(run: () => Promise<T>): Promise<T>
}

export type InteractiveTerminalDisplay = TerminalDisplay & TerminalPromptControl

type TerminalOutput = NodeJS.WritableStream & {
  readonly columns?: number
  readonly isTTY?: boolean
}

type LogUpdate = ReturnType<typeof createLogUpdate>
type ScheduleRefresh = (refresh: () => void) => () => void

const FALLBACK_TERMINAL_WIDTH = 80
const REFRESH_INTERVAL_MS = 1_000

const scheduleRefresh: ScheduleRefresh = (refresh) => {
  const timer = setInterval(refresh, REFRESH_INTERVAL_MS)
  timer.unref()
  return () => clearInterval(timer)
}

export function createTerminalDisplay(
  output: TerminalOutput,
  createUpdate: (output: NodeJS.WritableStream) => LogUpdate = (stream) =>
    createLogUpdate(stream, { showCursor: true }),
  schedule: ScheduleRefresh = scheduleRefresh,
): InteractiveTerminalDisplay {
  if (output.isTTY !== true) {
    return {
      overview(line) {
        output.write(`${line}\n`)
      },
      progress(render) {
        output.write(`${render()}\n`)
      },
      detail() {},
      prompt: (run) => run(),
      close() {},
    }
  }

  const update = createUpdate(output)
  let activeDetail: (() => string) | null = null
  let closed = false
  let promptActive = false
  const pendingOverview: string[] = []
  let stopRefresh: (() => void) | null = null
  const renderDetail = (): void => {
    if (activeDetail === null || closed || promptActive) return
    const width = Math.max(1, output.columns ?? FALLBACK_TERMINAL_WIDTH)
    update(cliTruncate(activeDetail(), width))
  }
  const showLive = (render: () => string): void => {
    if (closed) return
    activeDetail = render
    renderDetail()
    if (!promptActive) stopRefresh ??= schedule(renderDetail)
  }

  return {
    overview(line) {
      if (closed) return
      activeDetail = null
      if (promptActive) {
        pendingOverview.push(line)
        return
      }
      update.persist(line)
    },
    progress: showLive,
    detail: showLive,
    async prompt(run) {
      if (closed) {
        throw new Error("The terminal display is closed.")
      }
      if (promptActive) {
        throw new Error("A terminal prompt is already active.")
      }
      promptActive = true
      stopRefresh?.()
      stopRefresh = null
      update.clear()
      try {
        return await run()
      } finally {
        promptActive = false
        if (!closed) {
          for (const line of pendingOverview.splice(0)) {
            update.persist(line)
          }
          renderDetail()
          if (activeDetail !== null) {
            stopRefresh = schedule(renderDetail)
          }
        }
      }
    },
    close() {
      if (closed) return
      closed = true
      stopRefresh?.()
      stopRefresh = null
      activeDetail = null
      pendingOverview.length = 0
      update.clear()
      update.done()
    },
  }
}
