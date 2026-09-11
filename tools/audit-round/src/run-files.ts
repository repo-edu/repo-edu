import { closeSync, openSync, writeFileSync } from "node:fs"

export type RunFiles = {
  readonly log: (text: string) => void
  readonly markdown: (text: string) => void
  readonly close: () => void
}

/** Each write finishes before returning to the invocation that admitted it. */
export function openRunFiles(paths: {
  readonly log: string
  readonly markdown: string
}): RunFiles {
  const log = openSync(paths.log, "wx")
  let markdown: number
  try {
    markdown = openSync(paths.markdown, "wx")
  } catch (error) {
    closeSync(log)
    throw error
  }
  return {
    log: (text) => writeFileSync(log, `${text}\n`),
    markdown: (text) => writeFileSync(markdown, `${text}\n`),
    close() {
      try {
        closeSync(log)
      } finally {
        closeSync(markdown)
      }
    },
  }
}
