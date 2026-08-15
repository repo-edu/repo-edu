import cliTruncate from "cli-truncate"
import { createLogUpdate } from "log-update"

export type TerminalDisplay = {
  overview(line: string): void
  progress(render: () => string): void
  detail(render: () => string): void
  close(): void
}

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
): TerminalDisplay {
  if (output.isTTY !== true) {
    return {
      overview(line) {
        output.write(`${line}\n`)
      },
      progress(render) {
        output.write(`${render()}\n`)
      },
      detail() {},
      close() {},
    }
  }

  const update = createUpdate(output)
  let activeDetail: (() => string) | null = null
  let stopRefresh: (() => void) | null = null
  const renderDetail = (): void => {
    if (activeDetail === null) return
    const width = Math.max(1, output.columns ?? FALLBACK_TERMINAL_WIDTH)
    update(cliTruncate(activeDetail(), width))
  }
  const showLive = (render: () => string): void => {
    activeDetail = render
    renderDetail()
    stopRefresh ??= schedule(renderDetail)
  }

  return {
    overview(line) {
      activeDetail = null
      update.persist(line)
    },
    progress: showLive,
    detail: showLive,
    close() {
      stopRefresh?.()
      stopRefresh = null
      activeDetail = null
      update.clear()
      update.done()
    },
  }
}
