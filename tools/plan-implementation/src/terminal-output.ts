import cliTruncate from "cli-truncate"
import { createLogUpdate } from "log-update"

export type TerminalDisplay = {
  overview(line: string): void
  detail(line: string): void
  close(): void
}

type TerminalOutput = NodeJS.WritableStream & {
  readonly columns?: number
  readonly isTTY?: boolean
}

type LogUpdate = ReturnType<typeof createLogUpdate>

const FALLBACK_TERMINAL_WIDTH = 80

export function createTerminalDisplay(
  output: TerminalOutput,
  createUpdate: (output: NodeJS.WritableStream) => LogUpdate = (stream) =>
    createLogUpdate(stream, { showCursor: true }),
): TerminalDisplay {
  if (output.isTTY !== true) {
    return {
      overview(line) {
        output.write(`${line}\n`)
      },
      detail() {},
      close() {},
    }
  }

  const update = createUpdate(output)
  return {
    overview(line) {
      update.persist(line)
    },
    detail(line) {
      const width = Math.max(1, output.columns ?? FALLBACK_TERMINAL_WIDTH)
      update(cliTruncate(line, width))
    },
    close() {
      update.clear()
      update.done()
    },
  }
}
