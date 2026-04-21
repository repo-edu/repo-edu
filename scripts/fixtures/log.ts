import { appendFileSync } from "node:fs"

export function fail(msg: string): never {
  process.stderr.write(`fixture: ${msg}\n`)
  process.stderr.write("Run with --help for usage.\n")
  process.exit(2)
}

export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`
}

let EMIT_STATE = { verbosity: 0, logPath: "" }

export function setEmitState(verbosity: number, logPath: string): void {
  EMIT_STATE = { verbosity, logPath }
}

const ANSI_RESET = "\x1b[0m"
const ANSI_H1 = "\x1b[1;35m"
const ANSI_H2 = "\x1b[1;36m"
const ANSI_H3 = "\x1b[1;33m"

function colorizeForTTY(text: string): string {
  if (!process.stdout.isTTY) return text
  return text.replace(
    /^(#{1,3})(\s+.+)$/gm,
    (_, hashes: string, rest: string) => {
      const color =
        hashes.length === 1 ? ANSI_H1 : hashes.length === 2 ? ANSI_H2 : ANSI_H3
      return `${color}${hashes}${rest}${ANSI_RESET}`
    },
  )
}

export function emit(level: 1 | 2, text: string): void {
  const block = text.endsWith("\n") ? text : `${text}\n`
  if (EMIT_STATE.verbosity >= level) process.stdout.write(colorizeForTTY(block))
  appendFileSync(EMIT_STATE.logPath, block)
}

export async function withTicker<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  const stream = process.stderr
  const start = Date.now()

  if (!stream.isTTY) {
    stream.write(`${label}\n`)
    return fn()
  }

  const render = () => {
    const secs = Math.floor((Date.now() - start) / 1000)
    stream.cursorTo(0)
    stream.write(`${label}  ${secs} s`)
    stream.clearLine(1)
  }
  render()
  const interval = setInterval(render, 1000)
  try {
    return await fn()
  } finally {
    clearInterval(interval)
    stream.cursorTo(0)
    stream.clearLine(0)
  }
}
