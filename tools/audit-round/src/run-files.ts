import { closeSync, openSync, writeFileSync } from "node:fs"

export type RunPaths = {
  /** Null for a standalone brief or contract probe, which reserves no round. */
  readonly claim: string | null
  readonly log: string
  /** Null when the run keeps no transcript: a brief on its own retells an existing one. */
  readonly markdown: string | null
}

export type RunFiles = {
  readonly log: (text: string) => void
  readonly markdown: ((text: string) => void) | null
  readonly close: () => void
}

/** A retained exclusive claim reserves the number for either entry route. */
export function claimRound(path: string): void {
  closeSync(openSync(path, "wx"))
}

/** Each write finishes before returning to the invocation that admitted it. */
export function openRunFiles(paths: RunPaths): RunFiles {
  // A claim is retained even when opening or writing the tagged files fails.
  if (paths.claim !== null) claimRound(paths.claim)
  const log = openSync(paths.log, paths.markdown === null ? "w" : "wx")
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
