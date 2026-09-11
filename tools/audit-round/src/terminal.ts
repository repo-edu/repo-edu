import { createLogUpdate } from "log-update"

export type Terminal = {
  readonly write: (text: string) => void
  readonly status: (text: string) => void
  readonly clear: () => void
}

export function createTerminal(
  stream: NodeJS.WriteStream = process.stdout,
): Terminal {
  const update = stream.isTTY
    ? createLogUpdate(stream, { showCursor: true })
    : undefined
  return {
    write(text) {
      if (update === undefined) stream.write(`${text}\n`)
      else update.persist(text)
    },
    status(text) {
      update?.(text)
    },
    clear() {
      update?.clear()
    },
  }
}
