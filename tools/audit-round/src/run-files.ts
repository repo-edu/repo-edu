import { closeSync, openSync, writeFileSync } from "node:fs"

export type RunPaths = {
  readonly log: string
  /** Null when the run keeps no transcript: a brief on its own retells an existing one. */
  readonly markdown: string | null
}

export type RunFiles = {
  readonly log: (text: string) => void
  readonly markdown: ((text: string) => void) | null
  readonly close: () => void
}

/** Each write finishes before returning to the invocation that admitted it. */
export function openRunFiles(paths: RunPaths): RunFiles {
  const log = openSync(paths.log, "wx")
  let markdown: number | null = null
  try {
    if (paths.markdown !== null) markdown = openSync(paths.markdown, "wx")
  } catch (error) {
    closeSync(log)
    throw error
  }
  const transcript = markdown
  return {
    log: (text) => writeFileSync(log, `${text}\n`),
    markdown:
      transcript === null
        ? null
        : (text) => writeFileSync(transcript, `${text}\n`),
    close() {
      try {
        closeSync(log)
      } finally {
        if (transcript !== null) closeSync(transcript)
      }
    },
  }
}
